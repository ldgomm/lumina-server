package com.premierdarkcoffee.loyalty.wallet.providers

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.appleJson
import com.premierdarkcoffee.loyalty.wallet.presentation.appleActivityFields
import com.premierdarkcoffee.loyalty.wallet.presentation.appleStoreFields
import com.premierdarkcoffee.loyalty.wallet.recentActivity

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class AppleWalletExperienceTest {
    private fun balance(id: String = "a", kind: String = "STAMPS", amount: Long = 6, name: String = "Cada visita cuenta") =
        obj("programId" to id, "name" to name, "kind" to kind, "available" to amount)
    private fun reward(id: String = "r", program: String = "a", kind: String = "STAMPS", goal: Long = 7, name: String = "Un corte gratis") =
        obj("id" to id, "programId" to program, "kind" to kind, "goal" to goal, "available" to 999, "remaining" to 0, "name" to name)
    private fun pass(balances: List<JsonObject> = listOf(balance()), rewards: List<JsonObject> = listOf(reward()),
                     design: WalletDesign = WalletDesign(), active: Boolean = true, name: String = "Ana Solís",
                     activity: List<JsonObject> = emptyList()) = WalletPass("t", "m", "same-serial", "same-token",
        obj("businessName" to "Negocio", "name" to name, "currency" to "USD", "canOperate" to active,
            "cardCode" to "same-qr", "timezone" to "America/Guayaquil", "balances" to balances, "rewardProgress" to rewards,
            "recentActivity" to activity, "design" to json.parseToJsonElement(json.encodeToString(design)),
            "announcements" to listOf(obj("id" to "event", "title" to "Evento", "body" to "Información del negocio"))),
        42, Instant.parse("2026-11-05T02:00:00Z"), "pass.example", null, null)
    private fun WalletPass.front(group: String): JsonObject {
        val fields=appleStoreFields()
        return fields.getValue(group).jsonArray.firstOrNull()?.jsonObject
            ?: fields.getValue("headerFields").jsonArray.map { it.jsonObject }.single { it["key"]==JsonPrimitive("balance") }
    }
    private fun WalletPass.detail(key: String) = appleStoreFields().getValue("backFields").jsonArray.map { it.jsonObject }.single { it["key"] == JsonPrimitive(key) }
    private fun JsonObject.text(key: String = "value") = getValue(key).jsonPrimitive.content

    @Test fun `one stamp remaining comes from the matching balance not a stale message`() {
        val p = pass()
        assertEquals("6 / 7", p.front("primaryFields").text())
        assertEquals("1 sello", p.detail("card_state_detail").text())
        assertTrue(p.detail("reward_r").text().contains("Te falta 1 sello."))
    }
    @Test fun `ready prize preserves extra stamps and requires cashier confirmation`() {
        val p = pass(listOf(balance(amount = 11)))
        assertEquals("11 sellos", p.front("primaryFields").text())
        assertEquals("Disponible", p.detail("card_state_detail").text())
        assertTrue(p.detail("reward_r").text().contains("Pide el canje en caja"))
        assertTrue(p.detail("reward_r").text().contains("Canje: 7 sellos"))
    }
    @Test fun `arbitrary goal and discount name never become fixed coffee rules`() {
        val p = pass(listOf(balance(amount = 12)), listOf(reward(goal = 13, name = "35% en accesorios")))
        assertEquals("12 / 13", p.front("primaryFields").text())
        assertEquals("35% en accesorios", p.front("auxiliaryFields").text())
    }
    @Test fun `ready reward leads with its own balance and keeps the featured alternative in details`() {
        val p = pass(listOf(balance("a", amount = 7), balance("b", amount = 2)),
            listOf(reward(), reward("rb", "b", goal = 9)), WalletDesign(featuredProgramId = "b"))
        assertEquals("7 sellos", p.front("primaryFields").text())
        assertEquals("Disponible", p.detail("card_state_detail").text())
        assertTrue(p.detail("reward_r").text().contains("Saldo: 7 sellos"))
    }
    @Test fun `deleted and paused promotion rewards cannot leak through orphan progress`() {
        val p = pass(listOf(balance("b", amount = 1)), listOf(reward(name = "Premio oculto")))
        assertFalse(p.appleStoreFields().toString().contains("Premio oculto"))
        assertEquals("1 sello", p.front("primaryFields").text())
    }
    @Test fun `paused business preserves balances without inviting redemption or showing events`() {
        val p = pass(listOf(balance(amount = 7)), active = false)
        assertEquals("Pausada", p.detail("card_state_detail").text())
        assertEquals("PREMIO PAUSADO", p.front("auxiliaryFields").text("label"))
        assertTrue(p.detail("reward_r").text().contains("Canjes pausados"))
        assertFalse(p.appleStoreFields().toString().contains("Pide el canje"))
        assertFalse(p.appleStoreFields().toString().contains("Información del negocio"))
    }
    @Test fun `cashback progress uses exact money not cents or floating point rounding`() {
        val p = pass(listOf(balance(kind = "CASHBACK", amount = 499)), listOf(reward(kind = "CASHBACK", goal = 500)))
        assertEquals("4.99 USD", p.front("primaryFields").text())
        assertEquals("0.01 USD", p.detail("card_state_detail").text())
        assertTrue(p.detail("reward_r").text().contains("Canje: 5.00 USD"))
        assertFalse(p.detail("reward_r").text().contains("centavos"))
    }
    @Test fun `multiple rewards choose a deterministic affordable goal in the same program`() {
        val p = pass(rewards = listOf(reward("expensive", goal = 15), reward("affordable", goal = 4), reward("next", goal = 9)))
        assertEquals("Disponible", p.detail("card_state_detail").text())
        assertTrue(p.detail("reward_affordable").text().contains("Canje: 4 sellos"))
        assertTrue(p.detail("reward_next").text().contains("Te faltan 3 sellos"))
    }
    @Test fun `large goals never allocate giant stamp grids`() {
        val p = pass(listOf(balance(amount = 0)), listOf(reward(goal = 1_000_000)))
        assertEquals("0 / 1000000", p.front("primaryFields").text())
        assertFalse(p.detail("reward_r").text().contains("○"))
        assertTrue(p.detail("reward_r").text().length < 300)
    }
    @Test fun `stamp symbol is personalized and long rows wrap after ten`() {
        val p = pass(listOf(balance(amount = 11)), listOf(reward(goal = 13)), WalletDesign(stampSymbol = "★"))
        val text = p.detail("reward_r").text()
        assertEquals(11, text.count { it == '★' })
        assertEquals(2, text.count { it == '○' })
        assertTrue(text.endsWith("★ ○ ○"))
    }
    @Test fun `long names have concise front fields and complete accessible details`() {
        val person = "María de los Ángeles Rodríguez de la Torre"
        val prize = "Un descuento personalizado para tu próximo servicio completo"
        val p = pass(name = person, rewards = listOf(reward(name = prize)))
        assertTrue(p.front("auxiliaryFields").text().endsWith("…"))
        assertEquals(person, p.detail("member_detail").text())
        assertEquals(prize, p.detail("reward_r").text("label"))
        val fields = p.appleStoreFields()
        assertTrue(fields.getValue("auxiliaryFields").jsonArray.size + fields.getValue("secondaryFields").jsonArray.size <= 4)
        val keys = fields.values.flatMap { group -> group.jsonArray.map { it.jsonObject.text("key") } }
        assertEquals(keys.distinct().size, keys.size)
    }
    @Test fun `history sorts newest first before limiting and precedes announcements`() {
        val events = (1..7).map { obj("kind" to "PURCHASE", "label" to "Compra: $it.00 USD", "at" to "2026-11-0${it}T10:00:00Z", "branch" to "Centro") }
        val p = pass(activity = events)
        assertEquals("7.00 USD\nSucursal: Centro", p.appleActivityFields().first().text())
        assertEquals(5, p.appleActivityFields().size)
        val keys = p.appleStoreFields().getValue("backFields").jsonArray.map { it.jsonObject.text("key") }
        assertTrue(keys.indexOf("activity_0") < keys.indexOf("notice_event"))
        assertTrue(p.detail("updated").text().startsWith("04 "))
        assertTrue(p.detail("updated").text().contains("21:00"))
    }
    @Test fun `new card has welcome and no fictional goals`() {
        val p = pass(emptyList(), emptyList(), WalletDesign(welcome = "Bienvenido a nuestro club"))
        assertEquals("Bienvenido a nuestro club", p.front("primaryFields").text())
        assertTrue(p.appleStoreFields().getValue("auxiliaryFields").jsonArray.isEmpty())
        assertEquals("Activa", p.detail("card_state_detail").text())
    }
    @Test fun `rendering keeps pass identity authentication and QR intact`() {
        val p = pass(); val encoded = p.appleJson("pass.example", "TEAM", "https://example.com")
        assertEquals("same-serial", encoded.text("serialNumber"))
        assertEquals("same-token", encoded.text("authenticationToken"))
        assertEquals("same-qr", encoded.getValue("barcodes").jsonArray.single().jsonObject.text("message"))
        assertEquals("https://example.com/wallet/apple", encoded.text("webServiceURL"))
        assertEquals(42L, p.tag)
        // Account progress retains its change message; birthday/event details do not send ads.
        assertEquals("Progreso actualizado: %@", p.front("primaryFields").text("changeMessage"))
        assertFalse(p.detail("notice_event").containsKey("changeMessage"))
    }
    @Test fun `points have their own units and do not use a stamp ratio`() {
        val p = pass(listOf(balance(kind = "POINTS", amount = 1)), listOf(reward(kind = "POINTS", goal = 20)))
        assertEquals("1 punto", p.front("primaryFields").text())
        assertEquals("19 puntos", p.detail("card_state_detail").text())
        assertFalse(p.detail("reward_r").text().contains("○"))
    }
    @Test fun `invalid zero cost or mismatched reward kind does not create a ready prize`() {
        val p = pass(rewards = listOf(reward(goal = 0), reward("other", kind = "CASHBACK")))
        assertEquals("Activa", p.detail("card_state_detail").text())
        assertFalse(p.appleStoreFields().toString().contains("Un corte gratis"))
    }
}
