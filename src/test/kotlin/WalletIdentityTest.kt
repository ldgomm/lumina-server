package com.premierdarkcoffee.loyalty

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.postgresql.ds.PGSimpleDataSource
import java.awt.Color
import java.io.ByteArrayInputStream
import java.time.Instant
import javax.imageio.ImageIO
import kotlin.test.*

class WalletIdentityTest {
    private fun image(bytes:ByteArray)=ImageIO.read(ByteArrayInputStream(bytes))
    private fun pass(accent:String?=null,kind:String="POINTS",active:Boolean=true)=WalletPass("tenant","member","fixed-serial","fixed-token",obj(
        "businessName" to "Marca ficticia", "slug" to "demo", "name" to "Cliente ficticio", "currency" to "USD", "canOperate" to active, "cardCode" to "fixed-qr",
        "design" to json.encodeToJsonElement(WalletDesign(background="#0b1f3a",composition="ATELIER",artworkAccent=accent)),
        "balances" to listOf(obj("programId" to "p","name" to "Promoción","kind" to kind,"available" to 4)),
        "rewardProgress" to listOf(obj("id" to "r","name" to "Premio","programId" to "p","kind" to kind,"goal" to 5))),42,Instant.EPOCH,"pass.example","123.member","123.business")

    @Test fun `old designs remain automatic and invalid custom colors fail validation`() {
        assertNull(json.decodeFromString<WalletDesign>("{}").artworkAccent)
        val d=WalletDesign(artworkAccent="#12ABef");d.validate();assertEquals(d,json.decodeFromString<WalletDesign>(json.encodeToString(d)))
        for(bad in listOf("","red","#fff","123456","#12345678","#zzzzzz","url(secret)")) assertFailsWith<Problem>{d.copy(artworkAccent=bad).validate()}
        assertFailsWith<Problem>{WalletArtwork("SOLID",0,"ffffff",0,5,accent="auto").validate()}
    }
    @Test fun `readable colors and legacy fallback are unchanged`() {
        val base=Color.decode("#0b1f3a");val chosen=Color.decode("#ffbb55")
        assertEquals(chosen,walletArtworkAccent("ffbb55",base,Color.WHITE))
        assertEquals(Color(11,22,33),walletArtworkAccent(null,base,Color(11,22,33)))
    }
    @Test fun `custom accents meet minimum contrast against any base even when initially identical`() {
        for(bg in listOf("000000","ffffff","808080","0b1f3a","34241f","eecc66","204e41","faafff")) for(chosen in listOf(bg,"000000","ffffff","ff0000","00ff00","0000ff","edb774")) {
            val base=Color.decode("#$bg");val result=walletArtworkAccent(chosen,base,Color.MAGENTA)
            assertTrue(walletArtworkContrast(base,result)>=3.0,"$bg / $chosen")
            assertEquals(result,walletArtworkAccent(chosen,base,Color.MAGENTA))
        }
    }
    @Test fun `new automatic urls preserve v30 image bytes in every native format`() {
        for(c in walletCompositions) {
            val art=WalletArtwork("GRADIENT",5,"0b1f3a",41,100,c)
            assertContentEquals(art.png(version=30),art.png(version=32))
            assertContentEquals(art.png(1,30),art.png(1,32))
            assertContentEquals(art.posterPng(1,30),art.posterPng(1,32))
        }
    }
    @Test fun `custom colors do not alter older rendering versions`() {
        val art=WalletArtwork("GRADIENT",5,"0b1f3a",4,5,accent="ffbb55")
        for(v in listOf(20,22,24,27,29,30)) assertFailsWith<IllegalArgumentException>{art.png(version=v)}
        for(v in listOf(27,29,30)) assertFailsWith<IllegalArgumentException>{art.posterPng(version=v)}
    }
    @Test fun `accent changes illustration pixels for every composition and layout`() {
        for(c in walletCompositions) {
            val a=WalletArtwork("SOLID",5,"0b1f3a",41,100,c,"ffbb55");val b=a.copy(accent="77dddd")
            assertFalse(a.png().contentEquals(b.png()),c)
            assertFalse(a.png(1).contentEquals(b.png(1)),c)
            assertFalse(a.posterPng(1).contentEquals(b.posterPng(1)),c)
        }
    }
    @Test fun `both providers share artwork color while identity qr text and balances remain unchanged`() {
        val old=pass();val new=pass("#D45CaA")
        assertEquals(old.serial,new.serial);assertEquals(old.token,new.token);assertEquals(old.googleId,new.googleId)
        assertEquals(old.snapshot["balances"],new.snapshot["balances"])
        assertEquals(old.applePosterFields(),new.applePosterFields());assertEquals(old.appleStoreFields(),new.appleStoreFields())
        val g=new.googleJson(new.googleId!!,new.googleClass!!,"https://example.com")
        assertEquals("fixed-qr",g["barcode"]!!.jsonObject["value"]!!.jsonPrimitive.content)
        assertEquals("D45CaA",new.artwork().accent)
        assertContains(g["heroImage"].toString(),"/v32/ATELIER/GRADIENT/0/0b1f3a/d45caa/")
        assertFalse(new.artwork().path().contains("fixed"));assertNotEquals(old.artwork().path(),new.artwork().path())
    }
    @Test fun `public custom artwork route bounds all parameters without database access`()=testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"admin","https://example.com") }
        val path="/wallet/art/v32/PANORAMA/AURORA/32/0b1f3a/ffbb55/4/5.png"
        for(suffix in listOf("","?layout=apple","?layout=poster")) assertEquals(HttpStatusCode.OK,client.get(path+suffix).status)
        assertEquals(HttpStatusCode.OK,client.get(path.replace("ffbb55","auto")).status)
        for(bad in listOf(path.replace("ffbb55","ffffff00"),path.replace("ffbb55","red"),path.replace("/4/5","/6/5"),path.replace("/32/","/33/"),path+"?layout=html")) assertEquals(HttpStatusCode.BadRequest,client.get(bad).status)
        assertEquals(HttpStatusCode.NotFound,client.post(path).status)
        assertEquals(HttpStatusCode.NotFound,client.get(path.replace("v32","v30")).status)
    }
    @Test fun `custom artwork keeps native dimensions and poster text zones clear`() {
        for(c in walletCompositions) {
            val art=WalletArtwork("AURORA",5,"0b1f3a",41,100,c,"77dddd")
            val poster=image(art.posterPng(1));assertEquals(358,poster.width);assertEquals(448,poster.height)
            for(y in listOf(0,20,390,447)) assertEquals(Color.decode("#0b1f3a").rgb,poster.getRGB(18,y),c)
            val classic=image(art.png(1));assertEquals(375,classic.width);assertEquals(144,classic.height)
            val google=image(art.png());assertEquals(1032,google.width);assertEquals(812,google.height)
        }
    }
    @Test fun `custom accent never invents progress and disappears from stale targets`() {
        for(kind in listOf("STAMPS","POINTS","CASHBACK")) {
            val p=pass("#77dddd",kind);val old=pass(null,kind)
            assertEquals(old.artwork().filled,p.artwork().filled);assertEquals(old.artwork().total,p.artwork().total)
            assertEquals(old.journey(),p.journey())
            assertEquals(0,pass("#77dddd",kind,false).artwork().total)
            val removed=p.copy(snapshot=JsonObject(p.snapshot+obj("rewardProgress" to emptyList<JsonObject>())))
            assertEquals(0,removed.artwork().filled);assertEquals(0,removed.artwork().total)
        }
    }
}
