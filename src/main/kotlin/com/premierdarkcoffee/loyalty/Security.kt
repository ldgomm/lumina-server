package com.premierdarkcoffee.loyalty

import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.Locale
import javax.crypto.Mac
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

object Security {
    private val random = SecureRandom()
    fun token(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(ByteArray(32).also(random::nextBytes))
    fun hash(value: String): String = MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }
    fun equal(a: String, b: String) = MessageDigest.isEqual(a.toByteArray(), b.toByteArray())
    fun identity(pepper: String, tenant: String, document: String): String {
        val normalized = document.trim().uppercase(Locale.ROOT)
        need(normalized.matches(Regex("[A-Z0-9-]{5,40}")),"INVALID_DOCUMENT","Documento inválido.")
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(pepper.toByteArray(),"HmacSHA256"))
        return mac.doFinal("$tenant:$normalized".toByteArray()).joinToString("") { "%02x".format(it) }
    }
    fun password(value: String, salt: String = token(), iterations: Int = 210_000): String {
        need(value.length in 12..128,"WEAK_PASSWORD","Usa una contraseña de 12 a 128 caracteres.")
        val spec = PBEKeySpec(value.toCharArray(), salt.toByteArray(), iterations, 256)
        return try { "$iterations:$salt:" + Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).encoded) } finally { spec.clearPassword() }
    }
    fun verify(value: String, encoded: String): Boolean {
        if (value.length !in 12..128) return false
        val parts = encoded.split(':')
        return parts.size == 3 && equal(password(value,parts[1],parts[0].toInt()), encoded)
    }
}
data class Staff(val tenant: String, val id: String, val role: String, val branch: String?) {
    fun owner() = need(role == "OWNER","FORBIDDEN","Requiere administrador del negocio.",403)
    fun at(branchId: String) = need(branch == null || branch == branchId,"BRANCH_FORBIDDEN","Acceso no autorizado a esta sucursal.",403)
}
data class Member(val tenant: String, val id: String)
