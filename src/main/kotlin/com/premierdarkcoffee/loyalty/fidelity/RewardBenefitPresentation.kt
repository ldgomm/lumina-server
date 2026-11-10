package com.premierdarkcoffee.loyalty.fidelity

import com.premierdarkcoffee.loyalty.marketing.Benefit
import com.premierdarkcoffee.loyalty.shared.json

import java.math.BigDecimal

/** Describes the existing checkout rule; never calculates or authorizes a discount. */
internal fun Benefit.description(): String {
    val percent = BigDecimal.valueOf(percentBps.toLong(), 2).stripTrailingZeros().toPlainString().replace('.', ',')
    return when (scope) {
        "ITEM" -> "$percent% de descuento en una unidad de «$group», la de menor precio elegible."
        "BASKET" -> "$percent% de descuento en el total de la categoría «$group» de esta compra."
        else -> error("Unsupported benefit scope")
    }
}

internal fun rewardBenefitDescription(encoded: String?): String? = encoded?.let {
    json.decodeFromString<Benefit>(it).description()
}
