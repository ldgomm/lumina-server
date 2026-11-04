package com.premierdarkcoffee.loyalty

import io.ktor.http.ContentType
import io.ktor.server.application.Application
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing

fun Application.localStagingRoutes(env: Map<String, String>) {
    if (env["LOYALTY_PROFILE"] != "local-staging") return
    val instance = uuid(requireNotNull(env["STAGING_INSTANCE_ID"]))
    val slug = "demo-cafe-${instance.take(8)}"
    val source = (env["LOYALTY_SOURCE_SHA"] ?: "working-tree").also { require(it == "working-tree" || it.matches(Regex("[a-f0-9]{64}"))) }
    routing {
        get("/api/staging/info") { call.respondText(obj("profile" to "local-staging", "instance" to instance, "sourceSha" to source, "clientPath" to "/join/$slug").toString(), ContentType.Application.Json) }
        get("/preview") {
            val page = requireNotNull(javaClass.getResource("/web/staging.html")).readText().replace("{{CLIENT_PATH}}", "/join/$slug").replace("{{BUILD}}", source.take(12))
            call.respondText(page, ContentType.Text.Html)
        }
    }
}
