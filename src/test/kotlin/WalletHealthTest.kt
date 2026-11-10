package com.premierdarkcoffee.loyalty

import org.junit.jupiter.api.Test
import kotlin.test.*

class WalletHealthTest {
    @Test fun `wallet filters accept only bounded server values`() {
        WalletHealthQuery().validate(); WalletHealthQuery("APPLE","ATTENTION","Carla",25).validate()
        for(q in listOf(WalletHealthQuery(provider="OTHER"),WalletHealthQuery(state="INSTALLED"),WalletHealthQuery(offset=-25),WalletHealthQuery(offset=1),WalletHealthQuery(offset=1_000_025))) assertFailsWith<Problem>{q.validate()}
    }
    @Test fun `search rejects controls and oversized text but permits literal wildcards`() {
        WalletHealthQuery(search="O'Connor 50%_club").validate()
        for(q in listOf("a\nb","x".repeat(101)))assertFailsWith<Problem>{WalletHealthQuery(search=q).validate()}
    }
    @Test fun `retry requires a reviewed tag and a meaningful bounded reason`() {
        WalletRetry(1,"El cliente no ve la actualización").validate()
        for(r in listOf(WalletRetry(0,"Reintentar envío"),WalletRetry(-1,"Reintentar envío"),WalletRetry(1,"  "),WalletRetry(1,"a".repeat(501)),WalletRetry(1,"linea\notra")))assertFailsWith<Problem>{r.validate()}
    }
    @Test fun `diagnostic descriptions never reflect untrusted provider bodies`() {
        assertEquals("GOOGLE_DELIVERY_FAILED",walletDeliveryDiagnosticCode("GOOGLE","Bearer customer-secret"))
        assertEquals("APPLE_HTTP_503",walletDeliveryDiagnosticCode("APPLE","APPLE_HTTP_503"))
        assertEquals("GOOGLE_AUTH_403",walletDeliveryDiagnosticCode("GOOGLE","GOOGLE_AUTH_403"))
    }
}
