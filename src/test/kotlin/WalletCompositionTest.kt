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

class WalletCompositionTest {
    private fun pass(composition:String, kind:String="POINTS", amount:Long=41, goal:Long=100, active:Boolean=true)=WalletPass(
        "tenant","member","same-serial","same-token",obj("businessName" to "Marca de ejemplo","slug" to "demo","name" to "Cliente ficticio","currency" to "USD","canOperate" to active,"cardCode" to "same-qr",
            "design" to json.parseToJsonElement(json.encodeToString(WalletDesign(background="#0b1f3a",stampSymbol="☕",composition=composition))),
            "balances" to listOf(obj("programId" to "p","name" to "Mi promoción","kind" to kind,"available" to amount)),
            "rewardProgress" to listOf(obj("id" to "r","name" to "Premio de ejemplo","programId" to "p","kind" to kind,"goal" to goal))),
        42,Instant.EPOCH,"pass.example","123.member","123.business")
    private fun image(bytes:ByteArray)=ImageIO.read(ByteArrayInputStream(bytes))
    @Test fun `old JSON preserves signature and compositions are explicit validated independent choices`() {
        assertEquals("SIGNATURE",json.decodeFromString<WalletDesign>("{}").composition)
        for(c in walletCompositions) { val d=WalletDesign(composition=c);d.validate();assertEquals(d,json.decodeFromString<WalletDesign>(json.encodeToString(d)));assertEquals("GRADIENT",d.artworkStyle) }
        assertFailsWith<Problem>{WalletDesign(composition="CUSTOM").validate()}
        assertFailsWith<Problem>{WalletArtwork("GRADIENT",5,"0b1f3a",41,100,"../").validate()}
    }
    @Test fun `same palette icon and amount produce structurally distinct images in every native layout`() {
        for(layout in listOf("google","apple","poster")) {
            val images=walletCompositions.map { c->val a=WalletArtwork("GRADIENT",5,"0b1f3a",41,100,c);image(if(layout=="poster")a.posterPng(1) else a.png(if(layout=="apple")1 else null)) }
            for(a in images.indices)for(b in a+1 until images.size) {
                val x=images[a];val y=images[b];var differing=0;var count=0
                val top=if(layout=="poster")66 else 0;val bottom=if(layout=="poster")248 else x.height
                for(py in top until bottom step 3)for(px in 0 until x.width step 3) {
                    val one=java.awt.Color(x.getRGB(px,py));val two=java.awt.Color(y.getRGB(px,py));count++
                    if(kotlin.math.abs(one.red-two.red)+kotlin.math.abs(one.green-two.green)+kotlin.math.abs(one.blue-two.blue)>24)differing++
                }
                assertTrue(differing.toDouble()/count>.075,"$layout ${walletCompositions.elementAt(a)} / ${walletCompositions.elementAt(b)} differ only ${differing.toDouble()/count}")
            }
        }
    }
    @Test fun `native artwork sizes and text safe areas stay correct with dark and light palettes`() {
        for(c in walletCompositions)for(bg in listOf("0b1f3a","ffffff")) {
            val a=WalletArtwork("GRADIENT",5,bg,4,5,c)
            for(scale in 1..3) {val bytes=a.posterPng(scale);val i=image(bytes);assertEquals(358*scale,i.width);assertEquals(448*scale,i.height);assertEquals(java.awt.Color.decode("#$bg").rgb,i.getRGB(18*scale,20*scale));assertEquals(java.awt.Color.decode("#$bg").rgb,i.getRGB(179*scale,390*scale));assertTrue(bytes.size<600000)}
            assertEquals(375,image(a.png(1)).width);assertEquals(144,image(a.png(1)).height)
            assertEquals(1032,image(a.png()).width);assertEquals(812,image(a.png()).height)
        }
    }
    @Test fun `progress changes each composition without inventing units or exposing identities in urls`() {
        for(c in walletCompositions) {
            for(total in listOf(5,20,100)) {val images=listOf(0,total/2,total).map { WalletArtwork("GRADIENT",5,"0b1f3a",it,total,c).png().contentHashCode() };assertEquals(3,images.distinct().size,c)}
            val p=pass(c,"CASHBACK",499,500);assertEquals(99,p.artwork().filled);assertEquals(100,p.artwork().total)
            assertContains(p.artwork().path(),"/v32/$c/");assertFalse(p.artwork().path().contains("same-"))
            assertContains(p.applePosterFields().toString(),"4.99 de 5.00 USD");assertContains(p.googleExperienceFields().toString(),"0.01 USD")
        }
    }
    @Test fun `all compositions remove progress on pause and removal and preserve wallet identity`() {
        for(c in walletCompositions) {
            val p=pass(c);val paused=pass(c,active=false);assertEquals(0,paused.artwork().total)
            assertContains(paused.googleArtwork("https://example.com").toString(),"/0/0.png")
            val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("balances" to emptyList<JsonObject>(),"rewardProgress" to emptyList<JsonObject>())))
            assertEquals(0,removed.artwork().total);assertFalse(removed.applePosterFields().toString().contains("Premio de ejemplo"));assertFalse(removed.googleExperienceFields().toString().contains("Premio de ejemplo"))
            assertEquals(p.serial,removed.serial);assertEquals(p.googleId,removed.googleId);assertEquals(p.token,removed.token)
        }
    }
    @Test fun `Google native hierarchy changes with composition but class never includes personal data`() {
        val layouts=mutableSetOf<String>()
        for(c in walletCompositions) {
            val p=pass(c);val brand=p.googleBrand("https://example.com");val t=brand.getValue("classTemplateInfo").jsonObject;layouts+=t.toString()
            assertEquals(googleWalletTemplate(c),t);assertEquals(JsonPrimitive("UNDER_REVIEW"),brand["reviewStatus"])
            val rows=t.getValue("cardTemplateOverride").jsonObject.getValue("cardRowTemplateInfos").jsonArray
            assertTrue(rows.size in 1..if(c=="SIGNATURE")3 else 2)
            for(secret in listOf("Cliente ficticio","same-qr","same-token","41 de 100"))assertFalse(t.toString().contains(secret))
            val data=p.googleExperienceFields();assertTrue(data.containsKey("loyaltyPoints"));assertTrue(data.containsKey("secondaryLoyaltyPoints"))
            data.getValue("textModulesData").jsonArray.forEach {assertContains(t.toString(),"object.textModulesData['${it.jsonObject.getValue("id").jsonPrimitive.content}']")}
            assertTrue(data.getValue("textModulesData").jsonArray.size<=10)
        }
        assertTrue(layouts.size>=4)
    }
    @Test fun `Apple hierarchy changes without losing native accessibility detail alerts or QR`() {
        for(c in walletCompositions) {
            val p=pass(c);val native=p.appleJson("pass.example","TEAM","https://example.com");val fields=native.getValue("posterGeneric").jsonObject
            val keys=fields.values.flatMap { it.jsonArray }.map{it.jsonObject.getValue("key").jsonPrimitive.content}
            assertEquals(keys.size,keys.distinct().size)
            val first=fields.getValue("primaryFields").jsonArray.first().jsonObject.getValue("key").jsonPrimitive.content
            if(c in setOf("EDITORIAL","TICKET","RIBBON","PANORAMA","ATELIER"))assertEquals("featured_reward",first) else assertEquals("journey",first)
            assertContains(fields.toString(),"41 de 100 puntos");assertContains(fields.toString(),"Faltan 59 puntos")
            assertEquals(native.getValue("storeCard").jsonObject["backFields"],fields["backFields"])
            assertEquals("same-qr",native.getValue("barcodes").jsonArray.single().jsonObject.getValue("message").jsonPrimitive.content)
            assertEquals(1,fields.values.flatMap{it.jsonArray}.count{it.jsonObject.containsKey("changeMessage")})
        }
    }
    @Test fun `v27 endpoints retain old bytes and reject new composition semantics`() {
        val a=WalletArtwork("GRADIENT",5,"0b1f3a",41,100)
        assertContentEquals(a.png(version=27),a.png(version=29));assertContentEquals(a.posterPng(1,27),a.posterPng(1,29))
        for(c in walletCompositions-"SIGNATURE") {val b=a.copy(composition=c);assertFailsWith<IllegalArgumentException>{b.png(version=27)};assertFailsWith<IllegalArgumentException>{b.posterPng(1,27)}}
    }
    @Test fun `new public routes are bounded and independent of private database`()=testApplication {
        environment {config=MapApplicationConfig()}
        application {loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"admin","https://example.com")}
        for(c in walletCompositions)for(suffix in listOf("","?layout=apple","?layout=poster"))assertEquals(HttpStatusCode.OK,client.get("/wallet/art/v30/$c/GRADIENT/5/0b1f3a/4/5.png$suffix").status)
        val path="/wallet/art/v30/TICKET/GRADIENT/5/0b1f3a/4/5.png"
        for(bad in listOf(path.replace("TICKET","CUSTOM"),path.replace("/4/5","/6/5"),path+"?layout=html",path.replace("/5/0b","/33/0b")))assertEquals(HttpStatusCode.BadRequest,client.get(bad).status)
        assertEquals(HttpStatusCode.NotFound,client.post(path).status)
    }
    @Test fun `fictitious visual evidence covers every composition provider and state`() {
        val directory=System.getenv("LOYALTY_COMPOSITION_EVIDENCE")
        for(c in walletCompositions)for((filled,total) in listOf(0 to 0,0 to 5,2 to 5,4 to 5,5 to 5,19 to 20,50 to 100,99 to 100))for(layout in listOf("apple","google","poster")) {
            val a=WalletArtwork("GRADIENT",5,"0b1f3a",filled,total,c)
            val bytes=if(layout=="poster")a.posterPng(1) else a.png(if(layout=="apple")1 else null)
            assertTrue(bytes.isNotEmpty())
            if(directory!=null) {val file=Path.of(directory,"$c-$filled-$total-$layout.png");Files.createDirectories(file.parent);Files.write(file,bytes)}
        }
    }
}
