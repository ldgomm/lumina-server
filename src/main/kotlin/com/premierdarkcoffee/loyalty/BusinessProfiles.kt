package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.net.URI
import java.sql.Connection
import java.sql.Timestamp
import java.text.Normalizer
import java.util.Locale

object BusinessProfileMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V008.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=8") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V008 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(8,?)", checksum)
        }
    }
}

@Serializable data class BusinessProfile(
    val legalName: String, val ruc: String, val activity: String,
    val contactName: String, val email: String, val phone: String,
    val province: String, val city: String, val address: String, val website: String = "",
    val socialLinks: Map<String, String> = emptyMap()
) {
    fun normalized(): BusinessProfile = copy(legalName=legalName.trim(), ruc=ruc.trim(), activity=activity.trim(),
        contactName=contactName.trim(), email=email.trim(), phone=phone.trim(), province=province.trim(),
        city=city.trim(), address=address.trim(), website=website.trim(), socialLinks=socialLinks.mapValues { it.value.trim() }.filterValues { it.isNotEmpty() })
    fun validate() {
        val socialHosts = mapOf("instagram" to setOf("instagram.com"), "facebook" to setOf("facebook.com", "fb.com"),
            "tiktok" to setOf("tiktok.com"), "youtube" to setOf("youtube.com", "youtu.be"), "whatsapp" to setOf("wa.me", "whatsapp.com"))
        for ((network, link) in socialLinks) {
            val uri = runCatching { URI(link) }.getOrNull(); val hosts = socialHosts[network].orEmpty()
            need(link.length <= 250 && link.none { it.isISOControl() } && uri?.scheme == "https" && uri.userInfo == null && uri.port in setOf(-1,443) &&
                hosts.any { uri.host?.lowercase(Locale.ROOT) == it || uri.host?.lowercase(Locale.ROOT)?.endsWith(".$it") == true },
                "INVALID_SOCIAL_LINK", "Revisa el enlace de $network: usa la dirección https:// de esa red social, sin contraseñas.")
        }
        fun required(value: String, max: Int, label: String) = need(value.isNotBlank() && value.length <= max && value.none { it.isISOControl() }, "INVALID_BUSINESS_PROFILE", "Revisa $label: es obligatorio y admite hasta $max caracteres.")
        required(legalName,200,"la razón social"); required(activity,100,"la actividad del negocio")
        required(contactName,120,"el nombre de contacto"); required(province,80,"la provincia")
        required(city,80,"la ciudad"); required(address,250,"la dirección")
        need(ruc.matches(Regex("[0-9]{13}")) && ruc.any { it != '0' }, "INVALID_RUC", "El RUC debe tener 13 dígitos, sin letras ni separadores. Cópialo de tu registro del SRI.")
        need(email.length <= 254 && email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) && email.none { it.isISOControl() }, "INVALID_EMAIL", "Escribe un correo válido, por ejemplo contacto@negocio.com.")
        need(phone.length <= 30 && phone.matches(Regex("[+0-9() .-]+")) && phone.count { it in '0'..'9' } in 7..15, "INVALID_PHONE", "Escribe un teléfono de contacto con 7 a 15 dígitos; puedes incluir +593.")
        if (website.isNotEmpty()) {
            val uri = runCatching { URI(website) }.getOrNull()
            need(website.length <= 250 && uri != null && uri.scheme in setOf("http","https") && !uri.host.isNullOrBlank() && uri.userInfo == null,
                "INVALID_WEBSITE", "La página web debe empezar por https:// o http://, por ejemplo https://negocio.com.")
        }
    }
}
@Serializable data class BusinessProfileChange(val expectedVersion: Int, val profile: BusinessProfile, val reason: String = "")

