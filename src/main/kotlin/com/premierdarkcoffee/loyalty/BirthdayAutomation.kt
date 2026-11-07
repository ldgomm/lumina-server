package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.security.SecureRandom
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.LocalDate

@Serializable data class BirthdayGreeting(val title: String, val message: String) {
    fun validate() { text(title,80); text(message,250) }
}
val birthdaySuggestions = listOf(
    BirthdayGreeting("¡Feliz cumpleaños!", "Hoy celebramos contigo. Gracias por formar parte de nuestra comunidad."),
    BirthdayGreeting("Un saludo en tu día", "Te deseamos un cumpleaños lleno de buenos momentos. ¡Gracias por elegirnos!"),
    BirthdayGreeting("Hoy el protagonista eres tú", "Que este nuevo año de vida te traiga muchas razones para sonreír. ¡Feliz cumpleaños!"),
    BirthdayGreeting("De parte de todo el equipo", "Te enviamos nuestros mejores deseos en tu cumpleaños. Nos alegra tenerte cerca.")
)
@Serializable data class BirthdaySettings(val enabled: Boolean = true, val mode: String = "FIXED",
    val title: String = "¡Feliz cumpleaños!", val message: String = WalletDesign().birthdayMessage,
    val templates: List<BirthdayGreeting> = emptyList()) {
    fun validate() {
        need(mode in setOf("FIXED","RANDOM"), "INVALID_BIRTHDAY_MODE", "Elige un texto fijo o una selección aleatoria.")
        BirthdayGreeting(title,message).validate()
        need(templates.size <= 8, "TOO_MANY_BIRTHDAY_TEMPLATES", "Guarda hasta ocho felicitaciones.")
        templates.forEach { it.validate() }
        need(mode != "RANDOM" || templates.distinct().size >= 2, "BIRTHDAY_TEMPLATES_REQUIRED", "Elige al menos dos felicitaciones diferentes para la selección aleatoria.")
    }
}
@Serializable data class BirthdaySettingsChange(val expectedVersion: Int, val settings: BirthdaySettings)
private val birthdayRandom = SecureRandom()
internal fun birthdaySettings(c: Connection, tenant: String, design: WalletDesign): BirthdaySettings =
    c.one("SELECT config::text FROM birthday_settings WHERE tenant_id=?",tenant) { json.decodeFromString<BirthdaySettings>(it.getString(1)) }
        ?: BirthdaySettings(message=design.birthdayMessage)

fun LoyaltyService.birthdayConfiguration(s: Staff): JsonObject {
    s.owner()
    return db.tx { c -> obj("version" to (c.one("SELECT version FROM birthday_settings WHERE tenant_id=?",s.tenant) { it.getInt(1) } ?: 0),
        "settings" to json.parseToJsonElement(json.encodeToString(birthdaySettings(c,s.tenant,walletDesign(c,s.tenant)))),
        "suggestions" to json.parseToJsonElement(json.encodeToString(birthdaySuggestions))) }
}
fun LoyaltyService.saveBirthdayConfiguration(s: Staff, input: BirthdaySettingsChange): JsonObject {
    s.owner(); input.settings.validate(); need(input.expectedVersion >= 0,"INVALID_VERSION","Versión de cumpleaños inválida.")
    return db.tx { c ->
        commercial.requireActive(c,s.tenant)
        c.one("SELECT id FROM tenants WHERE id=? FOR UPDATE",s.tenant) { it.getString(1) }
        val version = c.one("SELECT version FROM birthday_settings WHERE tenant_id=?",s.tenant) { it.getInt(1) } ?: 0
        need(version == input.expectedVersion,"VERSION_CONFLICT","Otra persona cambió los cumpleaños. Recarga antes de guardar.",409)
        c.exec("INSERT INTO birthday_settings(tenant_id,version,config) VALUES(?,?,?::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET version=excluded.version,config=excluded.config",
            s.tenant,version+1,json.encodeToString(input.settings))
        audit(c,s.tenant,s.id,"BIRTHDAY_AUTOMATION_UPDATED",s.tenant)
        obj("version" to version+1)
    }
}

/** One stored choice for the customer and local year, reused by both providers and all retries. */
internal fun birthdayAnnouncement(c: Connection, member: Member, design: WalletDesign, day: LocalDate, at: Instant): JsonObject? {
    val settings = birthdaySettings(c,member.tenant,design)
    if (!settings.enabled) return null
    val saved = c.one("SELECT title,body FROM birthday_greetings WHERE tenant_id=? AND member_id=? AND birthday_year=?",member.tenant,member.id,day.year) {
        BirthdayGreeting(it.getString(1),it.getString(2))
    }
    val greeting = saved ?: run {
        val options = if(settings.mode == "RANDOM") settings.templates.distinct() else listOf(BirthdayGreeting(settings.title,settings.message))
        val chosen = options[birthdayRandom.nextInt(options.size)]
        c.exec("INSERT INTO birthday_greetings(tenant_id,member_id,birthday_year,title,body,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING",
            member.tenant,member.id,day.year,chosen.title,chosen.message,Timestamp.from(at))
        c.one("SELECT title,body FROM birthday_greetings WHERE tenant_id=? AND member_id=? AND birthday_year=?",member.tenant,member.id,day.year) {
            BirthdayGreeting(it.getString(1),it.getString(2))
        }!!
    }
    return obj("id" to "birthday-${day.year}", "title" to greeting.title, "body" to greeting.message)
}
