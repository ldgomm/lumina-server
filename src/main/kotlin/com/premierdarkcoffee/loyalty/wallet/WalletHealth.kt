package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.access.teamReason
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.uuid

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp

object WalletHealthMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V012.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val old = c.one("SELECT checksum FROM comeback_migrations WHERE version=12") { it.getString(1) }
        check(old == null || old == checksum) { "Migration V012 changed beyond formatting." }
        if (old == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(12,?)", checksum)
        }
    }
}

data class WalletHealthQuery(val provider: String = "ALL", val state: String = "ALL", val search: String = "", val offset: Int = 0) {
    fun validate() {
        need(provider in setOf("ALL", "APPLE", "GOOGLE"), "INVALID_PROVIDER", "Elige Apple, Google o ambas.")
        need(state in setOf("ALL", "ATTENTION", "PENDING", "PROVIDER_ACCEPTED", "NOT_ISSUED"), "INVALID_STATE", "Filtro de tarjetas inválido.")
        need(search.length <= 100 && search.none { it.isISOControl() }, "INVALID_SEARCH", "Usa hasta 100 caracteres para buscar.")
        need(offset in 0..1_000_000 && offset % 25 == 0, "INVALID_PAGE", "Página inválida.")
    }
}

@Serializable data class WalletRetry(val expectedTag: Long, val reason: String) {
    fun validate() {
        need(expectedTag > 0, "INVALID_VERSION", "Actualiza la lista antes de reintentar.")
        teamReason(reason)
    }
}

