package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Native Wallet fields; balances from different programs always remain separate. */
fun WalletPass.appleStoreFields(): JsonObject {
    val design = design()
    val balances = snapshot.getValue("balances").jsonArray.map { it.jsonObject }.sortedBy { if(it["programId"]?.jsonPrimitive?.content==design.featuredProgramId)0 else 1 }
    val currency = snapshot.getValue("currency").jsonPrimitive.content
    val first = balances.firstOrNull()
    val paused = !snapshot.getValue("canOperate").jsonPrimitive.boolean
    val otherBalances = balances.drop(1).take(2).mapIndexed { index, balance ->
        val kind = balance.getValue("kind").jsonPrimitive.content
        val name = if (balances.count { it.getValue("kind").jsonPrimitive.content == kind } > 1) {
            balance.getValue("name").jsonPrimitive.content
        } else when (kind) {
            "POINTS" -> "Puntos"
            "STAMPS" -> "Sellos"
            else -> balance.getValue("name").jsonPrimitive.content
        }
        obj("key" to "extra_balance_$index", "label" to name,
            "value" to if (kind == "CASHBACK") JsonPrimitive(walletBalance(balance, currency)) else balance.getValue("available"))
    }
    return obj(
        "headerFields" to listOf(obj("key" to "card_state", "label" to "MEMBRESÍA", "value" to if (paused) "Pausada" else "Activa")),
        "primaryFields" to listOf(obj("key" to "balance", "label" to (first?.getValue("name") ?: JsonPrimitive("Tu tarjeta")),
            "value" to (first?.let { walletBalance(it, currency) } ?: design.welcome), "changeMessage" to "Saldo disponible: %@")),
        "secondaryFields" to listOf(obj("key" to "member", "label" to "Cliente", "value" to snapshot.getValue("name"))),
        "auxiliaryFields" to otherBalances,
        "backFields" to (listOf(obj("key" to "balances", "label" to "Saldos disponibles", "value" to summary())) + progressFields() + announcementFields() + appleActivityFields() + listOf(
            obj("key" to "validity", "label" to "Estado de la tarjeta", "value" to if (paused) "Operaciones pausadas. Tus saldos se conservan." else "Válida en todas las sucursales de este negocio."),
            obj("key" to "usage", "label" to "Cómo usar tu tarjeta", "value" to design.usage)
        ))
    )
}

/** One native detail field per movement, including local date and branch when available. */
fun WalletPass.appleActivityFields(): List<JsonObject> {
    val activity = snapshot["recentActivity"]?.jsonArray.orEmpty().take(5)
    if (activity.isEmpty()) return listOf(obj("key" to "activity", "label" to "Últimos movimientos", "value" to "Tu primera compra aparecerá aquí."))
    val zone = ZoneId.of(snapshot["timezone"]?.jsonPrimitive?.content ?: "America/Guayaquil")
    val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm", Locale.forLanguageTag("es-EC"))
    return activity.mapIndexed { index, item ->
        val event = item.jsonObject
        val kind = event["kind"]?.jsonPrimitive?.contentOrNull
        val type = when (kind) { "PURCHASE" -> "COMPRA"; "REDEMPTION" -> "CANJE"; else -> "MOVIMIENTO" }
        val date = Instant.parse(event.getValue("at").jsonPrimitive.content).atZone(zone).format(formatter)
        val label = event.getValue("label").jsonPrimitive.content
        val detail = when (kind) { "PURCHASE" -> label.removePrefix("Compra: "); "REDEMPTION" -> label.removePrefix("Canje: "); else -> label }
        val branch = event["branch"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
        obj("key" to "activity_$index", "label" to "$type · $date", "value" to (detail + (branch?.let { "\nSucursal: $it" } ?: "")))
    }
}
