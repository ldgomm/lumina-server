package com.premierdarkcoffee.loyalty.access

/** Consistency checks only: neither function certifies ownership or official registration. */
fun consistentCedula(value: String): Boolean {
    if (!value.matches(Regex("[0-9]{10}"))) return false
    val province = value.take(2).toInt()
    if (province !in 1..24 && province != 30) return false
    // Gob.EC documents valid third-digit exceptions; do not reject them by that digit.
    val sum = value.take(9).mapIndexed { index, digit ->
        val product = digit.digitToInt() * if (index % 2 == 0) 2 else 1
        if (product > 9) product - 9 else product
    }.sum()
    return (10 - sum % 10) % 10 == value.last().digitToInt()
}

/** SRI does not mandate a checksum algorithm for corporate/public/foreign RUCs. */
fun consistentRuc(value: String): Boolean =
    value.matches(Regex("[0-9]{10}001")) && value.take(10).any { it != '0' }
