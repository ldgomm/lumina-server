package com.premierdarkcoffee.loyalty.wallet



/** Stable codes only. Provider messages can contain pass contents or credentials. */
fun walletDeliveryDiagnosticCode(provider: String, reason: String?): String {
    val name = provider.takeIf { it == "APPLE" || it == "GOOGLE" } ?: "WALLET"
    val known = when (name) {
        "GOOGLE" -> reason?.matches(Regex("GOOGLE_(AUTH|CLASS|OBJECT|DESIGN)_[1-5][0-9]{2}")) == true
        "APPLE" -> reason?.matches(Regex("APPLE_HTTP_[1-5][0-9]{2}")) == true ||
            reason in setOf("APPLE_SIGN_TIMEOUT", "APPLE_SIGN_FAILED")
        else -> false
    }
    return if (known) requireNotNull(reason) else "${name}_DELIVERY_FAILED"
}
