package com.premierdarkcoffee.loyalty

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
    val balances = snapshot.getValue("balances").jsonArray
    return if (balances.isEmpty()) "Tu próxima compra empieza aquí" else balances.take(20).joinToString("\n") {
        val b = it.jsonObject; b.getValue("name").jsonPrimitive.content + ": " + walletBalance(b, snapshot.getValue("currency").jsonPrimitive.content)
    }
}

fun WalletPass.appleJson(passType: String, team: String, origin: String): JsonObject {
    val balances = snapshot.getValue("balances").jsonArray
    val first = balances.firstOrNull()?.jsonObject
    val paused = !snapshot.getValue("canOperate").jsonPrimitive.boolean
    val primary = obj("key" to "balance", "label" to (first?.getValue("name")?.jsonPrimitive?.content ?: "Tu tarjeta"),
        "value" to (first?.let { walletBalance(it, snapshot.getValue("currency").jsonPrimitive.content) } ?: "Bienvenido"), "changeMessage" to "Saldo disponible: %@")
    return obj("formatVersion" to 1, "passTypeIdentifier" to passType, "serialNumber" to serial, "teamIdentifier" to team,
        "organizationName" to snapshot.getValue("businessName"), "description" to "Tarjeta de fidelización de ${snapshot.getValue("businessName").jsonPrimitive.content}",
        "logoText" to snapshot.getValue("businessName"), "backgroundColor" to "rgb(32,78,65)", "foregroundColor" to "rgb(255,255,255)", "labelColor" to "rgb(219,243,139)",
        "sharingProhibited" to true, "webServiceURL" to "$origin/wallet/apple", "authenticationToken" to token,
        "barcodes" to listOf(obj("format" to "PKBarcodeFormatQR", "message" to snapshot.getValue("cardCode"), "messageEncoding" to "iso-8859-1")),
        "storeCard" to obj("primaryFields" to listOf(primary),
            "secondaryFields" to listOf(obj("key" to "member", "label" to "Cliente", "value" to snapshot.getValue("name"))),
            "auxiliaryFields" to listOf(obj("key" to "status", "label" to "Estado", "value" to if (paused) "Operaciones pausadas" else "Todas las sucursales")),
            "backFields" to listOf(obj("key" to "balances", "label" to "Saldos disponibles", "value" to summary()),
                                obj("key" to "activity", "label" to "Últimos consumos y canjes", "value" to recentActivity()),
                obj("key" to "usage", "label" to "Cómo usar tu tarjeta", "value" to "Presenta esta tarjeta en caja para acumular o pedir un premio. No necesitas contraseña ni entrar en la web. El negocio verifica al titular y confirma el saldo vigente; Wallet puede tardar en actualizarse."))))
}

fun WalletPass.googleJson(objectId: String, classId: String, origin: String): JsonObject = obj(
    "id" to objectId, "classId" to classId, "state" to "ACTIVE", "accountName" to snapshot.getValue("name"), "accountId" to serial.take(8),
    "barcode" to obj("type" to "QR_CODE", "value" to snapshot.getValue("cardCode")),
    "loyaltyPoints" to obj("label" to "Saldos disponibles", "balance" to obj("string" to summary().take(500))),
    "textModulesData" to listOf(obj("id" to "status", "header" to "Estado", "body" to if (snapshot.getValue("canOperate").jsonPrimitive.boolean) "Válida en todas las sucursales del negocio" else "Operaciones pausadas. Tus saldos se conservan."),
                obj("id" to "activity", "header" to "Últimos consumos y canjes", "body" to recentActivity().take(1000)),
        obj("id" to "usage", "header" to "Cómo usar tu tarjeta", "body" to "Presenta esta tarjeta en caja para acumular o pedir un premio. No necesitas contraseña ni entrar en la web. El negocio verifica al titular y confirma el saldo vigente.")),
    "linksModuleData" to obj("uris" to listOf(obj("id" to "account", "uri" to "$origin/join/${snapshot.getValue("slug").jsonPrimitive.content}", "description" to "Ayuda para recuperar tu tarjeta"))))
