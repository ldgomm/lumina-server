package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj

import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletFirstDomainTest {
    @Test fun `new enrollment cannot receive a customer password`() {
        val input=json.decodeFromString<WalletEnrollment>("""{"name":"Ana","document":"0001234567","acceptedTerms":true}""")
        assertEquals("0001234567",input.document)
        assertFailsWith<SerializationException>{json.decodeFromString<WalletEnrollment>("""{"name":"Ana","document":"0001234567","acceptedTerms":true,"password":"not-accepted"}""")}
    }
    @Test fun `staff confirmation flags are false when omitted`() {
        val input=json.decodeFromString<CounterRedemption>("""{"memberId":"a","branchId":"b","rewardId":"c","expectedRevision":1,"expectedRewardVersion":1}""")
        assertFalse(input.identityVerified);assertFalse(input.customerConfirmed)
        assertFalse(json.decodeFromString<RestoreIssue>("""{"memberId":"a","reason":"DEVICE_CHANGE"}""").identityVerified)
    }
    @Test fun `Wallet activity is bounded local time and backwards compatible`() {
        val p=WalletPass("t","m","serial","token",obj("timezone" to "America/Guayaquil","recentActivity" to (1..7).map{obj("at" to "2026-11-03T15:00:00Z","label" to "Compra $it")}),1,Instant.EPOCH,null,null,null)
        assertEquals(5,p.recentActivity().lines().size)
        assertTrue(p.recentActivity().startsWith("03/11 10:00"));assertFalse(p.recentActivity().contains("Compra 6"))
        assertEquals("Tu primera compra aparecerá aquí.",p.copy(snapshot=obj()).recentActivity())
    }
}
