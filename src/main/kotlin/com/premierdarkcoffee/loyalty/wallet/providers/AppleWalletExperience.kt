package com.premierdarkcoffee.loyalty.wallet.providers

import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.marketing.announcementFields
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.presentation.appleActivityFields
import com.premierdarkcoffee.loyalty.wallet.presentation.earningRule
import com.premierdarkcoffee.loyalty.wallet.presentation.journey
import com.premierdarkcoffee.loyalty.wallet.presentation.rewardFocus
import com.premierdarkcoffee.loyalty.wallet.presentation.WalletReward
import com.premierdarkcoffee.loyalty.wallet.presentation.walletRewardGuidance
import com.premierdarkcoffee.loyalty.wallet.summary

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private fun appleShort(value: String, limit: Int): String {
    val compact = value.trim().replace(Regex("\\s+"), " ")
    return if (compact.codePointCount(0, compact.length) <= limit) compact
    else compact.substring(0, compact.offsetByCodePoints(0, limit - 1)).trimEnd() + "…"
}

private fun appleAmount(amount: Long, kind: String, currency: String): String = when (kind) {
    "CASHBACK" -> BigDecimal.valueOf(amount, 2).toPlainString() + " " + currency
    "STAMPS" -> "$amount " + if (amount == 1L) "sello" else "sellos"
    else -> "$amount " + if (amount == 1L) "punto" else "puntos"
}

private fun WalletReward.detail(currency: String, symbol: String, paused: Boolean): String {
    val status = walletRewardGuidance(available, goal, kind, currency, paused)
    val stamps = if (kind == "STAMPS" && goal <= 20) {
        "\n" + (1..goal.toInt()).chunked(10).joinToString("\n") { row ->
            row.joinToString(" ") { if (it.toLong() <= available) symbol else "○" }
        }
    } else ""
    val benefit = source["benefitText"]?.jsonPrimitive?.contentOrNull?.let { "$it\n" } ?: ""
    return "${balance.getValue("name").jsonPrimitive.content}\n$benefit$status\n" +
        "Saldo: ${appleAmount(available, kind, currency)} · Canje: ${appleAmount(goal, kind, currency)}$stamps"
}

