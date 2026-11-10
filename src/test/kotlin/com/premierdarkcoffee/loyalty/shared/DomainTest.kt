package com.premierdarkcoffee.loyalty.shared

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one

import java.time.*
import kotlin.test.*

class DomainTest {
    private val zone = ZoneId.of("America/Guayaquil")
    private val monday = Instant.parse("2026-11-02T15:00:00Z")
    @Test fun `points floor before multiplier`() {
        val rule = Program("Puntos",Kind.POINTS,pointsPerUnit=3,bonuses=listOf(Bonus(1,2)))
        assertEquals(12L,rule.earn(299,"branch",monday,zone))
    }
    @Test fun `cashback is integer minor units`() { assertEquals(49L,Program("Saldo",Kind.CASHBACK,cashbackBps=500).earn(999,"branch",monday,zone)) }
    @Test fun `stamps count one receipt and obey minimum`() {
        val p=Program("Visitas",Kind.STAMPS,minimumSpendMinor=500)
        assertEquals(0L,p.earn(499,"branch",monday,zone)); assertEquals(1L,p.earn(50_000,"branch",monday,zone))
    }
    @Test fun `schedule uses business timezone and exclusive end`() {
        val w=Window(weekdays=setOf(1),localStart="10:00",localEnd="11:00")
        assertTrue(w.matches(monday,zone));assertFalse(w.matches(monday.minusSeconds(1),zone));assertFalse(w.matches(monday.plusSeconds(3600),zone))
    }
    @Test fun `overnight belongs to starting weekday`() {
        val w=Window(weekdays=setOf(5),localStart="22:00",localEnd="02:00")
        assertTrue(w.matches(Instant.parse("2026-11-07T06:00:00Z"),zone))
        assertFalse(w.matches(Instant.parse("2026-11-07T07:00:00Z"),zone))
        assertFalse(w.matches(Instant.parse("2026-11-06T06:00:00Z"),zone))
    }
    @Test fun `global period uses half open interval`() { val w=Window(startsAt=monday.toString(),endsAt=monday.plusSeconds(60).toString());assertTrue(w.matches(monday,zone));assertFalse(w.matches(monday.plusSeconds(60),zone)) }
    @Test fun `inactive branch mismatch and minimum earn nothing`() {
        assertEquals(0L,Program("P",Kind.POINTS,active=false).earn(1000,"b",monday,zone))
        assertEquals(0L,Program("P",Kind.POINTS,branchIds=setOf("a")).earn(1000,"b",monday,zone))
    }
    @Test fun `highest priority matching bonus wins instead of multiplying promotions`() {
        val p=Program("P",Kind.POINTS,bonuses=listOf(Bonus(1,2),Bonus(5,3),Bonus(6,10,branchIds=setOf("other"))))
        assertEquals(30L,p.earn(1000,"b",monday,zone))
    }
    @Test fun `ambiguous and invalid rules are rejected`() {
        assertFailsWith<Problem>{Program("P",Kind.POINTS,bonuses=listOf(Bonus(1,2),Bonus(1,3))).validate()}
        assertFailsWith<Problem>{Window(localStart="12:00").validate()}
        assertFailsWith<Problem>{Window(localStart="10:00",localEnd="10:00").validate()}
        assertFailsWith<Problem>{Program("P",Kind.CASHBACK).validate()}
    }
    @Test fun `large amounts use exact arithmetic`() { assertEquals(10_000_000_000_000_000L,Program("P",Kind.POINTS,unitMinor=1,pointsPerUnit=1_000_000,bonuses=listOf(Bonus(1,10))).earn(1_000_000_000,"b",monday,zone)) }
    @Test fun `documents are tenant scoped and normalized without exposing original`() {
        val a=Security.identity("pepper","tenant-a"," ab-123 ")
        assertEquals(a,Security.identity("pepper","tenant-a","AB-123"));assertNotEquals(a,Security.identity("pepper","tenant-b","AB-123"));assertFalse(a.contains("123"))
    }
    @Test fun `password hashes have salts and enforce verification`() {
        val p="correct-password-123";val a=Security.password(p);val b=Security.password(p)
        assertNotEquals(a,b);assertTrue(Security.verify(p,a));assertFalse(Security.verify("wrong-password-123",a));assertFailsWith<Problem>{Security.password("short")}
    }
    @Test fun `cashier cannot manage promotions or another branch`() { val s=Staff("t","s","CASHIER","a");s.at("a");assertFailsWith<Problem>{s.owner()};assertFailsWith<Problem>{s.at("b")} }
}
