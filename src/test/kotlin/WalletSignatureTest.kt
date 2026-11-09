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

class WalletSignatureTest {
    private fun pass(kind:String="POINTS",amount:Long=41,goal:Long=100,active:Boolean=true,style:String="GRADIENT")=WalletPass(
        "tenant","member","same-serial","same-token",obj("businessName" to "Negocio", "slug" to "demo", "name" to "Cliente de ejemplo", "currency" to "USD",
            "canOperate" to active,"cardCode" to "same-qr","design" to json.parseToJsonElement(json.encodeToString(WalletDesign(background="#0b1f3a",stampSymbol="☕",artworkStyle=style))),
            "balances" to listOf(obj("programId" to "p","name" to "Mi promoción","kind" to kind,"available" to amount)),
            "rewardProgress" to listOf(obj("id" to "r","name" to "Café de cortesía","programId" to "p","kind" to kind,"goal" to goal)),
            "announcements" to listOf(obj("id" to "event","title" to "Tu evento","body" to "Una novedad"))),42,Instant.EPOCH,"pass.example","123.member","123.business")
    private fun JsonObject.fields(key:String)=getValue(key).jsonArray.map { it.jsonObject }

    @Test fun `classic front has one header and two fields with exact remaining and goal`() {
        val f=pass().appleExperienceFields()
        assertEquals(1,f.fields("headerFields").size)
        assertEquals("41 puntos",f.fields("headerFields").single().getValue("value").jsonPrimitive.content)
        assertEquals(2,f.fields("secondaryFields").size+f.fields("auxiliaryFields").size)
        assertEquals("Faltan 59 puntos",f.fields("secondaryFields").single().getValue("label").jsonPrimitive.content)
        assertEquals("41 de 100 puntos",f.fields("secondaryFields").single().getValue("value").jsonPrimitive.content)
        assertEquals("Café de cortesía",f.fields("auxiliaryFields").single().getValue("value").jsonPrimitive.content)
    }
    @Test fun `poster and classic coexist in the same pass with identical QR identity and details`() {
        val p=pass();val before=p.snapshot.toString();val doc=p.appleJson("pass.example","TEAM","https://example.com")
        assertEquals(p.serial,doc.getValue("serialNumber").jsonPrimitive.content)
        assertEquals(p.token,doc.getValue("authenticationToken").jsonPrimitive.content)
        assertEquals("same-qr",doc.getValue("barcodes").jsonArray.single().jsonObject.getValue("message").jsonPrimitive.content)
        val classic=doc.getValue("storeCard").jsonObject;val poster=doc.getValue("posterGeneric").jsonObject
        assertEquals(classic["headerFields"],poster["headerFields"])
        assertEquals(classic["backFields"],poster["backFields"])
        assertEquals(2,poster.fields("primaryFields").size);assertEquals(1,poster.fields("footerFields").size)
        assertEquals(before,p.snapshot.toString());assertEquals(42L,p.tag)
    }
    @Test fun `both native layouts preserve exact money and no fabricated visits`() {
        val p=pass("CASHBACK",499,500)
        assertContains(p.applePosterFields().toString(),"4.99 de 5.00 USD")
        assertContains(p.googleExperienceFields().toString(),"4.99 de 5.00 USD")
        assertContains(p.applePosterFields().toString(),"0.01 USD")
        assertEquals(99,p.artwork().filled)
    }
    @Test fun `suspension and removed promotions clear visual progress for both providers`() {
        val p=pass(active=false);assertEquals(0,p.artwork().total)
        assertFalse(p.applePosterFields().toString().contains("Faltan"))
        assertFalse(p.googleExperienceFields().toString().contains("Faltan"))
        val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("balances" to emptyList<JsonObject>())))
        assertFalse(removed.applePosterFields().toString().contains("Café de cortesía"))
        assertFalse(removed.googleExperienceFields().toString().contains("Café de cortesía"))
        assertContains(removed.googleArtwork("https://example.com").toString(),"/0/0.png")
    }
    @Test fun `poster dimensions and native text zones remain safe for dark and light palettes`() {
        for(background in listOf("0b1f3a","ffffff","3f3334"))for(style in listOf("SOLID","GRADIENT","AURORA"))for(scale in 1..3) {
            val art=WalletArtwork(style,5,background,41,100)
            val bytes=art.posterPng(scale);assertTrue(bytes.size<600000)
            val image=ImageIO.read(ByteArrayInputStream(bytes))
            assertEquals(358*scale,image.width);assertEquals(448*scale,image.height)
            val rgb=java.awt.Color.decode("#$background").rgb
            // The logo/header and native text below the QR retain the validated brand contrast.
            assertEquals(rgb,image.getRGB(18*scale,20*scale))
            assertEquals(rgb,image.getRGB(179*scale,390*scale))
        }
    }
    @Test fun `all three finishes differ and legacy endpoints reject new finish`() {
        val hashes=listOf("SOLID","GRADIENT","AURORA").map { style->
            WalletDesign(artworkStyle=style).validate()
            WalletArtwork(style,5,"0b1f3a",41,100).png().contentHashCode()
        }
        assertEquals(3,hashes.distinct().size)
        for(version in listOf(20,22,24))assertFailsWith<IllegalArgumentException> { WalletArtwork("AURORA",5,"0b1f3a",41,100).png(version=version) }
        val art=WalletArtwork("GRADIENT",5,"0b1f3a",41,100)
        assertEquals(123,ImageIO.read(ByteArrayInputStream(art.png(1,24))).height)
        assertEquals(144,ImageIO.read(ByteArrayInputStream(art.png(1,27))).height)
    }
    @Test fun `native alerts stay transactional and poster field keys remain unique`() {
        val fields=pass().applePosterFields()
        val flattened=fields.values.flatMap { it.jsonArray }.map { it.jsonObject }
        val keys=flattened.map { it.getValue("key").jsonPrimitive.content }
        assertEquals(keys.size,keys.distinct().size)
        assertEquals(listOf("balance"),flattened.filter { it.containsKey("changeMessage") }.map { it.getValue("key").jsonPrimitive.content })
        assertTrue(fields.fields("backFields").any { it["key"]==JsonPrimitive("member_detail") })
    }
    @Test fun `google rows keep reward and journey reachable without private class content`() {
        val p=pass();val template=googleWalletTemplate().toString()
        assertTrue(template.indexOf("['headline']")<template.indexOf("['journey']"))
        assertFalse(template.contains("Café de cortesía"));assertFalse(template.contains("same-qr"))
        val data=p.googleJson(p.googleId!!,p.googleClass!!,"https://example.com")
        assertTrue(data.containsKey("loyaltyPoints") && data.containsKey("secondaryLoyaltyPoints"))
        assertTrue(data.getValue("textModulesData").jsonArray.size<=10)
        assertContains(data.getValue("heroImage").toString(),"/wallet/art/v29/SIGNATURE/")
    }
    @Test fun `public poster rendering is bounded and still needs no database`()=testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"admin","https://example.com") }
        val path="/wallet/art/v27/AURORA/32/0b1f3a/4/5.png"
        for(suffix in listOf("","?layout=apple","?layout=poster"))assertEquals(HttpStatusCode.OK,client.get(path+suffix).status)
        assertEquals(HttpStatusCode.BadRequest,client.get(path+"?layout=custom").status)
        assertEquals(HttpStatusCode.BadRequest,client.get(path.replace("/4/5","/6/5")).status)
        assertEquals(HttpStatusCode.BadRequest,client.get(path.replace("/v27/","/v24/")+"?layout=poster").status)
        assertEquals(HttpStatusCode.NotFound,client.post(path).status)
    }
    @Test fun `visual evidence uses genuine renderers and fictitious progress only`() {
        val directory=System.getenv("LOYALTY_ARTWORK_EVIDENCE") ?: return
        val palettes=listOf(5 to "34241f",5 to "0b1f3a",6 to "702c28",8 to "3f3334",7 to "f2e9da",15 to "23566a",1 to "0b1f3a")
        for((symbol,bg) in palettes)for(style in listOf("GRADIENT","AURORA","SOLID"))for((fill,total) in listOf(0 to 0,0 to 5,2 to 5,4 to 5,5 to 5,0 to 6,3 to 6,5 to 6,6 to 6,12 to 13,13 to 13,0 to 13,41 to 100,50 to 100,99 to 100,100 to 100))for(layout in listOf("apple","google","poster")) {
            val art=WalletArtwork(style,symbol,bg,fill,total)
            val bytes=if(layout=="poster")art.posterPng() else art.png(if(layout=="apple")3 else null)
            val file=Path.of(directory,art.path().drop(1)+".$layout.png")
            Files.createDirectories(file.parent);Files.write(file,bytes)
        }
    }
}
