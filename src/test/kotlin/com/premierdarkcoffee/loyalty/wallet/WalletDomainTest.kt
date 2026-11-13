package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.team
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.artwork.artwork
import com.premierdarkcoffee.loyalty.wallet.artwork.precision
import com.premierdarkcoffee.loyalty.wallet.providers.AppleWalletProvider
import com.premierdarkcoffee.loyalty.wallet.providers.CertificateAppleProvider
import com.premierdarkcoffee.loyalty.wallet.providers.ServiceAccountGoogleProvider
import com.premierdarkcoffee.loyalty.wallet.providers.WalletDeliveryFailure
import com.premierdarkcoffee.loyalty.wallet.providers.WalletHttp
import com.premierdarkcoffee.loyalty.wallet.providers.WalletHttpResponse
import com.premierdarkcoffee.loyalty.wallet.providers.applePackage

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

class WalletDomainTest {
    companion object { val rsa = KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair() }
    private val origin = "https://wallet.example.com"
    private val clock = Clock.fixed(Instant.parse("2026-11-03T15:00:00Z"), ZoneOffset.UTC)
    private fun account() = obj("type" to "service_account", "client_email" to "wallet@example.iam.gserviceaccount.com", "private_key_id" to "test-key-123",
        "private_key" to ("-----BEGIN " + "PRIVATE KEY-----\n" + Base64.getMimeEncoder().encodeToString(rsa.private.encoded) + "\n-----END " + "PRIVATE KEY-----\n"))
    private fun pass() = WalletPass("tenant", "member", "11111111-1111-1111-1111-111111111111", "pass-secret-different-from-card-code", obj("businessName" to "Café de prueba", "name" to "Cliente", "slug" to "test", "currency" to "USD", "cardCode" to "public-card-code", "canOperate" to true,
        "balances" to listOf(obj("name" to "Visitas", "kind" to "STAMPS", "available" to 4), obj("name" to "Devolución", "kind" to "CASHBACK", "available" to 125))), 5, clock.instant(), "pass.com.example.loyalty", "12345.loyalty_member", "12345.loyalty_tenant")
    private fun jwtPayload(jwt: String) = json.parseToJsonElement(Base64.getUrlDecoder().decode(jwt.split('.')[1]).toString(Charsets.UTF_8)).jsonObject
    private fun fakeGoogle(responses: MutableList<WalletHttpResponse>, calls: MutableList<Triple<String,String,String?>>): ServiceAccountGoogleProvider = ServiceAccountGoogleProvider("12345", account(), clock, WalletHttp { method,url,_,body -> calls += Triple(method,url,body); responses.removeAt(0) })
    @Test fun `encrypted pass secrets use random nonces and context binding`() {
        val c = WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32) { 1 }))
        val a = c.encrypt("secret", "pass:1"); val b = c.encrypt("secret", "pass:1")
        assertNotEquals(a,b); assertEquals("secret",c.decrypt(a,"pass:1")); assertFails { c.decrypt(a,"pass:2") }
    }
    @Test fun `wrong encryption key and malformed key fail closed`() {
        val a = WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32) { 1 })); val b = WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32) { 2 }))
        assertFails { b.decrypt(a.encrypt("secret","c"),"c") }; assertFails { WalletCipher("short") }
    }
    @Test fun `wallet origin requires HTTPS and excludes credentials and paths`() {
        assertEquals(origin,walletHttps(origin+"/"))
        for (url in listOf("http://wallet.example.com","https://user:secret@example.com","https://example.com/path","https://localhost","https://example.com/?token=private")) assertFails { walletHttps(url) }
    }
    @Test fun `Apple identity is stable and barcode cannot authorize updates`() {
        val p = pass(); val content = p.appleJson(p.appleType!!,"ABCDEFGHIJ",origin)
        assertEquals(p.serial,content.getValue("serialNumber").jsonPrimitive.content)
        assertNotEquals(content.getValue("authenticationToken"),content.getValue("barcodes").jsonArray[0].jsonObject.getValue("message"))
        assertFalse(content.toString().contains("document")); assertEquals("$origin/wallet/apple",content.getValue("webServiceURL").jsonPrimitive.content)
    }
    @Test fun `balances preserve program names and cashback precision`() {
        assertEquals("Visitas: 4 sellos\nDevolución: 1.25 USD",pass().summary())
    }
    @Test fun `pkpass manifest covers exact packaged files`() {
        var signed = byteArrayOf()
        val provider = object : AppleWalletProvider { override val passType="pass.com.example.loyalty";override val team="ABCDEFGHIJ";override fun sign(manifest:ByteArray):ByteArray { signed=manifest;return byteArrayOf(1,2,3) };override fun push(token:String)=true }
        val files=mutableMapOf<String,ByteArray>()
        ZipInputStream(ByteArrayInputStream(applePackage(pass(),provider,origin))).use { zip -> while(true){val e=zip.nextEntry?:break;files[e.name]=zip.readBytes()} }
                assertEquals(setOf("pass.json","icon.png","icon@2x.png","icon@3x.png","logo.png","logo@2x.png","logo@3x.png","strip.png","strip@2x.png","strip@3x.png","artwork.png","artwork@2x.png","artwork@3x.png","manifest.json","signature"),files.keys)
        assertContentEquals(signed,files.getValue("manifest.json"))
        val hashes=json.parseToJsonElement(signed.toString(Charsets.UTF_8)).jsonObject
        for((name,hash)in hashes)assertEquals(hash.jsonPrimitive.content,MessageDigest.getInstance("SHA-1").digest(files.getValue(name)).joinToString(""){"%02x".format(it)})
    }
    @Test fun `Apple CMS signature verifies and certificate identifier mismatch fails`() {
        val dir=Files.createTempDirectory("loyalty-apple-test-")
        fun run(vararg args:String) {val p=ProcessBuilder("openssl",*args).directory(dir.toFile()).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();assertEquals(0,p.waitFor())}
        try {
            run("req","-x509","-newkey","rsa:2048","-nodes","-keyout","ca.key","-out","ca.crt","-days","2","-subj","/CN=Loyalty test CA/O=Test only")
            run("req","-newkey","rsa:2048","-nodes","-keyout","leaf.key","-out","leaf.csr","-subj","/UID=pass.com.example.loyalty/OU=ABCDEFGHIJ/CN=Test only")
            run("x509","-req","-in","leaf.csr","-CA","ca.crt","-CAkey","ca.key","-CAcreateserial","-out","leaf.crt","-days","1")
            run("pkcs12","-export","-inkey","leaf.key","-in","leaf.crt","-out","test.p12","-passout","pass:test-only")
            val provider=CertificateAppleProvider("pass.com.example.loyalty","ABCDEFGHIJ",dir.resolve("test.p12"),"test-only".toCharArray(),dir.resolve("ca.crt"))
            val manifest="{\"file\":\"hash\"}".toByteArray();Files.write(dir.resolve("manifest.json"),manifest);Files.write(dir.resolve("signature"),provider.sign(manifest))
            run("smime","-verify","-binary","-inform","DER","-in","signature","-content","manifest.json","-noverify","-out","verified")
            assertContentEquals(manifest,Files.readAllBytes(dir.resolve("verified")))
            assertFails { CertificateAppleProvider("pass.com.example.other","ABCDEFGHIJ",dir.resolve("test.p12"),"test-only".toCharArray(),dir.resolve("ca.crt")) }
        } finally { Files.list(dir).use { it.forEach(Files::deleteIfExists) };Files.deleteIfExists(dir) }
    }
    @Test fun `Google save JWT is verifiable short lived and contains only object reference`() {
        val provider=ServiceAccountGoogleProvider("12345",account(),clock,WalletHttp { _,_,_,_->error("No network for signing") })
        val jwt=provider.saveLink(pass().googleId!!,origin).substringAfter("/save/");val pieces=jwt.split('.');val payload=jwtPayload(jwt)
        assertTrue(Signature.getInstance("SHA256withRSA").run { initVerify(rsa.public);update((pieces[0]+"."+pieces[1]).toByteArray());verify(Base64.getUrlDecoder().decode(pieces[2])) })
        assertEquals("google",payload.getValue("aud").jsonPrimitive.content);assertEquals(300,payload.getValue("exp").jsonPrimitive.long-payload.getValue("iat").jsonPrimitive.long)
        assertFalse(payload.toString().contains("public-card-code"));assertFalse(payload.toString().contains("Cliente"));assertTrue(jwt.length<1800)
    }
    @Test fun `Google OAuth uses pinned audience scope and cached token`() {
        val calls=mutableListOf<Triple<String,String,String?>>()
        val provider=fakeGoogle(mutableListOf(WalletHttpResponse(200,"{\"access_token\":\"test-only\",\"expires_in\":3600}"),WalletHttpResponse(200,"{}"),WalletHttpResponse(200,"{}")),calls)
        provider.sync(pass(),origin);provider.sync(pass(),origin)
        assertEquals(1,calls.count { it.second=="https://oauth2.googleapis.com/token" })
        val assertion=URLDecoder.decode(calls[0].third!!.substringAfter("&assertion="),Charsets.UTF_8)
        assertEquals("https://www.googleapis.com/auth/wallet_object.issuer",jwtPayload(assertion).getValue("scope").jsonPrimitive.content)
        assertEquals("https://oauth2.googleapis.com/token",jwtPayload(assertion).getValue("aud").jsonPrimitive.content)
    }
    @Test fun `Google missing class and object are created with stable identifiers`() {
        val calls=mutableListOf<Triple<String,String,String?>>()
        val provider=fakeGoogle(mutableListOf(WalletHttpResponse(200,"{\"access_token\":\"test\",\"expires_in\":3600}"),WalletHttpResponse(404,"{}"),WalletHttpResponse(404,"{}"),WalletHttpResponse(200,"{}"),WalletHttpResponse(200,"{}")),calls)
        provider.sync(pass(),origin)
        val clazz=json.parseToJsonElement(calls[3].third!!).jsonObject
        assertEquals(pass().googleClass,clazz.getValue("id").jsonPrimitive.content);assertEquals("UNDER_REVIEW",clazz.getValue("reviewStatus").jsonPrimitive.content)
        assertTrue(clazz.toString().contains("$origin/wallet/logo.png"));assertEquals("POST",calls.last().first)
    }
    @Test fun `Google conflict during creation retries patch without new identifier`() {
        val calls=mutableListOf<Triple<String,String,String?>>()
        val provider=fakeGoogle(mutableListOf(WalletHttpResponse(200,"{\"access_token\":\"test\",\"expires_in\":3600}"),WalletHttpResponse(404,"{}"),WalletHttpResponse(200,"{}"),WalletHttpResponse(409,"{}"),WalletHttpResponse(200,"{}")),calls)
        provider.sync(pass(),origin);assertEquals("PATCH",calls.last().first);assertTrue(calls.last().second.endsWith(pass().googleId!!))
    }
    @Test fun `Google authentication errors do not leak provider body and refresh on retry`() {
        val calls=mutableListOf<Triple<String,String,String?>>()
        val provider=fakeGoogle(mutableListOf(WalletHttpResponse(200,"{\"access_token\":\"test\",\"expires_in\":3600}"),WalletHttpResponse(401,"provider-sensitive-detail"),WalletHttpResponse(200,"{\"access_token\":\"test2\",\"expires_in\":3600}"),WalletHttpResponse(200,"{}")),calls)
        val error=assertFailsWith<WalletDeliveryFailure> { provider.sync(pass(),origin) };assertEquals("GOOGLE_OBJECT_401",error.reason)
        provider.sync(pass(),origin);assertEquals(2,calls.count { it.second.contains("oauth2.googleapis.com") })
    }
    @Test fun `invalid issuer and non service account JSON are rejected`() {
        assertFails { ServiceAccountGoogleProvider("12345/other",account(),clock) }
        assertFails { ServiceAccountGoogleProvider("12345",JsonObject(account()+mapOf("type" to JsonPrimitive("authorized_user"))),clock) }
        assertFails { ServiceAccountGoogleProvider("12345",account(),clock).saveLink("other.tenant",origin) }
    }
    @Test fun `paused business retains card with generic status and migration accepts format`() {
        val paused=pass().copy(snapshot=JsonObject(pass().snapshot+("canOperate" to JsonPrimitive(false))))
        val apple=paused.appleJson(paused.appleType!!,"ABCDEFGHIJ",origin);assertTrue(apple.getValue("voided").jsonPrimitive.boolean);assertTrue(apple.toString().contains("pausadas"))
        assertEquals("INACTIVE",paused.googleJson(paused.googleId!!,paused.googleClass!!,origin).getValue("state").jsonPrimitive.content)
        val sql=requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V003.sql")).readText();assertEquals(SqlFingerprint.checksum(sql),SqlFingerprint.checksum(sql.replace("CREATE TABLE","create   table")))
    }
}
