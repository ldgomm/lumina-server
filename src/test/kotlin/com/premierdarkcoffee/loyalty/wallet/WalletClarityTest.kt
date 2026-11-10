package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.marketing.googleBrand
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.artwork.artwork
import com.premierdarkcoffee.loyalty.wallet.artwork.walletCompositions
import com.premierdarkcoffee.loyalty.wallet.presentation.googleWalletTemplate
import com.premierdarkcoffee.loyalty.wallet.presentation.journey
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletClarityTest {
    private fun pass(composition: String = "SIGNATURE", focus: String = "AUTO", kind: String = "STAMPS", amount: Long = 4, goal: Long = 5, active: Boolean = true): WalletPass = WalletPass(
        "tenant", "member", "unchanged-serial", "unchanged-token", obj(
            "businessName" to "Marca ficticia", "slug" to "fiction", "name" to "Cliente privado", "currency" to "USD", "cardCode" to "unchanged-qr", "canOperate" to active,
            "design" to json.encodeToJsonElement(WalletDesign(composition=composition,frontFocus=focus)),
            "balances" to listOf(obj("programId" to "p", "name" to "Promoción", "kind" to kind, "available" to amount)),
            "rewardProgress" to listOf(obj("id" to "r", "programId" to "p", "name" to "Un premio con nombre completo que debe conservarse en los detalles", "kind" to kind, "goal" to goal))),
        7, Instant.EPOCH, "pass.example", "123.member", "123.business")
    private fun key(fields: JsonObject, group: String) = fields.getValue(group).jsonArray.first().jsonObject.getValue("key").jsonPrimitive.content

    @Test fun `previous designs retain automatic hierarchy and all focus options round trip`() {
        assertEquals("AUTO",json.decodeFromString<WalletDesign>("{}").frontFocus)
        for(focus in listOf("AUTO","PROGRESS","REWARD")) {
            val d=WalletDesign(frontFocus=focus);d.validate()
            assertEquals(d,json.decodeFromString<WalletDesign>(json.encodeToString(d)))
        }
        for(value in listOf("", "progress", "CUSTOM", "<script>")) {
            assertFailsWith<Problem>{WalletDesign(frontFocus=value).validate()}
            assertFailsWith<IllegalArgumentException>{googleWalletTemplate("SIGNATURE",value)}
        }
    }
    @Test fun `Apple focus orders allowed native groups for every composition in both formats`() {
        for(composition in walletCompositions) for(focus in listOf("PROGRESS","REWARD")) {
            val p=pass(composition,focus)
            val first=if(focus=="PROGRESS")"journey" else "featured_reward"
            assertEquals(first,key(p.appleExperienceFields(),"secondaryFields"))
            assertEquals(first,key(p.applePosterFields(),"primaryFields"))
            assertEquals(pass(composition).appleExperienceFields()["headerFields"],p.appleExperienceFields()["headerFields"])
            assertEquals(pass(composition).appleExperienceFields()["backFields"],p.appleExperienceFields()["backFields"])
        }
    }
    @Test fun `Google focus uses two native rows and object references without private data in class`() {
        for(composition in walletCompositions) for(focus in listOf("PROGRESS","REWARD")) {
            val p=pass(composition,focus);val brand=p.googleBrand("https://example.com")
            val template=brand.getValue("classTemplateInfo").jsonObject
            val rows=template.getValue("cardTemplateOverride").jsonObject.getValue("cardRowTemplateInfos").jsonArray
            assertEquals(2,rows.size)
            assertContains(rows[0].toString(),if(focus=="PROGRESS")"['journey']" else "['headline']")
            assertContains(rows[1].toString(),"secondaryLoyaltyPoints")
            assertContains(template["detailsTemplateOverride"].toString(),"['journey']")
            assertContains(template["detailsTemplateOverride"].toString(),"['headline']")
            assertFalse(brand.toString().contains("Cliente privado"));assertFalse(brand.toString().contains("unchanged-qr"))
            assertEquals(JsonPrimitive("UNDER_REVIEW"),brand["reviewStatus"])
        }
    }
    @Test fun `focus never changes exact units surplus balances or native Google content`() {
        for(kind in listOf("STAMPS","POINTS","CASHBACK")) for(amount in listOf(0L,4L,5L,18L,Long.MAX_VALUE)) {
            val before=pass(kind=kind,amount=amount)
            for(focus in listOf("PROGRESS","REWARD")) {
                val after=pass(focus=focus,kind=kind,amount=amount)
                assertEquals(before.journey(),after.journey());assertEquals(before.artwork(),after.artwork())
                assertEquals(before.googleExperienceFields(),after.googleExperienceFields())
                assertEquals(before.appleExperienceFields()["backFields"],after.appleExperienceFields()["backFields"])
            }
        }
    }
    @Test fun `paused and removed targets never regain progress from a focus preference`() {
        for(focus in listOf("AUTO","PROGRESS","REWARD")) {
            val paused=pass(focus=focus,active=false)
            assertNull(paused.journey());assertEquals(0,paused.artwork().total)
            assertFalse(paused.appleExperienceFields().toString().contains("CANJEA EN CAJA"))
            assertFalse(paused.googleExperienceFields().toString().contains("Tu premio disponible"))
            val active=pass(focus=focus)
            val removed=active.copy(snapshot=JsonObject(active.snapshot+obj("rewardProgress" to emptyList<JsonObject>())))
            assertNull(removed.journey());assertEquals(0,removed.artwork().total)
            assertFalse(removed.appleExperienceFields().toString().contains("Un premio con nombre"))
            assertFalse(removed.googleExperienceFields().toString().contains("Un premio con nombre"))
        }
    }
    @Test fun `new memberships show zero using active rules without creating balances`() {
        for(focus in listOf("PROGRESS","REWARD")) {
            val p=pass(focus=focus).let { it.copy(snapshot=JsonObject(it.snapshot+obj("balances" to emptyList<JsonObject>(),"earningRules" to listOf(obj("programId" to "p","programName" to "Promoción","kind" to "STAMPS","text" to "Un sello por visita elegible."))))) }
            assertEquals(0,p.journey()!!.available);assertEquals(5,p.journey()!!.remaining)
            assertTrue(p.snapshot.getValue("balances").jsonArray.isEmpty())
            assertContains(p.appleExperienceFields().toString(),"0 de 5 sellos")
            assertContains(p.googleExperienceFields().toString(),"0 de 5 sellos")
        }
    }
    @Test fun `long reward names remain complete in native details for both priorities`() {
        val name="Un premio con nombre completo que debe conservarse en los detalles"
        for(focus in listOf("PROGRESS","REWARD")) {
            val p=pass(focus=focus)
            assertContains(p.appleExperienceFields()["backFields"].toString(),name)
            val featured=p.googleExperienceFields().getValue("textModulesData").jsonArray.first{it.jsonObject["id"]==JsonPrimitive("featured")}
            assertContains(featured.toString(),name)
        }
    }
    @Test fun `focus preserves barcode identity and artwork in both wallet payloads`() {
        for(focus in listOf("PROGRESS","REWARD")) {
            val p=pass(focus=focus);val old=pass()
            assertEquals(old.serial,p.serial);assertEquals(old.token,p.token);assertEquals(old.googleId,p.googleId)
            assertEquals(old.artwork().path(),p.artwork().path())
            val google=p.googleJson(p.googleId!!,p.googleClass!!,"https://example.com")
            assertEquals(JsonPrimitive("unchanged-qr"),google.getValue("barcode").jsonObject["value"])
            assertEquals(old.googleExperienceFields()["loyaltyPoints"],google["loyaltyPoints"])
            assertEquals(old.googleExperienceFields()["secondaryLoyaltyPoints"],google["secondaryLoyaltyPoints"])
        }
    }
}
