package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp

object TeamManagementMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V010.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val old = c.one("SELECT checksum FROM comeback_migrations WHERE version=10") { it.getString(1) }
        check(old == null || old == checksum) { "Migration V010 changed beyond formatting." }
        if (old == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(10,?)", checksum)
        }
    }
}

@Serializable data class TeamChange(val expectedVersion: Int, val name: String, val contact: String = "", val role: String, val branchId: String? = null, val reason: String)
@Serializable data class TeamAction(val expectedVersion: Int, val action: String, val reason: String, val confirmed: Boolean = false)

internal fun validateTeam(name: String, contact: String, role: String, branch: String?) {
    need(name.trim().length in 2..100 && name.none { it.isISOControl() }, "INVALID_STAFF_NAME", "Escribe el nombre del usuario (2 a 100 caracteres).")
    need(contact.length <= 160 && contact.none { it.isISOControl() }, "INVALID_CONTACT", "Usa hasta 160 caracteres para el contacto.")
    need(role in setOf("OWNER", "CASHIER"), "INVALID_ROLE", "Elige dueño o cajero.")
    need(role != "CASHIER" || branch != null, "BRANCH_REQUIRED", "Asigna una sucursal al cajero.")
    need(role != "OWNER" || branch == null, "OWNER_SCOPE", "El dueño administra todas las sucursales.")
    branch?.let(::uuid)
}
internal fun teamReason(reason: String) = need(reason.trim().length in 5..500 && reason.none { it.isISOControl() }, "REASON_REQUIRED", "Escribe el motivo del cambio (5 a 500 caracteres).")

/** Business lock comes first. Revocation waits for writes already accepted, then blocks stale credentials. */
internal fun LoyaltyService.authorizeStaff(c: Connection, s: Staff, exclusive: Boolean = false) {
    need(c.one("SELECT tenant_id FROM business_access WHERE tenant_id=? FOR " + if (exclusive) "UPDATE" else "SHARE", s.tenant) { it.getString(1) } != null, "NOT_FOUND", "Negocio no encontrado.", 404)
    if (s.id == "platform") return // Only constructed after the platform route authenticates its own credential.
    val current = c.one("SELECT role,branch_id,version,revoked_at,archived_at FROM staff_tokens WHERE tenant_id=? AND id=?", s.tenant, s.id) {
        it.getString(1) == s.role && it.getString(2) == s.branch && (s.version == null || it.getInt(3) == s.version) && it.getTimestamp(4) == null && it.getTimestamp(5) == null
    } ?: false
    need(current, "STAFF_ACCESS_CHANGED", "Tu acceso cambió. Inicia sesión con la credencial vigente.", 401)
}

internal fun staffRows(c: Connection, tenant: String): List<JsonObject> = c.rows("""
    SELECT s.*,b.name AS branch_name FROM staff_tokens s LEFT JOIN branches b ON b.tenant_id=s.tenant_id AND b.id=s.branch_id
    WHERE s.tenant_id=? ORDER BY (s.archived_at IS NOT NULL),lower(s.display_name),s.id
""".trimIndent(), tenant) {
    obj("id" to it.getString("id"), "name" to it.getString("display_name").ifBlank { if (it.getString("role") == "OWNER") "Dueño · ${it.getString("id").takeLast(6)}" else "Caja · ${it.getString("id").takeLast(6)}" },
        "contact" to it.getString("contact"), "role" to it.getString("role"), "branchId" to it.getString("branch_id"), "branch" to it.getString("branch_name"),
        "version" to it.getInt("version"), "state" to if (it.getTimestamp("archived_at") != null) "ARCHIVED" else if (it.getTimestamp("revoked_at") != null) "INACTIVE" else "ACTIVE",
        "createdAt" to it.getTimestamp("created_at")?.toInstant(), "updatedAt" to it.getTimestamp("updated_at")?.toInstant())
}

fun LoyaltyService.team(s: Staff): JsonObject {
    s.owner()
    return db.tx { c ->
        authorizeStaff(c,s)
        obj("users" to staffRows(c,s.tenant), "currentUserId" to s.id,
            "branches" to c.rows("SELECT id,name,code FROM branches WHERE tenant_id=? ORDER BY name,id",s.tenant) { obj("id" to it.getString(1),"name" to it.getString(2),"code" to it.getString(3)) })
    }
}

internal fun LoyaltyService.teamAudit(c: Connection, s: Staff, target: String, action: String, details: JsonObject) {
    c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at,details) VALUES(?,?,?,?,?,?,?::jsonb)",id(),s.tenant,s.id,action,target,Timestamp.from(clock.instant()),details.toString())
}

private fun teamCreateHash(name: String, input: NewStaff) = Security.hash(obj("name" to name,"contact" to input.contact.trim(),"role" to input.role,"branch" to input.branchId).toString())

