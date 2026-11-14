package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import org.junit.jupiter.api.Test
import kotlin.test.*

class LuminaRegistrationTest {
    private fun value()=LuminaRegistration(id(),"Negocio real","Responsable","contacto@example.test","0991234567")
    @Test fun `known contact data is normalized without fabricating fiscal information`() {
        val input=value().copy(name="  Café Ñandú  ",email=" CONTACTO@EXAMPLE.TEST ").normalized()
        input.validate();assertEquals("Café Ñandú",input.name);assertEquals("contacto@example.test",input.email)
    }
    @Test fun `durable company identity is required`() {
        for(key in listOf("", "demo-cafe", "not-a-uuid")) assertFailsWith<Problem>{value().copy(companyId=key).normalized().validate()}
    }
    @Test fun `names are bounded and reject control characters`() {
        for(name in listOf("", "A", "x".repeat(101), "Nombre\nFalso")) assertFailsWith<Problem>{value().copy(name=name).validate()}
    }
    @Test fun `contact validation matches the minimal portal registration`() {
        for(mail in listOf("a@b", "x\ny@example.test"))assertFailsWith<Problem>{value().copy(email=mail).validate()}
        for(phone in listOf("123", "CALL ME", "0991234567\n"))assertFailsWith<Problem>{value().copy(phone=phone).validate()}
        value().copy(phone="+593 (99) 123-4567").validate()
        value().copy(email="").validate()
    }
}
