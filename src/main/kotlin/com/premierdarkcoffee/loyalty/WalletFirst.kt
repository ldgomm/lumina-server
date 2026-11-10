package com.premierdarkcoffee.loyalty

import kotlinx.serialization.encodeToString

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

object WalletFirstMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V004.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val existing = c.one("SELECT checksum FROM comeback_migrations WHERE version=4") { it.getString(1) }
        check(existing == null || existing == checksum) { "Migration V004 changed beyond formatting." }
        if (existing == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(4,?)", checksum)
        }
    }
}

@Serializable data class WalletEnrollment(val name: String, val document: String, val acceptedTerms: Boolean, val preferences: CustomerPreferences = CustomerPreferences())
@Serializable data class CounterRedemption(
    val memberId: String, val branchId: String, val rewardId: String,
    val expectedRevision: Long, val expectedRewardVersion: Int,
    val identityVerified: Boolean = false, val customerConfirmed: Boolean = false
)
@Serializable data class RestoreIssue(val memberId: String, val reason: String, val identityVerified: Boolean = false)
@Serializable data class RestoreUse(val token: String)

/** A document is a unique identifier within a business, never an authentication secret. */
fun LoyaltyService.enrollWithoutPassword(slug: String, input: WalletEnrollment): JsonObject {
    text(input.name, 80)
    input.preferences.validate()
    need(input.acceptedTerms, "CONSENT_REQUIRED", "Debes aceptar las condiciones del piloto.")
    return db.tx { c ->
        val business = tenant(c, slug).getValue("id").jsonPrimitive.content
        commercial.requireActive(c, business)
        val identity = Security.identity(pepper, business, input.document)
        val memberId = id()
        val inserted = c.exec("INSERT INTO members(tenant_id,id,identity_hash,password_hash,name,card_code,terms_version) VALUES(?,?,?,NULL,?,?,'pilot-1') ON CONFLICT(tenant_id,identity_hash) DO NOTHING",
            business, memberId, identity, input.name.trim(), Security.token())
        need(inserted == 1, "ENROLLMENT_UNAVAILABLE", "No se puede crear otra tarjeta con esta cédula. Abre la que tienes en Wallet o pide al dueño del negocio que verifique tu identidad para recuperarla.", 409)
        writePreferences(c,Member(business,memberId),input.preferences)
        changed(c, business, memberId)
        audit(c, business, memberId, "ENROLL_WALLET", memberId)
        session(c, Member(business, memberId))
    }
}

/** Employee-authorized redemption: debit, receipt and notification commit together. */
fun LoyaltyService.redeemAtCounter(staff: Staff, input: CounterRedemption, key: String): JsonObject {
    staff.at(input.branchId)
    uuid(input.memberId); uuid(input.branchId); uuid(input.rewardId)
    need(input.identityVerified && input.customerConfirmed, "CUSTOMER_CONFIRMATION_REQUIRED", "Verifica al titular y confirma que solicitó este premio antes de entregarlo.")
    need(input.expectedRevision >= 0 && input.expectedRewardVersion > 0, "INVALID_VERSION", "Recarga los datos del cliente y del premio.")
    return db.tx { c -> authorizeStaff(c,staff,required=setOf(StaffOperation.REWARD)); once(c, staff.tenant, "counter-redeem", key, json.encodeToString(input)) {
        authorizeStaff(c,staff,required=setOf(StaffOperation.REWARD)); commercial.requireActive(c, staff.tenant)
        requireCounterReward(c,staff.tenant,input.rewardId)
        branch(c, staff.tenant, input.branchId)
        lockMember(c, staff.tenant, input.memberId)
        releaseExpired(c, staff.tenant, input.memberId)
        val revision = c.one("SELECT revision FROM members WHERE tenant_id=? AND id=?", staff.tenant, input.memberId) { it.getLong(1) }!!
        need(revision == input.expectedRevision, "CARD_CHANGED", "La tarjeta cambió o ya hubo otra operación. Vuelve a buscar al cliente antes de entregar un premio.", 409)
        val reward = c.one("SELECT * FROM rewards WHERE tenant_id=? AND id=? AND active=true FOR SHARE", staff.tenant, input.rewardId) {
            obj("programId" to it.getString("program_id"), "name" to it.getString("name"), "cost" to it.getLong("cost"), "version" to it.getInt("version"))
        } ?: throw Problem(404, "NOT_FOUND", "Premio no disponible.")
        need(reward.getValue("version").jsonPrimitive.int == input.expectedRewardVersion, "REWARD_CHANGED", "El premio cambió. Revisa su costo y confirma de nuevo con el cliente.", 409)
        val redemption = id()
        val cost = reward.getValue("cost").jsonPrimitive.long
        val program = reward.getValue("programId").jsonPrimitive.content
        requireActivePromotion(c,staff.tenant,program)
        val at = Timestamp.from(clock.instant())
        c.exec("INSERT INTO redemptions(tenant_id,id,member_id,program_id,reward_id,reward_version,reward_name,cost,token_hash,status,expires_at,confirmed_branch_id,confirmed_actor_id,consumed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,'CONSUMED',?,?,?,?,?)",
            staff.tenant, redemption, input.memberId, program, input.rewardId, input.expectedRewardVersion, reward.getValue("name").jsonPrimitive.content, cost,
            Security.hash(Security.token()), at, input.branchId, staff.id, at, at)
        ledger(c, staff.tenant, input.memberId, program, -cost, "RESERVE", redemption)
        changed(c, staff.tenant, input.memberId)
        audit(c, staff.tenant, staff.id, "COUNTER_CONSUME_VERIFIED", redemption)
        obj("id" to redemption, "receipt" to redemption, "status" to "CONSUMED", "name" to reward.getValue("name"), "cost" to cost,
            "programId" to program, "branchId" to input.branchId, "recordedAt" to clock.instant())
    } }
}

