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

class WalletFeaturedRewardTest {
    private val program = "00000000-0000-0000-0000-000000000001"
    private val chosen = "00000000-0000-0000-0000-000000000003"
    private fun pass(kind: String = "POINTS", amount: Long = 150, goal: Long = 200,
                     selected: String? = chosen, composition: String = "PANORAMA", focus: String = "AUTO"): WalletPass = WalletPass(
        "tenant", "member", "same-serial", "same-token", obj(
            "businessName" to "Negocio ficticio", "name" to "Cliente", "slug" to "fiction", "currency" to "USD", "canOperate" to true, "cardCode" to "same-qr",
            "design" to json.encodeToJsonElement(WalletDesign(featuredProgramId=program,featuredRewardId=selected,composition=composition,frontFocus=focus)),
            "balances" to listOf(obj("programId" to program,"name" to "Promoción","kind" to kind,"available" to amount),obj("programId" to "other","name" to "Otra","kind" to kind,"available" to 999999)),
            "rewardProgress" to listOf(obj("id" to "cheap","programId" to program,"name" to "Premio pequeño","kind" to kind,"goal" to 10),
                obj("id" to chosen,"programId" to program,"name" to "Premio destacado","kind" to kind,"goal" to goal,"available" to 999999),
                obj("id" to "foreign","programId" to "other","name" to "Otro premio","kind" to kind,"goal" to 1))),
        7,Instant.EPOCH,"pass.example","123.member","123.business")
    private fun WalletPass.withRewards(rows: List<JsonObject>) = copy(snapshot=JsonObject(snapshot+obj("rewardProgress" to rows)))
    private fun WalletPass.rewards() = snapshot.getValue("rewardProgress").jsonArray.map{it.jsonObject}
    private fun assertFront(p: WalletPass, name: String) {
        for(fields in listOf(p.appleExperienceFields(),p.applePosterFields())) {
            val all=listOf("secondaryFields","auxiliaryFields","primaryFields").flatMap{fields[it]?.jsonArray.orEmpty()}
            assertEquals(JsonPrimitive(name),all.map{it.jsonObject}.single{it["key"]==JsonPrimitive("featured_reward")}["value"])
        }
        val modules=p.googleExperienceFields().getValue("textModulesData").jsonArray.map{it.jsonObject}
        assertContains(modules.single{it["id"]==JsonPrimitive("headline")}.toString(),name)
    }
    @Test fun `old designs keep automatic behavior and explicit choices require valid paired IDs`() {
        assertNull(json.decodeFromString<WalletDesign>("{}").featuredRewardId)
        WalletDesign(featuredProgramId=program,featuredRewardId=chosen).validate()
        assertEquals("FEATURED_PROGRAM_REQUIRED",assertFailsWith<Problem>{WalletDesign(featuredRewardId=chosen).validate()}.code)
        assertFailsWith<Problem>{WalletDesign(featuredProgramId=program,featuredRewardId="invalid").validate()}
        assertEquals(10,pass(selected=null).journey()!!.goal);assertFront(pass(selected=null),"Premio pequeño")
    }
    @Test fun `chosen reward controls name goal remaining and illustration for both providers`() {
        for((kind,amount,goal) in listOf(Triple("POINTS",150L,200L),Triple("STAMPS",7L,12L),Triple("CASHBACK",750L,1025L))) {
            val p=pass(kind,amount,goal);val j=p.journey()!!
            assertEquals(goal,j.goal);assertEquals(goal-amount,j.remaining);assertFront(p,"Premio destacado")
            for(fields in listOf(p.appleExperienceFields(),p.applePosterFields(),p.googleExperienceFields())) assertContains(fields.toString(),j.summary)
            assertEquals(if(kind=="STAMPS")12 else 100,p.artwork().total)
            assertEquals(if(kind=="STAMPS")7 else j.percent,p.artwork().filled)
        }
    }
    @Test fun `unavailable selection falls back inside the same program and never uses a different balance`() {
        for(p in listOf(pass(selected="missing"),pass(selected="foreign"),pass().withRewards(pass().rewards().filter{it["id"]!=JsonPrimitive(chosen)}))) {
            assertEquals(150,p.journey()!!.available);assertEquals(10,p.journey()!!.goal);assertFront(p,"Premio pequeño")
        }
        val p=pass();val wrong=p.withRewards(p.rewards().map{if(it["id"]==JsonPrimitive(chosen))JsonObject(it+obj("kind" to "CASHBACK"))else it})
        assertFront(wrong,"Premio pequeño")
    }
    @Test fun `no active target or paused account never invents progress or redemption capacity`() {
        val p=pass();val none=p.withRewards(p.rewards().filter{it["programId"]==JsonPrimitive("other")})
        for(value in listOf(none,p.copy(snapshot=JsonObject(p.snapshot+obj("canOperate" to false))))) {
            assertNull(value.journey());assertEquals(0,value.artwork().total)
            val apple=value.appleExperienceFields();val google=value.googleExperienceFields()
            for(key in listOf("headerFields","primaryFields","secondaryFields","auxiliaryFields"))assertFalse(apple[key].toString().contains("Saldo para"))
            assertFalse(google.getValue("secondaryLoyaltyPoints").toString().contains("canje"))
            assertFalse(google.getValue("textModulesData").jsonArray.map{it.jsonObject}.single{it["id"]==JsonPrimitive("journey")}.toString().contains("Saldo para"))
            if(value.snapshot["canOperate"]==JsonPrimitive(false))for(fields in listOf(apple,google))assertFalse(fields.toString().contains("Saldo para"))
        }
    }
    @Test fun `new customer sees chosen target at zero without fabricating a balance`() {
        val base=pass()
        val p=base.copy(snapshot=JsonObject(base.snapshot+obj("balances" to emptyList<JsonObject>(),
            "earningRules" to listOf(obj("programId" to program,"programName" to "Promoción","kind" to "POINTS","text" to "Regla de ejemplo")))))
        assertEquals(0,p.journey()!!.available);assertEquals(200,p.journey()!!.remaining);assertFront(p,"Premio destacado")
        assertTrue(p.snapshot.getValue("balances").jsonArray.isEmpty())
    }
    @Test fun `redemption budget and remainder refer to chosen cost with exact large amounts`() {
        val p=pass(amount=550,goal=200);assertEquals(2,p.journey()!!.affordableRedemptions);assertEquals(350,p.journey()!!.balanceAfterOne)
        for(fields in listOf(p.appleExperienceFields(),p.googleExperienceFields())) {
            assertContains(fields.toString(),"Saldo para 2 canjes");assertContains(fields.toString(),"te quedan 350 puntos")
        }
        val large=pass(kind="CASHBACK",amount=9007199254740993,goal=9007199254740992)
        assertEquals(1,large.journey()!!.balanceAfterOne);assertContains(large.googleExperienceFields().toString(),"0.01 USD")
    }
    @Test fun `every composition and focus carries the same explicit prize`() {
        for(c in walletCompositions) for(f in listOf("AUTO","PROGRESS","REWARD")) {
            val p=pass(composition=c,focus=f);assertFront(p,"Premio destacado");assertEquals(200,p.journey()!!.goal)
            assertEquals(googleWalletTemplate(c,f),p.googleBrand("https://example.test")["classTemplateInfo"])
        }
    }
    @Test fun `rendering preserves identity balances and alternatives while public class has no private choice`() {
        val p=pass();val before=p.snapshot.toString()
        repeat(3){p.appleExperienceFields();p.applePosterFields();p.googleExperienceFields();p.artwork()}
        assertEquals(before,p.snapshot.toString());assertEquals("same-serial",p.serial)
        assertContains(p.appleExperienceFields().getValue("backFields").toString(),"Premio pequeño")
        assertContains(p.googleExperienceFields().getValue("textModulesData").toString(),"Premio pequeño")
        val g=p.googleJson(p.googleId!!,p.googleClass!!,"https://example.test")
        assertEquals(JsonPrimitive("same-qr"),g.getValue("barcode").jsonObject["value"]);assertTrue(g.getValue("textModulesData").jsonArray.size<=10)
        assertFalse(p.googleBrand("https://example.test").toString().contains(chosen))
    }
}
