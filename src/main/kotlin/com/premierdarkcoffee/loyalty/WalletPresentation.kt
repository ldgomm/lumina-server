package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Native Wallet fields; balances from different programs always remain separate. */
fun WalletPass.appleStoreFields(): JsonObject = appleExperienceFields()

/** One native detail field per movement, including local date and branch when available. */
fun WalletPass.appleActivityFields(): List<JsonObject> {
    val activity = snapshot["recentActivity"]?.jsonArray.orEmpty().sortedByDescending { Instant.parse(it.jsonObject.getValue("at").jsonPrimitive.content) }.take(5)
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
