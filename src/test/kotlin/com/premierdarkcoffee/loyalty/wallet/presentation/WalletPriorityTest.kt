package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.application.qr
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.artwork.artwork
import com.premierdarkcoffee.loyalty.wallet.artwork.walletCompositions
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.*

class WalletPriorityTest {
    private val a="00000000-0000-0000-0000-000000000001"
    private val b="00000000-0000-0000-0000-000000000002"
    private fun pass(first:Long=41,second:Long=7,design:WalletDesign=WalletDesign(automaticPriority="PROGRESS"))=WalletPass("tenant","member","serial","token",obj(
        "businessName" to "Ejemplo","name" to "Cliente ficticio","slug" to "demo","currency" to "USD","canOperate" to true,"cardCode" to "qr",
        "design" to json.encodeToJsonElement(design),
        "balances" to listOf(obj("programId" to a,"name" to "Puntos","kind" to "POINTS","available" to first),obj("programId" to b,"name" to "Visitas","kind" to "STAMPS","available" to second)),
        "rewardProgress" to listOf(obj("id" to "ra","programId" to a,"name" to "Premio puntos","kind" to "POINTS","goal" to 100),obj("id" to "rb","programId" to b,"name" to "Premio visitas","kind" to "STAMPS","goal" to 8))
    ),1,Instant.EPOCH,"pass.example","1.member","1.business")
    @Test fun `new preference is optional and validated`() {
        assertEquals("PROGRESS",json.decodeFromString<WalletDesign>("{}").automaticPriority)
        assertEquals("INVALID_PRIORITY",assertFailsWith<Problem>{WalletDesign(automaticPriority="random").validate()}.code)
        WalletDesign(automaticPriority="PROGRESS").validate()
    }
    @Test fun `closest percentage wins across different units without adding balances`() {
        val p=pass();assertEquals(b,p.rewardFocus().balances.first()["programId"]!!.jsonPrimitive.content)
        assertEquals(WalletJourney(7,8,"STAMPS","USD"),p.journey())
        for(fields in listOf(p.appleExperienceFields(),p.applePosterFields(),p.googleExperienceFields()))assertContains(fields.toString(),"Premio visitas")
        assertEquals(7,p.artwork().filled);assertEquals(8,p.artwork().total)
    }
    @Test fun `sufficient balance is prioritized before incomplete progress`() {
        assertEquals(WalletJourney(100,100,"POINTS","USD"),pass(100,7).journey())
        assertEquals(WalletJourney(100,100,"POINTS","USD"),pass(100,800).journey()) // Both ready: stable order, not incomparable sums.
    }
    @Test fun `legacy order and featured promotion cannot hide a better reward`() {
        for (mode in listOf("ORDER", "PROGRESS")) {
            val design = WalletDesign(featuredProgramId=a, automaticPriority=mode)
            assertEquals(b, pass(design=design).rewardFocus().target!!.programId)
            assertEquals(a, pass(100,8,design).rewardFocus().target!!.programId)
        }
    }
    @Test fun `cashback available and the closest reward after redeeming agree on both fronts and artwork`() {
        val original = pass(44,0,WalletDesign(featuredProgramId=a,automaticPriority="ORDER"))
        fun check(cents:Long, points:Long, expected:String) {
            val balances = listOf(obj("programId" to a,"name" to "Puntos","kind" to "POINTS","available" to points),
                obj("programId" to b,"name" to "Saldo por volver","kind" to "CASHBACK","available" to cents))
            val rows = listOf(obj("id" to "ra","programId" to a,"name" to "Postre","kind" to "POINTS","goal" to 100),
                obj("id" to "rb","programId" to b,"name" to "Usa tu saldo","kind" to "CASHBACK","goal" to 500))
            val p = original.copy(snapshot=JsonObject(original.snapshot+obj("balances" to balances,"rewardProgress" to rows)))
            for (front in listOf(p.appleExperienceFields(),p.applePosterFields())) {
                val fields = listOf("primaryFields","secondaryFields","auxiliaryFields").flatMap { front[it]?.jsonArray.orEmpty() }
                assertEquals(expected,fields.single{it.jsonObject["key"]==JsonPrimitive("featured_reward")}.jsonObject["value"]!!.jsonPrimitive.content)
                if(cents>=500) {
                    assertContains(fields.toString(),"CANJEA EN CAJA")
                    assertContains(fields.toString(),"Canje de 5.00 USD")
                }
            }
            val modules = p.googleExperienceFields().getValue("textModulesData").jsonArray
            assertEquals(JsonPrimitive(expected),modules.single { it.jsonObject["id"] == JsonPrimitive("headline") }.jsonObject["body"])
            val journey = p.journey()!!
            assertEquals(if (expected=="Postre") points else cents,journey.available)
            assertEquals(journey.percent,p.artwork().filled)
        }
        check(725,44,"Usa tu saldo")
        check(500,44,"Usa tu saldo")
        check(499,44,"Usa tu saldo")
        check(799,44,"Usa tu saldo")
        check(225,44,"Usa tu saldo")
        check(225,46,"Postre")
    }
    @Test fun `no rewards and paused account do not fabricate progress`() {
        val p=pass();val none=p.copy(snapshot=JsonObject(p.snapshot+obj("rewardProgress" to emptyList<JsonObject>())))
        assertNull(none.journey());assertEquals(a,none.rewardFocus().balances.first()["programId"]!!.jsonPrimitive.content)
        val paused=p.copy(snapshot=JsonObject(p.snapshot+obj("canOperate" to false)))
        assertNull(paused.journey());assertEquals(0,paused.artwork().total)
    }
    @Test fun `ranking is exact for large balances and does not overflow`() {
        val p=pass(Long.MAX_VALUE-2,Long.MAX_VALUE-1)
        val rewards=p.snapshot.getValue("rewardProgress").jsonArray.map{JsonObject(it.jsonObject+obj("goal" to Long.MAX_VALUE))}
        val big=p.copy(snapshot=JsonObject(p.snapshot+obj("rewardProgress" to rewards)))
        assertEquals(b,big.rewardFocus().balances.first()["programId"]!!.jsonPrimitive.content)
        assertEquals(Long.MAX_VALUE-1,big.journey()!!.available)
    }
    @Test fun `selected target is identical in all compositions and native module budget is respected`() {
        for(composition in walletCompositions) {
            val p=pass(design=WalletDesign(automaticPriority="PROGRESS",composition=composition));assertEquals(8,p.journey()!!.goal)
            val modules=p.googleExperienceFields().getValue("textModulesData").jsonArray
            assertTrue(modules.size<=10);assertContains(modules.first{it.jsonObject["id"]==JsonPrimitive("headline")}.toString(),"Premio visitas")
            for(fields in listOf(p.appleExperienceFields(),p.applePosterFields()))assertContains(fields.toString(),"7 de 8 sellos")
        }
    }
}
