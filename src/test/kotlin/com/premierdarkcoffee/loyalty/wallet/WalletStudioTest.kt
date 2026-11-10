package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.artwork.WalletArtwork
import com.premierdarkcoffee.loyalty.wallet.artwork.walletCompositionsV29

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import org.junit.jupiter.api.Test
import org.postgresql.ds.PGSimpleDataSource
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.test.*

class WalletStudioTest {
    @Test fun `studio assets preserve v29 drawing and do not extend its public contract`() = testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"admin","https://example.com") }
        for (c in walletCompositionsV29) {
            val art=WalletArtwork("GRADIENT",5,"0b1f3a",4,5,c)
            assertContentEquals(art.png(version=29),art.png(version=30))
            assertContentEquals(art.posterPng(1,29),art.posterPng(1,30))
            assertEquals(HttpStatusCode.OK,client.get("/wallet/art/v29/$c/GRADIENT/5/0b1f3a/4/5.png").status)
        }
        for (c in listOf("PANORAMA","PRECISION","ATELIER")) {
            val art=WalletArtwork("GRADIENT",5,"0b1f3a",4,5,c)
            assertFailsWith<IllegalArgumentException>{art.png(version=29)}
            assertFailsWith<IllegalArgumentException>{art.posterPng(1,29)}
            assertEquals(HttpStatusCode.NotFound,client.get("/wallet/art/v29/$c/GRADIENT/5/0b1f3a/4/5.png").status)
            for (suffix in listOf("","?layout=apple","?layout=poster")) assertEquals(HttpStatusCode.OK,client.get(art.path()+suffix).status)
        }
    }

    @Test fun `studio styles retain clean native text zones and visually distinct progress at both extremes`() {
        for (c in listOf("PANORAMA","PRECISION","ATELIER")) for (bg in listOf("000000","ffffff")) for (style in listOf("SOLID","GRADIENT","AURORA")) {
            val blank=WalletArtwork(style,32,bg,0,0,c)
            val empty=blank.copy(total=100);val ready=empty.copy(filled=100)
            assertFalse(empty.png().contentEquals(ready.png()))
            assertFalse(blank.png().contentEquals(empty.png()))
            val poster=ImageIO.read(ByteArrayInputStream(ready.posterPng(1)))
            for (y in listOf(0,20,60,300,390,447)) for (x in listOf(0,18,179,357)) {
                assertEquals(java.awt.Color.decode("#$bg").rgb,poster.getRGB(x,y),"$c $bg $style at $x,$y")
            }
            assertTrue(ready.posterPng(3).size<600000)
        }
    }
}
