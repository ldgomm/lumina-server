package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/** Explain the actual rule, without estimating future spend, visit dates or granting benefits. */
internal fun walletEarningRules(program: Program, currency: String, zone: ZoneId): String {
    fun money(value: Long) = BigDecimal.valueOf(value,2).toPlainString()+" "+currency
    val base = when(program.kind) {
        Kind.STAMPS -> "${program.stampsPerPurchase} ${if(program.stampsPerPurchase==1L) "sello" else "sellos"} por ${if(program.countUnits) "unidad elegible" else "compra elegible"}."
        Kind.POINTS -> "${program.pointsPerUnit} ${if(program.pointsPerUnit==1L) "punto" else "puntos"} por cada ${money(program.unitMinor)} completos en una compra."
        Kind.CASHBACK -> BigDecimal.valueOf(program.cashbackBps.toLong(),2).stripTrailingZeros().toPlainString()+"% del importe elegible pagado."
    }
    val rules=mutableListOf(program.name, "Cómo acumulas: $base", "Mínimo elegible por compra: ${money(program.minimumSpendMinor)}.")
    if(program.productGroup.isNotBlank())rules+="Categoría: ${program.productGroup}. Se registran los productos en caja."
    rules+=if(program.branchIds.isEmpty()) "En todas las sucursales." else "Solo en sucursales habilitadas; consulta en caja."
    val w=program.window
    if(w.weekdays != (1..7).toSet())rules+="Días: "+w.weekdays.sorted().joinToString(", "){listOf("lun","mar","mié","jue","vie","sáb","dom")[it-1]}+"."
    if(w.localStart!=null)rules+="Horario: ${w.localStart}–${w.localEnd}${if(w.localStart>w.localEnd!!) " del día siguiente" else ""} (${zone.id})."
    val fmt=DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(zone)
    w.startsAt?.let { rules+="Desde: ${fmt.format(Instant.parse(it))} (${zone.id})." }
    w.endsAt?.let { rules+="Hasta: ${fmt.format(Instant.parse(it))} (${zone.id}), fin no incluido." }
    if(program.bonuses.isNotEmpty())rules+="Regla base. Los bonos dependen del horario y la sucursal; caja calcula el aplicable."
    rules+="Acumulas sobre el importe elegible pagado después de descuentos. Al usar un premio no acumulas en esa misma promoción."
    return rules.joinToString("\n")
}

internal fun WalletPass.earningRule(programId: String?): String? {
    // Before the first purchase there is no balance row yet. Use a visible reward's
    // promotion, still respecting the featured choice and the active-rule snapshot.
    val rules=snapshot["earningRules"]?.jsonArray.orEmpty().map { it.jsonObject }
    val visible=snapshot["rewardProgress"]?.jsonArray.orEmpty().mapNotNull {
        it.jsonObject["programId"]?.jsonPrimitive?.contentOrNull
    }
    val selected=programId ?: design().featuredProgramId?.takeIf { it in visible }
        ?: visible.firstOrNull { id -> rules.any { it["programId"]==JsonPrimitive(id) } }
        ?: return null
    return rules.firstOrNull { it["programId"]==JsonPrimitive(selected) }
        ?.get("text")?.jsonPrimitive?.contentOrNull
}
