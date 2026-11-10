package com.premierdarkcoffee.loyalty.wallet.providers

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.presentation.earningRule
import com.premierdarkcoffee.loyalty.wallet.presentation.journey
import com.premierdarkcoffee.loyalty.wallet.presentation.prioritizedBalances
import com.premierdarkcoffee.loyalty.wallet.presentation.rewardPriority
import com.premierdarkcoffee.loyalty.wallet.presentation.walletRewardGuidance
import com.premierdarkcoffee.loyalty.wallet.recentActivity
import com.premierdarkcoffee.loyalty.wallet.summary
import com.premierdarkcoffee.loyalty.wallet.walletBalance

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Google-native presentation only. The ledger and cashier still authorize every award. */
private data class GoogleReward(val source: JsonObject, val balance: JsonObject) {
    val id = source.getValue("id").jsonPrimitive.content
    val name = source.getValue("name").jsonPrimitive.content
    val goal = source.getValue("goal").jsonPrimitive.long
    val available = balance.getValue("available").jsonPrimitive.long
    val remaining = maxOf(0L, goal - available)
    val kind = balance.getValue("kind").jsonPrimitive.content
}

private fun googleShort(value: String, limit: Int): String {
    val text = value.trim().replace(Regex("\\s+"), " ")
    return if (text.codePointCount(0, text.length) <= limit) text
    else text.substring(0, text.offsetByCodePoints(0, limit - 1)).trimEnd() + "…"
}

private fun googleAmount(value: Long, kind: String, currency: String): String = when (kind) {
    "CASHBACK" -> BigDecimal.valueOf(value, 2).toPlainString() + " " + currency
    "STAMPS" -> "$value " + if (value == 1L) "sello" else "sellos"
    else -> "$value " + if (value == 1L) "punto" else "puntos"
}

private fun GoogleReward.detail(currency: String, symbol: String, paused: Boolean): String {
    val status = walletRewardGuidance(available, goal, kind, currency, paused)
    val grid = if (kind == "STAMPS" && goal <= 20) "\n" + (1..goal.toInt()).chunked(10).joinToString("\n") { row ->
        row.joinToString(" ") { if (it.toLong() <= available) symbol else "○" }
    } else ""
    val benefit = source["benefitText"]?.jsonPrimitive?.contentOrNull?.let { "$it\n" } ?: ""
    return "$name\n${balance.getValue("name").jsonPrimitive.content}\n$benefit$status\n" +
        "Saldo: ${googleAmount(available, kind, currency)} · Canje: ${googleAmount(goal, kind, currency)}$grid"
}

/** Keep whole records and exact amounts. If the native module budget fills, disclose it. */
private fun googleModules(id: String, title: String, entries: List<String>, pages: Int): List<JsonObject> {
    val groups = mutableListOf<MutableList<String>>()
    var included = 0
    for (entry in entries) {
        if (groups.isEmpty() || (groups.last() + entry).joinToString("\n\n").length > 500) {
            if (groups.size == pages) break
            groups.add(mutableListOf())
        }
        groups.last().add(entry)
        included++
    }
    if (included < entries.size) {
        val last = groups.last()
        fun notice() = "${entries.size - included} registros adicionales. Consulta en caja."
        while (last.isNotEmpty() && (last + notice()).joinToString("\n\n").length > 500) {
            last.removeAt(last.lastIndex)
            included--
        }
        last.add(notice())
    }
    return groups.mapIndexed { index, group -> obj("id" to "${id}_$index",
        "header" to googleShort(if (index == 0) title else "$title · ${index + 1}", 35),
        "body" to group.joinToString("\n\n")) }
}

