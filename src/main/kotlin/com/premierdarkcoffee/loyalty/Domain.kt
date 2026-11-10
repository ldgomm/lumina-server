package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.time.*
import java.math.BigInteger
import java.util.UUID

val json = Json { encodeDefaults = true; ignoreUnknownKeys = false }
class Problem(val status: Int, val code: String, override val message: String) : RuntimeException(message)
fun need(ok: Boolean, code: String, message: String, status: Int = 400) { if (!ok) throw Problem(status, code, message) }
fun id() = UUID.randomUUID().toString()
fun uuid(value: String): String = try { UUID.fromString(value).toString() } catch (_: Exception) { throw Problem(400,"INVALID_ID","Identificador inválido.") }
fun text(value: String, max: Int = 120): String = value.trim().also { need(it.isNotEmpty() && it.length <= max,"INVALID_TEXT","Texto vacío o demasiado largo.") }
fun obj(vararg pairs: Pair<String, Any?>) = JsonObject(pairs.associate { it.first to element(it.second) })
fun element(v: Any?): JsonElement = when (v) {
    null -> JsonNull; is JsonElement -> v; is Boolean -> JsonPrimitive(v); is Number -> JsonPrimitive(v)
    is Iterable<*> -> JsonArray(v.map(::element)); else -> JsonPrimitive(v.toString())
}

enum class Kind { POINTS, CASHBACK, STAMPS }
@Serializable data class Window(
    val startsAt: String? = null, val endsAt: String? = null,
    val weekdays: Set<Int> = (1..7).toSet(), val localStart: String? = null, val localEnd: String? = null
) {
    fun validate() {
        try {
            val start = startsAt?.let(Instant::parse); val end = endsAt?.let(Instant::parse)
            need(start == null || end == null || end > start,"INVALID_WINDOW","La fecha final debe ser posterior.")
            need(weekdays.isNotEmpty() && weekdays.all { it in 1..7 },"INVALID_WEEKDAYS","Días válidos: 1 a 7.")
            need((localStart == null) == (localEnd == null),"INVALID_HOURS","Indica inicio y fin del horario.")
            if (localStart != null) need(LocalTime.parse(localStart) != LocalTime.parse(localEnd),"INVALID_HOURS","Las horas deben ser distintas.")
        } catch (e: DateTimeException) { throw Problem(400,"INVALID_WINDOW","Fecha u hora inválida.") }
    }
    fun matches(now: Instant, zone: ZoneId): Boolean {
        if (startsAt != null && now < Instant.parse(startsAt)) return false
        if (endsAt != null && now >= Instant.parse(endsAt)) return false
        val local = now.atZone(zone)
        if (localStart == null) return local.dayOfWeek.value in weekdays
        val start = LocalTime.parse(localStart); val end = LocalTime.parse(localEnd)
        val time = local.toLocalTime()
        if (start < end) return local.dayOfWeek.value in weekdays && time >= start && time < end
        // Overnight window belongs to its starting weekday (Friday 22:00 -> Saturday 02:00).
        return (time >= start && local.dayOfWeek.value in weekdays) ||
            (time < end && local.minusDays(1).dayOfWeek.value in weekdays)
    }
}
@Serializable data class Bonus(val priority: Int, val multiplier: Int, val window: Window = Window(), val branchIds: Set<String> = emptySet())
@Serializable data class Program(
    val name: String, val kind: Kind, val active: Boolean = true,
    val unitMinor: Long = 100, val pointsPerUnit: Long = 1, val cashbackBps: Int = 0,
    val stampsPerPurchase: Long = 1, val minimumSpendMinor: Long = 1,
    val branchIds: Set<String> = emptySet(), val window: Window = Window(), val bonuses: List<Bonus> = emptyList(),
    val productGroup: String = "", val countUnits: Boolean = false
) {
    fun validate() {
        text(name); window.validate()
        need(productGroup.length <= 60 && (!countUnits || kind == Kind.STAMPS),"INVALID_PRODUCT_RULE","El conteo por productos se usa con sellos.")
        need(unitMinor in 1..1_000_000_000 && pointsPerUnit in 1..1_000_000 && cashbackBps in 0..10_000 && stampsPerPurchase in 1..100 && minimumSpendMinor in 1..1_000_000_000,"INVALID_RULE","Valores de acumulación fuera de rango.")
        need(kind != Kind.CASHBACK || cashbackBps > 0,"INVALID_RULE","Define el porcentaje de cashback.")
        need(bonuses.size <= 30 && bonuses.map { it.priority }.distinct().size == bonuses.size,"AMBIGUOUS_PRIORITY","Cada bono debe tener prioridad distinta; máximo 30.")
        (branchIds + bonuses.flatMap { it.branchIds }).forEach(::uuid)
        bonuses.forEach { it.window.validate(); need(it.multiplier in 1..10,"INVALID_MULTIPLIER","Multiplicador entre 1 y 10.") }
    }
    fun earn(amount: Long, branch: String, now: Instant, zone: ZoneId): Long {
        if (!active || amount < minimumSpendMinor || branchIds.isNotEmpty() && branch !in branchIds || !window.matches(now,zone)) return 0
        val multiplier = bonuses.filter { it.window.matches(now,zone) && (it.branchIds.isEmpty() || branch in it.branchIds) }.maxByOrNull { it.priority }?.multiplier ?: 1
        val base = when(kind) {
            Kind.POINTS -> BigInteger.valueOf(amount / unitMinor).multiply(BigInteger.valueOf(pointsPerUnit))
            Kind.CASHBACK -> BigInteger.valueOf(amount).multiply(BigInteger.valueOf(cashbackBps.toLong())).divide(BigInteger.valueOf(10_000))
            Kind.STAMPS -> BigInteger.valueOf(stampsPerPurchase)
        }
        return base.multiply(BigInteger.valueOf(multiplier.toLong())).longValueExact()
    }
}
@Serializable data class NewTenant(val name: String, val slug: String, val currency: String = "USD", val timezone: String = "America/Guayaquil", val firstBranch: NewBranch? = null, val profile: BusinessProfile? = null)

@Serializable data class NewBranch(val name: String, val code: String)
@Serializable data class NewStaff(val role: String, val branchId: String? = null, val name: String? = null, val contact: String = "", val requestId: String? = null, val permissions: StaffPermissions? = null)
@Serializable data class Enrollment(val name: String, val document: String, val password: String, val acceptedTerms: Boolean)
@Serializable data class Login(val document: String, val password: String)
@Serializable data class ProgramChange(val expectedVersion: Int, val program: Program)
@Serializable data class Reward(val programId: String, val name: String, val cost: Long, val active: Boolean = true, val benefit: Benefit? = null)
@Serializable data class RewardChange(val expectedVersion: Int, val reward: Reward)
@Serializable data class Purchase(val memberId: String, val branchId: String, val receipt: String, val amountMinor: Long, val currency: String,
    val items: List<PurchaseItem> = emptyList(), val programIds: Set<String>? = null, val rewardId: String? = null,
    val expectedRevision: Long? = null, val expectedRewardVersion: Int? = null,
    val identityVerified: Boolean = false, val customerConfirmed: Boolean = false, val expectedEarningReview: String? = null)
@Serializable data class Reserve(val rewardId: String)
@Serializable data class Confirm(val token: String, val branchId: String)
@Serializable data class Lookup(val document: String? = null, val cardCode: String? = null)
