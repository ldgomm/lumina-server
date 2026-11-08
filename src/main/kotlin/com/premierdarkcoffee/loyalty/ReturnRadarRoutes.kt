package com.premierdarkcoffee.loyalty

import io.ktor.server.application.ApplicationCall

fun ApplicationCall.radarQuery(): ReturnRadarQuery {
    val p=request.queryParameters
    val offset=p["offset"]?.let { it.toIntOrNull() ?: throw Problem(400,"INVALID_PAGE","Página inválida.") } ?: 0
    return ReturnRadarQuery(p["segment"]?:"FOCUS",p["q"]?:"",offset)
}
