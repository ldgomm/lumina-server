package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.team
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.fidelity.description
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.marketing.walletRgb
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.artwork.googleArtwork
import com.premierdarkcoffee.loyalty.wallet.presentation.appleStoreFields
import com.premierdarkcoffee.loyalty.wallet.presentation.presentationBalances
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.net.URI
import java.security.MessageDigest
import java.security.SecureRandom
import java.time.Instant
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

@Serializable data class AppleRegistration(val pushToken: String)
@Serializable data class AppleLog(val logs: List<String>)
data class WalletPass(val tenant: String, val member: String, val serial: String, val token: String, val snapshot: JsonObject, val tag: Long, val updatedAt: Instant, val appleType: String?, val googleId: String?, val googleClass: String?)

class WalletCipher(encodedKey: String) {
    private val key = Base64.getDecoder().decode(encodedKey).also { require(it.size == 32) { "WALLET_DATA_KEY must be base64 of 32 random bytes." } }
    val fingerprint = MessageDigest.getInstance("SHA-256").digest(key).joinToString("") { "%02x".format(it) }
    fun encrypt(value: String, context: String): String {
        val iv = ByteArray(12).also(SecureRandom()::nextBytes)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, iv)); cipher.updateAAD(context.toByteArray())
        return Base64.getEncoder().encodeToString(iv + cipher.doFinal(value.toByteArray()))
    }
    fun decrypt(value: String, context: String): String {
        val bytes = Base64.getDecoder().decode(value); require(bytes.size >= 28)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES"), GCMParameterSpec(128, bytes.copyOfRange(0, 12))); cipher.updateAAD(context.toByteArray())
        return cipher.doFinal(bytes.copyOfRange(12, bytes.size)).toString(Charsets.UTF_8)
    }
}

fun walletHttps(value: String): String {
    val uri = URI(value)
    require(uri.scheme == "https" && !uri.host.isNullOrBlank() && uri.userInfo == null && uri.query == null && uri.fragment == null && (uri.path.isNullOrEmpty() || uri.path == "/")) { "Wallet requires a public HTTPS origin without a path." }
    require(uri.host != "localhost" && uri.host != "127.0.0.1" && uri.host != "[::1]") { "Wallet requires a public HTTPS origin." }
    return value.trimEnd('/')
}

fun walletBalance(balance: JsonObject, currency: String): String {
    val available = balance.getValue("available").jsonPrimitive.long
    return if (balance.getValue("kind").jsonPrimitive.content == "CASHBACK") BigDecimal.valueOf(available, 2).toPlainString() + " " + currency
    else available.toString() + if (balance.getValue("kind").jsonPrimitive.content == "STAMPS") " sellos" else " puntos"
}

fun WalletPass.summary(): String {
    val balances = presentationBalances()
    return if (balances.isEmpty()) "Tu próxima compra empieza aquí" else balances.take(20).joinToString("\n") {
        val b = it.jsonObject; b.getValue("name").jsonPrimitive.content + ": " + walletBalance(b, snapshot.getValue("currency").jsonPrimitive.content)
    }
}

fun WalletPass.appleJson(passType: String, team: String, origin: String): JsonObject {
    val design = design()
    return obj("formatVersion" to 1, "passTypeIdentifier" to passType, "serialNumber" to serial, "teamIdentifier" to team,
        "organizationName" to snapshot.getValue("businessName"), "description" to "Tarjeta de fidelización de ${snapshot.getValue("businessName").jsonPrimitive.content}",
        "logoText" to design.displayName.ifBlank { snapshot.getValue("businessName").jsonPrimitive.content }, "backgroundColor" to walletRgb(design.background), "foregroundColor" to walletRgb(design.foreground), "labelColor" to walletRgb(design.label),
        "sharingProhibited" to true, "webServiceURL" to "$origin/wallet/apple", "authenticationToken" to token,
        "barcodes" to listOf(obj("format" to "PKBarcodeFormatQR", "message" to snapshot.getValue("cardCode"), "messageEncoding" to "iso-8859-1")),
        "storeCard" to appleStoreFields(), "posterGeneric" to applePosterFields())
}

fun WalletPass.googleJson(objectId: String, classId: String, origin: String): JsonObject = JsonObject(obj(
    "id" to objectId, "classId" to classId, "state" to "ACTIVE", "accountId" to serial.take(8),
    "barcode" to obj("type" to "QR_CODE", "value" to snapshot.getValue("cardCode")),
    "hexBackgroundColor" to design().background,
    "heroImage" to googleArtwork(origin),
    "linksModuleData" to obj("uris" to listOf(obj("id" to "account", "uri" to "$origin/join/${snapshot.getValue("slug").jsonPrimitive.content}", "description" to "Ayuda para recuperar tu tarjeta")))) + googleExperienceFields())
