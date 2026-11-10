package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.shared.text

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals

class WalletDeliveryDiagnosticsTest {
    @Test fun `Google retains the failed operation and HTTP status`() {
        for (stage in listOf("AUTH", "CLASS", "OBJECT", "DESIGN")) {
            for (status in listOf(400, 401, 403, 404, 429, 500, 503)) {
                val code = "GOOGLE_${stage}_$status"
                assertEquals(code, walletDeliveryDiagnosticCode("GOOGLE", code))
            }
        }
    }

    @Test fun `Apple retains HTTP and signing failures`() {
        for (code in listOf("APPLE_HTTP_403", "APPLE_HTTP_429", "APPLE_HTTP_503", "APPLE_SIGN_TIMEOUT", "APPLE_SIGN_FAILED")) {
            assertEquals(code, walletDeliveryDiagnosticCode("APPLE", code))
        }
    }

    @Test fun `unknown text secrets and cross provider errors are never disclosed`() {
        for (value in listOf(null, "PRIVATE_SENTINEL", "GOOGLE_SECRET_SENTINEL", "GOOGLE_OBJECT_400\nBearer secret",
            "GOOGLE_OBJECT_999", "https://private.example/key", "APPLE_HTTP_403")) {
            assertEquals("GOOGLE_DELIVERY_FAILED", walletDeliveryDiagnosticCode("GOOGLE", value))
        }
        assertEquals("APPLE_DELIVERY_FAILED", walletDeliveryDiagnosticCode("APPLE", "GOOGLE_DESIGN_400"))
        assertEquals("WALLET_DELIVERY_FAILED", walletDeliveryDiagnosticCode("PRIVATE_SENTINEL", "PRIVATE_SENTINEL"))
    }
}
