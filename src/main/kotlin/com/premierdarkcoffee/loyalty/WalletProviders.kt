package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.awt.Color
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.net.URI
import java.net.URLEncoder
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermissions
import java.security.*
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import java.security.interfaces.RSAKey
import java.security.spec.PKCS8EncodedKeySpec
import java.time.Clock
import java.time.Duration
import java.util.Base64
import java.util.Date
import java.util.concurrent.TimeUnit
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.imageio.ImageIO
import javax.naming.ldap.LdapName
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext

class WalletDeliveryFailure(val reason: String) : RuntimeException(reason)
data class WalletHttpResponse(val status: Int, val body: String)
fun interface WalletHttp { fun send(method: String, url: String, headers: Map<String, String>, body: String?): WalletHttpResponse }
class JdkWalletHttp(private val client: HttpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).version(HttpClient.Version.HTTP_2).build()) : WalletHttp {
    override fun send(method: String, url: String, headers: Map<String, String>, body: String?): WalletHttpResponse {
        val builder = HttpRequest.newBuilder(URI(url)).timeout(Duration.ofSeconds(10))
        headers.forEach { (k, v) -> builder.header(k, v) }
        val response = client.send(builder.method(method, body?.let(HttpRequest.BodyPublishers::ofString) ?: HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString())
        return WalletHttpResponse(response.statusCode(), response.body())
    }
}

fun walletLogo(size: Int): ByteArray {
    val image = BufferedImage(size, size, BufferedImage.TYPE_INT_ARGB)
    val g = image.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.color = Color(32, 78, 65); g.fillRect(0, 0, size, size)
        g.color = Color(219, 243, 139); g.fillOval(size/5, size/5, size*3/5, size*3/5)
        g.color = Color(32, 78, 65); g.fillOval(size*7/20, size*7/20, size*3/10, size*3/10); g.fillRect(size/2, size*2/5, size/3, size/5)
    } finally { g.dispose() }
    return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
}

interface AppleWalletProvider {
    val passType: String
    val team: String
    fun sign(manifest: ByteArray): ByteArray
    /** false means this exact push token is no longer valid; other errors must retry. */
    fun push(token: String): Boolean
}

fun applePackage(pass: WalletPass, provider: AppleWalletProvider, origin: String): ByteArray {
    val files = linkedMapOf("pass.json" to pass.appleJson(provider.passType, provider.team, origin).toString().toByteArray(),
        "icon.png" to walletLogo(29), "icon@2x.png" to walletLogo(58), "icon@3x.png" to walletLogo(87))
    val manifest = JsonObject(files.mapValues { (_, bytes) -> JsonPrimitive(MessageDigest.getInstance("SHA-1").digest(bytes).joinToString("") { "%02x".format(it) }) }).toString().toByteArray()
    files["manifest.json"] = manifest; files["signature"] = provider.sign(manifest)
    return ByteArrayOutputStream().also { out -> ZipOutputStream(out).use { zip -> files.forEach { (name, bytes) -> zip.putNextEntry(ZipEntry(name)); zip.write(bytes); zip.closeEntry() } } }.toByteArray()
}

