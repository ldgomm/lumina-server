package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.net.URLDecoder
import java.nio.file.Files
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.Signature
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.Base64
import java.util.zip.ZipInputStream
import kotlin.test.*

class EngagementGoogleTest {
    companion object { val rsa = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair() }
    private val origin = "https://wallet.example.com"
    private val clock = Clock.fixed(Instant.parse("2026-11-03T15:00:00Z"), ZoneOffset.UTC)
    private fun account() = obj("type" to "service_account", "client_email" to "wallet@example.iam.gserviceaccount.com", "private_key_id" to "test-key-123",
        "private_key" to ("-----BEGIN " + "PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(rsa.private.encoded) + "\n-----END " + "PRIVATE KEY-----\n"))
    private fun pass() = WalletPass("tenant", "member", "11111111-1111-1111-1111-111111111111", "pass-secret-different-from-card-code", obj("businessName" to "Café de prueba", "name" to "Cliente", "slug" to "test", "currency" to "USD", "cardCode" to "public-card-code", "canOperate" to true,
        "balances" to listOf(obj("name" to "Visitas", "kind" to "STAMPS", "available" to 4), obj("name" to "Devolución", "kind" to "CASHBACK", "available" to 125))), 5, clock.instant(), "pass.com.example.loyalty", "12345.loyalty_member", "12345.loyalty_tenant")
    private fun jwtPayload(jwt: String) = json.parseToJsonElement(Base64.getUrlDecoder().decode(jwt.split('.')[1]).toString(Charsets.UTF_8)).jsonObject
    private fun fakeGoogle(responses: MutableList<WalletHttpResponse>, calls: MutableList<Triple<String,String,String?>>): ServiceAccountGoogleProvider = ServiceAccountGoogleProvider("12345", account(), clock, WalletHttp { method,url,_,body -> calls += Triple(method,url,body); responses.removeAt(0) })
    @Test fun `Google brand updates class once and ignores an older design`() {
        val calls=mutableListOf<Triple<String,String,String?>>()
        val responses=mutableListOf(WalletHttpResponse(200,"{\"access_token\":\"test\",\"expires_in\":3600}"))
        repeat(4){responses+=WalletHttpResponse(200,"{}")}
        val provider=fakeGoogle(responses,calls)
        fun styled(version:Int,name:String)=pass().copy(snapshot=JsonObject(pass().snapshot+obj("designVersion" to version,"design" to json.parseToJsonElement(json.encodeToString(WalletDesign(displayName=name,logoPng=Base64.getEncoder().encodeToString(walletLogo(36))))))))
        provider.sync(styled(2,"Mi marca"),origin);provider.sync(styled(2,"Mi marca"),origin);provider.sync(styled(1,"Antes"),origin)
        val updates=calls.filter{it.first=="PATCH" && it.second.contains("loyaltyClass/")}
        assertEquals(1,updates.size);assertTrue(updates.single().third!!.contains("Mi marca"));assertTrue(updates.single().third!!.contains("/wallet/brand/test/logo.png?v="))
        assertTrue(responses.isEmpty())
    }

}
