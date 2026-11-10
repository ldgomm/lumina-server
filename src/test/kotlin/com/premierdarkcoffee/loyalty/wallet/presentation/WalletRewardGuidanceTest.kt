package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletRewardGuidanceTest {
    private fun details(kind: String, available: Long, goal: Long, active: Boolean = true): List<String> {
        val pass = WalletPass("t", "m", "same-serial", "same-token", obj(
            "businessName" to "Aurora", "name" to "Ana", "currency" to "USD", "canOperate" to active,
            "balances" to listOf(obj("programId" to "p", "name" to "Visitas", "kind" to kind, "available" to available),
                obj("programId" to "other", "name" to "Otro programa", "kind" to kind, "available" to 99999)),
            "rewardProgress" to listOf(obj("id" to "r", "programId" to "p", "name" to "Premio elegido", "kind" to kind,
                "goal" to goal, "available" to 999999, "remaining" to 0))),
            42, Instant.parse("2026-11-07T12:00:00Z"), "pass.example", "12345.member", "12345.business")
        val apple = pass.appleExperienceFields().getValue("backFields").jsonArray
            .single { it.jsonObject["key"] == JsonPrimitive("reward_r") }.jsonObject.getValue("value").jsonPrimitive.content
        val google = pass.googleExperienceFields().getValue("textModulesData").jsonArray
            .single { it.jsonObject["id"] == JsonPrimitive("featured") }.jsonObject.getValue("body").jsonPrimitive.content
        return listOf(apple, google)
    }
    @Test fun `both platforms forecast one reward from its own live balance`() {
        details("STAMPS", 29, 13).forEach {
            assertTrue(it.contains("Si canjeas este premio, te quedan 16 sellos."))
            assertTrue(it.contains("Caja confirma el saldo vigente antes del canje."))
            assertFalse(it.contains("99999"))
        }
    }
    @Test fun `both platforms keep exact cents for surplus cashback`() {
        details("CASHBACK", 501, 500).forEach { assertTrue(it.contains("te quedan 0.01 USD.")) }
    }
    @Test fun `both platforms preserve large exact money without floating point`() {
        details("CASHBACK", 9007199254740993L, 9007199254740992L).forEach {
            assertTrue(it.contains("te quedan 0.01 USD."))
            assertTrue(it.contains("Saldo: 90071992547409.93 USD"))
        }
    }
    @Test fun `both platforms keep singular points and zero remaining stamps`() {
        details("POINTS", 201, 200).forEach { assertTrue(it.contains("te queda 1 punto.")) }
        details("STAMPS", 13, 13).forEach { assertTrue(it.contains("te quedan 0 sellos.")) }
    }
    @Test fun `both platforms do not forecast a redemption before the goal`() {
        details("STAMPS", 12, 13).forEach {
            assertTrue(it.contains("Te falta 1 sello.")); assertFalse(it.contains("Si canjeas"))
            assertFalse(it.contains("Saldo suficiente"))
        }
    }
    @Test fun `both platforms hide redemption forecasts while the business is paused`() {
        details("STAMPS", 29, 13, false).forEach {
            assertTrue(it.contains("Canjes pausados")); assertFalse(it.contains("Si canjeas"))
            assertFalse(it.contains("Pide el canje")); assertTrue(it.contains("Saldo: 29 sellos"))
        }
    }
}
