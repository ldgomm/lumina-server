package com.premierdarkcoffee.loyalty.access

import com.premierdarkcoffee.loyalty.shared.Problem
import org.junit.jupiter.api.Test
import kotlin.test.*

class ContactPhoneTest {
    @Test fun `accept Ecuador mobile fixed and international`() {
        mapOf("099 123 4567" to "+593991234567", "(02) 234-5678" to "+59322345678", "593991234567" to "+593991234567", "+1 (202) 555-0143" to "+12025550143").forEach { (input,expected) -> assertEquals(expected,contactPhone(input)) }
    }
    @Test fun `reject missing malformed and overlong contact`() {
        listOf(null,"","abc0991234567","09+91234567","09912345678","099123","+00012345678","+1234567890123456","0991234567\n0").forEach { assertFailsWith<Problem>(it) { contactPhone(it) } }
    }
    @Test fun `normalization is idempotent`() {
        listOf("0991234567","023456789","+442079460123").forEach { assertEquals(contactPhone(it),contactPhone(contactPhone(it))) }
    }
}
