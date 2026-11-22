package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.TeamAction
import com.premierdarkcoffee.loyalty.access.TeamChange
import com.premierdarkcoffee.loyalty.access.editTeamUser
import com.premierdarkcoffee.loyalty.access.team
import com.premierdarkcoffee.loyalty.access.teamAction
import com.premierdarkcoffee.loyalty.application.bearer
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.businesses.BranchDirectoryQuery
import com.premierdarkcoffee.loyalty.businesses.ManagedBranch
import com.premierdarkcoffee.loyalty.businesses.ManagedBranchChange
import com.premierdarkcoffee.loyalty.businesses.administration
import com.premierdarkcoffee.loyalty.businesses.branchDirectory
import com.premierdarkcoffee.loyalty.businesses.createManagedBranch
import com.premierdarkcoffee.loyalty.businesses.editManagedBranch
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.correctSale
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid
import com.premierdarkcoffee.loyalty.wallet.WalletHealthQuery
import com.premierdarkcoffee.loyalty.wallet.WalletRetry
import com.premierdarkcoffee.loyalty.wallet.retryWallet
import com.premierdarkcoffee.loyalty.wallet.walletHealth

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.*

private fun ApplicationCall.managementNumber(name: String, default: Int): Int = request.queryParameters[name]?.let { it.toIntOrNull() ?: throw Problem(400,"INVALID_FILTER","Filtro numérico inválido.") } ?: default
private fun ApplicationCall.managementQuery() = ManagementQuery(managementNumber("days",30),request.queryParameters["kind"]?:"ALL",request.queryParameters["branchId"]?.takeIf(String::isNotBlank),request.queryParameters["actorId"]?.takeIf(String::isNotBlank),request.queryParameters["q"]?:"",managementNumber("offset",0),request.queryParameters["asOf"],request.queryParameters["fromDate"]?.takeIf(String::isNotBlank),request.queryParameters["throughDate"]?.takeIf(String::isNotBlank))

private fun ApplicationCall.walletHealthQuery() = WalletHealthQuery(request.queryParameters["provider"]?:"ALL",request.queryParameters["state"]?:"ALL",request.queryParameters["q"]?:"",managementNumber("offset",0))

private fun ApplicationCall.branchDirectoryQuery() = BranchDirectoryQuery(request.queryParameters["q"]?:"",managementNumber("offset",0))

private fun ApplicationCall.operationsQuery() = OperationsQuery(managementNumber("days",30),request.queryParameters["branchId"]?.takeIf(String::isNotBlank),request.queryParameters["actorId"]?.takeIf(String::isNotBlank),request.queryParameters["fromDate"]?.takeIf(String::isNotBlank),request.queryParameters["throughDate"]?.takeIf(String::isNotBlank),request.queryParameters["asOf"])
private suspend fun ApplicationCall.activityCsv(service: LoyaltyService, s: Staff) {
    s.owner();val q=managementQuery();val csv=io { service.activityExport(s,q) }
    response.header(HttpHeaders.ContentDisposition,"attachment; filename=loyalty-actividad.csv")
    response.header(HttpHeaders.CacheControl,"no-store")
    respondText(csv,ContentType.parse("text/csv; charset=utf-8"))
}

