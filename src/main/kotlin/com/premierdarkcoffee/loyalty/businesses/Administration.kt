package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.billing.branchOffer
import com.premierdarkcoffee.loyalty.billing.recordBranchAddition

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.access.team
import com.premierdarkcoffee.loyalty.access.teamAudit
import com.premierdarkcoffee.loyalty.access.teamReason
import com.premierdarkcoffee.loyalty.application.key
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
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.ZoneId

object AdministrationMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V013.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val old = c.one("SELECT checksum FROM comeback_migrations WHERE version=13") { it.getString(1) }
        check(old == null || old == checksum) { "Migration V013 changed beyond formatting." }
        if (old == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(13,?)", checksum)
        }
    }
}

@Serializable data class ManagedBranch(val name: String, val code: String, @kotlinx.serialization.EncodeDefault(kotlinx.serialization.EncodeDefault.Mode.NEVER) val acceptedBranchQuote: String? = null) {
    fun normalized() = copy(name=name.trim(), code=code.trim())
    fun validate() {
        need(name.length in 2..120 && name.none { it.isISOControl() }, "INVALID_BRANCH_NAME", "Escribe un nombre de sucursal de 2 a 120 caracteres.")
        need(code.length in 1..40 && code.none { it.isISOControl() }, "INVALID_BRANCH_CODE", "Escribe un código de 1 a 40 caracteres.")
    }
}
@Serializable data class ManagedBranchChange(val expectedVersion: Int, val name: String, val code: String, val reason: String)
data class BranchDirectoryQuery(val search: String = "", val offset: Int = 0) {
    fun validate() {
        need(search.length <= 100 && search.none { it.isISOControl() }, "INVALID_SEARCH", "Usa hasta 100 caracteres para buscar.")
        need(offset in 0..1_000_000 && offset % 25 == 0, "INVALID_PAGE", "Página inválida.")
    }
}

private fun administrationReader(c: Connection, s: Staff) {
    s.owner()
    if (s.id != "platform") need(c.one("SELECT version FROM staff_tokens WHERE tenant_id=? AND id=? AND role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL",s.tenant,s.id) { s.version == null || it.getInt(1) == s.version } == true,
        "STAFF_ACCESS_CHANGED", "Tu acceso cambió. Inicia sesión con la credencial vigente.", 401)
}

/** Administrative readiness only. Reading this view must never generate bills or mutate Wallet. */
fun LoyaltyService.administration(s: Staff): JsonObject {
    s.owner()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        administrationReader(c,s)
        val business = c.one("SELECT name,currency,timezone,created_at FROM tenants WHERE id=?",s.tenant) {
            obj("id" to s.tenant,"name" to it.getString(1),"currency" to it.getString(2),"timezone" to it.getString(3),"joinedAt" to it.getTimestamp(4).toInstant())
        } ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
        val staff = c.one("SELECT count(*) FILTER(WHERE revoked_at IS NULL AND archived_at IS NULL) AS active,count(*) FILTER(WHERE role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL) AS owners,count(*) FILTER(WHERE revoked_at IS NOT NULL AND archived_at IS NULL) AS inactive,count(*) FILTER(WHERE archived_at IS NOT NULL) AS archived FROM staff_tokens WHERE tenant_id=?",s.tenant) {
            obj("active" to it.getLong("active"),"owners" to it.getLong("owners"),"inactive" to it.getLong("inactive"),"archived" to it.getLong("archived"))
        }
        val branches = c.one("SELECT count(*) AS total,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM staff_tokens s WHERE s.tenant_id=b.tenant_id AND s.branch_id=b.id AND s.role='CASHIER' AND s.revoked_at IS NULL AND s.archived_at IS NULL)) AS unassigned FROM branches b WHERE b.tenant_id=?",s.tenant) {
            obj("total" to it.getLong("total"),"withoutCashier" to it.getLong("unassigned"))
        }
        val profile = c.one("SELECT config::text,updated_at FROM business_profiles WHERE tenant_id=?",s.tenant) {
            val p=json.decodeFromString<BusinessProfile>(it.getString(1))
            obj("present" to true,"category" to BusinessCategories.context(p),"city" to p.city,"updatedAt" to it.getTimestamp(2).toInstant(),"socialCount" to p.socialLinks.size)
        } ?: obj("present" to false)
        val pending = c.one("SELECT count(*) FROM business_profile_requests WHERE tenant_id=? AND status='PENDING'",s.tenant) { it.getInt(1) }
        obj("business" to business,"asOf" to clock.instant(),"profile" to profile,"pendingProfileRequests" to pending,"team" to staff,"branches" to branches,
            "account" to commercial.administrationSnapshot(c,s.tenant,if(s.id=="platform")null else s.id))
    }
}

