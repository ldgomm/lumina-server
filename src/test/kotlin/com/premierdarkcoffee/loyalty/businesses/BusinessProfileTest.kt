package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.json

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import kotlin.test.*

class BusinessProfileTest {
    private fun profile() = BusinessProfile("Negocio de prueba", "1790012345001", "Cafetería", "Ana Ejemplo", "ana@example.test", "+593 99 123 4567", "Pichincha", "Quito", "Dirección ficticia 123")
    @Test fun `RUC is a format check not a tax or checksum certification`() {
        profile().validate()
        profile().copy(ruc="1234567890001").validate()
        for (ruc in listOf("", "0000000000000", "0000000000001", "1234567890123", "1790012345002", "179001234500", "17900123450011", "1790012345A01", "179-012345001"))
            assertEquals("INVALID_RUC", assertFailsWith<Problem> { profile().copy(ruc=ruc).validate() }.code)
    }
    @Test fun `normalization trims without changing legal spelling or phone`() {
        val p=profile().copy(legalName="  Café Ñandú  ",ruc=" 1790012345001 ",phone=" +593 99 123 4567 ").normalized()
        p.validate();assertEquals("Café Ñandú",p.legalName);assertEquals("1790012345001",p.ruc);assertEquals("+593 99 123 4567",p.phone)
    }
    @Test fun `identity contact and address are required and bounded`() {
        for(p in listOf(profile().copy(legalName=" "),profile().copy(activity=""),profile().copy(contactName=""),profile().copy(province=""),profile().copy(city=""),profile().copy(address=""),profile().copy(legalName="x".repeat(201)),profile().copy(address="x".repeat(251)),profile().copy(contactName="Ana\nTest")))
            assertEquals("INVALID_BUSINESS_PROFILE",assertFailsWith<Problem>{p.validate()}.code)
    }
    @Test fun `optional legacy email rejects malformed values and controls`() {
        profile().copy(email="").validate()
        for(email in listOf("ana@", "ana@example", "ana @example.test", "ana\n@example.test"))
            assertEquals("INVALID_EMAIL",assertFailsWith<Problem>{profile().copy(email=email).validate()}.code)
    }
    @Test fun `phone permits international formatting but rejects unusable contacts`() {
        profile().copy(phone="(02) 234-5678").validate()
        for(phone in listOf("", "123456", "+1234567890123456", "CALL ME", "0991234567\n"))
            assertEquals("INVALID_PHONE",assertFailsWith<Problem>{profile().copy(phone=phone).validate()}.code)
    }
    @Test fun `optional website accepts http urls without embedded credentials`() {
        profile().copy(website="https://example.test/tienda").validate();profile().copy(website="http://example.test").validate()
        for(url in listOf("javascript:alert(1)","//example.test","https://user:password@example.test","https://","https://example.test/"+"x".repeat(251)))
            assertEquals("INVALID_WEBSITE",assertFailsWith<Problem>{profile().copy(website=url).validate()}.code)
    }
    @Test fun `legacy tenant payload remains compatible`() {
        val input=json.decodeFromString<NewTenant>("""{"name":"Anterior","slug":"anterior"}""")
        assertNull(input.profile);assertNull(input.firstBranch)
    }
    @Test fun `search normalizes accents and keeps wildcard characters literal`() {
        assertEquals("cafe nandu",normalizedSearch(" Café Ñandú "));assertEquals("%_",normalizedSearch("%_"))
        assertEquals("INVALID_SEARCH",assertFailsWith<Problem>{normalizedSearch("x".repeat(101))}.code)
    }
}
