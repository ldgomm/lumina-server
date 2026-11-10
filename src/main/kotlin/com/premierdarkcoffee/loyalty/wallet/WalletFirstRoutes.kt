package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.application.bearer
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.application.web
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.element
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json

import io.ktor.http.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import java.util.Base64

fun Route.walletFirstRoutes(service: LoyaltyService, publicUrl: String) {
    get("/scanner.js") { call.web("scanner.js", ContentType.Application.JavaScript) }
    get("/jsqr.js") { call.web("jsqr.js", ContentType.Application.JavaScript) }
    post("/api/public/{slug}/join") {
        val input = call.body<WalletEnrollment>()
        io { service.rateLimit("join:${call.parameters["slug"]}:${call.request.local.remoteHost}", 12) }
        call.respond(HttpStatusCode.Created, io { service.enrollWithoutPassword(call.parameters["slug"]!!, input) })
    }
    post("/api/staff/counter-redemptions") {
        val staff = io { service.staff(call.bearer()) }
        val input = call.body<CounterRedemption>()
        call.respond(io { service.redeemAtCounter(staff, input, call.key()) })
    }
    post("/api/staff/wallet/restore") {
        val staff = io { service.staff(call.bearer()) }
        val input = call.body<RestoreIssue>()
        io { service.rateLimit("restore-issue:${staff.tenant}:${staff.id}", 6) }
        val result = io { service.issueRestore(staff, input) }
        val path = result.getValue("path").let { (it as JsonPrimitive).content }
        call.respond(
            JsonObject(result + ("qrData" to element(
                Base64.getEncoder().encodeToString(qr(publicUrl + path))
            )))
        )
    }
    post("/api/public/{slug}/restore") {
        val input = call.body<RestoreUse>()
        io { service.rateLimit("restore-use:${call.parameters["slug"]}:${call.request.local.remoteHost}", 12) }
        call.respond(io { service.useRestore(call.parameters["slug"]!!, input) })
    }
}