fun LoyaltyService.branchDirectory(s: Staff, q: BranchDirectoryQuery = BranchDirectoryQuery()): JsonObject {
    s.owner();q.validate()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        administrationReader(c,s)
        val business=c.one("SELECT name,currency,timezone FROM tenants WHERE id=?",s.tenant) {
            obj("id" to s.tenant,"name" to it.getString(1),"currency" to it.getString(2),"timezone" to it.getString(3))
        } ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
        val at=clock.instant(); val zone=ZoneId.of(business.getValue("timezone").jsonPrimitive.content)
        val since=at.atZone(zone).toLocalDate().minusDays(29).atStartOfDay(zone).toInstant()
        val search=normalizedSearch(q.search)
        val where="b.tenant_id=? AND strpos(translate(lower(b.name||' '||b.code),'áéíóúüñ','aeiouun'),?)>0"
        val total=c.one("SELECT count(*) FROM branches b WHERE $where",s.tenant,search) { it.getLong(1) }!!
        val items=c.rows("""
            SELECT b.*,
              (SELECT count(*) FROM staff_tokens s WHERE s.tenant_id=b.tenant_id AND s.branch_id=b.id AND s.role='CASHIER' AND s.revoked_at IS NULL AND s.archived_at IS NULL) AS cashiers,
              (SELECT count(*) FROM purchases p WHERE p.tenant_id=b.tenant_id AND p.branch_id=b.id AND p.created_at>=? AND p.created_at<=?) AS purchases,
              (SELECT coalesce(sum(p.amount_minor),0) FROM purchases p WHERE p.tenant_id=b.tenant_id AND p.branch_id=b.id AND p.created_at>=? AND p.created_at<=?) AS paid,
              (SELECT count(*) FROM redemptions r WHERE r.tenant_id=b.tenant_id AND r.confirmed_branch_id=b.id AND r.status='CONSUMED' AND r.consumed_at>=? AND r.consumed_at<=?) AS rewards
            FROM branches b WHERE $where ORDER BY lower(b.name),b.id LIMIT 25 OFFSET ?
        """.trimIndent(),Timestamp.from(since),Timestamp.from(at),Timestamp.from(since),Timestamp.from(at),Timestamp.from(since),Timestamp.from(at),s.tenant,search,q.offset) {
            obj("id" to it.getString("id"),"name" to it.getString("name"),"code" to it.getString("code"),"version" to it.getInt("version"),"updatedAt" to it.getTimestamp("updated_at")?.toInstant(),
                "cashiers" to it.getLong("cashiers"),"purchases" to it.getLong("purchases"),"paidMinor" to it.getLong("paid"),"rewards" to it.getLong("rewards"))
        }
        val subscription=commercial.plan(c,s.tenant)
        obj("business" to business,"items" to items,"total" to total,"offset" to q.offset,"hasMore" to (q.offset+items.size<total),"from" to since,"asOf" to at,"days" to 30,
            "branchOffer" to commercial.branchOffer(c,s.tenant), "walletRecurring" to (subscription?.first?.walletAgreement!=null && subscription.first.recurring),
            "walletIntervalMonths" to (subscription?.first?.intervalMonths?:1),
            "walletUnitMinor" to (subscription?.first?.feeMinor?:com.premierdarkcoffee.loyalty.billing.WALLET_BRANCH_PRICE))
    }
}

fun LoyaltyService.createManagedBranch(s: Staff, input: ManagedBranch, key: String): JsonObject {
    s.owner();val branch=input.normalized();branch.validate()
    return db.tx { c ->
        authorizeStaff(c,s,true)
        once(c,s.tenant,"managed-branch-create:${s.id}",key,json.encodeToString(branch)) {
            commercial.lock(c,s.tenant)
            commercial.requireActive(c,s.tenant)
            need(c.one("SELECT id FROM branches WHERE tenant_id=? AND code=?",s.tenant,branch.code){it.getString(1)}==null,"BRANCH_CODE_EXISTS","Ya hay una sucursal con ese código. Elige otro.",409)
            val target=id()
            c.exec("INSERT INTO branches(tenant_id,id,name,code,updated_at,created_at) VALUES(?,?,?,?,?,?)",s.tenant,target,branch.name,branch.code,Timestamp.from(clock.instant()),Timestamp.from(clock.instant()))
            commercial.recordBranchAddition(c,s.tenant,target,branch.name,s.id,branch.acceptedBranchQuote)
            teamAudit(c,s,target,"CREATE_BRANCH",obj("name" to branch.name,"code" to branch.code))
            obj("id" to target,"name" to branch.name,"code" to branch.code,"version" to 1)
        }
    }
}

fun LoyaltyService.editManagedBranch(s: Staff, target: String, input: ManagedBranchChange, key: String): JsonObject {
    s.owner();uuid(target);val branch=ManagedBranch(input.name,input.code).normalized();branch.validate();teamReason(input.reason)
    need(input.expectedVersion>0,"INVALID_VERSION","Recarga las sucursales antes de guardar.")
    val normalized=input.copy(name=branch.name,code=branch.code,reason=input.reason.trim())
    return db.tx { c ->
        authorizeStaff(c,s,true)
        once(c,s.tenant,"managed-branch-edit:${s.id}:$target",key,json.encodeToString(normalized)) {
            val before=c.one("SELECT name,code,version FROM branches WHERE tenant_id=? AND id=? FOR UPDATE",s.tenant,target) {
                obj("name" to it.getString(1),"code" to it.getString(2),"version" to it.getInt(3))
            } ?: throw Problem(404,"NOT_FOUND","Sucursal no encontrada en este negocio.")
            need(before["version"]==JsonPrimitive(input.expectedVersion),"BRANCH_CHANGED","Otra persona cambió esta sucursal. Tu borrador se conserva; recarga y revisa la versión vigente.",409)
            need(c.one("SELECT id FROM branches WHERE tenant_id=? AND code=? AND id<>?",s.tenant,branch.code,target){it.getString(1)}==null,"BRANCH_CODE_EXISTS","Ya hay una sucursal con ese código. Elige otro.",409)
            c.exec("UPDATE branches SET name=?,code=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=?",branch.name,branch.code,Timestamp.from(clock.instant()),s.tenant,target)
            teamAudit(c,s,target,"EDIT_BRANCH",obj("reason" to normalized.reason,"before" to before,"after" to obj("name" to branch.name,"code" to branch.code,"version" to input.expectedVersion+1)))
            obj("id" to target,"name" to branch.name,"code" to branch.code,"version" to input.expectedVersion+1)
        }
    }
}