fun LoyaltyService.createTeamUser(s: Staff, input: NewStaff): JsonObject {
    s.owner()
    val name = input.name?.trim() ?: if (input.role == "OWNER") "Dueño" else "Caja"
    validateTeam(name,input.contact,input.role,input.branchId)
    input.requestId?.let(::uuid)
    return db.tx { c ->
        authorizeStaff(c,s,true); commercial.requireActive(c,s.tenant)
        input.branchId?.let { branch(c,s.tenant,it) }
        if (input.requestId != null) {
            val previous = c.one("SELECT id,request_hash FROM staff_tokens WHERE tenant_id=? AND request_id=?",s.tenant,input.requestId) { it.getString(1) to it.getString(2) }
            if (previous != null) {
                need(previous.second == teamCreateHash(name,input),"IDEMPOTENCY_CONFLICT","Este intento ya creó otro acceso. Recarga la lista antes de continuar.",409)
                return@tx obj("id" to previous.first,"credentialIssued" to false,"replayed" to true)
            }
        }
        val token=Security.token(); val target=id(); val at=Timestamp.from(clock.instant())
        c.exec("INSERT INTO staff_tokens(tenant_id,id,token_hash,role,branch_id,display_name,contact,created_at,updated_at,request_id,request_hash) VALUES(?,?,?,?,?,?,?,?,?,?,?)",s.tenant,target,Security.hash(token),input.role,input.branchId,name,input.contact.trim(),at,at,input.requestId,teamCreateHash(name,input))
        teamAudit(c,s,target,"CREATE_STAFF",obj("name" to name,"role" to input.role,"branchId" to input.branchId))
        obj("id" to target,"token" to token,"version" to 1,"credentialIssued" to true)
    }
}

fun LoyaltyService.editTeamUser(s: Staff, target: String, input: TeamChange): JsonObject {
    s.owner();uuid(target);validateTeam(input.name,input.contact,input.role,input.branchId);teamReason(input.reason)
    return db.tx { c ->
        authorizeStaff(c,s,true)
        val before=staffRows(c,s.tenant).find { it["id"]?.jsonPrimitive?.content == target } ?: throw Problem(404,"NOT_FOUND","Usuario no encontrado en este negocio.")
        need(before["state"] != JsonPrimitive("ARCHIVED"),"USER_ARCHIVED","Este acceso está eliminado; crea otro usuario.",409)
        need(before["version"] == JsonPrimitive(input.expectedVersion),"VERSION_CONFLICT","El usuario cambió. Recarga antes de guardar.",409)
        need(target != s.id || (before["role"] == JsonPrimitive(input.role) && before["branchId"] == (input.branchId?.let(::JsonPrimitive) ?: JsonNull)),"SELF_ACCESS_CHANGE","Otro dueño debe cambiar tu propio rol o sucursal.",409)
        input.branchId?.let { branch(c,s.tenant,it) }
        if (before["state"] == JsonPrimitive("ACTIVE") && before["role"] == JsonPrimitive("OWNER") && input.role != "OWNER") requireAnotherOwner(c,s.tenant,target)
        c.exec("UPDATE staff_tokens SET display_name=?,contact=?,role=?,branch_id=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=?",input.name.trim(),input.contact.trim(),input.role,input.branchId,Timestamp.from(clock.instant()),s.tenant,target)
        teamAudit(c,s,target,"EDIT_STAFF",obj("reason" to input.reason.trim(),"before" to obj("name" to before["name"],"role" to before["role"],"branchId" to before["branchId"]),"after" to obj("name" to input.name.trim(),"role" to input.role,"branchId" to input.branchId)))
        obj("id" to target,"version" to input.expectedVersion+1)
    }
}

private fun requireAnotherOwner(c: Connection, tenant: String, target: String) {
    need(c.one("SELECT count(*) FROM staff_tokens WHERE tenant_id=? AND id<>? AND role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL",tenant,target) { it.getInt(1) }!! > 0,"LAST_OWNER","Conserva al menos un dueño activo antes de retirar este acceso.",409)
}

fun LoyaltyService.teamAction(s: Staff, target: String, input: TeamAction): JsonObject {
    s.owner();uuid(target);teamReason(input.reason)
    need(input.confirmed,"CONFIRMATION_REQUIRED","Confirma el cambio de acceso.")
    need(input.action in setOf("DEACTIVATE","ARCHIVE","ROTATE","REACTIVATE"),"INVALID_ACTION","Acción de usuario inválida.")
    need(target != s.id,"SELF_REVOKE","Otro dueño debe renovar, desactivar o eliminar tu propio acceso.",409)
    return db.tx { c ->
        authorizeStaff(c,s,true)
        val before=staffRows(c,s.tenant).find { it["id"]?.jsonPrimitive?.content == target } ?: throw Problem(404,"NOT_FOUND","Usuario no encontrado en este negocio.")
        need(before["version"] == JsonPrimitive(input.expectedVersion),"VERSION_CONFLICT","El usuario cambió. Recarga antes de continuar.",409)
        val state=before.getValue("state").jsonPrimitive.content
        need(state != "ARCHIVED","USER_ARCHIVED","El acceso está eliminado y conserva únicamente su historial.",409)
        if (state == "ACTIVE" && before["role"] == JsonPrimitive("OWNER") && input.action in setOf("DEACTIVATE","ARCHIVE")) requireAnotherOwner(c,s.tenant,target)
        need(input.action != "ROTATE" || state == "ACTIVE","USER_INACTIVE","Para habilitarlo, elige reactivar.",409)
        need(input.action != "REACTIVATE" || state == "INACTIVE","USER_ACTIVE","Este usuario ya está activo.",409)
        val token=if(input.action in setOf("ROTATE","REACTIVATE")) Security.token() else null
        val at=Timestamp.from(clock.instant())
        c.exec("UPDATE staff_tokens SET token_hash=coalesce(?,token_hash),revoked_at=?,archived_at=?,version=version+1,updated_at=? WHERE tenant_id=? AND id=?",token?.let(Security::hash),if(token == null)at else null,if(input.action=="ARCHIVE")at else null,at,s.tenant,target)
        teamAudit(c,s,target,"STAFF_${input.action}",obj("name" to before["name"],"reason" to input.reason.trim(),"previousState" to state))
        obj("id" to target,"version" to input.expectedVersion+1,"token" to token,"credentialIssued" to (token != null))
    }
}