fun Route.managementRoutes(service: LoyaltyService, platformToken: String) {
    route("/api/staff") {
        post("/activity/{id}/correction/preview") { val s=io { service.staff(call.bearer()) };val p=call.body<com.premierdarkcoffee.loyalty.fidelity.SaleCorrection>();call.respond(io { service.correctSale(s,call.parameters["id"]!!,p) }) }
        post("/activity/{id}/correction") { val s=io { service.staff(call.bearer()) };val p=call.body<com.premierdarkcoffee.loyalty.fidelity.SaleCorrection>();call.respond(io { service.correctSale(s,call.parameters["id"]!!,p,call.key()) }) }
        get("/administration") { val s=io { service.staff(call.bearer()) };call.respond(io { service.administration(s) }) }
        get("/branch-directory") { val s=io { service.staff(call.bearer()) };val q=call.branchDirectoryQuery();call.respond(io { service.branchDirectory(s,q) }) }
        post("/branch-directory") { val s=io { service.staff(call.bearer()) };val input=call.body<ManagedBranch>();call.respond(HttpStatusCode.Created,io { service.createManagedBranch(s,input,call.key()) }) }
        put("/branch-directory/{id}") { val s=io { service.staff(call.bearer()) };val input=call.body<ManagedBranchChange>();call.respond(io { service.editManagedBranch(s,call.parameters["id"]!!,input,call.key()) }) }

        get("/wallet-health") { val s=io { service.staff(call.bearer()) };val q=call.walletHealthQuery();call.respond(io { service.walletHealth(s,q) }) }
        post("/wallet-health/{member}/{provider}/retry") { val s=io { service.staff(call.bearer()) };val input=call.body<WalletRetry>();call.respond(io { service.retryWallet(s,call.parameters["member"]!!,call.parameters["provider"]!!,input,call.key()) }) }
        get("/operations") { val s=io { service.staff(call.bearer()) };val q=call.operationsQuery();call.respond(io { service.operationsReport(s,q) }) }
        get("/activity.csv") { val s=io { service.staff(call.bearer()) };call.activityCsv(service,s) }
        get("/team") { val s=io { service.staff(call.bearer()) };call.respond(io { service.team(s) }) }
        put("/customer-workspace/{id}/profile") {
            val staff = io { service.staff(call.bearer()) }
            val input = call.body<CustomerProfileEdit>()
            call.respond(io { service.editCustomer(staff, call.parameters["id"]!!, input, call.key()) })
        }
        delete("/customer-workspace/{id}") {
            val staff = io { service.staff(call.bearer()) }
            val input = call.body<CustomerRemoval>()
            call.respond(io { service.removeCustomer(staff, call.parameters["id"]!!, input, call.key()) })
        }
        put("/customer-workspace/{id}/contact") {
            val staff=io { service.staff(call.bearer()) }
            val input=call.body<CustomerContactChange>()
            call.respond(io { service.updateCustomerContact(staff,call.parameters["id"]!!,input) })
        }
        put("/team/{id}") { val s=io { service.staff(call.bearer()) };val input=call.body<TeamChange>();call.respond(io { service.editTeamUser(s,call.parameters["id"]!!,input) }) }
        post("/team/{id}/actions") { val s=io { service.staff(call.bearer()) };val input=call.body<TeamAction>();call.respond(io { service.teamAction(s,call.parameters["id"]!!,input) }) }
        get("/activity") { val s=io { service.staff(call.bearer()).also { it.owner() } };val q=call.managementQuery();call.respond(io { service.managementActivity(s.tenant,q,s) }) }
    }
    route("/api/platform") {
        intercept(ApplicationCallPipeline.Call) { need(Security.equal(Security.hash(call.bearer()),Security.hash(platformToken)),"UNAUTHORIZED","Acceso no autorizado.",401) }
        get("/overview") { call.respond(io { service.platformOverview(call.managementNumber("days",30),call.request.queryParameters["q"]?:"",call.managementNumber("offset",0)) }) }
        route("/tenants/{tenant}") {
            fun ApplicationCall.owner() = Staff(uuid(parameters["tenant"]!!),"platform","OWNER",null)
            get("/administration") { call.respond(io { service.administration(call.owner()) }) }
            get("/branch-directory") { val q=call.branchDirectoryQuery();call.respond(io { service.branchDirectory(call.owner(),q) }) }
            post("/branch-directory") { val input=call.body<ManagedBranch>();call.respond(HttpStatusCode.Created,io { service.createManagedBranch(call.owner(),input,call.key()) }) }
            put("/branch-directory/{id}") { val input=call.body<ManagedBranchChange>();call.respond(io { service.editManagedBranch(call.owner(),call.parameters["id"]!!,input,call.key()) }) }

            get("/wallet-health") { val q=call.walletHealthQuery();call.respond(io { service.walletHealth(call.owner(),q) }) }
            post("/wallet-health/{member}/{provider}/retry") { val input=call.body<WalletRetry>();call.respond(io { service.retryWallet(call.owner(),call.parameters["member"]!!,call.parameters["provider"]!!,input,call.key()) }) }
            get("/operations") { val q=call.operationsQuery();call.respond(io { service.operationsReport(call.owner(),q) }) }
            get("/activity.csv") { call.activityCsv(service,call.owner()) }
            get("/activity") { val q=call.managementQuery();call.respond(io { service.managementActivity(call.owner().tenant,q,call.owner()) }) }
            get("/team") { call.respond(io { service.team(call.owner()) }) }
            put("/team/{id}") { val input=call.body<TeamChange>();call.respond(io { service.editTeamUser(call.owner(),call.parameters["id"]!!,input) }) }
            post("/team/{id}/actions") { val input=call.body<TeamAction>();call.respond(io { service.teamAction(call.owner(),call.parameters["id"]!!,input) }) }
            get("/customer-activity") {
                val p=call.request.queryParameters
                val q=CustomerActivityQuery(call.managementNumber("days",30),call.managementNumber("inactiveDays",30),p["segment"]?:"ALL",p["q"]?:"",call.managementNumber("offset",0),p["sort"]?:"RECENT")
                call.respond(io { service.customerActivity(call.owner(),q) })
            }
            get("/customer-workspace/{id}") {
                val q=CustomerTimelineQuery(call.request.queryParameters["kind"]?:"ALL",call.request.queryParameters["branchId"]?.takeIf(String::isNotBlank),call.managementNumber("offset",0))
                val result=io { service.customerWorkspace(call.owner(),call.parameters["id"]!!,q) }
                // Reports never expose a scannable card or customer authentication material.
                call.respond(JsonObject(result + ("member" to JsonObject(result.getValue("member").jsonObject.filterKeys { it != "cardCode" }))))
            }
        }
    }
}