fun WalletPass.googleExperienceFields(): JsonObject {
    val design = design()
    val currency = snapshot.getValue("currency").jsonPrimitive.content
    val paused = !snapshot.getValue("canOperate").jsonPrimitive.boolean
    val balances = prioritizedBalances()
    val byId = balances.mapNotNull { balance -> balance["programId"]?.jsonPrimitive?.contentOrNull?.let { it to balance } }.toMap()
    val rewards = snapshot["rewardProgress"]?.jsonArray.orEmpty().mapNotNull { value ->
        val reward = value.jsonObject
        val balance = byId[reward["programId"]?.jsonPrimitive?.contentOrNull] ?: return@mapNotNull null
        if ((reward["goal"]?.jsonPrimitive?.longOrNull ?: 0) <= 0 || reward["kind"] != balance["kind"]) return@mapNotNull null
        GoogleReward(reward, balance)
    }.sortedWith(compareBy<GoogleReward> { balances.indexOf(it.balance) }
        .thenBy { design.rewardPriority(it.source["programId"]?.jsonPrimitive?.contentOrNull, it.id) }.thenBy { it.goal }.thenBy { it.id })
    val first = balances.firstOrNull()
    val target = rewards.firstOrNull { it.balance == first }
    val progress = journey()
    val kind = first?.getValue("kind")?.jsonPrimitive?.content
    val mainLabel = when (kind) { "STAMPS" -> "Sellos"; "POINTS" -> "Puntos"; "CASHBACK" -> currency; else -> "Tarjeta" }
    val mainValue = when {
        first == null -> if (paused) "Pausada" else "Activa"
        target?.kind == "STAMPS" && target.remaining > 0 -> "${target.available}/${target.goal}"
        kind == "CASHBACK" -> BigDecimal.valueOf(first.getValue("available").jsonPrimitive.long, 2).toPlainString()
        else -> first.getValue("available").jsonPrimitive.content
    }
    val (secondaryLabel, secondaryValue) = when {
        paused -> "Estado" to "Pausada"
        target == null -> "Estado" to "Activa"
        target.remaining == 0L -> "Por saldo" to "${target.available / target.goal} " + if (target.available / target.goal == 1L) "canje" else "canjes"
        else -> (if (target.remaining == 1L && target.kind != "CASHBACK") "Falta" else "Faltan") to googleAmount(target.remaining, target.kind, currency)
    }
    val zone = ZoneId.of(snapshot["timezone"]?.jsonPrimitive?.content ?: "America/Guayaquil")
    val formatter = DateTimeFormatter.ofPattern("dd MMM yyyy · HH:mm", Locale.forLanguageTag("es-EC"))
    val activity = snapshot["recentActivity"]?.jsonArray.orEmpty()
        .sortedByDescending { Instant.parse(it.jsonObject.getValue("at").jsonPrimitive.content) }.take(5).map { value ->
            val event = value.jsonObject
            val date = Instant.parse(event.getValue("at").jsonPrimitive.content).atZone(zone).format(formatter)
            val branch = event["branch"]?.jsonPrimitive?.contentOrNull?.takeIf { it.isNotBlank() }
            "$date\n${event.getValue("label").jsonPrimitive.content}" + (branch?.let { "\nSucursal: $it" } ?: "")
        }.ifEmpty { listOf("Tu primera compra aparecerá aquí.") }
    val featured = target?.detail(currency, design.stampSymbol, paused)
        ?: first?.let { "${it.getValue("name").jsonPrimitive.content}\nSaldo: ${walletBalance(it, currency)}" }
        ?: design.welcome
    // At most ten object modules: featured 1 + balances 2 + rewards 2 + history 2 + status 1 + usage 1 + news 1.
    // v022 reallocates one rewards module to a compact headline on the front.
    val headline=obj("id" to "headline", "header" to when {paused->"Estado";target==null->"Tu promoción";target.remaining==0L->"Premio en caja";else->"Próximo premio"},
        "body" to googleShort(if(paused)"Operaciones pausadas" else target?.name ?: first?.getValue("name")?.jsonPrimitive?.content ?: design.welcome,44))
    val earning=if(paused) null else earningRule(first?.get("programId")?.jsonPrimitive?.contentOrNull)
    val journeyModule = obj("id" to "journey", "header" to (if(progress?.remaining == 0L) progress.redemptionLabel else if(progress != null) "Tu avance" else "Tu tarjeta"),
        "body" to (progress?.summary ?: if (paused) "Operaciones pausadas" else "Acumula en tus promociones activas"))
    val modules = listOf(headline,journeyModule,obj("id" to "featured", "header" to when { paused -> "Operaciones pausadas"; target == null -> "Tu promoción"; target.remaining == 0L -> "Tu premio disponible"; else -> "Tu próximo premio" }, "body" to featured)) +
        googleModules("balances", "Saldos por promoción", balances.map { "${it.getValue("name").jsonPrimitive.content}\n${walletBalance(it, currency)}" }, if(earning==null) 2 else 1) +
        (earning?.let { listOf(obj("id" to "earning", "header" to "Cómo acumular", "body" to it)) }.orEmpty()) +
        googleModules("rewards", "Otros premios", rewards.filter { it != target }.map { it.detail(currency, design.stampSymbol, paused) }, 1) +
        googleModules("activity", "Últimos consumos y canjes", activity, 2) + listOf(
            obj("id" to "status", "header" to "Tu tarjeta", "body" to "Titular: ${snapshot.getValue("name").jsonPrimitive.content}\n" +
                (if (paused) "Operaciones pausadas. Tus saldos se conservan." else "Válida en todas las sucursales de este negocio.") +
                "\nActualizada: ${updatedAt.atZone(zone).format(formatter)}\nHora del negocio. El saldo y las condiciones se confirman en caja.\n\n${design.usage}")) +
        (if (paused) emptyList() else googleModules("news", "Novedades del negocio", snapshot["announcements"]?.jsonArray.orEmpty().map {
            val notice = it.jsonObject; "${notice.getValue("title").jsonPrimitive.content}\n${notice.getValue("body").jsonPrimitive.content}"
        }, 1))
    return obj("accountName" to googleShort(snapshot.getValue("name").jsonPrimitive.content, 20),
        "loyaltyPoints" to obj("label" to mainLabel, "balance" to obj("string" to mainValue)),
        // Replace both native slots: PATCH must not leave a deleted promotion's old reward here.
        "secondaryLoyaltyPoints" to obj("label" to secondaryLabel, "balance" to obj("string" to secondaryValue)),
        "textModulesData" to modules)
}
