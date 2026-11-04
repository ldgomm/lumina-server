package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import java.time.LocalDate
import java.time.YearMonth

fun billingDate(value: String): LocalDate = try { LocalDate.parse(value) } catch (_: Exception) {
    throw Problem(400, "INVALID_DATE", "Usa una fecha válida: AAAA-MM-DD.")
}

fun nextBillingDate(current: LocalDate, months: Int, anchor: Int): LocalDate {
    val month = YearMonth.from(current).plusMonths(months.toLong())
    return month.atDay(minOf(anchor, month.lengthOfMonth()))
}

@Serializable data class MembershipPlan(
    val name: String,
    val feeMinor: Long,
    val startedOn: String,
    val nextChargeOn: String,
    val intervalMonths: Int = 1,
    val dueDays: Int = 7,
    val graceDays: Int = 7,
    val autoSuspend: Boolean = false,
    val recurring: Boolean = true,
    val anchorDay: Int = billingDate(nextChargeOn).dayOfMonth
) {
    fun validate(today: LocalDate) {
        text(name, 100)
        need(feeMinor in 0..1_000_000_000, "INVALID_AMOUNT", "Tarifa fuera del rango permitido.")
        need(intervalMonths in setOf(1, 3, 6, 12) && dueDays in 0..90 && graceDays in 0..90 && anchorDay in 1..31,
            "INVALID_PLAN", "Revisa el ciclo, el día de corte y los plazos.")
        val start = billingDate(startedOn); val next = billingDate(nextChargeOn)
        need(start <= today && start >= today.minusYears(100) && next >= start && next >= today && next <= today.plusYears(5),
            "INVALID_DATE", "El alta no puede ser futura. El próximo cargo debe ser hoy o una fecha futura.")
        need(next.dayOfMonth == minOf(anchorDay, next.lengthOfMonth()), "INVALID_ANCHOR", "El día de corte debe coincidir con la fecha del próximo cargo.")
    }
}
@Serializable data class MembershipChange(val expectedVersion: Int, val plan: MembershipPlan)
@Serializable data class AccessChange(val state: String, val reason: String, val expectedVersion: Int)
@Serializable data class NewCharge(val description: String, val amountMinor: Long, val dueOn: String)
@Serializable data class RecordPayment(val invoiceId: String, val amountMinor: Long, val reference: String, val method: String, val paidOn: String)
@Serializable data class Correction(val reason: String)
@Serializable data class BusinessNotice(val title: String, val body: String, val severity: String = "INFO", val expiresOn: String? = null)
