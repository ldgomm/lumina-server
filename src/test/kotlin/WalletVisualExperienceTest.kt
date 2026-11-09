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

class WalletVisualExperienceTest {
    private fun pass(kind: String="POINTS", amount: Long=75, goal: Long=100, active: Boolean=true, name: String="Tu premio") =
        WalletPass("tenant","member","same-serial","private-token",obj(
            "businessName" to "Negocio", "slug" to "demo", "name" to "Ana de ejemplo", "currency" to "USD",
            "cardCode" to "same-qr", "canOperate" to active, "timezone" to "America/Guayaquil",
            "design" to json.parseToJsonElement(json.encodeToString(WalletDesign(background="#0b1f3a",stampSymbol="★"))),
            "balances" to listOf(obj("programId" to "p","kind" to kind,"available" to amount,"name" to "Mi promoción")),
            "rewardProgress" to listOf(obj("id" to "r","programId" to "p","kind" to kind,"goal" to goal,"name" to name)),
            "recentActivity" to listOf(obj("kind" to "PURCHASE","at" to "2026-11-07T17:00:00Z","label" to "Compra: 12.34 USD","branch" to "Centro"))
        ),42,Instant.parse("2026-11-07T17:00:00Z"),"pass.example","12345.member","12345.tenant")
    private fun JsonObject.text(name:String)=getValue(name).jsonPrimitive.content
    private fun WalletPass.modules()=googleExperienceFields().getValue("textModulesData").jsonArray.map{it.jsonObject}