/** Staff must verify identity in person. Merely knowing a document cannot issue a link. */
fun LoyaltyService.issueRestore(staff: Staff, input: RestoreIssue): JsonObject {
    staff.owner(); uuid(input.memberId)
    need(input.identityVerified, "IDENTITY_VERIFICATION_REQUIRED", "Verifica presencialmente la identidad del titular antes de recuperar su tarjeta.")
    need(input.reason in setOf("DEVICE_CHANGE", "REMOVED_CARD", "CONNECTION_REPAIR"), "INVALID_REASON", "Selecciona el motivo de recuperación.")
    return db.tx { c ->
        authorizeStaff(c,staff); commercial.requireActive(c, staff.tenant)
        lockMember(c, staff.tenant, input.memberId)
        val token = Security.token()
        val expires = clock.instant().plusSeconds(300)
        c.exec("DELETE FROM member_restore_links WHERE tenant_id=? AND member_id=?", staff.tenant, input.memberId)
        c.exec("INSERT INTO member_restore_links(token_hash,tenant_id,member_id,actor_id,reason,expires_at) VALUES(?,?,?,?,?,?)",
            Security.hash(token), staff.tenant, input.memberId, staff.id, input.reason, Timestamp.from(expires))
        audit(c, staff.tenant, staff.id, "ISSUE_RESTORE_${input.reason}", input.memberId)
        val slug = c.one("SELECT slug FROM tenants WHERE id=?", staff.tenant) { it.getString(1) }!!
        obj("path" to "/join/$slug#restore=$token", "expiresAt" to expires)
    }
}

fun LoyaltyService.useRestore(slug: String, input: RestoreUse): JsonObject {
    need(input.token.matches(Regex("[A-Za-z0-9_-]{43}")), "RESTORE_UNAVAILABLE", "El enlace venció o ya fue usado. Solicita otro al dueño del negocio.", 410)
    return db.tx { c ->
        val business = tenant(c, slug).getValue("id").jsonPrimitive.content
        commercial.requireActive(c, business)
        val hash = Security.hash(input.token)
        val memberId = c.one("SELECT member_id FROM member_restore_links WHERE token_hash=? AND tenant_id=?", hash, business) { it.getString(1) }
            ?: throw Problem(410, "RESTORE_UNAVAILABLE", "El enlace venció o ya fue usado. Solicita otro al dueño del negocio.")
        lockMember(c, business, memberId)
        val used = c.exec("UPDATE member_restore_links SET consumed_at=? WHERE token_hash=? AND tenant_id=? AND consumed_at IS NULL AND expires_at>?",
            Timestamp.from(clock.instant()), hash, business, Timestamp.from(clock.instant()))
        need(used == 1, "RESTORE_UNAVAILABLE", "El enlace venció o ya fue usado. Solicita otro al dueño del negocio.", 410)
        c.exec("DELETE FROM member_sessions WHERE tenant_id=? AND member_id=?", business, memberId)
        audit(c, business, memberId, "RESTORE_WALLET", memberId)
        session(c, Member(business, memberId))
    }
}

/** Public pass content excludes documents, receipt numbers and authentication material. */
fun walletActivity(c: Connection, member: Member): List<JsonObject> = c.rows("""
    SELECT kind,label,at,branch_name FROM (
      SELECT 'PURCHASE' AS kind, 'Compra: ' || (p.amount_minor::numeric/100)::numeric(20,2)::text || ' ' || p.currency AS label, p.created_at AS at, p.id, b.name AS branch_name
      FROM purchases p LEFT JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
      WHERE p.tenant_id=? AND p.member_id=?
      UNION ALL
      SELECT 'REDEMPTION' AS kind, 'Canje: ' || r.reward_name AS label, r.consumed_at AS at, r.id, b.name AS branch_name
      FROM redemptions r LEFT JOIN branches b ON b.tenant_id=r.tenant_id AND b.id=r.confirmed_branch_id
      WHERE r.tenant_id=? AND r.member_id=? AND r.status='CONSUMED' AND r.program_id IN (SELECT id FROM customer_programs WHERE tenant_id=r.tenant_id)
    ) events ORDER BY at DESC,id DESC LIMIT 5
""".trimIndent(), member.tenant, member.id, member.tenant, member.id) {
    obj("kind" to it.getString(1), "label" to it.getString(2).take(150), "at" to it.instant("at"), "branch" to it.getString(4))
}

fun WalletPass.recentActivity(): String = snapshot["recentActivity"]?.jsonArray?.take(5)?.joinToString("\n") {
    val event = it.jsonObject
    val zone = ZoneId.of(snapshot["timezone"]?.jsonPrimitive?.content ?: "America/Guayaquil")
    val date = Instant.parse(event.getValue("at").jsonPrimitive.content).atZone(zone).format(DateTimeFormatter.ofPattern("dd/MM HH:mm"))
    "$date · ${event.getValue("label").jsonPrimitive.content}"
}?.ifBlank { "Tu primera compra aparecerá aquí." } ?: "Tu primera compra aparecerá aquí."
