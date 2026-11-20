package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import kotlinx.serialization.json.*
import java.math.BigInteger

internal data class WalletReward(val source: JsonObject, val balance: JsonObject) {
    val id = source.getValue("id").jsonPrimitive.content
    val name = source.getValue("name").jsonPrimitive.content
    val programId = balance.getValue("programId").jsonPrimitive.content
    val kind = balance.getValue("kind").jsonPrimitive.content
    val goal = source.getValue("goal").jsonPrimitive.long
    val available = balance.getValue("available").jsonPrimitive.long.coerceAtLeast(0)
    val remaining = (goal - available).coerceAtLeast(0)

    fun journey(currency: String) = WalletJourney(available, goal, kind, currency)

    // Fractions compare points, stamps and cashback without ever adding or converting their units.
    private val earned = BigInteger.valueOf(minOf(available, goal))
    private val threshold = BigInteger.valueOf(goal)
    fun compareProgress(other: WalletReward): Int =
        (other.earned * threshold).compareTo(earned * other.threshold)
}

internal data class WalletFocus(val balances: List<JsonObject>, val rewards: List<WalletReward>) {
    val target get() = rewards.firstOrNull()
}

internal fun WalletPass.rewardFocus(): WalletFocus {
    val design = design()
    val balances = presentationBalances()
    val byProgram = balances.associateBy { it["programId"]?.jsonPrimitive?.contentOrNull }
    val rewards = snapshot["rewardProgress"]?.jsonArray.orEmpty().mapNotNull { item ->
        val reward = item.jsonObject
        val program = reward["programId"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
        val balance = byProgram[program] ?: return@mapNotNull null
        if (reward["kind"] != balance["kind"] || (reward["goal"]?.jsonPrimitive?.longOrNull ?: 0) <= 0) return@mapNotNull null
        WalletReward(reward, balance)
    }.sortedWith(compareByProgress
        .thenBy { design.rewardPriority(it.programId, it.id) }
        .thenBy { it.programId != design.featuredProgramId }
        .thenBy { it.programId }.thenBy { it.goal }.thenBy { it.id })
    val ordered = LinkedHashSet<JsonObject>()
    rewards.mapTo(ordered) { it.balance }
    ordered.addAll(balances.sortedBy { it["programId"]?.jsonPrimitive?.contentOrNull != design.featuredProgramId })
    return WalletFocus(ordered.toList(), rewards)
}

private val compareByProgress = Comparator(WalletReward::compareProgress)
