package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Presentation only. Never computes an award or authorizes a redemption. */
private data class AppleReward(val source: JsonObject, val balance: JsonObject) {
    val id = source.getValue("id").jsonPrimitive.content
    val name = source.getValue("name").jsonPrimitive.content
    val goal = source.getValue("goal").jsonPrimitive.long
    val available = balance.getValue("available").jsonPrimitive.long
    val remaining = maxOf(0L, goal - available)
    val kind = balance.getValue("kind").jsonPrimitive.content
}

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

private fun WalletPass.appleRewards(balances: List<JsonObject>): List<AppleReward> {
    val programs = balances.mapNotNull { balance ->
        balance["programId"]?.jsonPrimitive?.contentOrNull?.let { it to balance }
    }.toMap()
    return snapshot["rewardProgress"]?.jsonArray.orEmpty().mapNotNull { item ->
        val reward = item.jsonObject
        val balance = programs[reward["programId"]?.jsonPrimitive?.contentOrNull] ?: return@mapNotNull null
        if ((reward["goal"]?.jsonPrimitive?.longOrNull ?: 0) <= 0) return@mapNotNull null
        if (reward["kind"] != balance["kind"]) return@mapNotNull null
        AppleReward(reward, balance)
    }.sortedWith(compareBy<AppleReward> { balances.indexOf(it.balance) }.thenBy { it.goal }.thenBy { it.id })
}

private fun AppleReward.detail(currency: String, symbol: String, paused: Boolean): String {
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
    val balances = snapshot.getValue("balances").jsonArray.map { it.jsonObject }.sortedBy {
        if (it["programId"]?.jsonPrimitive?.contentOrNull == design.featuredProgramId) 0 else 1
    }
    val first = balances.firstOrNull()
    val rewards = appleRewards(balances)
    // Costs and available units are comparable only within the same promotion.
    val target = rewards.firstOrNull { it.balance == first }
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
    extras += balances.drop(1).take(2 - extras.size).mapIndexed { index, balance ->
        val kind = balance.getValue("kind").jsonPrimitive.content
        val name = if (balances.count { it.getValue("kind").jsonPrimitive.content == kind } > 1) {
            balance.getValue("name").jsonPrimitive.content
        } else when (kind) { "POINTS" -> "Puntos"; "STAMPS" -> "Sellos"; else -> balance.getValue("name").jsonPrimitive.content }
        obj("key" to "extra_balance_$index", "label" to appleShort(name, 24),
            "value" to if (kind == "CASHBACK") JsonPrimitive(walletBalance(balance, currency)) else balance.getValue("available"))
    }
    val rewardDetails = rewards.map { reward -> obj("key" to "reward_${reward.id}",
        "label" to reward.name, "value" to reward.detail(currency, design.stampSymbol, paused)) }
    val zone = ZoneId.of(snapshot["timezone"]?.jsonPrimitive?.content ?: "America/Guayaquil")
    val updated = updatedAt.atZone(zone).format(DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm", Locale.forLanguageTag("es-EC")))
    return obj(
        // A stamp illustration occupies the strip. Keep the exact balance as native text above it.
        // v022 also represents points and cashback; native fields retain their own units.
        "headerFields" to if (artwork().total > 0) listOf(header, JsonObject(primaryWithChange + obj("label" to when(first?.get("kind")?.jsonPrimitive?.content){"STAMPS"->"SELLOS";"POINTS"->"PUNTOS";else->"SALDO"}))) else listOf(header),
        "primaryFields" to if (artwork().total > 0) emptyList<JsonObject>() else listOf(primaryWithChange),
        "secondaryFields" to listOf(obj("key" to "member", "label" to "Cliente", "value" to appleShort(snapshot.getValue("name").jsonPrimitive.content, 24))),
        "auxiliaryFields" to extras,
        "backFields" to (rewardDetails.filter { it["key"] == JsonPrimitive("reward_${target?.id}") } +
            (if(paused) emptyList() else earningRule(first?.get("programId")?.jsonPrimitive?.contentOrNull)?.let { listOf(obj("key" to "earning", "label" to "Cómo acumular en tu promoción", "value" to it)) }.orEmpty()) +
            listOf(obj("key" to "balances", "label" to "Saldos disponibles", "value" to summary())) +
            appleActivityFields() + rewardDetails.filter { it["key"] != JsonPrimitive("reward_${target?.id}") } +
            (if (paused) emptyList() else announcementFields()) + listOf(
            obj("key" to "member_detail", "label" to "Titular", "value" to snapshot.getValue("name")),
            obj("key" to "validity", "label" to "Estado de la tarjeta", "value" to if (paused) "Operaciones pausadas. Tus saldos se conservan." else "Válida en todas las sucursales de este negocio."),
            obj("key" to "usage", "label" to "Cómo usar tu tarjeta", "value" to design.usage),
            obj("key" to "updated", "label" to "Última actualización", "value" to "$updated\nHora del negocio. El saldo y las condiciones se confirman en caja.")
        ))
    )
}
