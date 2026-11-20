package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.businesses.BusinessCategories
import com.premierdarkcoffee.loyalty.businesses.initialWalletDesign
import com.premierdarkcoffee.loyalty.shared.Problem
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.LocalDate
import kotlin.test.*

class WalletSubscriptionTest {
    private val provider=WalletProviderLegal("Agencia de prueba","1234567890001","Quito, dirección ficticia","soporte@example.test","0991234567","https://example.test/privacidad")
    @Test fun `promotion has one fixed end for November and December activations`() {
        for(day in listOf("2026-11-19","2026-12-03","2026-12-31"))assertEquals(LocalDate.parse("2027-01-01"),walletPaidFrom(LocalDate.parse(day)))
    }
    @Test fun `later activations have no renewed promotion or retroactive charge`() {
        for(day in listOf("2027-01-01","2027-02-15","2027-11-19"))assertEquals(LocalDate.parse(day),walletPaidFrom(LocalDate.parse(day)))
    }
    @Test fun `terms disclose final price monthly account charge cancellation and actual provider`() {
        val terms=walletTerms(provider,"Restaurante Ejemplo",LocalDate.parse("2026-11-19"),LocalDate.parse("2027-01-01"),3)
        for(value in listOf("15.00","5,00","2026","2027-02-01","impuestos","no autoriza débitos","sin penalidad","no equivale a aceptar","sin cargos retroactivos",provider.legalName,provider.privacyUrl))assertTrue(terms.contains(value),value)
    }
    @Test fun `contract requires real identification fields and secure privacy reference`() {
        provider.validate()
        assertFailsWith<Problem>{provider.copy(legalName="").validate()}
        assertFailsWith<Problem>{provider.copy(ruc="ABC").validate()}
        assertFailsWith<Problem>{provider.copy(privacyUrl="http://example.test/privacy").validate()}
        assertFailsWith<Problem>{provider.copy(privacyUrl="https://user:password@example.test").validate()}
    }
    @Test fun `all category designs and three variants satisfy wallet constraints`() {
        val categories=BusinessCategories.options().getValue("categories").jsonArray
        assertTrue(categories.size>20)
        for(category in categories)for(variant in 0..2){
            val id=category.jsonObject.getValue("id").jsonPrimitive.content
            val design=initialWalletDesign(id,"Mi negocio",variant)
            design.validate();assertEquals("Mi negocio",design.displayName)
        }
    }
    @Test fun `unknown historical categories receive a valid neutral design`() {
        assertEquals(initialWalletDesign("GENERAL","Ejemplo",0),initialWalletDesign("UNKNOWN","Ejemplo",0))
    }

    @Test fun `annual terms disclose one fifty dollar charge and twelve months`() {
        val terms=walletTerms(provider,"Ejemplo",LocalDate.parse("2026-12-03"),LocalDate.parse("2027-01-01"),3,"ANNUAL")
        for(value in listOf("150.00","50,00","renovación anual","un solo cargo","doce meses","sin penalidad"))assertTrue(terms.contains(value),value)
        assertEquals(5000L,walletUnitPrice("ANNUAL"));assertEquals(500L,walletUnitPrice("MONTHLY"))
    }
    @Test fun `unknown or injected billing interval is rejected`() {
        for(cycle in listOf("YEAR","FREE","MONTHLY ",""))assertFailsWith<Problem>{walletUnitPrice(cycle)}
    }

    @Test fun `historical agreements without cedula still decode without changing their evidence`() {
        val old="""{"version":"v1","terms":"Términos originales","hash":"original-hash","acceptedAt":"2026-11-19T15:00:00Z","ownerId":"old-owner","ownerName":"Responsable","ownerEmail":"old@example.test","companyId":"old-company","activationOn":"2026-11-19","paidFrom":"2027-01-01","firstBranchIds":["branch"],"provider":{"legalName":"Agencia","ruc":"1234567890001","address":"Quito","email":"legal@example.test","phone":"0991234567","privacyUrl":"https://example.test/privacy"}}"""
        val agreement=com.premierdarkcoffee.loyalty.shared.json.decodeFromString<WalletAgreement>(old)
        assertEquals("",agreement.ownerDocument);assertEquals("old@example.test",agreement.ownerEmail)
        assertEquals("original-hash",agreement.hash);assertEquals("Términos originales",agreement.terms)
    }

}
