package com.premierdarkcoffee.loyalty.marketing

import com.premierdarkcoffee.loyalty.analytics.CustomerActivityQuery
import com.premierdarkcoffee.loyalty.analytics.CustomerTimelineQuery
import com.premierdarkcoffee.loyalty.analytics.customerActivity
import com.premierdarkcoffee.loyalty.analytics.customerSuggestions
import com.premierdarkcoffee.loyalty.analytics.customerWorkspace
import com.premierdarkcoffee.loyalty.analytics.ownerReturnRadar
import com.premierdarkcoffee.loyalty.analytics.radarQuery
import com.premierdarkcoffee.loyalty.application.bearer
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.web
import com.premierdarkcoffee.loyalty.businesses.SimplePromotionSetup
import com.premierdarkcoffee.loyalty.businesses.createSimplePromotion
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.wallet.providers.walletLogo

import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*

fun Route.engagementRoutes(service:LoyaltyService) {
    get("/api/staff/return-radar") { val s=io { service.staff(call.bearer()) }; val query=call.radarQuery(); call.respond(io { service.ownerReturnRadar(s,query) }) }
    get("/engagement.js"){call.web("engagement.js",ContentType.Application.JavaScript)}
    get("/experience.js"){call.web("experience.js",ContentType.Application.JavaScript)}
    post("/api/staff/purchases/quote"){val s=io{service.staff(call.bearer())};val p=call.body<Purchase>();call.respond(io{service.receiptQuote(s,p)})}
    post("/api/staff/promotion-templates"){val s=io{service.staff(call.bearer())};val p=call.body<PromotionTemplate>();call.respond(io{service.createPromotion(s,p,call.key())})}
    post("/api/staff/promotion-setups"){val s=io{service.staff(call.bearer())};val p=call.body<SimplePromotionSetup>();call.respond(io{service.createSimplePromotion(s,p,call.key())})}
    get("/api/staff/wallet-design"){val s=io{service.staff(call.bearer())};call.respond(io{service.design(s)})}
    put("/api/staff/wallet-design"){val s=io{service.staff(call.bearer())};val p=call.body<WalletDesignChange>();call.respond(io{service.saveDesign(s,p)})}
        get("/api/staff/customer-activity") {
        val staff=io{service.staff(call.bearer())}
        val params=call.request.queryParameters
        fun number(name:String,default:Int):Int = params[name]?.let { it.toIntOrNull() ?: throw Problem(400,"INVALID_FILTER","Filtro numérico inválido: $name.") } ?: default
        val query=CustomerActivityQuery(number("days",30),number("inactiveDays",30),params["segment"]?:"ALL",params["q"]?:"",number("offset",0),params["sort"]?:"RECENT")
        call.respond(io{service.customerActivity(staff,query)})
    }
    get("/api/staff/customer-suggestions") { val s=io { service.staff(call.bearer()) };call.respond(io { service.customerSuggestions(s,call.request.queryParameters["q"]?:"") }) }
    get("/api/staff/customer-workspace/{id}") {
        val s=io { service.staff(call.bearer()) };val params=call.request.queryParameters
        val offset=params["offset"]?.let { it.toIntOrNull()?:throw Problem(400,"INVALID_PAGE","Página inválida.") }?:0
        val query=CustomerTimelineQuery(params["kind"]?:"ALL",params["branchId"]?.takeIf { it.isNotBlank() },offset)
        call.respond(io { service.customerWorkspace(s,call.parameters["id"]!!,query) })
    }
    get("/api/staff/customer-insights"){val s=io{service.staff(call.bearer())};val offset=call.request.queryParameters["offset"]?.toIntOrNull()?:0;call.respond(io{service.customerInsights(s,offset)})}
    get("/api/staff/customer-insights/{id}"){val s=io{service.staff(call.bearer())};call.respond(io{service.customerDetail(s,call.parameters["id"]!!)})}
    put("/api/staff/customer-insights/{id}/preferences"){val s=io{service.staff(call.bearer())};val p=call.body<CustomerPreferencesChange>();call.respond(io{service.savePreferences(s,call.parameters["id"]!!,p)})}
    get("/api/staff/customer-events"){val s=io{service.staff(call.bearer())};call.respond(io{service.customerEvents(s)})}
    get("/api/staff/birthday-settings"){val s=io{service.staff(call.bearer())};call.respond(io{service.birthdayConfiguration(s)})}
    put("/api/staff/birthday-settings"){val s=io{service.staff(call.bearer())};val p=call.body<BirthdaySettingsChange>();call.respond(io{service.saveBirthdayConfiguration(s,p)})}
    post("/api/staff/customer-events"){val s=io{service.staff(call.bearer())};val p=call.body<CustomerEvent>();call.respond(io{service.createCustomerEvent(s,p,call.key())})}
    delete("/api/staff/customer-events/{id}"){val s=io{service.staff(call.bearer())};call.respond(io{service.cancelCustomerEvent(s,call.parameters["id"]!!)})}
    get("/wallet/brand/{slug}/logo.png"){val bytes=io{service.db.tx{c->val tenant=service.tenant(c,call.parameters["slug"]!!).getValue("id").toString().trim('"');walletDesign(c,tenant).logoPng?.let(::validateWalletLogo)?:walletLogo(160)}};call.respondBytes(bytes,ContentType.Image.PNG)}
}
