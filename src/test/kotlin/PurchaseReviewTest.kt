package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.*
import kotlin.test.*

class PurchaseReviewTest {
    private val at=Instant.parse("2026-11-09T17:00:00Z")
    private val zone=ZoneId.of("America/Guayaquil")
    private val p=Purchase("member","branch","receipt",12300,"USD",programIds=setOf("p"))
    private fun Program.result(purchase:Purchase=p,receipt:ReceiptCalculation=ReceiptCalculation(purchase.amountMinor,0))=explainReceipt(purchase,"p",receipt,at,zone)
    @Test fun `selected promotions share the authoritative earning calculation`() {
        for((program,expected) in listOf(Program("Points",Kind.POINTS) to 123L,Program("Cash",Kind.CASHBACK,cashbackBps=500) to 615L,Program("Stamps",Kind.STAMPS) to 1L)) {
            assertEquals(ReceiptEarning(expected,12300,"EARNED"),program.result())
            assertEquals(expected,program.earnReceipt(p,"p",ReceiptCalculation(12300,0),at,zone))
        }
    }
    @Test fun `empty selection never earns and omitted selection remains compatible`() {
        val program=Program("P",Kind.POINTS)
        assertEquals("NOT_SELECTED",program.result(p.copy(programIds=emptySet())).reason)
        assertEquals(123,program.result(p.copy(programIds=null)).amount)
    }
    @Test fun `discount allocation and counted units remain exact`() {
        val p=p.copy(items=listOf(PurchaseItem("A","pizza",2,1000),PurchaseItem("B","drink",1,1000)))
        val receipt=ReceiptCalculation(3000,1000)
        assertEquals(ReceiptEarning(2,1333,"EARNED"),Program("Pizza",Kind.STAMPS,productGroup="pizza",countUnits=true).result(p,receipt))
        assertEquals(ReceiptEarning(66,1333,"EARNED"),Program("Cash",Kind.CASHBACK,cashbackBps=500,productGroup="pizza").result(p,receipt))
    }
    @Test fun `redeeming suppresses earnings only in the redeemed program`() {
        val r=ReceiptCalculation(12300,500,obj("programId" to "p"))
        assertEquals("REDEEMED_PROGRAM",Program("P",Kind.STAMPS).result(receipt=r).reason)
        assertEquals(118,Program("P",Kind.POINTS).result(receipt=r.copy(reward=obj("programId" to "other"))).amount)
    }
    @Test fun `exclusions explain category branch minimum and partial unit`() {
        assertEquals("PRODUCTS_REQUIRED",Program("P",Kind.STAMPS,productGroup="pizza").result().reason)
        assertEquals("PRODUCTS_REQUIRED",Program("P",Kind.STAMPS,countUnits=true).result().reason)
        assertEquals("OTHER_BRANCH",Program("P",Kind.STAMPS,branchIds=setOf("other")).result().reason)
        assertEquals("MINIMUM_SPEND",Program("P",Kind.STAMPS,minimumSpendMinor=15000).result().reason)
        assertEquals("BELOW_UNIT",Program("P",Kind.POINTS,unitMinor=15000).result().reason)
    }
    @Test fun `scheduled expired paused and overnight windows match production rules`() {
        assertEquals("PAUSED",Program("P",Kind.STAMPS,active=false).result().reason)
        assertEquals("OUTSIDE_WINDOW",Program("P",Kind.STAMPS,window=Window(startsAt=at.plusSeconds(1).toString())).result().reason)
        assertEquals("OUTSIDE_WINDOW",Program("P",Kind.STAMPS,window=Window(endsAt=at.toString())).result().reason)
        val rule=Program("P",Kind.STAMPS,window=Window(weekdays=setOf(7),localStart="22:00",localEnd="13:00"))
        assertEquals(1,rule.result().amount) // Monday noon belongs to Sunday's overnight window.
    }
    @Test fun `bonuses respect priority and do not multiply together`() {
        val result=Program("P",Kind.POINTS,bonuses=listOf(Bonus(1,2),Bonus(2,3))).result()
        assertEquals(369,result.amount)
    }
    @Test fun `legacy and nonlegacy hashes exclude the new null default`() {
        for(purchase in listOf(p.copy(programIds=null),p,p.copy(items=listOf(PurchaseItem("A","pizza",1,12300))))) {
            assertFalse(purchase.idempotencyPayload().contains("expectedEarningReview"))
            assertTrue(purchase.copy(expectedEarningReview="abc").idempotencyPayload().contains("expectedEarningReview"))
        }
        assertEquals(obj("memberId" to "member","branchId" to "branch","receipt" to "receipt","amountMinor" to 12300,"currency" to "USD").toString(),p.copy(programIds=null).idempotencyPayload())
    }
}
