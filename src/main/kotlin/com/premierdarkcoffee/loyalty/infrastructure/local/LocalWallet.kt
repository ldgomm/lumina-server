package com.premierdarkcoffee.loyalty.infrastructure.local



/** Explicit loopback browser access for the local Docker pilot while Wallet uses HTTPS. */
fun localWalletOrigin(environment: Map<String, String>): String? {
    val value = environment["LOYALTY_LOCAL_BROWSER_ORIGIN"]?.takeIf { it.isNotBlank() } ?: return null
    require(environment["LOYALTY_PROFILE"] == "local-staging") { "Local browser origin requires local-staging." }
    val match = Regex("http://(localhost|127\\.0\\.0\\.1):([0-9]{4,5})").matchEntire(value)
    require(match != null && match.groupValues[2].toInt() in 1024..65535) { "Local browser origin must be an explicit loopback port." }
    return value
}
