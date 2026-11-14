package com.premierdarkcoffee.loyalty.access

import com.premierdarkcoffee.loyalty.shared.need

/** Contact only: never an identity, recovery secret or permission to send marketing. */
fun contactPhone(value: String?): String {
    val raw = value?.trim().orEmpty()
    need(raw.length <= 30 && raw.matches(Regex("[+]?[0-9 ()-]+")), "INVALID_PHONE", "Escribe tu teléfono, por ejemplo 099 123 4567.")
    var digits = raw.filter { it in '0'..'9' }
    if (digits.matches(Regex("09[0-9]{8}|0[2-7][0-9]{7}"))) digits = "593" + digits.drop(1)
    need(digits.matches(Regex("[1-9][0-9]{7,14}")) &&
        (if (digits.startsWith("593")) digits.matches(Regex("593(9[0-9]{8}|[2-7][0-9]{7})")) else raw.startsWith("+")),
        "INVALID_PHONE", "Revisa el teléfono. Para otro país, incluye + y el código del país.")
    return "+$digits"
}
