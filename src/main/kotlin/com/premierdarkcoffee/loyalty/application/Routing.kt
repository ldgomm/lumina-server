package com.premierdarkcoffee.loyalty.application

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.analytics.managementRoutes
import com.premierdarkcoffee.loyalty.billing.commercialRoutes
import com.premierdarkcoffee.loyalty.billing.commercialWeb
import com.premierdarkcoffee.loyalty.infrastructure.local.localStagingRoutes
import com.premierdarkcoffee.loyalty.infrastructure.local.localWalletOrigin
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.DeletePromotion
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.deletePromotion
import com.premierdarkcoffee.loyalty.fidelity.previewPromotionRemoval
import com.premierdarkcoffee.loyalty.marketing.engagementRoutes
import com.premierdarkcoffee.loyalty.shared.Confirm
import com.premierdarkcoffee.loyalty.shared.Enrollment
import com.premierdarkcoffee.loyalty.shared.Login
import com.premierdarkcoffee.loyalty.shared.Lookup
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.ProgramChange
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reserve
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.RewardChange
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.walletDownload
import com.premierdarkcoffee.loyalty.wallet.walletFirstRoutes
import com.premierdarkcoffee.loyalty.wallet.walletRoutes
import com.premierdarkcoffee.loyalty.wallet.walletWeb

import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter
import com.google.zxing.client.j2se.MatrixToImageWriter
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.plugins.contentnegotiation.*
import io.ktor.server.plugins.statuspages.*
import io.ktor.server.request.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import io.ktor.serialization.kotlinx.json.*
import io.ktor.utils.io.readAvailable
import kotlinx.coroutines.*
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.*
import java.io.ByteArrayOutputStream
import java.net.URI
import java.sql.SQLException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

fun Application.configureRouting() {
    val environment = System.getenv()
    val url = requireNotNull(environment["DATABASE_URL"]) { "Set DATABASE_URL to a PostgreSQL JDBC URL." }
    val pepper = requireNotNull(environment["IDENTITY_PEPPER"]) { "Set IDENTITY_PEPPER (32+ characters)." }
    val admin = requireNotNull(environment["PLATFORM_ADMIN_TOKEN"]) { "Set PLATFORM_ADMIN_TOKEN (32+ characters)." }
    require(pepper.length >= 32 && admin.length >= 32 && pepper != admin) { "Use distinct secrets with 32+ characters." }
    val publicUrl = (environment["PUBLIC_BASE_URL"] ?: "http://localhost:8080").trimEnd('/')
    require(publicUrl.startsWith("https://") || publicUrl.startsWith("http://localhost:") || publicUrl.startsWith("http://127.0.0.1:")) { "PUBLIC_BASE_URL requires HTTPS except localhost." }
    val db = Database.connect(url,environment["DATABASE_USER"] ?: "loyalty",environment["DATABASE_PASSWORD"] ?: "")
    try { db.migrate() } catch (e: Throwable) { db.close(); throw e }
    val service = LoyaltyService(db, pepper)
    service.wallets = WalletService.fromEnvironment(service, publicUrl, environment)
    loyaltyRoutes(service,admin,publicUrl,localWalletOrigin(environment))
    localStagingRoutes(environment)
    val executor = Executors.newSingleThreadScheduledExecutor { r -> Thread(r,"redemption-expiry").apply { isDaemon = true } }
    executor.scheduleWithFixedDelay({
        try { service.expireBatch(); if (service.commercial.sweep() > 0) log.error("Billing sweep incomplete; it will retry.") } catch (_: Exception) { log.error("Expiry sweep failed; it will retry.") }
    },30,30,TimeUnit.SECONDS)
    val walletExecutor = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "wallet-delivery").apply { isDaemon = true } }
    walletExecutor.scheduleWithFixedDelay({
        try { if (service.wallets.sweep() > 0) log.warn("Wallet delivery pending; retry scheduled.") } catch (_: Exception) { log.error("Wallet sweep failed; retry scheduled.") }
    }, 30, 30, TimeUnit.SECONDS)
    monitor.subscribe(ApplicationStopped) { walletExecutor.shutdownNow(); executor.shutdownNow(); db.close() }
}

