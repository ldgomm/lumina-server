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

class WalletArtworkTest {
    private fun pass(available: Long=4, goal: Long=5, active: Boolean=true, kind: String="STAMPS", design: WalletDesign=WalletDesign(stampSymbol="🍕")): WalletPass = WalletPass("tenant","member","serial","token",obj(
        "businessName" to "Café de prueba", "slug" to "demo", "name" to "Cliente de prueba", "currency" to "USD", "canOperate" to active, "cardCode" to "PRIVATE-QR",
        "balances" to listOf(obj("programId" to "a","kind" to kind,"available" to available,"name" to "Visitas")),
        "rewardProgress" to listOf(obj("id" to "r","programId" to "a","kind" to kind,"goal" to goal,"name" to "Premio de ejemplo")),
        "design" to json.parseToJsonElement(json.encodeToString(design))),1,Instant.EPOCH,null,null,null)

    @Test fun `existing designs gain artwork without losing their configurable symbol`() {
        val d=json.decodeFromString<WalletDesign>("{\"stampSymbol\":\"★\"}")
        assertEquals("GRADIENT",d.artworkStyle);assertEquals("★",d.stampSymbol)
        walletStampSymbols.forEach { WalletDesign(stampSymbol=it).validate() }
        assertFailsWith<Problem> { WalletDesign(stampSymbol="<svg>").validate() }
        assertFailsWith<Problem> { WalletDesign(artworkStyle="CSS").validate() }
    }
    @Test fun `arbitrary targets use matching balances and cap ready stamps without losing excess`() {
        assertEquals(WalletArtwork("GRADIENT",6,"204e41",4,5),pass().artwork())
        assertEquals(13,pass(12,13).artwork().total)
        val p=pass(11,5);assertEquals(5,p.artwork().filled)
        val fields=p.appleStoreFields();assertTrue(fields.getValue("primaryFields").jsonArray.isEmpty())
        val balance=fields.getValue("headerFields").jsonArray.map { it.jsonObject }.single { it["key"]==JsonPrimitive("balance") }
        assertEquals("11 sellos",balance.getValue("value").jsonPrimitive.content)
        assertEquals("Progreso actualizado: %@",balance.getValue("changeMessage").jsonPrimitive.content)
        assertEquals("11",p.googleExperienceFields().getValue("loyaltyPoints").jsonObject.getValue("balance").jsonObject.getValue("string").jsonPrimitive.content)
    }
    @Test fun `featured promotion determines the picture even when another prize is ready`() {
        val p=pass(design=WalletDesign(featuredProgramId="b"))
        val s=JsonObject(p.snapshot + obj("balances" to (p.snapshot.getValue("balances").jsonArray + obj("programId" to "b","kind" to "STAMPS","available" to 2,"name" to "Otra")),
            "rewardProgress" to (p.snapshot.getValue("rewardProgress").jsonArray + obj("id" to "b","programId" to "b","kind" to "STAMPS","goal" to 9,"name" to "Otro premio"))))
        assertEquals(2,p.copy(snapshot=s).artwork().filled);assertEquals(9,p.copy(snapshot=s).artwork().total)
    }
    @Test fun `paused removed and orphan promotions have no graphic progress`() {
        assertEquals(0,pass(active=false).artwork().total)
        assertEquals(100,pass(kind="CASHBACK").artwork().total)
        assertEquals(0,pass(goal=0).artwork().total)
        val p=pass();val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("balances" to emptyList<JsonObject>())))
        assertEquals(0,removed.artwork().total)
        assertNotEquals(p.googleArtwork("https://example.com"),removed.googleArtwork("https://example.com"))
        assertFalse(removed.googleArtwork("https://example.com").toString().contains("4/5"))
    }
    @Test fun `large goals stay bounded and cannot overflow or invent individual stamps`() {
        assertEquals(100,pass(0,21).artwork().total)
        assertEquals(95,pass(20,21).artwork().filled)
        assertEquals(99,pass(Long.MAX_VALUE-1,Long.MAX_VALUE).artwork().filled)
        assertEquals(100,pass(Long.MAX_VALUE,Long.MAX_VALUE).artwork().filled)
        assertTrue(pass(Long.MAX_VALUE,Long.MAX_VALUE).artwork().png().size<200000)
    }
    @Test fun `image URLs change with progress but contain no customer or security identifiers`() {
        val p=pass();val native=p.googleJson("issuer.object","issuer.class","https://example.com")
        val uri=native.getValue("heroImage").jsonObject.getValue("sourceUri").jsonObject.getValue("uri").jsonPrimitive.content
        assertEquals("https://example.com/wallet/art/v27/GRADIENT/6/204e41/4/5.png",uri)
        for(secret in listOf("member","PRIVATE-QR","serial","token"))assertFalse(uri.contains(secret))
        assertNotEquals(uri,pass(5).googleArtwork("https://example.com").getValue("sourceUri").jsonObject.getValue("uri").jsonPrimitive.content)
        assertEquals("PRIVATE-QR",native.getValue("barcode").jsonObject.getValue("value").jsonPrimitive.content)
        assertTrue(native.getValue("heroImage").jsonObject.getValue("contentDescription").toString().contains("4 de 5"))
    }
    @Test fun `all symbols render without platform emoji fonts at native dimensions`() {
        val hashes=mutableSetOf<Int>()
        walletStampSymbols.indices.forEach { symbol ->
            val art=WalletArtwork("GRADIENT",symbol,"0b1f3a",4,5)
            val google=art.png();hashes+=google.contentHashCode()
            val image=ImageIO.read(ByteArrayInputStream(google));assertEquals(1032,image.width);assertEquals(812,image.height)
            for(scale in 1..3) { val apple=ImageIO.read(ByteArrayInputStream(art.png(scale)));assertEquals(375*scale,apple.width);assertEquals(144*scale,apple.height) }
        }
        assertEquals(walletStampSymbols.size,hashes.size)
        // Optional, local-only evidence used by the fully intercepted browser tests.
        System.getenv("LOYALTY_ARTWORK_EVIDENCE")?.let { directory ->
            for(symbol in listOf(1,5,6)) for(goal in listOf(5,13)) for(fill in listOf(0,goal-1,goal)) for(bg in listOf("204e41","0b1f3a","ffffff")) for(style in listOf("SOLID","GRADIENT")) {
                val art=WalletArtwork(style,symbol,bg,fill,goal)
                for(layout in listOf("apple","google")) { val file=Path.of(directory,art.path().drop(1)+".$layout.png");Files.createDirectories(file.parent);Files.write(file,art.png(if(layout=="apple") 3 else null)) }
            }
        }
    }
    @Test fun `artwork rejects oversized and malformed public rendering requests`() {
        for(art in listOf(WalletArtwork("CSS",1,"0b1f3a",1,5),WalletArtwork("SOLID",33,"0b1f3a",1,5),WalletArtwork("SOLID",1,"red",1,5),WalletArtwork("SOLID",1,"0b1f3a",6,5),WalletArtwork("SOLID",1,"0b1f3a",1,999),WalletArtwork("SOLID",1,"0b1f3a",-1,5))) {
            assertFailsWith<Problem> { art.png() }
        }
    }
    @Test fun `public image routes work without a database and bound both layouts`() = testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"test-admin","https://example.com") }
        val path="/wallet/art/v20/GRADIENT/5/0b1f3a/4/5.png"
        for(suffix in listOf("","?layout=apple")) {
            val response=client.get(path+suffix);assertEquals(HttpStatusCode.OK,response.status)
            assertEquals("image/png",response.headers[HttpHeaders.ContentType]);assertEquals("no-store",response.headers[HttpHeaders.CacheControl])
        }
        assertEquals(HttpStatusCode.BadRequest,client.get(path+"?layout=html").status)
        assertEquals(HttpStatusCode.BadRequest,client.get(path.replace("/4/5","/999/5")).status)
    }
}
