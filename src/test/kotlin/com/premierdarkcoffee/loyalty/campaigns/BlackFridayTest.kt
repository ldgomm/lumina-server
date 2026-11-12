package com.premierdarkcoffee.loyalty.campaigns

import com.premierdarkcoffee.loyalty.shared.*
import com.premierdarkcoffee.loyalty.businesses.SimplePromotionSetup
import com.premierdarkcoffee.loyalty.marketing.Benefit
import com.premierdarkcoffee.loyalty.wallet.presentation.walletEarningRules
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId
import kotlin.test.*

class BlackFridayTest {
    private val zone=ZoneId.of("America/Guayaquil")
    private fun campaign()=Program("Viernes Negro",Kind.STAMPS,window=Window(startsAt="2026-11-01T05:00:00Z",endsAt="2026-12-01T05:00:00Z"),blackFridayYear=2026,blackFridayMessage="Un premio por cada tres compras elegibles.")
    @Test fun `last night of November is eligible until Ecuador midnight`() {
        val p=campaign();p.validate()
        assertEquals(1,p.earn(1000,id(),Instant.parse("2026-12-01T04:59:59.999Z"),zone))
        assertEquals(0,p.earn(1000,id(),blackFridayEnd(2026),zone))
        assertEquals(Instant.parse("2026-12-01T05:00:00Z"),blackFridayEnd(2026))
    }
    @Test fun `season does not reactivate next November even if active remains true`() {
        assertFalse(campaign().blackFridayAvailable(Instant.parse("2027-11-27T17:00:00Z")))
        assertFalse(campaign().blackFridayAvailable(blackFridayStart(2026).minusNanos(1)))
        assertTrue(campaign().blackFridayAvailable(blackFridayStart(2026)))
    }
    @Test fun `shorter campaigns expire exclusively at their own end`() {
        val p=campaign().copy(window=Window(startsAt="2026-11-27T05:00:00Z",endsAt="2026-11-28T05:00:00Z"));p.validate()
        assertTrue(p.blackFridayAvailable(Instant.parse("2026-11-28T04:59:59Z")))
        assertFalse(p.blackFridayAvailable(Instant.parse("2026-11-28T05:00:00Z")))
    }
    @Test fun `missing outside or unbounded campaign dates are rejected`() {
        for(w in listOf(Window(),Window(startsAt="2026-11-01T05:00:00Z"),Window(startsAt="2026-10-31T05:00:00Z",endsAt="2026-12-01T05:00:00Z"),Window(startsAt="2026-11-01T05:00:00Z",endsAt="2026-12-01T05:00:01Z")))
            assertFailsWith<Problem>{campaign().copy(window=w).validate()}
        assertFailsWith<Problem>{campaign().copy(blackFridayYear=2027).validate()}
    }
    @Test fun `campaign still enforces branch spend active and normal hours`() {
        val branch=id();val p=campaign().copy(branchIds=setOf(branch),minimumSpendMinor=1000);val at=Instant.parse("2026-11-27T17:00:00Z")
        assertEquals(0,p.earn(999,branch,at,zone));assertEquals(0,p.earn(1000,id(),at,zone));assertEquals(1,p.earn(1000,branch,at,zone));assertEquals(0,p.copy(active=false).earn(1000,branch,at,zone))
    }
    @Test fun `legacy serialization remains identical for program and simple setup hashes`() {
        val regular=Program("Normal",Kind.POINTS);val encoded=json.encodeToString(regular)
        val old="""{"name":"Normal","kind":"POINTS","active":true,"unitMinor":100,"pointsPerUnit":1,"cashbackBps":0,"stampsPerPurchase":1,"minimumSpendMinor":1,"branchIds":[],"window":{"startsAt":null,"endsAt":null,"weekdays":[1,2,3,4,5,6,7],"localStart":null,"localEnd":null},"bonuses":[],"productGroup":"","countUnits":false}"""
        assertEquals(old,encoded);assertEquals(regular,json.decodeFromString<Program>(old))
        assertEquals("{\"program\":$old,\"rewardName\":\"Premio\",\"rewardCost\":3}",json.encodeToString(SimplePromotionSetup(regular,"Premio",3)))
        assertTrue(regular.blackFridayAvailable(Instant.parse("2026-12-20T10:00:00Z")))
    }
    @Test fun `seasonal stamps can atomically create a reward or a validated category discount`() {
        SimplePromotionSetup(campaign(),"Premio",3).validate()
        SimplePromotionSetup(campaign(),"Descuento",1,Benefit(2500,"Bebidas","BASKET")).validate()
        assertFailsWith<Problem>{SimplePromotionSetup(campaign(),"Descuento",1,Benefit(10001,"Bebidas")).validate()}
        assertFailsWith<Problem>{SimplePromotionSetup(Program("Normal",Kind.POINTS),"Premio",3,Benefit(2500,"Bebidas")).validate()}
    }
    @Test fun `both wallet providers receive conditions and explicit season deadline through shared rule`() {
        val text=walletEarningRules(campaign(),"USD",zone)
        assertContains(text,"Ecuador continental");assertContains(text,"1 de diciembre");assertContains(text,"canjes");assertContains(text,"Un premio por cada tres compras elegibles.")
        assertFalse(walletEarningRules(Program("Normal",Kind.POINTS),"USD",zone).contains("Viernes Negro"))
    }
}