internal fun businessProfileView(c: Connection, tenant: String): JsonObject {
    val business = c.one("SELECT id,name,slug FROM tenants WHERE id=?", uuid(tenant)) { obj("id" to it.getString(1), "name" to it.getString(2), "slug" to it.getString(3)) }
        ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
    val row = c.one("SELECT version,config::text,updated_at FROM business_profiles WHERE tenant_id=?", tenant) {
        obj("version" to it.getInt(1), "profile" to json.parseToJsonElement(it.getString(2)), "updatedAt" to it.getTimestamp(3).toInstant())
    } ?: obj("version" to 0, "profile" to null, "updatedAt" to null)
    return JsonObject(row + obj("business" to business, "rucVerification" to "NOT_VERIFIED", "protectedFields" to protectedBusinessFields, "requests" to profileRequests(c,tenant)))
}
fun LoyaltyService.businessProfile(tenant: String): JsonObject = db.tx { businessProfileView(it,tenant) }
fun LoyaltyService.saveBusinessProfile(tenant: String, input: BusinessProfileChange, actor: String): JsonObject {
    uuid(tenant); need(input.expectedVersion >= 0,"INVALID_VERSION","Versión de ficha inválida.")
    val profile = input.profile.normalized(); profile.validate()
    return db.tx { c ->
        need(c.one("SELECT id FROM tenants WHERE id=? FOR UPDATE",tenant) { it.getString(1) } != null,"NOT_FOUND","Negocio no encontrado.",404)
        val version = c.one("SELECT version FROM business_profiles WHERE tenant_id=?",tenant) { it.getInt(1) } ?: 0
        need(version == input.expectedVersion,"PROFILE_CHANGED","Otra persona actualizó los datos. Recarga la ficha antes de guardar.",409)
        val previous = c.one("SELECT config::text FROM business_profiles WHERE tenant_id=?",tenant) { json.decodeFromString<BusinessProfile>(it.getString(1)) }
        val identityChanged = previous?.normalized()?.identity() != profile.identity()
        need(actor == "platform" || !identityChanged, "PROFILE_ADMIN_REQUIRED", "Razón social, RUC, actividad y ubicación requieren revisión del administrador. Envía una solicitud desde Datos del negocio.", 403)
        if (identityChanged) {
            val reason = input.reason.trim()
            need(reason.length in 10..500 && reason.none { it.isISOControl() }, "CORRECTION_REASON_REQUIRED", "Indica qué verificaste y el motivo de la corrección (10 a 500 caracteres).")
            c.exec("INSERT INTO business_profile_corrections(tenant_id,version,actor_id,reason,before_config,after_config,created_at) VALUES(?,?,?,?,?::jsonb,?::jsonb,?)",
                tenant,version+1,actor,reason,previous?.let { json.encodeToString(it) },json.encodeToString(profile),Timestamp.from(clock.instant()))
        }
        c.exec("INSERT INTO business_profiles(tenant_id,version,config,updated_at) VALUES(?,?,?::jsonb,?) ON CONFLICT(tenant_id) DO UPDATE SET version=EXCLUDED.version,config=EXCLUDED.config,updated_at=EXCLUDED.updated_at",
            tenant,version+1,json.encodeToString(profile),Timestamp.from(clock.instant()))
        audit(c,tenant,actor,"BUSINESS_PROFILE_UPDATED",tenant)
        businessProfileView(c,tenant)
    }
}

internal fun normalizedSearch(query: String): String {
    need(query.length <= 100,"INVALID_SEARCH","Usa hasta 100 caracteres para buscar.")
    return Normalizer.normalize(query.trim().lowercase(Locale.ROOT),Normalizer.Form.NFD).replace(Regex("\\p{M}+"),"")
}
fun LoyaltyService.memberSuggestions(s: Staff, query: String): JsonObject {
    val q=normalizedSearch(query); if(q.length<2)return obj("items" to emptyList<JsonObject>())
    return db.tx { c -> obj("items" to c.rows("SELECT name,card_code FROM members WHERE tenant_id=? AND position(? in translate(lower(name),'áéíóúüñ','aeiouun'))>0 ORDER BY lower(name),id LIMIT 8",s.tenant,q) {
        obj("name" to it.getString(1),"cardCode" to it.getString(2))
    }) }
}
fun LoyaltyService.businessSuggestions(query: String): JsonObject {
    val q=normalizedSearch(query); if(q.length<2)return obj("items" to emptyList<JsonObject>())
    return db.tx { c -> obj("items" to c.rows("SELECT t.id,t.name,p.config->>'ruc',p.config->>'city' FROM tenants t LEFT JOIN business_profiles p ON p.tenant_id=t.id WHERE position(? in translate(lower(concat_ws(' ',t.name,t.slug,p.config->>'ruc',p.config->>'legalName')),'áéíóúüñ','aeiouun'))>0 ORDER BY lower(t.name),t.id LIMIT 8",q) {
        obj("id" to it.getString(1),"name" to it.getString(2),"ruc" to it.getString(3),"city" to it.getString(4))
    }) }
}
