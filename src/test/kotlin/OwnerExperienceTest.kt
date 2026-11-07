package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import kotlin.test.*

class OwnerExperienceTest {
    private fun profile()=BusinessProfile("Marca legal","1790012345001","Servicios","Ana","ana@example.test","0991234567","Pichincha","Quito","Calle de ejemplo")
    @Test fun `social links accept full profiles and remove blank optional entries`() {
        val p=profile().copy(socialLinks=mapOf("instagram" to " https://www.instagram.com/ejemplo/ ","facebook" to "", "whatsapp" to "https://wa.me/593991234567")).normalized()
        p.validate();assertEquals(2,p.socialLinks.size);assertFalse(p.socialLinks.getValue("instagram").startsWith(" "))
    }
    @Test fun `social links reject impersonation credentials and executable schemes`() {
        for(link in listOf("javascript:alert(1)","https://instagram.com.evil.test/a","https://evil.test/instagram.com","https://user:password@instagram.com/a","http://instagram.com/a","https://instagram.com:444/a","https://instagram.com/a\n"))
            assertEquals("INVALID_SOCIAL_LINK",assertFailsWith<Problem>{profile().copy(socialLinks=mapOf("instagram" to link)).validate()}.code)
        assertFailsWith<Problem>{profile().copy(socialLinks=mapOf("unknown" to "https://example.test")).validate()}
    }
    @Test fun `old profiles still decode without social links`() {
        val old=JsonObject(json.encodeToJsonElement(profile()).jsonObject.filterKeys { it!="socialLinks" })
        assertEquals(emptyMap(),json.decodeFromJsonElement<BusinessProfile>(old).socialLinks)
    }
    @Test fun `random birthday requires distinct bounded messages and valid mode`() {
        BirthdaySettings(mode="RANDOM",templates=birthdaySuggestions).validate()
        for(s in listOf(BirthdaySettings(mode="UNKNOWN"),BirthdaySettings(mode="RANDOM"),BirthdaySettings(mode="RANDOM",templates=listOf(birthdaySuggestions[0],birthdaySuggestions[0])),BirthdaySettings(templates=List(9){birthdaySuggestions[0]})))
            assertFailsWith<Problem>{s.validate()}
    }
    @Test fun `birthday title and message are required and fit provider text fields`() {
        for(g in listOf(BirthdayGreeting(" ","Mensaje"),BirthdayGreeting("Título",""),BirthdayGreeting("x".repeat(81),"Mensaje"),BirthdayGreeting("Título","x".repeat(251))))assertFailsWith<Problem>{g.validate()}
        birthdaySuggestions.forEach { it.validate() }
    }
    @Test fun `guided setup accepts points and cashback and rejects invalid reward`() {
        SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio",10).validate()
        SimplePromotionSetup(Program("Saldo",Kind.CASHBACK,cashbackBps=500),"Premio",500).validate()
        for(input in listOf(SimplePromotionSetup(Program("Sellos",Kind.STAMPS),"Premio",5),SimplePromotionSetup(Program("Puntos",Kind.POINTS),"",10),SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio",0),SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio",1_000_000_001)))assertFailsWith<Problem>{input.validate()}
    }
}
