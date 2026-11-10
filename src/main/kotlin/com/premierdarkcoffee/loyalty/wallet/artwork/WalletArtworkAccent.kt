package com.premierdarkcoffee.loyalty.wallet.artwork

import com.premierdarkcoffee.loyalty.shared.text

import java.awt.Color
import kotlin.math.pow
import kotlin.math.roundToInt

/** Only the illustration is tinted. Native text, logos, QR and monetary values remain independent. */
internal fun walletArtworkAccent(requested: String?, base: Color, fallback: Color): Color {
    if (requested == null) return fallback // Immutable rendering for all earlier artwork URLs.
    val chosen = Color.decode("#$requested")
    if (walletArtworkContrast(base, chosen) >= 3.0) return chosen
    val target = if (walletArtworkContrast(base, Color.BLACK) >= walletArtworkContrast(base, Color.WHITE)) Color.BLACK else Color.WHITE
    for (step in 1..100) {
        fun mix(a: Int, b: Int) = (a + (b - a) * step / 100.0).roundToInt()
        val candidate = Color(mix(chosen.red, target.red), mix(chosen.green, target.green), mix(chosen.blue, target.blue))
        if (walletArtworkContrast(base, candidate) >= 3.0) return candidate
    }
    return target
}

internal fun walletArtworkContrast(a: Color, b: Color): Double {
    fun luminance(c: Color): Double {
        fun channel(n: Int): Double { val v = n / 255.0; return if (v <= .04045) v / 12.92 else ((v + .055) / 1.055).pow(2.4) }
        return channel(c.red) * .2126 + channel(c.green) * .7152 + channel(c.blue) * .0722
    }
    val x = luminance(a); val y = luminance(b)
    return (maxOf(x, y) + .05) / (minOf(x, y) + .05)
}
