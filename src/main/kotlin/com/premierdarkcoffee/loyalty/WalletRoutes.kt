package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.jsonPrimitive

import kotlinx.serialization.json.contentOrNull

import io.ktor.http.*
import io.ktor.server.application.*
import io.ktor.server.response.*
import io.ktor.server.routing.*
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

private val passType = ContentType("application", "vnd.apple.pkpass")
fun walletWeb(name: String, html: String) = if (name == "index.html" && "/wallet-ui.js" !in html) html.replace(Regex("</head>", RegexOption.IGNORE_CASE), "<script src=\"/promotion-editor.js\" defer></script><script src=\"/jsqr.js\" defer></script><script src=\"/scanner.js\" defer></script><script src=\"/wallet-ui.js\" defer></script><script src=\"/engagement.js\" defer></script><script src=\"/experience.js\" defer></script></head>") else html

private fun ApplicationCall.appleToken(): String {
    val value = request.headers[HttpHeaders.Authorization] ?: ""
    need(value.startsWith("ApplePass ") && value.length in 40..200, "UNAUTHORIZED", "Acceso no autorizado.", 401)
    return value.removePrefix("ApplePass ")
}
private suspend fun ApplicationCall.pkpass(bytes: ByteArray) {
    response.header(HttpHeaders.ContentDisposition, "attachment; filename=\"comeback.pkpass\"")
    respondBytes(bytes, passType)
}
internal suspend fun ApplicationCall.walletDownload(service: LoyaltyService) {
    val member = io { service.member(bearer()) }
    when (parameters["provider"]) {
        "apple" -> pkpass(io { service.wallets.appleBytes(member) })
        "google" -> respond(io { service.wallets.googleLink(member) })
        else -> throw Problem(404, "UNKNOWN_WALLET", "Proveedor de Wallet no válido.")
    }
}
fun Route.walletRoutes(service: LoyaltyService, platformToken: String) {
        get("/promotion-editor.js") { call.web("promotion-editor.js", ContentType.Application.JavaScript) }
    get("/wallet-ui.js") { call.web("wallet-ui.js", ContentType.Application.JavaScript) }

    get("/wallet/art/{version}/{style}/{symbol}/{background}/{filled}/{total}.png") {
        val version=when(call.parameters["version"]){"v20"->20;"v22"->22;"v24"->24;else->throw Problem(404,"NOT_FOUND","Diseño no encontrado.")}
        fun number(name: String) = call.parameters[name]?.toIntOrNull() ?: throw Problem(400,"INVALID_ARTWORK","Diseño inválido.")
        val art=WalletArtwork(call.parameters["style"]?:"",number("symbol"),call.parameters["background"]?:"",number("filled"),number("total"))
        art.validate()
        need(version == 24 || art.symbol in 0..9,"NOT_FOUND","Diseño no encontrado.",404)
        val layout=call.request.queryParameters["layout"]
        need(layout==null || layout=="apple","INVALID_ARTWORK","Formato inválido.")
        call.respondBytes(io { art.png(if(layout=="apple") 3 else null,version) },ContentType.Image.PNG)
    }
    get("/wallet/logo.png") { call.respondBytes(walletLogo(660), ContentType.Image.PNG) }
    get("/api/me/wallet-status") { io { service.member(call.bearer()) }; call.respond(service.wallets.availability()) }
    get("/api/platform/wallet/status") {
        need(
            Security.equal(Security.hash(call.bearer()), Security.hash(platformToken)),
            "UNAUTHORIZED",
            "Acceso no autorizado.",
            401
        )
        call.respond(io { service.wallets.diagnostics() })
    }
    post("/api/me/wallet/{provider}/link") {
        val member = io { service.member(call.bearer()) }
        io { service.rateLimit("wallet-link:${member.tenant}:${member.id}", 10) }
        call.respond(io { when (call.parameters["provider"]) {
            "apple" -> service.wallets.appleLink(member)
            "google" -> service.wallets.googleLink(member)
            else -> throw Problem(404, "UNKNOWN_WALLET", "Proveedor de Wallet no válido.")
        } })
    }
    get("/wallet/apple/download/{ticket}") {
        io { service.rateLimit("wallet-download:${Security.hash(call.parameters["ticket"]!!)}", 12) }
        call.pkpass(io { service.wallets.ticketBytes(call.parameters["ticket"]!!) })
    }
    route("/wallet/apple/v1") {
        post("/devices/{device}/registrations/{type}/{serial}") {
            val token = call.appleToken(); val input = call.body<AppleRegistration>()
            io { service.rateLimit("apple-register:${Security.hash(token)}", 30) }
            val created = io { service.wallets.register(call.parameters["device"]!!, call.parameters["type"]!!, call.parameters["serial"]!!, token, input.pushToken) }
            call.respond(if (created) HttpStatusCode.Created else HttpStatusCode.OK)
        }
        delete("/devices/{device}/registrations/{type}/{serial}") {
            val token = call.appleToken()
            io { service.wallets.unregister(call.parameters["device"]!!, call.parameters["type"]!!, call.parameters["serial"]!!, token) }
            call.respond(HttpStatusCode.OK)
        }
        get("/devices/{device}/registrations/{type}") {
            val device = call.parameters["device"]!!
            io { service.rateLimit("apple-updates:${Security.hash(device)}", 60) }
            val result = io { service.wallets.updates(device, call.parameters["type"]!!, call.request.queryParameters["passesUpdatedSince"]) }
            if (result == null) call.respond(HttpStatusCode.NoContent) else call.respond(result)
        }
        get("/passes/{type}/{serial}") {
            val token = call.appleToken()
            io { service.rateLimit("apple-pass:${Security.hash(token)}", 30) }
            val pass = io { service.wallets.authenticatedPass(call.parameters["type"]!!, call.parameters["serial"]!!, token) }
            // Return the latest representation even when updates share a one-second HTTP timestamp.
            call.response.header(HttpHeaders.LastModified, DateTimeFormatter.RFC_1123_DATE_TIME.format(pass.updatedAt.atZone(ZoneOffset.UTC)))
            call.pkpass(io { service.wallets.authenticatedBytes(pass) })
        }
        post("/log") {
            io { service.rateLimit("apple-log:${call.request.local.remoteHost}", 10) }
            val input = call.body<AppleLog>(); need(
            input.logs.size <= 30 && input.logs.all { it.length <= 2000 },
            "INVALID_LOG",
            "Log demasiado largo."
        )
            // Wallet diagnostics can contain URLs and tokens. Do not retain raw client-provided logs.
            call.respond(HttpStatusCode.OK)
        }
    }
}
