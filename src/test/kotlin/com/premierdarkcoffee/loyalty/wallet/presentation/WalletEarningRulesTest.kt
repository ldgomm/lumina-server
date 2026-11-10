package com.premierdarkcoffee.loyalty.wallet.presentation

import com.premierdarkcoffee.loyalty.analytics.ReturnRadarQuery
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.shared.Bonus
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Window
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.googleJson
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneId
import kotlin.test.*

class WalletEarningRulesTest {
    private val zone=ZoneId.of("America/Guayaquil")
    private fun rules(p:Program)=walletEarningRules(p,"USD",zone)
    private fun pass(text:String,active:Boolean=true):WalletPass=WalletPass("t","m","same","secret",obj(
        "businessName" to "Café", "slug" to "cafe", "name" to "Ana", "currency" to "USD", "cardCode" to "same-code",
        "canOperate" to active,"timezone" to zone.id,
        "balances" to listOf(obj("programId" to "p","kind" to "STAMPS","available" to 3,"name" to "Visitas")),
        "rewardProgress" to listOf(obj("id" to "r","programId" to "p","kind" to "STAMPS","goal" to 5,"name" to "Premio")),
        "earningRules" to listOf(obj("programId" to "p","text" to text))
    ),1,Instant.parse("2026-11-08T17:00:00Z"),"pass.test","123.m","123.t")
    private fun WalletPass.apple()=appleExperienceFields().getValue("backFields").jsonArray.map{it.jsonObject}
    private fun WalletPass.google()=googleExperienceFields().getValue("textModulesData").jsonArray.map{it.jsonObject}
    @Test fun `both providers show identical rule and preserve identity`() {
        val text=rules(Program("Visitas",Kind.STAMPS));val p=pass(text)
        assertEquals(text,p.apple().single{it["key"]==JsonPrimitive("earning")}.getValue("value").jsonPrimitive.content)
        assertEquals(text,p.google().single{it["id"]==JsonPrimitive("earning")}.getValue("body").jsonPrimitive.content)
        assertEquals("same-code",p.googleJson("123.m","123.t","https://example.com").getValue("barcode").jsonObject.getValue("value").jsonPrimitive.content)
        assertTrue(p.google().size<=10);assertTrue(googleWalletTemplate().toString().contains("object.textModulesData['earning']"))
    }
    @Test fun `paused business does not invite accumulation in either provider`() {
        val p=pass("Cómo acumulas: 1 sello por compra.",false)
        assertTrue(p.apple().none{it["key"]==JsonPrimitive("earning")});assertTrue(p.google().none{it["id"]==JsonPrimitive("earning")})
    }
    @Test fun `a new member sees how to earn before the first purchase`() {
        val text=rules(Program("Visitas",Kind.STAMPS));val source=pass(text)
        val p=source.copy(snapshot=JsonObject(source.snapshot+obj("balances" to emptyList<JsonObject>())))
        assertEquals(text,p.apple().single{it["key"]==JsonPrimitive("earning")}.getValue("value").jsonPrimitive.content)
        assertEquals(text,p.google().single{it["id"]==JsonPrimitive("earning")}.getValue("body").jsonPrimitive.content)
        assertEquals("same",p.serial)
    }
    @Test fun `missing or retired promotion rules cannot leak into current card`() {
        val p=pass("Retirada");val absent=p.copy(snapshot=JsonObject(p.snapshot+obj("balances" to emptyList<JsonObject>(),"rewardProgress" to emptyList<JsonObject>())))
        assertFalse(absent.appleExperienceFields().toString().contains("Retirada"));assertFalse(absent.googleExperienceFields().toString().contains("Retirada"))
    }
    @Test fun `points and cashback use exact rates and paid eligible amounts`() {
        val p=rules(Program("Puntos",Kind.POINTS,unitMinor=250,pointsPerUnit=3,minimumSpendMinor=725));assertContains(p,"3 puntos por cada 2.50 USD completos");assertContains(p,"7.25 USD")
        val c=rules(Program("Saldo",Kind.CASHBACK,cashbackBps=255));assertContains(c,"2.55% del importe elegible pagado")
        assertContains(c,"después de descuentos");assertContains(c,"no acumulas en esa misma promoción")
    }
    @Test fun `unit based and receipt based stamps are not confused`() {
        assertContains(rules(Program("Pizza",Kind.STAMPS,countUnits=true,productGroup="pizza")),"por unidad elegible")
        assertContains(rules(Program("Visita",Kind.STAMPS)),"por compra elegible")
        assertContains(rules(Program("Pizza",Kind.STAMPS,countUnits=true,productGroup="pizza")),"Categoría: pizza")
    }
    @Test fun `branch date overnight schedule and bonus restrictions are disclosed`() {
        val r=rules(Program("Noche",Kind.STAMPS,branchIds=setOf(id()),window=Window(startsAt="2026-11-01T05:00:00Z",endsAt="2026-12-01T05:00:00Z",weekdays=setOf(5),localStart="22:00",localEnd="02:00"),bonuses=listOf(Bonus(1,2))))
        for(value in listOf("Solo en sucursales habilitadas","Días: vie","22:00–02:00 del día siguiente","01/12/2026 00:00","Regla base","fin no incluido"))assertContains(r,value)
    }
    @Test fun `large rule text stays complete rather than silently dropping conditions`() {
        val p=pass("Reglas completas. ".repeat(50)+"SOLO VIERNES")
        assertTrue(p.apple().single{it["key"]==JsonPrimitive("earning")}.getValue("value").jsonPrimitive.content.endsWith("SOLO VIERNES"))
        assertTrue(p.google().single{it["id"]==JsonPrimitive("earning")}.getValue("body").jsonPrimitive.content.endsWith("SOLO VIERNES"))
    }
    @Test fun `radar filters reject invalid pagination and unbounded search`() {
        for(q in listOf(ReturnRadarQuery("bad"),ReturnRadarQuery(offset=-1),ReturnRadarQuery(offset=1_000_001),ReturnRadarQuery(search="a".repeat(101))))assertFailsWith<Problem>{q.validate()}
        for(s in listOf("FOCUS","ALL","LATE","READY","NEAR","FIRST"))ReturnRadarQuery(s).validate()
    }
}
