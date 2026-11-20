package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.marketing.walletEngagement
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.providers.AppleWalletProvider
import com.premierdarkcoffee.loyalty.wallet.providers.CertificateAppleProvider
import com.premierdarkcoffee.loyalty.wallet.providers.GoogleWalletProvider
import com.premierdarkcoffee.loyalty.wallet.providers.ServiceAccountGoogleProvider
import com.premierdarkcoffee.loyalty.wallet.providers.WalletDeliveryFailure
import com.premierdarkcoffee.loyalty.wallet.providers.applePackage

import kotlinx.serialization.json.*
import java.nio.file.Files
import java.nio.file.Path
import java.sql.Connection
import java.sql.ResultSet
import java.sql.SQLException
import java.sql.Timestamp
import java.time.Instant

class WalletService(
    private val loyalty: LoyaltyService,
    val origin: String = "",
    private val cipher: WalletCipher? = null,
    private val apple: AppleWalletProvider? = null,
    private val google: GoogleWalletProvider? = null,
    private val configuration: List<String> = listOf("WALLET_NOT_CONFIGURED")
) {
    private val db get() = loyalty.db
    private fun now() = loyalty.clock.instant()
    private fun stamp() = Timestamp.from(now())
    companion object {
        fun fromEnvironment(loyalty: LoyaltyService, publicUrl: String, env: Map<String, String>): WalletService {
            val errors = mutableListOf<String>()
            val appleEnabled = env["APPLE_WALLET_ENABLED"] == "true"
            val googleEnabled = env["GOOGLE_WALLET_ENABLED"] == "true"
            if (!appleEnabled && !googleEnabled) return WalletService(loyalty)
            val origin = runCatching { walletHttps(publicUrl) }.getOrElse { errors += "PUBLIC_HTTPS_REQUIRED"; "" }
            val cipher = runCatching { WalletCipher(requireNotNull(env["WALLET_DATA_KEY"])) }.getOrElse { errors += "WALLET_DATA_KEY_REQUIRED"; null }
            if (cipher != null) {
                val stored = loyalty.db.tx { c -> c.one("SELECT fingerprint FROM wallet_key_identity WHERE singleton=true") { it.getString(1) } }
                if (stored != null && stored != cipher.fingerprint) errors += "WALLET_DATA_KEY_CHANGED"
            }
            var apple: AppleWalletProvider? = null; var google: GoogleWalletProvider? = null
            if (errors.isEmpty() && appleEnabled) {
                apple = runCatching { CertificateAppleProvider(requireNotNull(env["APPLE_PASS_TYPE_ID"]), requireNotNull(env["APPLE_TEAM_ID"]), Path.of(requireNotNull(env["APPLE_P12_PATH"])), requireNotNull(env["APPLE_P12_PASSWORD"]).toCharArray(), Path.of(requireNotNull(env["APPLE_WWDR_CERT_PATH"])), env["OPENSSL_BIN"] ?: "openssl", loyalty.clock) }
                    .getOrElse { errors += "APPLE_CERTIFICATE_CONFIG_INVALID"; null }
            }
            if (cipher != null && origin.isNotEmpty() && "WALLET_DATA_KEY_CHANGED" !in errors && googleEnabled) {
                google = runCatching {
                    val file = Path.of(requireNotNull(env["GOOGLE_WALLET_SERVICE_ACCOUNT_PATH"])); require(Files.size(file) < 64_000)
                    ServiceAccountGoogleProvider(requireNotNull(env["GOOGLE_WALLET_ISSUER_ID"]), json.parseToJsonElement(Files.readString(file)).jsonObject, loyalty.clock)
                }.getOrElse { errors += "GOOGLE_SERVICE_ACCOUNT_CONFIG_INVALID"; null }
            }
            if (apple != null && loyalty.db.tx { c -> c.one("SELECT count(*) FROM wallet_passes WHERE apple_type IS NOT NULL AND apple_type<>?", apple!!.passType) { it.getInt(1) } }!! > 0) { errors += "APPLE_BINDING_CHANGED"; apple = null }
            if (google != null && loyalty.db.tx { c -> c.one("SELECT count(*) FROM wallet_passes WHERE google_id IS NOT NULL AND google_id NOT LIKE ?", "${google!!.issuer}.%") { it.getInt(1) } }!! > 0) { errors += "GOOGLE_BINDING_CHANGED"; google = null }
            return WalletService(loyalty, origin, cipher, apple, google, errors)
        }
    }
    fun status() = obj("apple" to if (apple != null) "CONFIGURED_DEVICE_TEST_REQUIRED" else "NOT_CONFIGURED",
        "google" to if (google != null) "CONFIGURED_DEVICE_TEST_REQUIRED" else "NOT_CONFIGURED", "issues" to configuration,
        "deviceVerification" to "PENDING", "bankPayments" to false)
    fun availability() = obj("apple" to (apple != null), "google" to (google != null))
    private fun available(provider: String) {
        need(provider in setOf("apple", "google"), "UNKNOWN_WALLET", "Proveedor de Wallet no válido.", 404)
                need(cipher != null && origin.isNotEmpty() && (if (provider == "apple") apple != null else google != null), "WALLET_PENDING_INTEGRATION", "Wallet aún no está habilitado. El negocio puede localizar tu tarjeta por cédula mientras completa la configuración.", 503)
    }
    private fun key(c: Connection): WalletCipher {
        val key = cipher ?: throw Problem(503, "WALLET_PENDING_INTEGRATION", "Wallet no configurado.")
        c.exec("INSERT INTO wallet_key_identity(singleton,fingerprint) VALUES(true,?) ON CONFLICT DO NOTHING", key.fingerprint)
        need(c.one("SELECT fingerprint FROM wallet_key_identity WHERE singleton=true") { it.getString(1) } == key.fingerprint,
            "WALLET_KEY_MISMATCH", "La configuración de Wallet necesita revisión.", 503)
        return key
    }
    private fun pass(r: ResultSet): WalletPass {
        val serial = r.getString("serial")
        return WalletPass(r.getString("tenant_id"), r.getString("member_id"), serial, requireNotNull(cipher).decrypt(r.getString("auth_cipher"), "pass:$serial"),
            json.parseToJsonElement(r.getString("snapshot")).jsonObject, r.getLong("update_tag"), r.instant("updated_at"), r.getString("apple_type"), r.getString("google_id"), r.getString("google_class"))
    }
    private fun view(c: Connection, member: Member): JsonObject {
        val access = loyalty.commercial.walletAccess(c, member.tenant)
        val m = c.one("SELECT name,card_code,revision,removed_at FROM members WHERE tenant_id=? AND id=? FOR UPDATE", member.tenant, member.id) { obj("name" to it.getString(1), "cardCode" to it.getString(2), "revision" to it.getLong(3), "removed" to (it.getTimestamp(4) != null)) }
            ?: throw Problem(404, "NOT_FOUND", "Tarjeta no encontrada.")
                val business = c.one("SELECT name,slug,currency,timezone FROM tenants WHERE id=?", member.tenant) { obj("businessName" to it.getString(1), "slug" to it.getString(2), "currency" to it.getString(3), "timezone" to it.getString(4)) }!!
        val balances = c.rows("SELECT b.program_id,b.available,p.kind,v.config->>'name' AS name FROM balances b JOIN programs p ON p.tenant_id=b.tenant_id AND p.id=b.program_id JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version WHERE b.tenant_id=? AND b.member_id=? AND p.id IN (SELECT id FROM customer_programs WHERE tenant_id=p.tenant_id) ORDER BY b.program_id", member.tenant, member.id) {
            obj("programId" to it.getString(1), "available" to it.getLong(2), "kind" to it.getString(3), "name" to it.getString(4))
        }
        val canOperate = access.getValue("effectiveState").jsonPrimitive.content == "ACTIVE" && !m.getValue("removed").jsonPrimitive.boolean
        return JsonObject(m.filterKeys { it != "removed" } + business + walletEngagement(c, member, now(), canOperate) + mapOf(
            "recentActivity" to JsonArray(walletActivity(c, member)), "presentationVersion" to JsonPrimitive(35),
            "lifecycleVersion" to JsonPrimitive(1), "balances" to JsonArray(balances), "canOperate" to JsonPrimitive(canOperate)))
    }
    /** Financial locks precede the pass lock; the transactional clock assigns commit-ordered tags. */
    fun materialize(member: Member, provider: String? = null): WalletPass = db.tx { c ->
        if (provider != null) available(provider)
        val key = key(c); val snapshot = view(c, member)
        val existing = c.one("SELECT * FROM wallet_passes WHERE tenant_id=? AND member_id=? FOR UPDATE", member.tenant, member.id, read = ::pass)
        val serial = existing?.serial ?: id(); val token = existing?.token ?: Security.token()
        val appleType = if (provider == "apple") apple!!.passType else existing?.appleType
        val googleId = if (provider == "google") "${google!!.issuer}.comeback_${serial.replace("-", "")}" else existing?.googleId
        val googleClass = if (provider == "google") "${google!!.issuer}.comeback_${member.tenant.replace("-", "")}" else existing?.googleClass
        need(existing?.appleType == null || existing.appleType == appleType, "WALLET_BINDING_CHANGED", "Conserva el Pass Type ID original para actualizar esta tarjeta.", 409)
        need(existing?.googleId == null || existing.googleId == googleId, "WALLET_BINDING_CHANGED", "Conserva el emisor original para actualizar esta tarjeta.", 409)
        val hash = Security.hash(snapshot.toString())
        val changed = existing == null || existing.snapshot != snapshot || existing.appleType != appleType || existing.googleId != googleId
        val tag = if (changed) c.one("UPDATE wallet_update_clock SET value=value+1 WHERE singleton=true RETURNING value") { it.getLong(1) }!! else existing!!.tag
        val updated = if (changed) now() else existing!!.updatedAt
        if (existing == null) c.exec("INSERT INTO wallet_passes(tenant_id,member_id,serial,auth_cipher,auth_hash,snapshot,content_hash,update_tag,updated_at,next_scan_at,apple_type,google_id,google_class) VALUES(?,?,?,?,?,?::jsonb,?,?,?,?,?,?,?)",
            member.tenant, member.id, serial, key.encrypt(token, "pass:$serial"), Security.hash(token), snapshot.toString(), hash, tag, Timestamp.from(updated), Timestamp.from(now().plusSeconds(60)), appleType, googleId, googleClass)
        else c.exec("UPDATE wallet_passes SET snapshot=?::jsonb,content_hash=?,update_tag=?,updated_at=?,next_scan_at=?,apple_type=?,google_id=?,google_class=? WHERE serial=?",
            snapshot.toString(), hash, tag, Timestamp.from(updated), Timestamp.from(now().plusSeconds(60)), appleType, googleId, googleClass, serial)
        for ((enabled, name) in listOf((appleType != null) to "APPLE", (googleId != null) to "GOOGLE")) if (enabled) {
            c.exec("INSERT INTO wallet_delivery(serial,provider,next_attempt_at) VALUES(?,?,?) ON CONFLICT DO NOTHING", serial, name, stamp())
            if (changed) c.exec("UPDATE wallet_delivery SET wake_revision=wake_revision+1,next_attempt_at=LEAST(next_attempt_at,?) WHERE serial=? AND provider=?", stamp(), serial, name)
        }
        c.exec("UPDATE wallet_outbox SET materialized_at=? WHERE tenant_id=? AND member_id=? AND revision<=? AND materialized_at IS NULL", stamp(), member.tenant, member.id, snapshot.getValue("revision").jsonPrimitive.long)
        WalletPass(member.tenant, member.id, serial, token, snapshot, tag, updated, appleType, googleId, googleClass)
    }
    fun appleBytes(member: Member): ByteArray { available("apple"); return applePackage(materialize(member, "apple"), apple!!, origin) }
    fun appleLink(member: Member): JsonObject {
        available("apple"); val pass = materialize(member, "apple"); val ticket = Security.token()
        db.tx { c -> c.exec("INSERT INTO wallet_download_tickets(token_hash,serial,expires_at) VALUES(?,?,?)", Security.hash(ticket), pass.serial, Timestamp.from(now().plusSeconds(120))) }
        return obj("url" to "$origin/wallet/apple/download/$ticket", "expiresIn" to 120)
    }
    fun ticketBytes(ticket: String): ByteArray {
        available("apple")
        need(ticket.matches(Regex("[A-Za-z0-9_-]{43}")), "INVALID_DOWNLOAD", "Enlace inválido o vencido.", 404)
        val member = db.tx { c -> c.one("SELECT p.tenant_id,p.member_id FROM wallet_download_tickets t JOIN wallet_passes p ON p.serial=t.serial WHERE t.token_hash=? AND t.expires_at>?", Security.hash(ticket), stamp()) { Member(it.getString(1), it.getString(2)) } }
        need(member != null, "INVALID_DOWNLOAD", "Enlace inválido o vencido. Genera uno nuevo desde tu tarjeta.", 404)
        return appleBytes(member!!)
    }
    fun googleLink(member: Member): JsonObject {
        available("google"); val pass = materialize(member, "google")
        need(deliver(pass.serial, "GOOGLE", force = true), "WALLET_RETRY", "No se pudo preparar Google Wallet. Reintenta en un momento.", 503)
        return obj("url" to google!!.saveLink(pass.googleId!!, origin), "expiresIn" to 300)
    }
    private fun authorize(c: Connection, passType: String, serial: String, token: String): WalletPass {
        val p = c.one("SELECT * FROM wallet_passes WHERE serial=? AND apple_type=?", serial, passType, read = ::pass)
        need(p != null && Security.equal(Security.hash(token), Security.hash(p.token)), "UNAUTHORIZED", "Acceso no autorizado.", 401)
        return p!!
    }
    fun authenticatedPass(passType: String, serial: String, token: String): WalletPass {
        available("apple"); need(passType == apple!!.passType, "UNAUTHORIZED", "Acceso no autorizado.", 401)
        val p = db.tx { c -> authorize(c, passType, serial, token) }
        return materialize(Member(p.tenant, p.member))
    }
    fun authenticatedBytes(pass: WalletPass) = applePackage(pass, requireNotNull(apple), origin)
    fun register(device: String, passType: String, serial: String, token: String, pushToken: String): Boolean = db.tx { c ->
        available("apple"); key(c)
        need(device.matches(Regex("[A-Za-z0-9._-]{16,256}")) && pushToken.matches(Regex("[A-Fa-f0-9]{32,512}")), "INVALID_DEVICE", "Registro de dispositivo inválido.")
        authorize(c, passType, serial, token)
        val deviceHash = Security.hash(device); val context = "push:$deviceHash:$serial"
        c.rows("SELECT pg_advisory_xact_lock(hashtextextended(?,0))", "wallet-device:$deviceHash") { true }
        val existed = c.one("SELECT serial FROM wallet_apple_registrations WHERE device_hash=? AND serial=?", deviceHash, serial) { it.getString(1) } != null
        if (!existed) need(c.one("SELECT count(*) FROM wallet_apple_registrations WHERE device_hash=?", deviceHash) { it.getInt(1) }!! < 100, "DEVICE_LIMIT", "Demasiadas tarjetas en este dispositivo.", 429)
        c.exec("INSERT INTO wallet_apple_registrations(device_hash,serial,push_cipher,push_hash,registered_at) VALUES(?,?,?,?,?) ON CONFLICT(device_hash,serial) DO UPDATE SET push_cipher=excluded.push_cipher,push_hash=excluded.push_hash,registered_at=excluded.registered_at",
            deviceHash, serial, cipher!!.encrypt(pushToken, context), Security.hash(pushToken), stamp())
        c.exec("UPDATE wallet_delivery SET sent_tag=0,wake_revision=wake_revision+1,next_attempt_at=? WHERE serial=? AND provider='APPLE'", stamp(), serial)
        !existed
    }
    fun unregister(device: String, passType: String, serial: String, token: String) = db.tx { c ->
        available("apple"); authorize(c, passType, serial, token)
        c.exec("DELETE FROM wallet_apple_registrations WHERE device_hash=? AND serial=?", Security.hash(device), serial); Unit
    }
    fun updates(device: String, passType: String, since: String?): JsonObject? = db.tx { c ->
        available("apple")
        val previous = since?.toLongOrNull()
        need(since == null || previous != null && previous >= 0, "INVALID_CURSOR", "Referencia de actualización inválida.")
        val rows = c.rows("SELECT p.serial,p.update_tag FROM wallet_apple_registrations r JOIN wallet_passes p ON p.serial=r.serial WHERE r.device_hash=? AND p.apple_type=? ORDER BY p.serial", Security.hash(device), passType) { it.getString(1) to it.getLong(2) }
        val changed = rows.filter { previous == null || it.second > previous }
        if (changed.isEmpty()) null else obj("serialNumbers" to changed.map { it.first }, "lastUpdated" to rows.maxOf { it.second }.toString())
    }
    /** Network work holds only a provider-specific advisory lock, never a member or access row. */
    fun deliver(serial: String, provider: String, force: Boolean = false): Boolean {
        if ((provider == "APPLE" && apple == null) || (provider == "GOOGLE" && google == null)) return false
        return db.tx { c ->
            val locked = c.one("SELECT pg_try_advisory_xact_lock(hashtextextended(?,0))", "wallet-send:$provider:$serial") { it.getBoolean(1) }!!
            if (!locked) return@tx false
            val pass = c.one("SELECT * FROM wallet_passes WHERE serial=?", serial, read = ::pass) ?: return@tx false
            val delivery = c.one("SELECT sent_tag,next_attempt_at,wake_revision FROM wallet_delivery WHERE serial=? AND provider=?", serial, provider) { Triple(it.getLong(1), it.instant("next_attempt_at"), it.getLong(3)) } ?: return@tx false
            if (!force && delivery.second > now()) return@tx true
            if (provider == "APPLE" && delivery.first >= pass.tag && !force) return@tx true
            try {
                if (provider == "GOOGLE") google!!.sync(pass, origin)
                else {
                    need(pass.appleType == apple!!.passType, "WALLET_BINDING_CHANGED", "Pass Type ID incompatible.", 409)
                    val registrations = c.rows("SELECT device_hash,push_cipher,push_hash,registered_at FROM wallet_apple_registrations WHERE serial=?", serial) { arrayOf(it.getString(1), it.getString(2), it.getString(3), it.getTimestamp(4).toInstant().toString()) }
                    registrations.forEach { r ->
                        val valid = apple.push(cipher!!.decrypt(r[1], "push:${r[0]}:$serial"))
                        if (!valid) c.exec("DELETE FROM wallet_apple_registrations WHERE device_hash=? AND serial=? AND push_hash=? AND registered_at<=?", r[0], serial, r[2], Timestamp.from(Instant.parse(r[3])))
                    }
                }
                c.exec("UPDATE wallet_delivery SET sent_tag=?,attempts=0,last_error=NULL,next_attempt_at=?,last_success_at=? WHERE serial=? AND provider=? AND wake_revision=?", pass.tag, Timestamp.from(now().plusSeconds(300)), stamp(), serial, provider, delivery.third)
                c.exec("UPDATE wallet_outbox SET state='SENT' WHERE tenant_id=? AND member_id=? AND materialized_at IS NOT NULL AND revision<=? AND NOT EXISTS(SELECT 1 FROM wallet_delivery d WHERE d.serial=? AND d.sent_tag<?)", pass.tenant, pass.member, pass.snapshot.getValue("revision").jsonPrimitive.long, serial, pass.tag)
                true
            } catch (e: Exception) {
                if (e is SQLException) throw e
                val reason = walletDeliveryDiagnosticCode(provider, (e as? WalletDeliveryFailure)?.reason)
                c.exec("UPDATE wallet_delivery SET attempts=attempts+1,last_error=?,next_attempt_at=?::timestamptz + (LEAST(3600,30*power(2,LEAST(attempts,7))) * interval '1 second') WHERE serial=? AND provider=? AND wake_revision=?", reason, stamp(), serial, provider, delivery.third)
                false
            }
        }
    }
    fun sweep(): Int {
        if (cipher == null || apple == null && google == null) return 0
        var failed = 0
        val members = db.tx { c -> c.rows("SELECT p.tenant_id,p.member_id FROM wallet_passes p WHERE p.next_scan_at<=? OR EXISTS(SELECT 1 FROM wallet_outbox o WHERE o.tenant_id=p.tenant_id AND o.member_id=p.member_id AND o.materialized_at IS NULL) ORDER BY p.next_scan_at,p.serial LIMIT 100", stamp()) { Member(it.getString(1), it.getString(2)) } }
        members.forEach { try { materialize(it) } catch (_: Exception) { failed++ } }
        val work = db.tx { c -> c.rows("SELECT d.serial,d.provider FROM wallet_delivery d JOIN wallet_passes p ON p.serial=d.serial WHERE d.next_attempt_at<=? AND ((d.provider='APPLE' AND ?) OR (d.provider='GOOGLE' AND ?)) AND (d.sent_tag<p.update_tag OR d.provider='GOOGLE') ORDER BY d.next_attempt_at,d.serial LIMIT 100", stamp(), apple != null, google != null) { it.getString(1) to it.getString(2) } }
        work.forEach { (serial, provider) -> try { if (!deliver(serial, provider)) failed++ } catch (_: Exception) { failed++ } }
        db.tx { c -> c.exec("DELETE FROM wallet_download_tickets WHERE expires_at<=?", stamp()) }
        return failed
    }
    fun diagnostics() = db.tx { c -> obj("configuration" to status(),
        "passes" to c.one("SELECT count(*) FROM wallet_passes") { it.getLong(1) },
        "devices" to c.one("SELECT count(*) FROM wallet_apple_registrations") { it.getLong(1) },
        "delivery" to c.rows("SELECT provider,count(*) AS total,count(*) FILTER(WHERE last_error IS NOT NULL) AS failed,max(attempts) AS attempts FROM wallet_delivery GROUP BY provider") { obj("provider" to it.getString(1), "total" to it.getLong(2), "withErrors" to it.getLong(3), "maxAttempts" to it.getInt(4)) },
        "deliveryErrors" to c.rows("SELECT provider,last_error,count(*) AS total,max(attempts) AS attempts FROM wallet_delivery WHERE last_error IS NOT NULL GROUP BY provider,last_error ORDER BY provider,last_error LIMIT 30") {
            obj("provider" to it.getString(1), "code" to walletDeliveryDiagnosticCode(it.getString(1), it.getString(2)), "total" to it.getLong(3), "maxAttempts" to it.getInt(4))
        }) }
}
