package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp

object PromotionLifecycleMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V006.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=6") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V006 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(6,?)", checksum)
        }
    }
}

@Serializable data class DeletePromotion(val expectedVersion: Int, val expectedImpact: String,
    val confirmation: String, val acknowledged: Boolean = false)

/** Exclusive access is acquired before members, programs and passes. Purchases use the shared access lock. */
fun lockPromotionBusiness(c: Connection, tenant: String) {
    need(c.one("SELECT tenant_id FROM business_access WHERE tenant_id=? FOR UPDATE",tenant){it.getString(1)} != null,
        "NOT_FOUND","Negocio no encontrado.",404)
}
fun queuePromotionCards(c: Connection, tenant: String) {
    c.exec("UPDATE wallet_passes SET next_scan_at=TIMESTAMPTZ '1970-01-01 00:00:00+00' WHERE tenant_id=?",tenant)
}
fun requireActivePromotion(c: Connection, tenant: String, program: String) {
    val row=c.one("SELECT current_version,deleted_at IS NOT NULL FROM programs WHERE tenant_id=? AND id=? FOR SHARE",tenant,program){it.getInt(1) to it.getBoolean(2)}
        ?:throw Problem(404,"NOT_FOUND","Promoción no encontrada.")
    need(!row.second,"PROMOTION_DELETED","Esta promoción fue eliminada y ya no permite acumular ni canjear.",410)
    val active=c.one("SELECT coalesce((config->>'active')::boolean,true) FROM program_versions WHERE tenant_id=? AND program_id=? AND version=?",tenant,program,row.first){it.getBoolean(1)} == true
    need(active,"PROMOTION_PAUSED","Esta promoción está pausada. No permite acumular ni canjear hasta que el negocio la reactive.",409)
}
private fun removalImpact(c: Connection, tenant: String, program: String): JsonObject {
    val p=c.one("SELECT p.current_version,p.kind,v.config->>'name' AS name FROM programs p JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version WHERE p.tenant_id=? AND p.id=? AND p.deleted_at IS NULL",tenant,program){obj("id" to program,"version" to it.getInt(1),"kind" to it.getString(2),"name" to it.getString(3))}
        ?:throw Problem(404,"NOT_FOUND","Promoción no encontrada o ya eliminada.")
    val balances=c.rows("SELECT member_id,available FROM balances WHERE tenant_id=? AND program_id=? ORDER BY member_id",tenant,program){obj("member" to it.getString(1),"available" to it.getLong(2))}
    val holds=c.rows("SELECT id,member_id,cost FROM redemptions WHERE tenant_id=? AND program_id=? AND status='RESERVED' ORDER BY id",tenant,program){obj("id" to it.getString(1),"member" to it.getString(2),"cost" to it.getLong(3))}
    val rewards=c.rows("SELECT id,version,active FROM rewards WHERE tenant_id=? AND program_id=? ORDER BY id",tenant,program){obj("id" to it.getString(1),"version" to it.getInt(2),"active" to it.getBoolean(3))}
    val affected=(balances.filter{it.getValue("available").jsonPrimitive.long>0}.map{it.getValue("member")}+holds.map{it.getValue("member")}).toSet().size
    val summary=JsonObject(p+obj("customersWithBalance" to affected,"available" to balances.sumOf{it.getValue("available").jsonPrimitive.long},
        "reserved" to holds.sumOf{it.getValue("cost").jsonPrimitive.long},"pendingRedemptions" to holds.size,"rewards" to rewards.size,
        "registeredCustomers" to c.one("SELECT count(*) FROM members WHERE tenant_id=?",tenant){it.getLong(1)},
        "currency" to c.one("SELECT currency FROM tenants WHERE id=?",tenant){it.getString(1)}))
    val fingerprint=Security.hash(obj("summary" to summary,"balances" to balances,"holds" to holds,"rewards" to rewards).toString())
    return JsonObject(summary+obj("impactHash" to fingerprint))
}
fun LoyaltyService.previewPromotionRemoval(s: Staff, program: String): JsonObject {
    s.owner();uuid(program)
    return db.tx { c -> commercial.requireActive(c,s.tenant);removalImpact(c,s.tenant,program) }
}
fun LoyaltyService.deletePromotion(s: Staff, program: String, input: DeletePromotion, key: String): JsonObject {
    s.owner();uuid(program)
    need(input.acknowledged && input.confirmation=="ELIMINAR","DELETION_CONFIRMATION_REQUIRED","Revisa los saldos afectados, acepta la pérdida definitiva y escribe ELIMINAR.")
    need(input.expectedImpact.matches(Regex("[a-f0-9]{64}")),"INVALID_REVIEW","Revisa el impacto antes de eliminar.")
    return db.tx { c -> once(c,s.tenant,"delete-promotion:$program",key,json.encodeToString(input)) {
        lockPromotionBusiness(c,s.tenant);authorizeStaff(c,s);commercial.requireActive(c,s.tenant)
        // Expiry and cancellation also lock the member. Lock affected members before examining balances.
        val members=c.rows("SELECT m.id FROM members m WHERE m.tenant_id=? AND (EXISTS(SELECT 1 FROM balances b WHERE b.tenant_id=m.tenant_id AND b.member_id=m.id AND b.program_id=?) OR EXISTS(SELECT 1 FROM redemptions r WHERE r.tenant_id=m.tenant_id AND r.member_id=m.id AND r.program_id=? AND r.status='RESERVED')) ORDER BY m.id FOR UPDATE OF m",s.tenant,program,program){it.getString(1)}
        c.rows("SELECT id FROM programs WHERE tenant_id=? AND id=? FOR UPDATE",s.tenant,program){it.getString(1)}
        val impact=removalImpact(c,s.tenant,program)
        need(impact.getValue("version").jsonPrimitive.int==input.expectedVersion && impact.getValue("impactHash").jsonPrimitive.content==input.expectedImpact,
            "DELETION_REVIEW_CHANGED","Los clientes, saldos o premios cambiaron. Revisa el aviso actualizado antes de eliminar.",409)
        val holds=c.rows("SELECT id,member_id,cost FROM redemptions WHERE tenant_id=? AND program_id=? AND status='RESERVED' ORDER BY member_id,id FOR UPDATE",s.tenant,program){Triple(it.getString(1),it.getString(2),it.getLong(3))}
        holds.forEach{(hold,member,cost)->
            ledger(c,s.tenant,member,program,cost,"RELEASE",hold)
            c.exec("UPDATE redemptions SET status='CANCELLED' WHERE tenant_id=? AND id=?",s.tenant,hold)
            audit(c,s.tenant,s.id,"CANCEL_FOR_PROGRAM_DELETION",hold)
        }
        c.rows("SELECT member_id,available FROM balances WHERE tenant_id=? AND program_id=? AND available>0 ORDER BY member_id",s.tenant,program){it.getString(1) to it.getLong(2)}.forEach{(member,amount)->
            ledger(c,s.tenant,member,program,-amount,"FORFEIT",id())
        }
        val stamp=Timestamp.from(clock.instant())
        c.exec("UPDATE programs SET deleted_at=?,deleted_by=? WHERE tenant_id=? AND id=?",stamp,s.id,s.tenant,program)
        c.exec("INSERT INTO program_deletions(tenant_id,program_id,actor_id,impact,deleted_at) VALUES(?,?,?,?::jsonb,?)",s.tenant,program,s.id,impact.toString(),stamp)
        members.forEach{changed(c,s.tenant,it)}
        queuePromotionCards(c,s.tenant);audit(c,s.tenant,s.id,"DELETE_PROGRAM",program)
        obj("id" to program,"deleted" to true,"impact" to impact)
    } }
}
