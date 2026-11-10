package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.math.BigInteger

/** Opt-in prioritization, shared by both providers and the illustration. Never combines balances. */
internal fun WalletPass.prioritizedBalances(): List<JsonObject> {
    val design = design()
    val balances = presentationBalances()
    if (design.automaticPriority != "PROGRESS" || snapshot["canOperate"]?.jsonPrimitive?.booleanOrNull != true) {
        return balances.sortedBy { if (it["programId"]?.jsonPrimitive?.contentOrNull == design.featuredProgramId) 0 else 1 }
    }
    val rewards = snapshot["rewardProgress"]?.jsonArray.orEmpty().map { it.jsonObject }
    fun ratio(balance: JsonObject): Pair<BigInteger, BigInteger>? {
        val goal = rewards.filter { it["programId"] == balance["programId"] && it["kind"] == balance["kind"] }
            .mapNotNull { it["goal"]?.jsonPrimitive?.longOrNull?.takeIf { goal -> goal > 0 } }.minOrNull() ?: return null
        val available = (balance["available"]?.jsonPrimitive?.longOrNull ?: 0).coerceIn(0, goal)
        return BigInteger.valueOf(available) to BigInteger.valueOf(goal)
    }
    return balances.sortedWith { a, b ->
        val fixedA = a["programId"]?.jsonPrimitive?.contentOrNull == design.featuredProgramId
        val fixedB = b["programId"]?.jsonPrimitive?.contentOrNull == design.featuredProgramId
        if (fixedA != fixedB) return@sortedWith if (fixedA) -1 else 1
        val ra = ratio(a); val rb = ratio(b)
        when {
            ra == null && rb != null -> 1
            rb == null && ra != null -> -1
            ra != null && rb != null -> (rb.first * ra.second).compareTo(ra.first * rb.second)
            else -> 0
        }
        // Stable sorting preserves the server's order when progress is tied.
    }
}
