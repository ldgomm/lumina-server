package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class GoogleWalletExperienceTest {
    private fun balance(id: String = "a", kind: String = "STAMPS", amount: Long = 6, name: String = "Visitas") =
        obj("programId" to id, "kind" to kind, "available" to amount, "name" to name)
    private fun reward(id: String = "r", program: String = "a", kind: String = "STAMPS", goal: Long = 7, name: String = "Un corte gratis") =
        obj("id" to id, "programId" to program, "kind" to kind, "goal" to goal, "available" to 999, "remaining" to 0, "name" to name)
    private fun pass(balances: List<JsonObject> = listOf(balance()), rewards: List<JsonObject> = listOf(reward()),
                     design: WalletDesign = WalletDesign(), active: Boolean = true, name: String = "Ana Solís",
                     activity: List<JsonObject> = emptyList(), notices: List<JsonObject> = listOf(obj("id" to "a", "title" to "Evento", "body" to "Nuevo menú"))) =
        WalletPass("t", "m", "same-serial", "private-token", obj("businessName" to "Negocio", "slug" to "negocio", "name" to name,
            "currency" to "USD", "canOperate" to active, "cardCode" to "same-qr", "timezone" to "America/Guayaquil",
            "balances" to balances, "rewardProgress" to rewards, "recentActivity" to activity, "announcements" to notices,
            "design" to json.parseToJsonElement(json.encodeToString(design))), 42,
            Instant.parse("2026-11-05T02:00:00Z"), "pass.example", "12345.member", "12345.business")
    private fun WalletPass.front(slot: String = "loyaltyPoints") = googleExperienceFields().getValue(slot).jsonObject
    private fun JsonObject.value() = getValue("balance").jsonObject.getValue("string").jsonPrimitive.content
    private fun WalletPass.modules() = googleExperienceFields().getValue("textModulesData").jsonArray.map { it.jsonObject }
    private fun JsonObject.text(key: String = "body") = getValue(key).jsonPrimitive.content
    private fun WalletPass.detail(id: String) = modules().single { it.text("id") == id }.text()

    @Test fun `native points show featured progress and one remaining stamp`() {
        val p = pass()
        assertEquals("6/7", p.front().value())
        assertEquals("Sellos", p.front().text("label"))
        assertEquals("1 sello", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("featured").contains("Te falta 1 sello."))
    }
    @Test fun `reward rules and names are fully configurable`() {
        val p = pass(listOf(balance(amount = 12)), listOf(reward(goal = 13, name = "35% en accesorios")))
        assertEquals("12/13", p.front().value())
        assertTrue(p.detail("featured").contains("35% en accesorios"))
    }
    @Test fun `featured promotion cannot inherit a ready prize from another program`() {
        val p = pass(listOf(balance("a", amount = 7), balance("b", amount = 2)),
            listOf(reward(), reward("rb", "b", goal = 9)), WalletDesign(featuredProgramId = "b"))
        assertEquals("2/9", p.front().value())
        assertEquals("7 sellos", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("rewards_0").contains("Saldo: 7 sellos"))
    }
    @Test fun `same program chooses lowest cost deterministically and lists other rewards`() {
        val p = pass(rewards = listOf(reward("r3", goal = 15), reward("r1", goal = 4, name = "Descuento A"), reward("r2", goal = 9)))
        assertEquals("1 canje", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("featured").startsWith("Descuento A"))
        assertTrue(p.detail("rewards_0").contains("Canje: 9 sellos"))
    }
    @Test fun `removed promotion cannot leave a reward or progress in either slot`() {
        val p = pass(emptyList(), listOf(reward(name = "Premio eliminado")))
        assertEquals("Activa", p.front().value())
        assertEquals("Activa", p.front("secondaryLoyaltyPoints").value())
        assertFalse(p.googleExperienceFields().toString().contains("Premio eliminado"))
        assertFalse(p.googleExperienceFields().toString().contains("6/7"))
    }
    @Test fun `invalid goals and mismatched units never offer a reward`() {
        val p = pass(rewards = listOf(reward(goal = 0), reward("bad", kind = "CASHBACK")))
        assertEquals("6", p.front().value())
        assertEquals("Activa", p.front("secondaryLoyaltyPoints").value())
        assertFalse(p.googleExperienceFields().toString().contains("Un corte gratis"))
    }
    @Test fun `suspended business keeps balances without redemption invitations or marketing`() {
        val p = pass(listOf(balance(amount = 9)), active = false)
        assertEquals("9", p.front().value())
        assertEquals("Pausada", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("featured").contains("Canjes pausados"))
        assertFalse(p.googleExperienceFields().toString().contains("Pide el canje"))
        assertFalse(p.googleExperienceFields().toString().contains("Nuevo menú"))
    }
    @Test fun `cashback never loses precision or confuses dollars with cents`() {
        val p = pass(listOf(balance(kind = "CASHBACK", amount = 499)), listOf(reward(kind = "CASHBACK", goal = 500)))
        assertEquals("USD", p.front().text("label"))
        assertEquals("4.99", p.front().value())
        assertEquals("0.01 USD", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("featured").contains("Canje: 5.00 USD"))
    }
    @Test fun `points keep their own units and do not get stamp artwork`() {
        val p = pass(listOf(balance(kind = "POINTS", amount = 1)), listOf(reward(kind = "POINTS", goal = 20)))
        assertEquals("1", p.front().value())
        assertEquals("Puntos", p.front().text("label"))
        assertEquals("19 puntos", p.front("secondaryLoyaltyPoints").value())
        assertFalse(p.detail("featured").contains("○"))
    }
    @Test fun `ready prize keeps surplus balance and asks for cashier confirmation`() {
        val p = pass(listOf(balance(amount = 11)))
        assertEquals("11", p.front().value())
        assertEquals("1 canje", p.front("secondaryLoyaltyPoints").value())
        assertTrue(p.detail("featured").contains("Saldo suficiente. Pide el canje en caja."))
        assertTrue(p.detail("featured").contains("Saldo: 11 sellos · Canje: 7 sellos"))
    }
    @Test fun `new member sees custom welcome without fictional purchases`() {
        val p = pass(emptyList(), emptyList(), WalletDesign(welcome = "Bienvenido a nuestro club"))
        assertEquals("Activa", p.front().value())
        assertEquals("Bienvenido a nuestro club", p.detail("featured"))
        assertEquals("Tu primera compra aparecerá aquí.", p.detail("activity_0"))
    }
    @Test fun `long unicode names are brief on front and complete in details`() {
        val name = "Ana 🌻 ".repeat(10)
        val p = pass(name = name)
        val front = p.googleExperienceFields().text("accountName")
        assertTrue(front.endsWith("…")); assertTrue(front.codePointCount(0, front.length) <= 20)
        assertTrue(p.detail("status").contains(name))
    }
    @Test fun `ten module budget keeps whole financial records and discloses overflow`() {
        val p = pass((1..30).map { balance("p$it", name = "Promoción $it "+"x".repeat(80)) },
            (1..30).map { reward("r$it", "p$it", name = "Premio $it "+"y".repeat(100)) },
            notices = (1..20).map { obj("id" to "$it", "title" to "Aviso $it", "body" to "z".repeat(100)) })
        val modules = p.modules()
        assertTrue(modules.size <= 10)
        assertEquals(modules.size, modules.map { it.text("id") }.distinct().size)
        assertTrue(modules.all { it.text("id").matches(Regex("[A-Za-z0-9_-]+")) })
        assertTrue(modules.any { it.text().contains("registros adicionales. Consulta en caja.") })
        assertTrue(p.detail("balances_0").contains("6 sellos"))
        assertTrue(modules.all { it.text().length <= 500 })
    }
    @Test fun `latest activity sorts before limit and keeps business timezone and branches`() {
        val events = (1..7).map { obj("kind" to "PURCHASE", "at" to "2026-11-0${it}T02:00:00Z", "label" to "Compra: $it.00 USD", "branch" to "Centro") }
        val p = pass(activity = events)
        val text = p.modules().filter { it.text("id").startsWith("activity_") }.joinToString { it.text() }
        assertTrue(text.startsWith("06 nov 2026 · 21:00"))
        assertTrue(text.contains("Sucursal: Centro"))
        assertTrue(text.indexOf("7.00 USD") < text.indexOf("6.00 USD"))
        assertFalse(text.contains("2.00 USD")); assertFalse(text.contains("1.00 USD"))
        assertTrue(p.detail("status").contains("04 nov 2026 · 21:00"))
    }
    @Test fun `historic redemption remains visible after promotion is removed`() {
        val p = pass(emptyList(), emptyList(), activity = listOf(obj("kind" to "REDEMPTION", "at" to "2026-11-05T02:00:00Z", "label" to "Canje: Beneficio de 5 USD", "branch" to "Norte")))
        assertTrue(p.detail("activity_0").contains("Canje: Beneficio de 5 USD"))
        assertEquals("Activa", p.front("secondaryLoyaltyPoints").value())
    }
    @Test fun `custom stamp symbol wraps and huge goals cannot allocate giant grids`() {
        val p = pass(listOf(balance(amount = 11)), listOf(reward(goal = 13)), WalletDesign(stampSymbol = "★"))
        assertEquals(11, p.detail("featured").count { it == '★' })
        assertTrue(p.detail("featured").endsWith("★ ○ ○"))
        val big = pass(listOf(balance(amount = 0)), listOf(reward(goal = 1_000_000)))
        assertFalse(big.detail("featured").contains("○")); assertTrue(big.detail("featured").length < 300)
    }
    @Test fun `rendering preserves Google identity QR branding and excludes secrets`() {
        val p = pass(design = WalletDesign(background = "#173E34"))
        val data = p.googleJson(p.googleId!!, p.googleClass!!, "https://wallet.example.com")
        assertEquals("12345.member", data.text("id")); assertEquals("12345.business", data.text("classId"))
        assertEquals("same-qr", data.getValue("barcode").jsonObject.text("value"))
        assertEquals("#173E34", data.text("hexBackgroundColor"))
        assertEquals("ACTIVE", data.text("state"))
        assertFalse(data.toString().contains("private-token")); assertFalse(data.containsKey("changeMessage"))
        assertFalse(data.containsKey("notifyPreference"))
        assertEquals(42L, p.tag)
    }
    @Test fun `same unit programs remain separate instead of becoming one balance`() {
        val p = pass(listOf(balance("a", amount = 6, name = "Cafetería"), balance("b", amount = 10, name = "Barbería")))
        assertEquals("6/7", p.front().value())
        assertTrue(p.detail("balances_0").contains("Cafetería\n6 sellos"))
        assertTrue(p.detail("balances_0").contains("Barbería\n10 sellos"))
        assertFalse(p.detail("balances_0").contains("16 sellos"))
    }
}
