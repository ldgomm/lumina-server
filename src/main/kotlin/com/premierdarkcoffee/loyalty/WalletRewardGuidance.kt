package com.premierdarkcoffee.loyalty

import java.math.BigDecimal

/** Presentation only: a forecast for one reward, never a reservation or a canje. */
internal fun walletRewardGuidance(available: Long, goal: Long, kind: String, currency: String, paused: Boolean): String {
    fun amount(value: Long) = when (kind) {
        "CASHBACK" -> BigDecimal.valueOf(value, 2).toPlainString() + " " + currency
        "STAMPS" -> "$value " + if (value == 1L) "sello" else "sellos"
        else -> "$value " + if (value == 1L) "punto" else "puntos"
    }
    if (paused) return "Canjes pausados. Tu saldo se conserva."
    if (available < goal) {
        val remaining = goal - available
        return "Te falta${if (remaining == 1L && kind != "CASHBACK") "" else "n"} ${amount(remaining)}."
    }
    return "Saldo suficiente. Pide el canje en caja.\n" +
        "Si canjeas este premio, te queda${if (available - goal == 1L && kind != "CASHBACK") "" else "n"} ${amount(available - goal)}.\nCaja confirma el saldo vigente antes del canje."
}
