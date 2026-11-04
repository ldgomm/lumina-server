package com.premierdarkcoffee.loyalty

import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.*

class CommercialDomainTest {
    private val today = LocalDate.parse("2026-11-03")
    private fun plan() = MembershipPlan("Mensual", 1500, "2026-11-01", "2026-11-03")
    @Test fun `end of month restores original anchor after February`() {
        val feb = nextBillingDate(LocalDate.parse("2027-01-31"), 1, 31)
        assertEquals("2027-02-28", feb.toString())
        assertEquals("2027-03-31", nextBillingDate(feb, 1, 31).toString())
    }
    @Test fun `leap year and annual February recurrence`() {
        assertEquals("2028-02-29", nextBillingDate(LocalDate.parse("2027-02-28"), 12, 29).toString())
    }
    @Test fun `quarterly recurrence preserves anchor`() {
        assertEquals("2027-04-30", nextBillingDate(LocalDate.parse("2027-01-31"), 3, 31).toString())
    }
    @Test fun `no negative fees or arbitrary recurrence intervals`() {
        assertFailsWith<Problem> { plan().copy(feeMinor = -1).validate(today) }
        assertFailsWith<Problem> { plan().copy(intervalMonths = 0).validate(today) }
    }
    @Test fun `retroactive or inconsistent future plans are rejected`() {
        assertFailsWith<Problem> { plan().copy(nextChargeOn = "2026-11-02").validate(today) }
        assertFailsWith<Problem> { plan().copy(startedOn = "2027-01-01").validate(today) }
        assertFailsWith<Problem> { plan().copy(nextChargeOn = "bad-date").validate(today) }
    }
    @Test fun `anchor must match first charge date`() {
        assertFailsWith<Problem> { plan().copy(anchorDay = 31).validate(today) }
        plan().copy(nextChargeOn = "2026-11-30", anchorDay = 31).validate(today)
    }
    @Test fun `free membership and zero grace are valid`() {
        plan().copy(feeMinor = 0, dueDays = 0, graceDays = 0).validate(today)
        assertFailsWith<Problem> { plan().copy(graceDays = 91).validate(today) }
    }
    @Test fun `commercial SQL checksum accepts formatting and rejects economic changes`() {
        val sql = requireNotNull(javaClass.getResource("/db/V002.sql")).readText()
        assertEquals(SqlFingerprint.checksum(sql), SqlFingerprint.checksum("-- reformatted\n" + sql.replace("CREATE TABLE", "create   table")))
        assertNotEquals(SqlFingerprint.checksum(sql), SqlFingerprint.checksum(sql.replace("1000000000", "1000000001")))
    }
}
