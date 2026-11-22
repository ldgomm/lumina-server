package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.analytics.radarQuery
import com.premierdarkcoffee.loyalty.analytics.returnRadar
import com.premierdarkcoffee.loyalty.application.bearer
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.web
import com.premierdarkcoffee.loyalty.businesses.BusinessCategories
import com.premierdarkcoffee.loyalty.businesses.BusinessProfileChange
import com.premierdarkcoffee.loyalty.businesses.ProfileCorrectionRequest
import com.premierdarkcoffee.loyalty.businesses.ProfileCorrectionResolution
import com.premierdarkcoffee.loyalty.businesses.businessProfile
import com.premierdarkcoffee.loyalty.businesses.businessSuggestions
import com.premierdarkcoffee.loyalty.businesses.memberSuggestions
import com.premierdarkcoffee.loyalty.businesses.platformBranches
import com.premierdarkcoffee.loyalty.businesses.platformNewBranch
import com.premierdarkcoffee.loyalty.businesses.requestProfileCorrection
import com.premierdarkcoffee.loyalty.businesses.resolveProfileCorrection
import com.premierdarkcoffee.loyalty.businesses.saveBusinessProfile
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.uuid

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
        post("/wallet-first-purchases") {
            val input=call.body<WalletBusinessList>()
            call.respond(io { commercial.firstPurchaseStates(input) })
        }
        get("/tenants") { call.respond(io { commercial.businesses(call.request.queryParameters["q"] ?: "", call.offset()) }) }
                get("/tenant-suggestions") { call.respond(io { service.businessSuggestions(call.request.queryParameters["q"] ?: "") }) }
        get("/business-categories") { call.respond(BusinessCategories.options()) }
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

            get("/wallet-outlook") { call.respond(io { commercial.walletOutlook(call.parameters["tenant"]!!,call.request.queryParameters["cut"]) }) }
            get("/account") { call.respond(io { commercial.account(call.parameters["tenant"]!!, offset = call.offset()) }) }
            get("/metrics") { call.respond(io { commercial.metrics(call.parameters["tenant"]!!, call.days()) }) }
            get("/return-radar") { val query=call.radarQuery(); call.respond(io { service.returnRadar(call.parameters["tenant"]!!,query) }) }
            put("/wallet-calendar") {
                val input=call.body<CatalogCalendar>()
                call.respond(io { commercial.updateCalendar(call.parameters["tenant"]!!,input) })
            }
            get("/access") { call.respond(io { commercial.accessState(call.parameters["tenant"]!!) }) }
            put("/access") { val input = call.body<AccessChange>(); call.respond(io { commercial.changeAccess(call.parameters["tenant"]!!, input) }) }
            put("/membership") { val input = call.body<MembershipChange>(); call.respond(io { commercial.configure(call.parameters["tenant"]!!, input) }) }
            post("/charges") { val input = call.body<NewCharge>(); call.respond(HttpStatusCode.Created, io { commercial.charge(call.parameters["tenant"]!!, input, call.key()) }) }
            post("/payments") { val input = call.body<RecordPayment>(); call.respond(HttpStatusCode.Created, io { commercial.pay(call.parameters["tenant"]!!, input, call.key()) }) }
            get("/payments/{id}") { call.respond(io { commercial.paymentReceipt(call.parameters["tenant"]!!, call.parameters["id"]!!) }) }
            post("/payments/{id}/reverse") { val input = call.body<Correction>(); call.respond(io { commercial.reverse(call.parameters["tenant"]!!, call.parameters["id"]!!, input, call.key()) }) }
            post("/charges/{id}/void") { val input = call.body<Correction>(); call.respond(io { commercial.void(call.parameters["tenant"]!!, call.parameters["id"]!!, input, call.key()) }) }
            post("/notices") { val input = call.body<BusinessNotice>(); call.respond(HttpStatusCode.Created, io { commercial.notify(call.parameters["tenant"]!!, input, call.key()) }) }
        }
    }
    get("/api/staff/lumina-subscription") { val s=io {service.staff(call.bearer())};call.respond(io {service.walletSubscriptionStatus(s)}) }
    post("/api/staff/lumina-subscription/offer") { val s=io {service.staff(call.bearer())};val input=call.body<WalletOfferInput>();call.respond(io {service.walletSubscriptionOffer(s,input)}) }
    post("/api/staff/lumina-subscription/accept") { val s=io {service.staff(call.bearer())};val input=call.body<WalletAcceptInput>();call.respond(io {service.acceptWalletSubscription(s,input,call.key())}) }
    post("/api/staff/lumina-subscription/cancel") { val s=io {service.staff(call.bearer())};val input=call.body<WalletCancelInput>();call.respond(io {service.cancelWalletSubscription(s,input,call.key())}) }
    get("/api/staff/account") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.ownerAccount(s, call.offset()) }) }
    get("/api/staff/payments/{id}") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.paymentReceipt(s.tenant, call.parameters["id"]!!, s) }) }
    get("/api/staff/business-profile") { val s=io { service.staff(call.bearer()).also { it.owner() } };call.respond(io { service.businessProfile(s.tenant) }) }
    put("/api/staff/business-profile") { val s=io { service.staff(call.bearer()).also { it.owner() } };val input=call.body<BusinessProfileChange>();call.respond(io { service.saveBusinessProfile(s.tenant,input,s.id) }) }
    post("/api/staff/business-profile/requests") { val s=io { service.staff(call.bearer()).also { it.owner() } };val input=call.body<ProfileCorrectionRequest>();call.respond(HttpStatusCode.Created,io { service.requestProfileCorrection(s,input,call.key()) }) }
    get("/api/staff/member-suggestions") { val s=io { service.staff(call.bearer()) };call.respond(io { service.memberSuggestions(s,call.request.queryParameters["q"]?:"") }) }
    get("/api/staff/metrics") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.ownerMetrics(s, call.days()) }) }
    get("/api/staff/access") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.publicAccess(s.tenant) }) }
    post("/api/staff/notices/{id}/read") { val s = io { service.staff(call.bearer()) }; call.respond(io { commercial.acknowledge(s, call.parameters["id"]!!) }) }
    get("/api/me/access") { val m = io { service.member(call.bearer()) }; call.respond(io { commercial.publicAccess(m.tenant) }) }
}