/** A single read-only snapshot. Never decrypt passes, contact providers or enqueue work from a report. */
fun LoyaltyService.walletHealth(s: Staff, q: WalletHealthQuery = WalletHealthQuery()): JsonObject {
    s.owner(); q.validate()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val business = c.one("SELECT name,timezone FROM tenants WHERE id=?", s.tenant) { obj("id" to s.tenant,"name" to it.getString(1),"timezone" to it.getString(2)) }
            ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
        if (s.id != "platform") need(c.one("SELECT version FROM staff_tokens WHERE tenant_id=? AND id=? AND role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL",s.tenant,s.id) { s.version == null || it.getInt(1) == s.version } == true,
            "STAFF_ACCESS_CHANGED","Tu acceso cambió. Inicia sesión con la credencial vigente.",401)
        val availability = wallets.availability()
        val at = clock.instant()
        val common = """
            WITH raw AS (
                SELECT m.id,m.name,v.provider,p.update_tag,p.updated_at,d.sent_tag,d.attempts,d.last_error,
                    d.next_attempt_at,d.last_success_at,d.last_manual_retry_at,
                    CASE WHEN v.provider='APPLE' THEN p.apple_type IS NOT NULL ELSE p.google_id IS NOT NULL END AS issued,
                    CASE WHEN v.provider='APPLE' THEN ?::boolean ELSE ?::boolean END AS configured,
                    (SELECT count(*) FROM wallet_apple_registrations r WHERE r.serial=p.serial) AS registrations,
                    (m.revision>coalesce((p.snapshot->>'revision')::bigint,0) OR EXISTS(
                        SELECT 1 FROM wallet_outbox o WHERE o.tenant_id=m.tenant_id AND o.member_id=m.id AND o.materialized_at IS NULL)) AS content_pending
                FROM members m CROSS JOIN (VALUES ('APPLE'),('GOOGLE')) v(provider)
                LEFT JOIN wallet_passes p ON p.tenant_id=m.tenant_id AND p.member_id=m.id
                LEFT JOIN wallet_delivery d ON d.serial=p.serial AND d.provider=v.provider
                WHERE m.tenant_id=? AND strpos(lower(m.name),lower(?))>0 AND (?='ALL' OR v.provider=?)
            ), status AS (
                SELECT *, CASE WHEN NOT issued THEN 'NOT_ISSUED'
                    WHEN NOT configured THEN 'NOT_CONFIGURED'
                    WHEN provider='APPLE' AND registrations=0 THEN 'NEEDS_CONNECTION'
                    WHEN last_error IS NOT NULL THEN 'RETRYING'
                    WHEN content_pending OR sent_tag IS NULL OR sent_tag<update_tag THEN 'PENDING'
                    ELSE 'PROVIDER_ACCEPTED' END AS state FROM raw
            ), filtered AS (
                SELECT * FROM status WHERE ?='ALL' OR state=? OR (?='ATTENTION' AND state IN ('NOT_CONFIGURED','NEEDS_CONNECTION','RETRYING'))
            )
        """.trimIndent()
        val args = arrayOf<Any?>(availability.getValue("apple").jsonPrimitive.boolean, availability.getValue("google").jsonPrimitive.boolean,s.tenant,q.search.trim(),q.provider,q.provider,q.state,q.state,q.state)
        val summary = c.one(common + "SELECT count(*) AS total,count(*) FILTER(WHERE state IN ('NOT_CONFIGURED','NEEDS_CONNECTION','RETRYING')) AS attention,count(*) FILTER(WHERE state='PENDING') AS pending,count(*) FILTER(WHERE state='PROVIDER_ACCEPTED') AS accepted,count(*) FILTER(WHERE state='NOT_ISSUED') AS unissued FROM filtered",*args) {
            obj("total" to it.getLong("total"),"attention" to it.getLong("attention"),"pending" to it.getLong("pending"),"accepted" to it.getLong("accepted"),"unissued" to it.getLong("unissued"))
        }!!
        val rows = c.rows(common + "SELECT * FROM filtered ORDER BY CASE state WHEN 'NOT_CONFIGURED' THEN 0 WHEN 'RETRYING' THEN 1 WHEN 'NEEDS_CONNECTION' THEN 2 WHEN 'PENDING' THEN 3 WHEN 'PROVIDER_ACCEPTED' THEN 4 ELSE 5 END,lower(name),id,provider LIMIT 25 OFFSET ?",*args,q.offset) {
            val provider = it.getString("provider")
            val retryAt = it.getTimestamp("last_manual_retry_at")?.toInstant()?.plusSeconds(60)
            obj("memberId" to it.getString("id"),"name" to it.getString("name"),"provider" to provider,"state" to it.getString("state"),
                "tag" to it.getLong("update_tag"),"snapshotAt" to it.getTimestamp("updated_at")?.toInstant(),
                "lastAcceptedAt" to it.getTimestamp("last_success_at")?.toInstant(),"lastRequestedAt" to it.getTimestamp("last_manual_retry_at")?.toInstant(),
                "nextAttemptAt" to it.getTimestamp("next_attempt_at")?.toInstant(),"retryAfter" to retryAt,
                "attempts" to it.getInt("attempts"),"errorCode" to it.getString("last_error")?.let { code -> walletDeliveryDiagnosticCode(provider,code) },
                "canRetry" to (it.getBoolean("issued") && it.getBoolean("configured") && (provider != "APPLE" || it.getLong("registrations") > 0) && (retryAt == null || retryAt <= at)))
        }
        val history = c.rows("""
            SELECT a.created_at,a.actor_name,a.details,coalesce(a.details->>'name',m.name) AS name FROM audit_events a
            JOIN members m ON m.tenant_id=a.tenant_id AND m.id=a.target_id
            WHERE a.tenant_id=? AND a.action='WALLET_RETRY' ORDER BY a.created_at DESC,a.id DESC LIMIT 8
        """.trimIndent(),s.tenant) {
            val details = json.parseToJsonElement(it.getString("details")).jsonObject
            obj("at" to it.instant("created_at"),"actor" to it.getString("actor_name"),"customer" to it.getString("name"),"provider" to details["provider"],"reason" to details["reason"])
        }
        obj("business" to business,"asOf" to at,"configuration" to availability,"summary" to summary,"items" to rows,
            "hasMore" to (q.offset + rows.size < summary.getValue("total").jsonPrimitive.long),"offset" to q.offset,"recentRequests" to history,
            "deviceVerification" to "NOT_OBSERVED","httpsVerification" to "NOT_CHECKED")
    }
}

