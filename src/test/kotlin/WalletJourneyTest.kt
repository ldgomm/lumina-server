package com.premierdarkcoffee.loyalty

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.postgresql.ds.PGSimpleDataSource
import java.io.ByteArrayInputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import javax.imageio.ImageIO
import kotlin.test.*

class WalletJourneyTest {
    private fun pass(kind: String="STAMPS", amount: Long?=4, goal: Long=5, active: Boolean=true): WalletPass = WalletPass("t","m","same-serial","secret",obj(
        "name" to "Cliente", "businessName" to "Negocio", "slug" to "demo", "currency" to "USD", "cardCode" to "same-code", "canOperate" to active,
        "balances" to (amount?.let { listOf(obj("programId" to "p","name" to "Mi promoción","kind" to kind,"available" to it)) } ?: emptyList()),
        "earningRules" to listOf(obj("programId" to "p","programName" to "Mi promoción","kind" to kind,"text" to "Solo compras elegibles.")),
        "rewardProgress" to listOf(obj("id" to "r","programId" to "p","name" to "Mi premio","kind" to kind,"goal" to goal))
    ),1,Instant.EPOCH,"pass.test","123.m","123.t")
    private fun WalletPass.googleModules()=googleExperienceFields().getValue("textModulesData").jsonArray.map { it.jsonObject }
    private fun WalletPass.appleProgress()=appleExperienceFields().getValue("secondaryFields").jsonArray.map{it.jsonObject}.single { it["key"]==JsonPrimitive("journey") }.getValue("value").jsonPrimitive.content
    @Test fun `both providers explain actual target in its own units`() {
        for ((kind, amount, goal, summary, missing) in listOf(
            listOf("STAMPS","4","5","4 de 5 sellos","1 sello"),
            listOf("POINTS","30","50","30 de 50 puntos","20 puntos"),
            listOf("CASHBACK","250","500","2.50 de 5.00 USD","2.50 USD"))) {
            val p=pass(kind,amount.toLong(),goal.toLong())
            assertEquals(summary,p.appleProgress())
            assertEquals(summary,p.googleModules().single { it["id"]==JsonPrimitive("journey") }.getValue("body").jsonPrimitive.content)
            assertContains(p.googleArtwork("https://example.com").toString(),missing)
            assertFalse(p.journey()!!.guidance.contains("visita"))
        }
    }
    @Test fun `overflow and surplus keep precise amounts without authorizing a redemption`() {
        val near=WalletJourney(Long.MAX_VALUE-1,Long.MAX_VALUE,"POINTS","USD")
        assertEquals(99,near.percent);assertEquals(1,near.remaining);assertContains(near.summary,Long.MAX_VALUE.toString())
        val surplus=pass(amount=11);assertEquals("11 de 5 sellos",surplus.appleProgress());assertEquals(100,surplus.journey()!!.percent)
        assertEquals("Saldo suficiente. Confirma el canje en caja.",surplus.journey()!!.guidance)
        assertEquals(5,surplus.artwork().filled);assertEquals(11,surplus.snapshot.getValue("balances").jsonArray[0].jsonObject.getValue("available").jsonPrimitive.long)
    }
    @Test fun `new customer sees zero only for active configured promotions without mutating the snapshot`() {
        val p=pass(amount=null);val original=p.snapshot.toString()
        assertEquals("0 de 5 sellos",p.appleProgress());assertEquals(5,p.artwork().total);assertEquals(0,p.artwork().filled)
        assertContains(p.summary(),"Mi promoción: 0 sellos");assertEquals(original,p.snapshot.toString())
        assertEquals("0/5",p.googleExperienceFields().getValue("loyaltyPoints").jsonObject.getValue("balance").jsonObject.getValue("string").jsonPrimitive.content)
        assertEquals("same-code",p.googleJson(p.googleId!!,p.googleClass!!,"https://example.com").getValue("barcode").jsonObject.getValue("value").jsonPrimitive.content)
    }
    @Test fun `missing retired mismatched and suspended goals do not show progress`() {
        val p=pass(amount=null)
        val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("earningRules" to emptyList<JsonObject>())))
        assertNull(removed.journey());assertEquals(0,removed.artwork().total);assertFalse(removed.googleExperienceFields().toString().contains("Mi premio"))
        assertNull(pass(amount=null,active=false).journey());assertEquals(0,pass(amount=null,active=false).artwork().total)
        val mismatch=p.copy(snapshot=JsonObject(p.snapshot+obj("rewardProgress" to listOf(obj("id" to "r","programId" to "p","name" to "Wrong","kind" to "POINTS","goal" to 5)))))
        assertNull(mismatch.journey());assertEquals(0,mismatch.artwork().total)
        assertNull(pass(goal=0).journey())
    }
    @Test fun `featured zero program never borrows progress from another earned program`() {
        val p=pass();val q=p.copy(snapshot=JsonObject(p.snapshot+obj(
            "design" to json.parseToJsonElement(json.encodeToString(WalletDesign(featuredProgramId="q"))),
            "earningRules" to (p.snapshot.getValue("earningRules").jsonArray+obj("programId" to "q","programName" to "Otra promoción","kind" to "POINTS","text" to "Regla de q")),
            "rewardProgress" to (p.snapshot.getValue("rewardProgress").jsonArray+obj("id" to "qreward","programId" to "q","name" to "Otro premio","kind" to "POINTS","goal" to 50)))))
        assertEquals("0 de 50 puntos",q.appleProgress());assertEquals(0,q.artwork().filled);assertEquals(100,q.artwork().total)
        assertEquals(4,q.presentationBalances().single { it["programId"]==JsonPrimitive("p") }.getValue("available").jsonPrimitive.long)
        assertEquals(1,q.snapshot.getValue("balances").jsonArray.size)
    }
    @Test fun `existing balances win over duplicated configuration and legacy metadata stays compatible`() {
        val p=pass();val rules=p.snapshot.getValue("earningRules").jsonArray
        val q=p.copy(snapshot=JsonObject(p.snapshot+obj("earningRules" to (rules+rules+obj("programId" to "orphan","text" to "Legacy only")))))
        assertEquals(1,q.presentationBalances().size);assertEquals("4 de 5 sellos",q.appleProgress())
        val empty=pass(amount=null).copy(snapshot=JsonObject(p.snapshot+obj("balances" to emptyList<JsonObject>(),"earningRules" to listOf(obj("programId" to "p","text" to "Legacy rule")))))
        assertTrue(empty.presentationBalances().isEmpty());assertNull(empty.journey())
    }
    @Test fun `exact progress remains accessible within native field budgets`() {
        val p=pass();val q=p.copy(snapshot=JsonObject(p.snapshot+obj(
            "balances" to ((1..12).map{obj("programId" to if(it==1)"p" else "p$it","name" to "Promoción $it","kind" to "STAMPS","available" to 4)}),
            "rewardProgress" to (p.snapshot.getValue("rewardProgress").jsonArray+(1..20).map{obj("id" to "other$it","programId" to "p","name" to "Premio "+"detalle ".repeat(15),"kind" to "STAMPS","goal" to 7+it)}),
            "recentActivity" to (1..5).map{obj("at" to "2026-11-08T14:0$it:00Z","label" to "Compra: 15.50 USD "+"detalle ".repeat(10),"branch" to "Centro")},
            "announcements" to listOf(obj("id" to "notice","title" to "Evento","body" to "Novedad del negocio")))))
        val a=q.appleExperienceFields();assertTrue(a.getValue("secondaryFields").jsonArray.size+a.getValue("auxiliaryFields").jsonArray.size<=4)
        assertEquals("4 de 5 sellos",q.appleProgress())
        val modules=q.googleModules();assertTrue(modules.size<=10);assertEquals(modules.size,modules.map{it.getValue("id")}.distinct().size)
        val template=googleWalletTemplate().toString();modules.forEach{assertContains(template,"object.textModulesData['${it.getValue("id").jsonPrimitive.content}']")}
        assertTrue(modules.any{it["id"]==JsonPrimitive("activity_0")});assertTrue(modules.any{it["id"]==JsonPrimitive("news_0")});assertTrue(modules.any{it["id"]==JsonPrimitive("earning")})
        assertContains(modules.single{it["id"]==JsonPrimitive("status")}.toString(),q.design().usage)
    }
    @Test fun `new artwork routes include all business symbols and reject retired version combinations`() = testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"test-admin","https://example.com") }
        for(symbol in listOf(10,15,32))for(layout in listOf("","?layout=apple")) {
            val r=client.get("/wallet/art/v24/GRADIENT/$symbol/0b1f3a/4/5.png$layout")
            assertEquals(HttpStatusCode.OK,r.status);assertEquals("image/png",r.headers[HttpHeaders.ContentType]);assertEquals("no-store",r.headers[HttpHeaders.CacheControl])
        }
        assertEquals(HttpStatusCode.BadRequest,client.get("/wallet/art/v24/GRADIENT/33/0b1f3a/4/5.png").status)
        for(version in listOf(20,22))assertEquals(HttpStatusCode.NotFound,client.get("/wallet/art/v$version/GRADIENT/32/0b1f3a/4/5.png").status)
    }
    @Test fun `native art preserves clear completed pending and paused states with bounded file sizes`() {
        for(symbol in walletStampSymbols.indices)for(total in listOf(1,5,20,100)) {
            val empty=WalletArtwork("GRADIENT",symbol,"0b1f3a",0,total)
            val ready=empty.copy(filled=total)
            assertFalse(empty.png().contentEquals(ready.png()))
            val bytes=ready.png(3);assertTrue(bytes.size<250000)
            val image=ImageIO.read(ByteArrayInputStream(bytes));assertEquals(1125,image.width);assertEquals(369,image.height)
        }
        val art=WalletArtwork("GRADIENT",32,"0b1f3a",0,0);val blank=ImageIO.read(ByteArrayInputStream(art.png()))
        assertEquals(blank.getRGB(0,0),blank.getRGB(blank.width/2,blank.height/2))
        System.getenv("LOYALTY_ARTWORK_EVIDENCE")?.let { directory ->
            // Deterministic native files used by UI tests, not browser-generated mock artwork.
            val palettes=listOf(1 to "0b1f3a",5 to "34241f",6 to "702c28",3 to "202936",7 to "f2e9da",32 to "193f38",15 to "23566a",9 to "283c50",10 to "792c20",11 to "614626",14 to "6c304c",12 to "e3f0e8",13 to "244c35",16 to "f1e3ec",17 to "153f43",18 to "183765",4 to "202b53",19 to "41355f",21 to "30353e",22 to "e2edf5",23 to "4b3930",24 to "dfeeee",25 to "364b43",26 to "5e3057",27 to "eae5de",28 to "2f4352",29 to "1e3646",30 to "4c3d27",31 to "273a3d",8 to "3f3334",4 to "182f35",2 to "efdfe5")
            for((symbol,bg) in palettes)for((fill,total) in listOf(1 to 1,0 to 5,2 to 5,4 to 5,5 to 5,0 to 100,50 to 100,99 to 100,100 to 100))for(layout in listOf("apple","google")) {
                val picture=WalletArtwork(if(total==1)"SOLID" else "GRADIENT",symbol,bg,fill,total)
                val file=Path.of(directory,picture.path().drop(1)+".$layout.png");Files.createDirectories(file.parent);Files.write(file,picture.png(if(layout=="apple")3 else null))
            }
        }
    }
}