    @Test fun `points and cashback progress never replace exact native balances`() {
        for((kind,amount,goal,label,display) in listOf(
            listOf("POINTS","75","100","PUNTOS","75 puntos"),
            listOf("CASHBACK","499","500","SALDO","4.99 USD"))) {
            val p=pass(kind,amount.toLong(),goal.toLong());val apple=p.appleExperienceFields()
            assertEquals(100,p.artwork().total)
            assertEquals(if(kind=="POINTS")75 else 99,p.artwork().filled)
            assertTrue(apple.getValue("primaryFields").jsonArray.isEmpty())
            val exact=apple.getValue("headerFields").jsonArray.map{it.jsonObject}.single{it.text("key")=="balance"}
            assertEquals(label,exact.text("label"));assertEquals(display,exact.text("value"))
            assertTrue(p.modules().single{it.text("id")=="featured"}.text("body").contains(display))
            assertEquals("same-qr",p.googleJson(p.googleId!!,p.googleClass!!,"https://example.com").getValue("barcode").jsonObject.text("value"))
        }
    }
    @Test fun `percentage graphics floor partial progress and cap surplus across arbitrary goals`() {
        for(kind in listOf("POINTS","CASHBACK")) {
            assertEquals(0,pass(kind,0,3).artwork().filled)
            assertEquals(33,pass(kind,1,3).artwork().filled)
            assertEquals(99,pass(kind,Long.MAX_VALUE-1,Long.MAX_VALUE).artwork().filled)
            val ready=pass(kind,11,5)
            assertEquals(100,ready.artwork().filled)
            assertTrue(ready.modules().single{it.text("id")=="featured"}.text("body").contains(if(kind=="POINTS")"11 puntos" else "0.11 USD"))
        }
    }
    @Test fun `google front names the featured prize while full unicode text stays in details`() {
        val name="Café ☕ y pizza 🍕 a elección ".repeat(5);val p=pass(name=name)
        val headline=p.modules().single{it.text("id")=="headline"}
        assertEquals("Próximo premio",headline.text("header"))
        assertTrue(headline.text("body").codePointCount(0,headline.text("body").length)<=44)
        assertTrue(headline.text("body").endsWith("…"))
        assertTrue(p.modules().single{it.text("id")=="featured"}.text("body").startsWith(name))
        assertEquals("Premio en caja",pass(amount=100).modules().single{it.text("id")=="headline"}.text("header"))
    }
    @Test fun `google shared layout covers every possible module without embedding customer data`() {
        val p=pass();val template=googleWalletTemplate();val serialized=template.toString()
        for(secret in listOf("Ana de ejemplo","same-qr","private-token","member","Tu premio"))assertFalse(serialized.contains(secret))
        assertEquals(3,template.getValue("cardTemplateOverride").jsonObject.getValue("cardRowTemplateInfos").jsonArray.size)
        for(id in listOf("headline","journey","featured","balances_0","balances_1","activity_0","activity_1","rewards_0","news_0","status","usage"))assertTrue(serialized.contains("object.textModulesData['$id']"))
        assertTrue(p.modules().all{serialized.contains("object.textModulesData['${it.text("id")}']")})
        assertTrue(serialized.indexOf("activity_0")<serialized.indexOf("rewards_0"))
        assertTrue(serialized.contains("object.loyaltyPoints.balance"));assertTrue(serialized.contains("object.secondaryLoyaltyPoints.balance"))
        assertEquals(template,p.googleBrand("https://example.com").getValue("classTemplateInfo"))
    }
    @Test fun `apple puts featured conditions and real movements before the remaining reward catalog`() {
        val initial=pass();val p=initial.copy(snapshot=JsonObject(initial.snapshot+obj("rewardProgress" to (
            initial.snapshot.getValue("rewardProgress").jsonArray+(1..9).map { obj("id" to "extra$it","programId" to "p","kind" to "POINTS","goal" to 100+it,"name" to "Otro premio $it") }))))
        val back=p.appleExperienceFields().getValue("backFields").jsonArray.map{it.jsonObject}
        assertEquals("reward_r",back.first().text("key"))
        val event=back.indexOfFirst{it.text("value").contains("12.34 USD")};assertTrue(event>0)
        assertTrue(event<back.indexOfFirst{it.text("key")=="reward_extra1"})
        assertTrue(back[event].text("value").contains("Centro"))
        assertTrue(back[event].text("label").contains("07 nov 2026"))
    }
    @Test fun `paused and withdrawn progress clears the illustration and Google headline`() {
        val p=pass(amount=100,active=false);assertEquals(0,p.artwork().total)
        val headline=p.modules().single{it.text("id")=="headline"}
        assertEquals("Operaciones pausadas",headline.text("body"));assertFalse(headline.toString().contains("Premio en caja"))
        val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("canOperate" to true,"balances" to emptyList<JsonObject>())))
        assertEquals(0,removed.artwork().total)
        assertFalse(removed.modules().toString().contains("Tu premio"))
        assertEquals(p.serial,removed.serial);assertEquals(p.googleId,removed.googleId)
        val png=ImageIO.read(ByteArrayInputStream(p.artwork().png()))
        assertEquals(1032,png.width)
        assertContentEquals(p.artwork().copy(filled=0,total=0).png(),p.artwork().png())
    }
    @Test fun `native image versions preserve old links and reject unknown layouts without database access`() = testApplication {
        environment{config=MapApplicationConfig()}
        application{loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"test-admin","https://example.com")}
        for(version in listOf(20,22,24))for(suffix in listOf("","?layout=apple"))assertEquals(HttpStatusCode.OK,client.get("/wallet/art/v$version/GRADIENT/5/0b1f3a/99/100.png$suffix").status)
        assertEquals(HttpStatusCode.NotFound,client.get("/wallet/art/v99/GRADIENT/5/0b1f3a/99/100.png").status)
        assertEquals(HttpStatusCode.BadRequest,client.get("/wallet/art/v22/GRADIENT/5/0b1f3a/101/100.png").status)
        assertEquals(HttpStatusCode.BadRequest,client.get("/wallet/art/v22/GRADIENT/5/0b1f3a/99/100.png?layout=web").status)
    }
    @Test fun `new illustration is versioned and keeps bounded retina assets for light and dark brands`() {
        val presets=listOf(1 to "0b1f3a",5 to "34241f",6 to "702c28",3 to "202936",7 to "f2e9da")
        for((symbol,bg) in presets)for(total in listOf(5,100))for(fill in listOf(0,total-1,total)) {
            val art=WalletArtwork("GRADIENT",symbol,bg,fill,total)
            for(layout in listOf("apple","google")) {
                val bytes=art.png(if(layout=="apple")3 else null)
                assertTrue(bytes.size<250000)
                val rendered=ImageIO.read(ByteArrayInputStream(bytes))
                assertEquals(if(layout=="apple")1125 else 1032,rendered.width)
                assertEquals(if(layout=="apple")432 else 812,rendered.height)
                System.getenv("LOYALTY_ARTWORK_EVIDENCE")?.let { directory ->
                    val file=Path.of(directory,art.path().drop(1)+".$layout.png");Files.createDirectories(file.parent);Files.write(file,bytes)
                }
            }
        }
        val art=WalletArtwork("GRADIENT",5,"0b1f3a",4,5)
        assertFalse(art.png().contentEquals(art.png(version=20)))
    }
}
