package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.fidelity.StaffOperation
import com.premierdarkcoffee.loyalty.fidelity.StaffPermissions
import com.premierdarkcoffee.loyalty.fidelity.purchaseOperations
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.wallet.artwork.precision

import java.time.*
import org.junit.jupiter.api.Test
import kotlin.test.*

class OperationsReportTest {
    private val now=Instant.parse("2026-11-10T18:30:00Z")
    private val zone=ZoneId.of("America/Guayaquil")
    @Test fun `rolling periods start at local midnight and preserve current time`() {
        val w=reportWindow(now,zone,7,null,null,null)
        assertEquals(Instant.parse("2026-11-04T05:00:00Z"),w.from);assertEquals(now,w.until)
        assertEquals(Instant.parse("2026-10-28T05:00:00Z"),w.previousFrom)
    }
    @Test fun `custom dates include the full final local day with database precision`() {
        val w=reportWindow(now,zone,30,"2026-11-01","2026-11-03",null)
        assertEquals(3,w.days);assertEquals(Instant.parse("2026-11-04T04:59:59.999999Z"),w.until)
        assertEquals(LocalDate.parse("2026-11-01"),w.fromDate)
    }
    @Test fun `daylight saving uses calendar days rather than hours`() {
        val w=reportWindow(now,ZoneId.of("America/New_York"),7,"2026-10-31","2026-11-02",null)
        assertEquals(Instant.parse("2026-10-31T04:00:00Z"),w.from);assertEquals(Instant.parse("2026-11-03T04:59:59.999999Z"),w.until)
    }
    @Test fun `malformed future partial reversed and excessive ranges are rejected`() {
        for((a,b) in listOf("bad" to "2026-11-02","2026-11-11" to "2026-11-12","2026-11-03" to "2026-11-02","2024-01-01" to "2026-11-02","2026-02-30" to "2026-11-02","2026-11-02" to null))assertFailsWith<Problem>{reportWindow(now,zone,30,a,b,null)}
        assertFailsWith<Problem>{reportWindow(now,zone,1,null,null,null)}
        assertFailsWith<Problem>{reportWindow(now,zone,30,null,null,"2027-01-01T00:00:00Z")}
    }
    @Test fun `csv protects formula prefixes controls quotes and line breaks`() {
        for(s in listOf("=CMD()","  +SUM(A1)","-1+2","@SUM(A1)","\t=1","\rhello","\u0001 =1"))assertTrue(csvCell(s).startsWith("\"'"))
        assertEquals("\"Ana \"\"Pérez\"\"; Café\nNorte\"",csvCell("Ana \"Pérez\"; Café\nNorte"))
        assertEquals("\"café\"",csvCell("ca\u0000fé"))
    }
    @Test fun `permissions validate owner access and cashier operation combinations`() {
        StaffPermissions(true,false).validate("CASHIER");StaffPermissions(false,true).validate("CASHIER");StaffPermissions().validate("OWNER")
        assertFailsWith<Problem>{StaffPermissions(false,false).validate("CASHIER")};assertFailsWith<Problem>{StaffPermissions(true,false).validate("OWNER")}
    }
    @Test fun `purchase with reward requires both operations`() {
        val p=Purchase("m","b","receipt",100,"USD")
        assertEquals(setOf(StaffOperation.PURCHASE),purchaseOperations(p));assertEquals(setOf(StaffOperation.PURCHASE,StaffOperation.REWARD),purchaseOperations(p.copy(rewardId="r")))
    }
    @Test fun `activity accepts operations filter but keeps bounded paging`() {
        ManagementQuery(kind="OPERATIONS").validate();assertFailsWith<Problem>{ManagementQuery(offset=1).validate()};assertFailsWith<Problem>{ManagementQuery(kind="ANY").validate()}
    }
}