class CertificateAppleProvider(
    override val passType: String, override val team: String, keyStorePath: Path, password: CharArray, wwdrPath: Path,
    private val openssl: String = "openssl", private val clock: Clock = Clock.systemUTC()
) : AppleWalletProvider {
    private val privateKey: PrivateKey
    private val certificate: X509Certificate
    private val intermediate: X509Certificate
    private val transport: WalletHttp
    init {
        require(passType.matches(Regex("pass\\.[A-Za-z0-9.-]{3,150}")) && team.matches(Regex("[A-Z0-9]{10}"))) { "Invalid Apple identifiers." }
        val store = KeyStore.getInstance("PKCS12"); Files.newInputStream(keyStorePath).use { store.load(it, password) }
        val aliases = store.aliases().toList().filter { store.isKeyEntry(it) }; require(aliases.size == 1) { "Apple PKCS12 must contain exactly one private key." }
        privateKey = store.getKey(aliases.single(), password) as PrivateKey
        certificate = store.getCertificate(aliases.single()) as X509Certificate
        intermediate = Files.newInputStream(wwdrPath).use { CertificateFactory.getInstance("X.509").generateCertificate(it) as X509Certificate }
        certificate.checkValidity(Date.from(clock.instant())); intermediate.checkValidity(Date.from(clock.instant())); certificate.verify(intermediate.publicKey)
        val subject = LdapName(certificate.subjectX500Principal.name).rdns.associate { it.type.uppercase() to it.value.toString() }
        require(subject["UID"] == passType && subject["OU"] == team) { "Apple certificate does not match Pass Type ID / Team ID." }
        require(privateKey.algorithm == "RSA" && (privateKey as RSAKey).modulus.bitLength() >= 2048) { "Apple pass key must be RSA 2048 or stronger." }
        val probe = "comeback-key-match".toByteArray()
        val signed = Signature.getInstance("SHA256withRSA").run { initSign(privateKey); update(probe); sign() }
        require(Signature.getInstance("SHA256withRSA").run { initVerify(certificate); update(probe); verify(signed) }) { "Apple certificate and key mismatch." }
        val clientStore = KeyStore.getInstance("PKCS12").apply { load(null, password); setKeyEntry("pass", privateKey, password, arrayOf(certificate, intermediate)) }
        val keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm()).apply { init(clientStore, password) }
        val ssl = SSLContext.getInstance("TLS").apply { init(keys.keyManagers, null, null) }
        transport = JdkWalletHttp(HttpClient.newBuilder().sslContext(ssl).version(HttpClient.Version.HTTP_2).connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build())
        password.fill('\u0000')
        // Validate signing availability at configuration time, before presenting an Add button.
        sign("{}".toByteArray())
    }
    private fun pem(type: String, bytes: ByteArray) = "-----BEGIN $type-----\n" + Base64.getMimeEncoder(64, "\n".toByteArray()).encodeToString(bytes) + "\n-----END $type-----\n"
    override fun sign(manifest: ByteArray): ByteArray {
        certificate.checkValidity(Date.from(clock.instant())); intermediate.checkValidity(Date.from(clock.instant()))
        val directory = Files.createTempDirectory("comeback-pass-", PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")))
        try {
            fun write(name: String, bytes: ByteArray) = directory.resolve(name).also { Files.createFile(it, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------"))); Files.write(it, bytes) }
            write("manifest.json", manifest); write("cert.pem", pem("CERTIFICATE", certificate.encoded).toByteArray())
            write("chain.pem", pem("CERTIFICATE", intermediate.encoded).toByteArray()); write("key.pem", pem("PRIVATE KEY", privateKey.encoded).toByteArray())
            val process = ProcessBuilder(openssl, "smime", "-binary", "-sign", "-signer", "cert.pem", "-inkey", "key.pem", "-certfile", "chain.pem", "-in", "manifest.json", "-out", "signature", "-outform", "DER", "-md", "sha256")
                .directory(directory.toFile()).redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start()
            if (!process.waitFor(10, TimeUnit.SECONDS)) { process.destroyForcibly(); process.waitFor(); throw WalletDeliveryFailure("APPLE_SIGN_TIMEOUT") }
            if (process.exitValue() != 0) throw WalletDeliveryFailure("APPLE_SIGN_FAILED")
            return Files.readAllBytes(directory.resolve("signature"))
        } finally { Files.list(directory).use { stream -> stream.forEach { Files.deleteIfExists(it) } }; Files.deleteIfExists(directory) }
    }
    override fun push(token: String): Boolean {
        require(token.matches(Regex("[A-Fa-f0-9]{32,512}")))
        val response = transport.send("POST", "https://api.push.apple.com/3/device/$token", mapOf("apns-topic" to passType, "apns-push-type" to "background", "apns-priority" to "5", "Content-Type" to "application/json"), "{}")
        if (response.status == 200) return true
        val reason = runCatching { json.parseToJsonElement(response.body).jsonObject["reason"]?.jsonPrimitive?.content }.getOrNull()
        if (response.status == 410 || response.status == 400 && reason == "BadDeviceToken") return false
        throw WalletDeliveryFailure("APPLE_HTTP_${response.status}")
    }
}

interface GoogleWalletProvider {
    val issuer: String
    fun sync(pass: WalletPass, origin: String)
    fun saveLink(objectId: String, origin: String): String
}

class ServiceAccountGoogleProvider(
    override val issuer: String, account: JsonObject, private val clock: Clock = Clock.systemUTC(), private val transport: WalletHttp = JdkWalletHttp()
) : GoogleWalletProvider {
    private val email = account.getValue("client_email").jsonPrimitive.content
    private val keyId = account.getValue("private_key_id").jsonPrimitive.content
    private val key: PrivateKey
    private var accessToken: String? = null
    private var accessExpires = 0L
    init {
        require(issuer.matches(Regex("[0-9]{3,30}"))) { "Invalid Google Issuer ID." }
        require(account.getValue("type").jsonPrimitive.content == "service_account" && email.matches(Regex("[A-Za-z0-9._-]+@[A-Za-z0-9.-]+\\.iam\\.gserviceaccount\\.com"))) { "Use a Google service account JSON." }
        require(keyId.matches(Regex("[A-Za-z0-9_-]{1,100}"))) { "Invalid service account key identifier." }
        val pem = account.getValue("private_key").jsonPrimitive.content
        require(pem.startsWith(("-----BEGIN " + "PRIVATE KEY-----"))) { "Expected a PKCS8 service account private key." }
        key = KeyFactory.getInstance("RSA").generatePrivate(PKCS8EncodedKeySpec(Base64.getMimeDecoder().decode(pem.removePrefix(("-----BEGIN " + "PRIVATE KEY-----")).substringBefore(("-----END " + "PRIVATE KEY-----")))))
        require((key as RSAKey).modulus.bitLength() >= 2048) { "Use an RSA key of at least 2048 bits." }
    }
    internal fun jwt(payload: JsonObject): String {
        fun encode(bytes: ByteArray) = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        val unsigned = encode(obj("alg" to "RS256", "typ" to "JWT", "kid" to keyId).toString().toByteArray()) + "." + encode(payload.toString().toByteArray())
        val signature = Signature.getInstance("SHA256withRSA").run { initSign(key); update(unsigned.toByteArray()); sign() }
        return unsigned + "." + encode(signature)
    }
    @Synchronized private fun token(): String {
        val now = clock.instant().epochSecond
        if (accessToken != null && accessExpires > now + 60) return accessToken!!
        val assertion = jwt(obj("iss" to email, "scope" to "https://www.googleapis.com/auth/wallet_object.issuer", "aud" to "https://oauth2.googleapis.com/token", "iat" to now, "exp" to now + 3600))
        val response = transport.send("POST", "https://oauth2.googleapis.com/token", mapOf("Content-Type" to "application/x-www-form-urlencoded"), "grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=" + URLEncoder.encode(assertion, Charsets.UTF_8))
        if (response.status != 200) throw WalletDeliveryFailure("GOOGLE_AUTH_${response.status}")
        val result = json.parseToJsonElement(response.body).jsonObject
        accessToken = result.getValue("access_token").jsonPrimitive.content
        accessExpires = now + result.getValue("expires_in").jsonPrimitive.long.coerceIn(1, 3600)
        return accessToken!!
    }
    private fun call(method: String, path: String, body: JsonObject? = null): WalletHttpResponse {
        val response = transport.send(method, "https://walletobjects.googleapis.com/walletobjects/v1/$path", mapOf("Authorization" to "Bearer ${token()}", "Content-Type" to "application/json"), body?.toString())
        if (response.status == 401) synchronized(this) { accessToken = null; accessExpires = 0 }
        return response
    }
    override fun sync(pass: WalletPass, origin: String) {
        val objectId = requireNotNull(pass.googleId); val classId = requireNotNull(pass.googleClass)
        require(objectId.startsWith("$issuer.") && classId.startsWith("$issuer."))
        var response = call("PATCH", "loyaltyObject/$objectId", pass.googleJson(objectId, classId, origin))
        if (response.status == 404) {
            val existing = call("GET", "loyaltyClass/$classId")
            if (existing.status == 404) {
                val created = call("POST", "loyaltyClass", obj("id" to classId, "issuerName" to pass.snapshot.getValue("businessName"), "programName" to pass.snapshot.getValue("businessName"), "reviewStatus" to "UNDER_REVIEW", "hexBackgroundColor" to "#204e41",
                    "programLogo" to obj("sourceUri" to obj("uri" to "$origin/wallet/logo.png"), "contentDescription" to obj("defaultValue" to obj("language" to "es", "value" to "Loyalty")))))
                if (created.status !in setOf(200, 201, 409)) throw WalletDeliveryFailure("GOOGLE_CLASS_${created.status}")
            } else if (existing.status != 200) throw WalletDeliveryFailure("GOOGLE_CLASS_${existing.status}")
            response = call("POST", "loyaltyObject", pass.googleJson(objectId, classId, origin))
            if (response.status == 409) response = call("PATCH", "loyaltyObject/$objectId", pass.googleJson(objectId, classId, origin))
        }
        if (response.status !in setOf(200, 201)) throw WalletDeliveryFailure("GOOGLE_OBJECT_${response.status}")
    }
    override fun saveLink(objectId: String, origin: String): String {
        require(objectId.matches(Regex("${Regex.escape(issuer)}\\.[A-Za-z0-9._-]+")))
        val now = clock.instant().epochSecond
        val signed = jwt(obj("iss" to email, "aud" to "google", "typ" to "savetowallet", "iat" to now, "exp" to now + 300,
            "origins" to listOf(URI(origin).host), "payload" to obj("loyaltyObjects" to listOf(obj("id" to objectId)))))
        return "https://pay.google.com/gp/v/save/$signed"
    }
}
