package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.AccessChange
import com.premierdarkcoffee.loyalty.BusinessNotice
import com.premierdarkcoffee.loyalty.Correction
import com.premierdarkcoffee.loyalty.LoyaltyService
import com.premierdarkcoffee.loyalty.MembershipChange
import com.premierdarkcoffee.loyalty.NewBranch
import com.premierdarkcoffee.loyalty.NewCharge
import com.premierdarkcoffee.loyalty.NewStaff
import com.premierdarkcoffee.loyalty.RecordPayment
import com.premierdarkcoffee.loyalty.Security
import com.premierdarkcoffee.loyalty.Staff
import com.premierdarkcoffee.loyalty.need
import com.premierdarkcoffee.loyalty.platformBranches
import com.premierdarkcoffee.loyalty.platformNewBranch
import com.premierdarkcoffee.loyalty.uuid
import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun commercialWeb(name: String, html: String): String = if (name == "index.html" && "/commercial.js" !in html) {
    html.replace(Regex("</head>", RegexOption.IGNORE_CASE), "<link rel=\"stylesheet\" href=\"/commercial.css\"><script src=\"/commercial.js\" defer></script></head>")
} else if (name == "platform.html" && "/experience.js" !in html) {
    html.replace(Regex("</head>", RegexOption.IGNORE_CASE), "<script src=\"/experience.js\" defer></script></head>")
} else html

fun Route.commercialRoutes(service: LoyaltyService, platformToken: String) {
    val commercial = service.commercial
    fun ApplicationCall.offset() = request.queryParameters["offset"]?.toIntOrNull() ?: 0
    fun ApplicationCall.days() = request.queryParameters["days"]?.toIntOrNull() ?: 30
    get("/platform") { call.web("platform.html", ContentType.Text.Html) }
    get("/commercial.js") { call.web("commercial.js", ContentType.Application.JavaScript) }
    get("/commercial.css") { call.web("commercial.css", ContentType.Text.CSS) }
    route("/api/platform") {
        intercept(ApplicationCallPipeline.Call) {
            need(
                Security.equal(Security.hash(call.bearer()), Security.hash(platformToken)),
                "UNAUTHORIZED",
                "Acceso no autorizado.",
                401
            )
        }
        get("/tenants") { call.respond(io { commercial.businesses(call.request.queryParameters["q"] ?: "", call.offset()) }) }
        get("/tenant-suggestions") { call.respond(io { service.businessSuggestions(call.request.queryParameters["q"] ?: "") }) }
        post("/businesses") {
            val input=call.body<NewTenant>()
            need(input.profile!=null && input.firstBranch!=null,"BUSINESS_PROFILE_REQUIRED","Completa los datos del negocio, el RUC y la primera sucursal.")
            call.respond(HttpStatusCode.Created,io { service.createTenant(input) })
        }
                route("/tenants/{tenant}") {
            get("/profile") { call.respond(io { service.businessProfile(call.parameters["tenant"]!!) }) }
            put("/profile") { val input=call.body<BusinessProfileChange>();call.respond(io { service.saveBusinessProfile(call.parameters["tenant"]!!,input,"platform") }) }
            put("/profile-requests/{id}") { val input=call.body<ProfileCorrectionResolution>();call.respond(io { service.resolveProfileCorrection(call.parameters["tenant"]!!,call.parameters["id"]!!,input) }) }
            get("/branches") { call.respond(io { service.platformBranches(call.parameters["tenant"]!!) }) }
            post("/branches") { val input = call.body<NewBranch>(); call.respond(HttpStatusCode.Created, io { service.platformNewBranch(call.parameters["tenant"]!!, input, call.key()) }) }
            post("/credentials") {
                val input = call.body<NewStaff>()
                call.respond(HttpStatusCode.Created, io { service.newStaff(
                    Staff(
                        uuid(call.parameters["tenant"]!!),
                        "platform",
                        "OWNER",
                        null
                    ), input) })
            }

            get("/account") { call.respond(io { commercial.account(call.parameters["tenant"]!!, offset = call.offset()) }) }
            get("/metrics") { call.respond(io { commercial.metrics(call.parameters["tenant"]!!, call.days()) }) }
            put("/access") { val input = call.body<AccessChange>(); call.respond(io { commercial.changeAccess(call.parameters["tenant"]!!, input) }) }
            put("/membership") { val input = call.body<MembershipChange>(); call.respond(io { commercial.configure(call.parameters["tenant"]!!, input) }) }
            post("/charges") { val input = call.body<NewCharge>(); call.respond(HttpStatusCode.Created, io { commercial.charge(call.parameters["tenant"]!!, input, call.key()) }) }
            post("/payments") { val input = call.body<RecordPayment>(); call.respond(HttpStatusCode.Created, io { commercial.pay(call.parameters["tenant"]!!, input, call.key()) }) }
            post("/payments/{id}/reverse") { val input = call.body<Correction>(); call.respond(io { commercial.reverse(call.parameters["tenant"]!!, call.parameters["id"]!!, input, call.key()) }) }
            post("/charges/{id}/void") { val input = call.body<Correction>(); call.respond(io { commercial.void(call.parameters["tenant"]!!, call.parameters["id"]!!, input, call.key()) }) }
            post("/notices") { val input = call.body<BusinessNotice>(); call.respond(HttpStatusCode.Created, io { commercial.notify(call.parameters["tenant"]!!, input, call.key()) }) }
        }
    }
    get("/api/staff/account") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.ownerAccount(s, call.offset()) }) }
    get("/api/staff/business-profile") { val s=io { service.staff(call.bearer()).also { it.owner() } };call.respond(io { service.businessProfile(s.tenant) }) }
    put("/api/staff/business-profile") { val s=io { service.staff(call.bearer()).also { it.owner() } };val input=call.body<BusinessProfileChange>();call.respond(io { service.saveBusinessProfile(s.tenant,input,s.id) }) }
    post("/api/staff/business-profile/requests") { val s=io { service.staff(call.bearer()).also { it.owner() } };val input=call.body<ProfileCorrectionRequest>();call.respond(HttpStatusCode.Created,io { service.requestProfileCorrection(s,input,call.key()) }) }
    get("/api/staff/member-suggestions") { val s=io { service.staff(call.bearer()) };call.respond(io { service.memberSuggestions(s,call.request.queryParameters["q"]?:"") }) }
    get("/api/staff/metrics") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.ownerMetrics(s, call.days()) }) }
    get("/api/staff/access") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.publicAccess(s.tenant) }) }
    post("/api/staff/notices/{id}/read") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.acknowledge(s, call.parameters["id"]!!) }) }
    get("/api/me/access") { val m = io { service.member(call.bearer()) }; call.respond(io { commercial.publicAccess(m.tenant) }) }
}