fun WalletPass.appleExperienceFields(): JsonObject {
    val design = design()
    val currency = snapshot.getValue("currency").jsonPrimitive.content
    val paused = !snapshot.getValue("canOperate").jsonPrimitive.boolean
    val focus = rewardFocus()
    val balances = focus.balances
    val rewards = focus.rewards
    val target = focus.target
    val first = balances.firstOrNull()
    val progress = if (paused) null else target?.journey(currency)
    val header = when {
        paused -> obj("key" to "card_state", "label" to "MEMBRESÍA", "value" to "Pausada")
        target == null -> obj("key" to "card_state", "label" to "MEMBRESÍA", "value" to "Activa")
        target.remaining == 0L -> obj("key" to "card_state", "label" to "PREMIO", "value" to "Disponible")
        else -> obj("key" to "card_state", "label" to if (target.remaining == 1L && target.kind != "CASHBACK") "TE FALTA" else "TE FALTAN", "value" to appleAmount(target.remaining, target.kind, currency))
    }
    val primary = when {
        first == null -> design.welcome
        target?.kind == "STAMPS" && target.remaining > 0 -> "${target.available} / ${target.goal}"
        else -> appleAmount(first.getValue("available").jsonPrimitive.long, first.getValue("kind").jsonPrimitive.content, currency)
    }
    val primaryField = obj("key" to "balance", "label" to appleShort(first?.getValue("name")?.jsonPrimitive?.content ?: "Tu tarjeta", 36), "value" to appleShort(primary, 44))
    // Preserve transactional balance updates. Marketing and detail fields never add alerts.
    val primaryWithChange = if (first != null && !paused) JsonObject(primaryField + obj("changeMessage" to if (target?.kind == "STAMPS") "Progreso actualizado: %@" else "Saldo disponible: %@")) else primaryField
    val extras = mutableListOf<JsonObject>()
    if (target != null) extras += obj("key" to "featured_reward", "label" to when {
        paused -> "PREMIO PAUSADO"
        target.remaining == 0L -> "CANJEA EN CAJA"
        else -> "PRÓXIMO PREMIO"
    }, "value" to appleShort(target.name, 28))
    val rewardDetails = rewards.map { reward -> obj("key" to "reward_${reward.id}",
        "label" to reward.name, "value" to reward.detail(currency, design.stampSymbol, paused)) }
    val zone = ZoneId.of(snapshot["timezone"]?.jsonPrimitive?.content ?: "America/Guayaquil")
    val updated = updatedAt.atZone(zone).format(DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm", Locale.forLanguageTag("es-EC")))
    val fields = obj(
        // One header and two full-width-friendly fields avoid four competing columns.
        "headerFields" to if (progress != null) listOf(JsonObject(primaryWithChange + obj("label" to when(first?.get("kind")?.jsonPrimitive?.content){"STAMPS"->"SELLOS";"POINTS"->"PUNTOS";else->"SALDO"}))) else listOf(header),
        "primaryFields" to if (progress != null) emptyList<JsonObject>() else listOf(primaryWithChange),
        "secondaryFields" to (progress?.let { listOf(obj("key" to "journey", "label" to when {
            it.remaining == 0L -> it.readyLabel
            else -> "Falta${if(it.remaining==1L && it.kind!="CASHBACK") "" else "n"} ${appleAmount(it.remaining, it.kind, currency)}"
        }, "value" to it.summary)) } ?: listOf(obj("key" to "member", "label" to "Cliente", "value" to appleShort(snapshot.getValue("name").jsonPrimitive.content, 24)))),
        "auxiliaryFields" to extras,
        "backFields" to (rewardDetails.filter { it["key"] == JsonPrimitive("reward_${target?.id}") } +
            progress?.let { listOf(obj("key" to "journey_detail", "label" to "Tu avance hacia el premio", "value" to "${it.summary}\n${it.guidance}")) }.orEmpty() +
            (if(paused) emptyList() else earningRule(first?.get("programId")?.jsonPrimitive?.contentOrNull)?.let { listOf(obj("key" to "earning", "label" to "Cómo acumular en tu promoción", "value" to it)) }.orEmpty()) +
            listOf(JsonObject(header + obj("key" to "card_state_detail")), obj("key" to "balances", "label" to "Saldos disponibles", "value" to summary())) +
            appleActivityFields() + rewardDetails.filter { it["key"] != JsonPrimitive("reward_${target?.id}") } +
            (if (paused) emptyList() else announcementFields()) + listOf(
            obj("key" to "member_detail", "label" to "Titular", "value" to snapshot.getValue("name")),
            obj("key" to "validity", "label" to "Estado de la tarjeta", "value" to if (paused) "Operaciones pausadas. Tus saldos se conservan." else "Válida en todas las sucursales de este negocio."),
            obj("key" to "usage", "label" to "Cómo usar tu tarjeta", "value" to design.usage),
            obj("key" to "updated", "label" to "Última actualización", "value" to "$updated\nHora del negocio. El saldo y las condiciones se confirman en caja.")
        ))
    )
    val rewardFirst = design.frontFocus == "REWARD" || design.frontFocus == "AUTO" &&
        design.composition in setOf("EDITORIAL","TICKET","RIBBON","PANORAMA","ATELIER")
    return if(rewardFirst && progress != null) JsonObject(fields + obj(
        "secondaryFields" to fields.getValue("auxiliaryFields"),
        "auxiliaryFields" to fields.getValue("secondaryFields")
    )) else fields
}

/** iOS/watchOS 27 poster; storeCard remains the fallback for earlier systems. */
fun WalletPass.applePosterFields(): JsonObject {
    val fields = appleExperienceFields()
    val header = fields.getValue("headerFields").jsonArray
    val primary = fields.getValue("primaryFields").jsonArray
    val secondary = fields.getValue("secondaryFields").jsonArray
    val reward = fields.getValue("auxiliaryFields").jsonArray
    val hasProgress = journey() != null
    return obj(
        "headerFields" to header,
        "primaryFields" to if(hasProgress) secondary + reward else primary + reward,
        "footerFields" to listOf(obj("key" to "poster_member", "label" to "Titular", "value" to appleShort(snapshot.getValue("name").jsonPrimitive.content,32))),
        "backFields" to fields.getValue("backFields")
    )
}