/** Schedule the existing identity. Cooldown, audit and idempotency commit atomically, without network I/O. */
fun LoyaltyService.retryWallet(s: Staff, memberId: String, provider: String, input: WalletRetry, requestId: String): JsonObject {
    s.owner(); uuid(memberId); input.validate()
    need(provider in setOf("APPLE","GOOGLE"),"INVALID_PROVIDER","Elige Apple o Google.")
    return db.tx { c ->
        authorizeStaff(c,s)
        once(c,s.tenant,"wallet-retry:${s.id}:$memberId:$provider",requestId,json.encodeToString(input)) {
            need(wallets.availability().getValue(provider.lowercase()).jsonPrimitive.boolean,"WALLET_NOT_CONFIGURED","El administrador debe revisar la configuración de esta Wallet antes de reintentar.",409)
            val customerName=c.one("SELECT name FROM members WHERE tenant_id=? AND id=? FOR UPDATE",s.tenant,memberId){it.getString(1)}
                ?: throw Problem(404,"NOT_FOUND","Cliente no encontrado.")
            val pass = c.one("SELECT serial,update_tag,apple_type,google_id FROM wallet_passes WHERE tenant_id=? AND member_id=? FOR UPDATE",s.tenant,memberId) {
                Triple(it.getString(1),it.getLong(2),it.getString(if(provider=="APPLE") 3 else 4)!=null)
            } ?: throw Problem(409,"WALLET_NOT_ISSUED","Esta tarjeta todavía no se ha preparado para esta Wallet.")
            need(pass.third,"WALLET_NOT_ISSUED","Esta tarjeta todavía no se ha preparado para esta Wallet.",409)
            need(pass.second==input.expectedTag,"WALLET_CHANGED","La tarjeta cambió. Actualiza la lista antes de reintentar.",409)
            if(provider=="APPLE") need(c.one("SELECT count(*) FROM wallet_apple_registrations WHERE serial=?",pass.first){it.getLong(1)}!!>0,
                "WALLET_CONNECTION_REQUIRED","No hay conexión registrada de Apple. Abre la ficha y recupera la misma tarjeta con el cliente.",409)
            val at=clock.instant();val stamp=Timestamp.from(at)
            val last=c.one("SELECT last_manual_retry_at FROM wallet_delivery WHERE serial=? AND provider=? FOR UPDATE",pass.first,provider){it.getTimestamp(1)?.toInstant() to true}
                ?: throw Problem(409,"WALLET_NOT_ISSUED","Actualiza la lista antes de reintentar.")
            need(last.first==null || last.first!!.plusSeconds(60)<=at,"WALLET_RETRY_COOLDOWN","Ya se solicitó un reintento. Espera un minuto y consulta el estado antes de volver a solicitarlo.",429)
            c.exec("UPDATE wallet_passes SET next_scan_at=? WHERE serial=?",stamp,pass.first)
            c.exec("UPDATE wallet_delivery SET sent_tag=0,wake_revision=wake_revision+1,next_attempt_at=?,last_manual_retry_at=? WHERE serial=? AND provider=?",stamp,stamp,pass.first,provider)
            val details=obj("name" to customerName,"provider" to provider,"reason" to input.reason.trim(),"tag" to pass.second)
            c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at,details) VALUES(?,?,?,'WALLET_RETRY',?,?,?::jsonb)",id(),s.tenant,s.id,memberId,stamp,details.toString())
            obj("status" to "QUEUED","provider" to provider,"memberId" to memberId,"requestedAt" to at,"retryAfter" to at.plusSeconds(60),"deviceVerification" to "NOT_OBSERVED")
        }
    }
}