fun Application.loyaltyRoutes(service: LoyaltyService, platformToken: String, publicUrl: String, localOrigin: String? = null) {

    val appLog = log
    install(ContentNegotiation) { json(json) }
    install(StatusPages) {
        exception<Problem> { call, e -> call.respond(HttpStatusCode.fromValue(e.status),
            obj("code" to e.code, "message" to e.message)
        ) }
        exception<SerializationException> { call,_ -> call.respond(HttpStatusCode.BadRequest,
            obj("code" to "INVALID_JSON", "message" to "Revisa los campos enviados.")
        ) }
        exception<SQLException> { call,e ->
            val conflict = e.sqlState == "23505"
            call.respond(if(conflict) HttpStatusCode.Conflict else HttpStatusCode.ServiceUnavailable,
                obj(
                    "code" to if (conflict) "DUPLICATE_RECORD" else "DATABASE_BUSY",
                    "message" to if (conflict) "El registro ya existe." else "No se completó la operación. Reintenta con la misma clave."
                )
            )
        }
        exception<Throwable> { call,e ->
            if (e is CancellationException) throw e
            appLog.error("Unhandled request failure: ${e.javaClass.simpleName}")
            call.respond(HttpStatusCode.InternalServerError,
                obj("code" to "INTERNAL_ERROR", "message" to "No se completó la operación.")
            )
        }
    }
    intercept(ApplicationCallPipeline.Call) {
        call.response.header("X-Content-Type-Options","nosniff")
        call.response.header("Referrer-Policy","no-referrer")
        call.response.header("Cache-Control","no-store")
        call.response.header("Content-Security-Policy","default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        val origin = call.request.header("Origin")
        if (call.request.httpMethod in setOf(HttpMethod.Post,HttpMethod.Put,HttpMethod.Delete)) {
            need(
                origin == null || origin == publicUrl || origin == localOrigin,
                "ORIGIN_FORBIDDEN",
                "Origen no permitido.",
                403
            )

        }
    }
    routing {
        commercialRoutes(service, platformToken)
        managementRoutes(service, platformToken)
                walletRoutes(service, platformToken)
        walletFirstRoutes(service, publicUrl)
        engagementRoutes(service)
        get("/health/live") { call.respond(obj("status" to "UP", "version" to "0.1.0")) }
        get("/health/ready") { io { service.db.tx { c -> c.one("SELECT 1") { it.getInt(1) } } }; call.respond(
            obj(
                "status" to "UP",
                "wallet" to service.wallets.availability()
            )
        ) }
        get("/") { call.web("index.html",ContentType.Text.Html) }
                get("/join/{slug}") {
            if (localOrigin != null && publicUrl.startsWith("https://") && call.request.header("Host") == URI(localOrigin).authority) {
                call.respondRedirect(publicUrl + "/join/" + call.parameters["slug"]!!.encodeURLPathPart())
            } else call.web("index.html",ContentType.Text.Html)
        }

        get("/app.js") { call.web("app.js",ContentType.Application.JavaScript) }
        get("/style.css") { call.web("style.css",ContentType.Text.CSS) }
        get("/api/public/{slug}") { call.respond(io { service.publicTenant(call.parameters["slug"]!!) }) }
        get("/api/public/{slug}/qr") {
            val slug = call.parameters["slug"]!!
            io { service.publicTenant(slug) }
            call.respondBytes(qr("$publicUrl/join/$slug"),ContentType.Image.PNG)
        }
        post("/api/platform/tenants") {
            need(
                Security.equal(Security.hash(call.bearer()), Security.hash(platformToken)),
                "UNAUTHORIZED",
                "Acceso no autorizado.",
                401
            )
            val input = call.body<NewTenant>(); call.respond(HttpStatusCode.Created,io { service.createTenant(input) })
        }
        post("/api/public/{slug}/enroll") {
            val slug = call.parameters["slug"]!!; val input = call.body<Enrollment>()
            io { service.rateLimit("enroll:$slug:${call.request.local.remoteHost}",6) }
            call.respond(HttpStatusCode.Created,io { service.enroll(slug,input) })
        }
        post("/api/public/{slug}/login") {
            val slug = call.parameters["slug"]!!; val input = call.body<Login>()
            io { service.rateLimit("login:$slug:${call.request.local.remoteHost}"); service.rateLimit("login-document:$slug:${input.document.trim().uppercase()}") }
            call.respond(io { service.login(slug,input) })
        }
        get("/api/staff/dashboard") { val s = io { service.staff(call.bearer()) }; call.respond(io { service.dashboard(s) }) }
        post("/api/staff/branches") { val s = io { service.staff(call.bearer()) }; val input = call.body<NewBranch>(); call.respond(HttpStatusCode.Created,io { service.newBranch(s,input) }) }
        post("/api/staff/credentials") { val s = io { service.staff(call.bearer()) }; val input = call.body<NewStaff>(); call.respond(HttpStatusCode.Created,io { service.newStaff(s,input) }) }
        delete("/api/staff/credentials/{id}") { val s = io { service.staff(call.bearer()) }; call.respond(io { service.revokeStaff(s,call.parameters["id"]!!) }) }
        post("/api/staff/programs") { val s = io { service.staff(call.bearer()) }; val input = call.body<Program>(); call.respond(HttpStatusCode.Created,io { service.newProgram(s,input) }) }
        put("/api/staff/programs/{id}") { val s = io { service.staff(call.bearer()) }; val input = call.body<ProgramChange>(); call.respond(io { service.editProgram(s,call.parameters["id"]!!,input) }) }
        get("/api/staff/programs/{id}/deletion-preview") { val s=io { service.staff(call.bearer()) }; call.respond(io { service.previewPromotionRemoval(s,call.parameters["id"]!!) }) }
        delete("/api/staff/programs/{id}") { val s=io { service.staff(call.bearer()) }; val input=call.body<DeletePromotion>(); call.respond(io { service.deletePromotion(s,call.parameters["id"]!!,input,call.key()) }) }
        post("/api/staff/rewards") { val s = io { service.staff(call.bearer()) }; val input = call.body<Reward>(); call.respond(HttpStatusCode.Created,io { service.saveReward(s,input) }) }
        put("/api/staff/rewards/{id}") { val s = io { service.staff(call.bearer()) }; val input = call.body<RewardChange>(); call.respond(io { service.saveReward(s,input.reward,call.parameters["id"]!!,input.expectedVersion) }) }
        post("/api/staff/members/lookup") { val s = io { service.staff(call.bearer()) }; val input = call.body<Lookup>(); call.respond(io { service.lookup(s,input) }) }
        post("/api/staff/purchases") { val s = io { service.staff(call.bearer()) }; val input = call.body<Purchase>(); call.respond(io { service.purchase(s,input,call.key()) }) }
        post("/api/staff/redemptions/confirm") { val s = io { service.staff(call.bearer()) }; val input = call.body<Confirm>(); call.respond(io { service.confirm(s,input,call.key()) }) }
        get("/api/me") { val m = io { service.member(call.bearer()) }; call.respond(io { service.card(m) }) }
        get("/api/me/qr") { val m = io { service.member(call.bearer()) }; val card = io { service.card(m) }; call.respondBytes(qr(card.getValue("member").jsonObject.getValue("cardCode").jsonPrimitive.content),ContentType.Image.PNG) }
        post("/api/me/logout") { call.respond(io { service.logout(call.bearer()) }) }
        post("/api/me/redemptions") { val m = io { service.member(call.bearer()) }; val input = call.body<Reserve>(); call.respond(io { service.reserve(m,input,call.key()) }) }
        post("/api/me/redemptions/{id}/cancel") { val m = io { service.member(call.bearer()) }; call.respond(io { service.cancel(m,call.parameters["id"]!!,call.key()) }) }
        post("/api/me/redemptions/qr") { io { service.member(call.bearer()) }; val input = call.body<Confirm>(); need(
            input.token.matches(Regex("[A-Za-z0-9_-]{43}")),
            "INVALID_TOKEN",
            "Código inválido."
        ); call.respondBytes(qr(input.token),ContentType.Image.PNG) }
        get("/api/me/wallet/{provider}") { call.walletDownload(service) }
    }
}
internal suspend fun <T> io(block: () -> T): T = withContext(Dispatchers.IO) { block() }
internal fun ApplicationCall.bearer(): String {
    val value = request.header(HttpHeaders.Authorization) ?: throw Problem(401, "UNAUTHORIZED", "Inicia sesión.")
    need(value.startsWith("Bearer ") && value.length in 39..200, "UNAUTHORIZED", "Credencial inválida.", 401)
    return value.removePrefix("Bearer ")
}
internal fun ApplicationCall.key() = request.header("Idempotency-Key") ?: ""
internal suspend inline fun <reified T> ApplicationCall.body(): T {
    need(request.contentType().match(ContentType.Application.Json), "JSON_REQUIRED", "Envía application/json.", 415)
    val channel = receiveChannel(); val bytes = ByteArrayOutputStream(); val buffer = ByteArray(4096)
    while (!channel.isClosedForRead) {
        val count = channel.readAvailable(buffer,0,buffer.size)
        if (count < 0) break
        need(bytes.size() + count <= 32_768, "BODY_TOO_LARGE", "Solicitud demasiado grande.", 413)
        if (count > 0) bytes.write(buffer,0,count)
    }
    return json.decodeFromString(bytes.toString(Charsets.UTF_8))
}
internal suspend fun ApplicationCall.web(name: String, type: ContentType) = respondText(walletWeb(name, commercialWeb(name, requireNotNull(
    LoyaltyService::class.java.getResource("/com/premierdarkcoffee/loyalty/presentation/loyalty/$name")).readText())),type)
internal fun qr(value: String): ByteArray = ByteArrayOutputStream().also { out -> MatrixToImageWriter.writeToStream(MultiFormatWriter().encode(value,BarcodeFormat.QR_CODE,320,320),"PNG",out) }.toByteArray()
