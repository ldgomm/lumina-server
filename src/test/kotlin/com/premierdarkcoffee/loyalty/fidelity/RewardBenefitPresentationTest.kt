package com.premierdarkcoffee.loyalty.fidelity

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.marketing.Benefit
import com.premierdarkcoffee.loyalty.marketing.PurchaseItem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class RewardBenefitPresentationTest {
    private fun pass(description: String?, active: Boolean = true, visible: Boolean = true): WalletPass = WalletPass(
        "t", "m", "serial", "token", obj("businessName" to "Aurora", "name" to "Ana", "currency" to "USD", "canOperate" to active,
            "balances" to if (visible) listOf(obj("programId" to "p", "name" to "Visitas", "kind" to "STAMPS", "available" to 7)) else emptyList<JsonObject>(),
            "rewardProgress" to listOf(obj("id" to "r", "programId" to "p", "name" to "Beneficio elegido", "kind" to "STAMPS", "goal" to 5, "benefitText" to description))),
        4, Instant.parse("2026-11-07T12:00:00Z"), "pass.example", "12345.member", "12345.business")
    private fun WalletPass.details(): List<String> = listOf(
        appleExperienceFields().getValue("backFields").jsonArray.joinToString("\n") { it.jsonObject.getValue("value").jsonPrimitive.content },
        googleExperienceFields().getValue("textModulesData").jsonArray.joinToString("\n") { it.jsonObject.getValue("body").jsonPrimitive.content })

    @Test fun `item describes one cheapest eligible unit even when quantities exceed one`() {
        val benefit = Benefit(group = "café")
        assertEquals("100% de descuento en una unidad de «café», la de menor precio elegible.", benefit.description())
        assertEquals(250, benefit.discount(listOf(PurchaseItem("Grande", "café", 3, 400), PurchaseItem("Pequeño", "CAFÉ", 2, 250), PurchaseItem("Agua", "agua", 1, 100))))
    }
    @Test fun `basket describes the category total and not the whole receipt`() {
        val benefit = Benefit(2550, "ropa", "BASKET")
        assertEquals("25,5% de descuento en el total de la categoría «ropa» de esta compra.", benefit.description())
        assertEquals(765, benefit.discount(listOf(PurchaseItem("Camiseta", "ropa", 3, 1000), PurchaseItem("Envío", "envío", 1, 500))))
    }
    @Test fun `basis points remain exact without inventing fixed percentages`() {
        assertTrue(Benefit(1, "servicios").description().startsWith("0,01%"))
        assertTrue(Benefit(7225, "servicios").description().startsWith("72,25%"))
        assertNull(rewardBenefitDescription(null))
        assertEquals(Benefit(5010, "corte").description(), rewardBenefitDescription("{\"percentBps\":5010,\"group\":\"corte\",\"scope\":\"ITEM\"}"))
    }
    @Test fun `Apple and Google show the same conditions and one reward forecast`() {
        val description = Benefit(3500, "servicio").description()
        pass(description).details().forEach {
            assertTrue(it.contains(description)); assertTrue(it.contains("te quedan 2 sellos")); assertTrue(it.contains("Canje: 5 sellos"))
        }
    }
    @Test fun `legacy snapshots and direct rewards invent no discount or null text`() {
        val legacy = pass(null).let { p -> p.copy(snapshot = JsonObject(p.snapshot + obj("rewardProgress" to p.snapshot.getValue("rewardProgress").jsonArray.map { JsonObject(it.jsonObject - "benefitText") }))) }
        listOf(pass(null), legacy).flatMap { it.details() }.forEach {
            assertFalse(it.contains("null")); assertFalse(it.contains("% de descuento")); assertTrue(it.contains("Canje: 5 sellos"))
        }
    }
    @Test fun `suspended business retains conditions but never invites redemption`() {
        val description = Benefit(group = "corte").description()
        pass(description, active = false).details().forEach {
            assertTrue(it.contains(description)); assertTrue(it.contains("Canjes pausados")); assertFalse(it.contains("Si canjeas")); assertFalse(it.contains("Pide el canje"))
        }
    }
    @Test fun `conditions from a program absent from visible balances do not leak`() {
        val description = Benefit(group = "promoción retirada").description()
        pass(description, visible = false).details().forEach { assertFalse(it.contains(description)); assertFalse(it.contains("Beneficio elegido")) }
    }
    @Test fun `long category remains complete in both native fields and module budget is retained`() {
        val description = Benefit(7891, "Categoría Ñ ".repeat(5).trim(), "BASKET").description()
        val p = pass(description)
        p.details().forEach { assertTrue(it.contains(description)) }
        assertTrue(p.googleExperienceFields().getValue("textModulesData").jsonArray.size <= 10)
    }
}
