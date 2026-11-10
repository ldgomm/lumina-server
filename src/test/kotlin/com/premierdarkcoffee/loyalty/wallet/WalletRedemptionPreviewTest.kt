package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.marketing.googleBrand
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.artwork.artwork
import com.premierdarkcoffee.loyalty.wallet.artwork.precision
import com.premierdarkcoffee.loyalty.wallet.artwork.walletCompositions
import com.premierdarkcoffee.loyalty.wallet.presentation.WalletJourney
import com.premierdarkcoffee.loyalty.wallet.presentation.googleWalletTemplate
import com.premierdarkcoffee.loyalty.wallet.presentation.journey
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletRedemptionPreviewTest {
    private fun pass(amount: Long = 12, goal: Long = 5, kind: String = "STAMPS", active: Boolean = true,
                     composition: String = "PANORAMA", focus: String = "AUTO"): WalletPass = WalletPass(
        "tenant", "member", "same-serial", "same-token", obj(
            "businessName" to "Negocio ficticio", "name" to "Cliente de prueba", "slug" to "fiction", "currency" to "USD", "canOperate" to active, "cardCode" to "same-qr",
            "design" to json.encodeToJsonElement(WalletDesign(featuredProgramId="p",composition=composition,frontFocus=focus)),
            "balances" to listOf(obj("programId" to "p", "name" to "Mi promoción", "kind" to kind, "available" to amount),
                obj("programId" to "other", "name" to "Otra promoción", "kind" to kind, "available" to 999999)),
            "rewardProgress" to listOf(obj("id" to "r", "programId" to "p", "name" to "Premio elegido", "kind" to kind, "goal" to goal, "available" to 999999, "remaining" to 0))),
        7, Instant.EPOCH, "pass.example", "123.member", "123.business")
    private fun WalletPass.appleJourney() = appleExperienceFields().let { f ->
        (f.getValue("secondaryFields").jsonArray + f.getValue("auxiliaryFields").jsonArray).map { it.jsonObject }.single { it["key"]==JsonPrimitive("journey") }
    }
    private fun WalletPass.googleJourney() = googleExperienceFields().getValue("textModulesData").jsonArray.map { it.jsonObject }.single { it["id"]==JsonPrimitive("journey") }

    @Test fun `budget counts only whole rewards and subtracts one without resetting surplus`() {
        for ((amount,count,after) in listOf(Triple(0L,0L,null),Triple(4L,0L,null),Triple(5L,1L,0L),Triple(12L,2L,7L),Triple(15L,3L,10L))) {
            val j=WalletJourney(amount,5,"STAMPS","USD")
            assertEquals(count,j.affordableRedemptions);assertEquals(after,j.balanceAfterOne)
        }
        assertEquals("Saldo para 2 canjes",WalletJourney(12,5,"STAMPS","USD").redemptionLabel)
    }
    @Test fun `ready text reads as available balance while unfinished progress keeps its goal`() {
        assertEquals("4 de 5 sellos",WalletJourney(4,5,"STAMPS","USD").summary)
        assertEquals("12 sellos disponibles",WalletJourney(12,5,"STAMPS","USD").summary)
        assertEquals("1 punto disponible",WalletJourney(1,1,"POINTS","USD").summary)
        assertEquals("0.01 USD disponibles",WalletJourney(1,1,"CASHBACK","USD").summary)
    }
    @Test fun `money stays exact beyond JavaScript integer precision and no intermediate product overflows`() {
        val j=WalletJourney(9007199254740993L,9007199254740992L,"CASHBACK","USD")
        assertEquals(1,j.affordableRedemptions);assertEquals(1,j.balanceAfterOne)
        assertEquals("90071992547409.93 USD disponibles",j.summary)
        val max=WalletJourney(Long.MAX_VALUE,1,"POINTS","USD")
        assertEquals(Long.MAX_VALUE,max.affordableRedemptions);assertEquals(Long.MAX_VALUE-1,max.balanceAfterOne)
        assertEquals(100,max.percent)
    }
    @Test fun `both providers use current selected promotion balance instead of reward snapshot values`() {
        val p=pass()
        assertEquals(JsonPrimitive("Saldo para 2 canjes"),p.appleJourney()["label"])
        assertEquals(JsonPrimitive("Saldo para 2 canjes"),p.googleJourney()["header"])
        assertEquals(JsonPrimitive("12 sellos disponibles"),p.appleJourney()["value"])
        assertEquals(JsonPrimitive("12 sellos disponibles"),p.googleJourney()["body"])
        val apple=p.appleExperienceFields()["backFields"].toString()
        val google=p.googleExperienceFields()["textModulesData"].toString()
        for(text in listOf(apple,google)) {
            assertContains(text,"Saldo para 2 canjes de este premio.")
            assertContains(text,"te quedan 7 sellos.")
            assertContains(text,"Caja confirma el saldo vigente")
        }
    }
    @Test fun `paused or missing rewards never offer a budget or a simulated redemption`() {
        val paused=pass(active=false)
        assertNull(paused.journey())
        for(fields in listOf(paused.appleExperienceFields(),paused.googleExperienceFields())) {
            assertFalse(fields.toString().contains("Saldo para"));assertFalse(fields.toString().contains("Si canjeas"))
        }
        val original=pass();val empty=original.copy(snapshot=JsonObject(original.snapshot+obj("rewardProgress" to emptyList<JsonObject>())))
        assertNull(empty.journey());assertEquals(0,empty.artwork().total)
        for(fields in listOf(empty.appleExperienceFields(),empty.googleExperienceFields()))assertFalse(fields.toString().contains("Saldo para"))
    }
    @Test fun `every composition and focus preserves budget in Apple classic poster and Google`() {
        for(c in walletCompositions) for(f in listOf("AUTO","PROGRESS","REWARD")) {
            val p=pass(composition=c,focus=f)
            assertEquals(JsonPrimitive("Saldo para 2 canjes"),p.appleJourney()["label"])
            assertContains(p.applePosterFields()["primaryFields"].toString(),"12 sellos disponibles")
            assertEquals(JsonPrimitive("Saldo para 2 canjes"),p.googleJourney()["header"])
            assertEquals(googleWalletTemplate(c,f),p.googleBrand("https://example.com")["classTemplateInfo"])
        }
    }
    @Test fun `rendering is immutable and keeps exact balance identity artwork and bounded module count`() {
        val p=pass();val original=p.snapshot.toString();val artwork=p.artwork().path()
        repeat(3) { p.appleExperienceFields();p.applePosterFields();p.googleExperienceFields() }
        assertEquals(original,p.snapshot.toString());assertEquals(artwork,p.artwork().path());assertEquals("same-serial",p.serial)
        val google=p.googleJson(p.googleId!!,p.googleClass!!,"https://example.com")
        assertEquals(JsonPrimitive("same-qr"),google.getValue("barcode").jsonObject["value"])
        assertTrue(google.getValue("textModulesData").jsonArray.size<=10)
        assertEquals(JsonPrimitive("12"),google.getValue("loyaltyPoints").jsonObject.getValue("balance").jsonObject["string"])
        assertEquals(JsonPrimitive("2 canjes"),google.getValue("secondaryLoyaltyPoints").jsonObject.getValue("balance").jsonObject["string"])
    }
    @Test fun `zero and partial balances do not imply earned rewards or future purchases`() {
        for(kind in listOf("STAMPS","POINTS","CASHBACK")) for(amount in listOf(0L,4L)) {
            val p=pass(amount=amount,kind=kind)
            assertEquals(0,p.journey()!!.affordableRedemptions);assertNull(p.journey()!!.balanceAfterOne)
            for(fields in listOf(p.appleExperienceFields(),p.googleExperienceFields())) {
                assertFalse(fields.toString().contains("Saldo para"));assertFalse(fields.toString().contains("Si canjeas"))
            }
        }
    }
}
