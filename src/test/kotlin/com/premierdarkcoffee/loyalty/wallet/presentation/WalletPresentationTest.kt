package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.appleJson
import com.premierdarkcoffee.loyalty.wallet.recentActivity
import com.premierdarkcoffee.loyalty.wallet.summary

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletPresentationTest {
    private fun balance(name: String, kind: String, amount: Long) = obj("name" to name, "kind" to kind, "available" to amount)
    private fun pass(balances: List<JsonObject>, activity: List<JsonObject> = emptyList(), active: Boolean = true) = WalletPass(
        "business", "member", "unchanged-serial", "unchanged-auth-token",
        obj("businessName" to "Café Loyalty", "name" to "Prueba iPhone", "currency" to "USD", "cardCode" to "unchanged-qr",
            "timezone" to "America/Guayaquil", "canOperate" to active, "balances" to balances, "recentActivity" to activity),
        7, Instant.EPOCH, "pass.com.example.loyalty", null, null
    )
    private fun fields(p: WalletPass) = p.appleJson("pass.com.example.loyalty", "ABCDEFGHIJ", "https://example.com").getValue("storeCard").jsonObject

    @Test fun `redemption keeps zero cashback and independent points and stamps visible`() {
        val p = pass(listOf(balance("Cashback del 5%", "CASHBACK", 0), balance("Puntos por compra", "POINTS", 100), balance("Cada visita cuenta", "STAMPS", 2)))
        val f = fields(p)
        assertEquals("0.00 USD", f.getValue("primaryFields").jsonArray.single().jsonObject.getValue("value").jsonPrimitive.content)
        val extra = f.getValue("auxiliaryFields").jsonArray.map { it.jsonObject }
        assertTrue(extra.isEmpty())
        val balancesText = f.getValue("backFields").jsonArray.map { it.jsonObject }.single { it["key"]==JsonPrimitive("balances") }.getValue("value").jsonPrimitive.content
        assertContains(balancesText,"Puntos por compra: 100 puntos")
        assertContains(balancesText,"Cada visita cuenta: 2 sellos")
        assertTrue(f.getValue("secondaryFields").jsonArray.size + extra.size <= 2)
        val json = p.appleJson("pass.com.example.loyalty", "ABCDEFGHIJ", "https://example.com")
        assertEquals(p.serial, json.getValue("serialNumber").jsonPrimitive.content)
        assertEquals(p.token, json.getValue("authenticationToken").jsonPrimitive.content)
        assertEquals("unchanged-qr", json.getValue("barcodes").jsonArray.single().jsonObject.getValue("message").jsonPrimitive.content)
        assertEquals("https://example.com/wallet/apple", json.getValue("webServiceURL").jsonPrimitive.content)
    }

    @Test fun `many programs keep their own names and amounts without overflowing the front`() {
        val balances = listOf(balance("Saldo A", "CASHBACK", 125)) + (1..8).map { balance("Programa $it", "POINTS", it.toLong()) }
        val f = fields(pass(balances))
        assertTrue(f.getValue("auxiliaryFields").jsonArray.isEmpty())
        val summary = f.getValue("backFields").jsonArray.map { it.jsonObject }.single { it["key"]==JsonPrimitive("balances") }.getValue("value").jsonPrimitive.content
        assertTrue(summary.contains("Saldo A: 1.25 USD"))
        assertContains(summary, "Programa 1: 1 punto\n")
        for (i in 2..8) assertContains(summary, "Programa $i: $i puntos")
        val keys = f.values.flatMap { group -> group.jsonArray.map { it.jsonObject.getValue("key").jsonPrimitive.content } }
        assertEquals(keys.size, keys.toSet().size)
    }

    @Test fun `movement details preserve local date branch and distinct entries with legacy compatibility`() {
        val events = listOf(
            obj("kind" to "REDEMPTION", "label" to "Canje: Beneficio de 5 USD", "at" to "2026-11-05T02:42:00Z", "branch" to "Centro"),
            obj("kind" to "PURCHASE", "label" to "Compra: 90.00 USD", "at" to "2026-11-05T01:37:00Z", "branch" to "Norte"),
            obj("label" to "Compra antigua", "at" to "2026-11-04T15:00:00Z")
        )
        val fields = pass(emptyList(), events).appleActivityFields()
        assertEquals(3, fields.size)
        val first = fields.first()
        assertTrue(first.getValue("label").jsonPrimitive.content.startsWith("CANJE · 04 "))
        assertTrue(first.getValue("label").jsonPrimitive.content.endsWith("21:42"))
        assertEquals("Beneficio de 5 USD\nSucursal: Centro", first.getValue("value").jsonPrimitive.content)
        assertEquals("90.00 USD\nSucursal: Norte", fields[1].getValue("value").jsonPrimitive.content)
        assertEquals("Compra antigua", fields[2].getValue("value").jsonPrimitive.content)
        assertFalse(fields.toString().contains("null"))
    }

    @Test fun `new paused and long history cards remain valid without invented balances`() {
        val empty = fields(pass(emptyList(), active = false))
        assertEquals("Bienvenido", empty.getValue("primaryFields").jsonArray.single().jsonObject.getValue("value").jsonPrimitive.content)
        assertTrue(empty.getValue("auxiliaryFields").jsonArray.isEmpty())
        assertTrue(empty.toString().contains("Operaciones pausadas"))
        assertTrue(empty.toString().contains("Tu primera compra aparecerá aquí."))
        val events = (1..8).map { obj("kind" to "PURCHASE", "label" to "Compra: $it.00 USD", "at" to "2026-11-04T15:00:00Z") }
        val history = pass(emptyList(), events).appleActivityFields()
        assertEquals(5, history.size)
        assertFalse(history.toString().contains("6.00"))
    }
}
