package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.math.BigInteger

/** Presentation only. A zero preview never creates a balance, purchase or redemption. */
fun WalletPass.presentationBalances(): List<JsonObject> {
    val existing = snapshot.getValue("balances").jsonArray.map { it.jsonObject }
    if (snapshot["canOperate"]?.jsonPrimitive?.booleanOrNull != true) return existing
    val ids = existing.mapNotNull { it["programId"]?.jsonPrimitive?.contentOrNull }.toMutableSet()
    val empty = snapshot["earningRules"]?.jsonArray.orEmpty().mapNotNull { entry ->
        val rule = entry.jsonObject
        val id = rule["programId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        val name = rule["programName"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        val kind = rule["kind"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        if (kind !in setOf("STAMPS", "POINTS", "CASHBACK") || !ids.add(id)) return@mapNotNull null
        obj("programId" to id, "name" to name, "kind" to kind, "available" to 0L)
    }
    return existing + empty
}

/** Exact units and target stay as native text, independently of the bounded illustration. */
data class WalletJourney(val available: Long, val goal: Long, val kind: String, val currency: String) {
    init { require(available >= 0 && goal > 0 && kind in setOf("POINTS", "STAMPS", "CASHBACK")) }
    val remaining: Long get() = if (available >= goal) 0 else goal - available
    val affordableRedemptions: Long get() = available / goal
    val balanceAfterOne: Long? get() = if (available >= goal) available - goal else null
    val redemptionLabel: String get() = "Saldo para $affordableRedemptions " + if (affordableRedemptions == 1L) "canje" else "canjes"
    val percent: Int get() = (BigInteger.valueOf(minOf(available, goal)) * BigInteger.valueOf(100) / BigInteger.valueOf(goal)).toInt()
    private fun number(value: Long) = if (kind == "CASHBACK") BigDecimal.valueOf(value, 2).toPlainString() else value.toString()
    private fun unit(value: Long) = when (kind) {
        "CASHBACK" -> currency
        "STAMPS" -> if (value == 1L) "sello" else "sellos"
        else -> if (value == 1L) "punto" else "puntos"
    }
    val summary: String get() = if (remaining == 0L) "${number(available)} ${unit(available)} disponible${if (available == 1L && kind != "CASHBACK") "" else "s"}" else "${number(available)} de ${number(goal)} ${unit(goal)}"
    val label: String get() = if (remaining == 0L) redemptionLabel else "PROGRESO · $percent%"
    val guidance: String get() = if (remaining == 0L) "$redemptionLabel de este premio. Confirma el canje en caja." else
        "Te falta${if (remaining == 1L && kind != "CASHBACK") "" else "n"} ${number(remaining)} ${unit(remaining)}."
}

/** An explicit reward is preferred only inside its own featured program. */
internal fun WalletDesign.rewardPriority(programId: String?, rewardId: String?): Int =
    if (featuredProgramId != null && featuredProgramId == programId && featuredRewardId != null && featuredRewardId == rewardId) 0 else 1

fun WalletPass.journey(): WalletJourney? {
    if (snapshot["canOperate"]?.jsonPrimitive?.booleanOrNull != true) return null
    val first = presentationBalances().sortedBy {
        if (it["programId"]?.jsonPrimitive?.contentOrNull == design().featuredProgramId) 0 else 1
    }.firstOrNull() ?: return null
    val target = snapshot["rewardProgress"]?.jsonArray.orEmpty().map { it.jsonObject }.filter {
        first["programId"] != null && it["programId"] == first["programId"] && it["kind"] == first["kind"] &&
            (it["goal"]?.jsonPrimitive?.longOrNull ?: 0) > 0
    }.sortedWith(compareBy<JsonObject> { design().rewardPriority(it["programId"]?.jsonPrimitive?.contentOrNull, it["id"]?.jsonPrimitive?.contentOrNull) }
        .thenBy { it.getValue("goal").jsonPrimitive.long }.thenBy { it.getValue("id").jsonPrimitive.content }).firstOrNull() ?: return null
    return WalletJourney(maxOf(0, first.getValue("available").jsonPrimitive.long), target.getValue("goal").jsonPrimitive.long,
        first.getValue("kind").jsonPrimitive.content, snapshot.getValue("currency").jsonPrimitive.content)
}
