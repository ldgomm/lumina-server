package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.access.consistentCedula
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.sql.SQLException
import java.sql.Timestamp

@Serializable data class CustomerProfileEdit(val name: String, val document: String? = null, val expectedVersion: Int, val confirmed: Boolean)
@Serializable data class CustomerRemoval(val expectedVersion: Int, val confirmed: Boolean)

fun LoyaltyService.editCustomer(staff: Staff, member: String, input: CustomerProfileEdit, key: String) = db.tx { c ->
    staff.owner(); uuid(member); authorizeStaff(c, staff); commercial.requireActive(c, staff.tenant)
    val name = input.name.trim()
    text(name, 80)
    need(input.confirmed, "CONFIRM_REQUIRED", "Confirma los datos con el titular.")
    val document = input.document?.trim()?.takeIf { it.isNotEmpty() }
    need(document == null || consistentCedula(document), "INVALID_DOCUMENT", "Revisa la cédula del cliente.")
    val identity = document?.let { Security.identity(pepper, staff.tenant, it) }
    // Store only a keyed fingerprint of the identification, including in retry records.
    once(c, staff.tenant, "customer-edit:${staff.id}:$member", key, json.encodeToString(input.copy(document = identity))) {
        lockMember(c, staff.tenant, member)
        try {
            need(c.exec("""UPDATE members SET name=?,identity_hash=coalesce(?,identity_hash),contact_version=contact_version+1
                WHERE tenant_id=? AND id=? AND contact_version=?""", name, identity, staff.tenant, member, input.expectedVersion) == 1,
                "CUSTOMER_CHANGED", "La ficha cambió. Vuelve a abrirla antes de guardar.", 409)
        } catch (e: SQLException) {
            if (e.sqlState == "23505") throw Problem(409, "DOCUMENT_IN_USE", "Ya existe una tarjeta con esa cédula en este negocio.")
            throw e
        }
        changed(c, staff.tenant, member)
        audit(c, staff.tenant, staff.id, "CUSTOMER_PROFILE_UPDATED", member)
        obj("version" to input.expectedVersion + 1)
    }
}

fun LoyaltyService.removeCustomer(staff: Staff, member: String, input: CustomerRemoval, key: String) = db.tx { c ->
    staff.owner(); uuid(member); authorizeStaff(c, staff); commercial.requireActive(c, staff.tenant)
    need(input.confirmed, "CONFIRM_REQUIRED", "Confirma que deseas eliminar a este cliente.")
    once(c, staff.tenant, "customer-remove:${staff.id}:$member", key, json.encodeToString(input)) {
        lockMember(c, staff.tenant, member)
        need(c.exec("""UPDATE members SET removed_at=?,name='Cliente eliminado',contact_phone=NULL,
            contact_version=contact_version+1,password_hash=NULL,identity_hash=?
            WHERE tenant_id=? AND id=? AND contact_version=?""", Timestamp.from(clock.instant()), Security.hash(Security.token()),
            staff.tenant, member, input.expectedVersion) == 1, "CUSTOMER_CHANGED", "La ficha cambió. Vuelve a abrirla antes de eliminarla.", 409)
        val holds = c.rows("SELECT id,program_id,cost FROM redemptions WHERE tenant_id=? AND member_id=? AND status='RESERVED' FOR UPDATE", staff.tenant, member) {
            Triple(it.getString(1), it.getString(2), it.getLong(3))
        }
        for ((hold, program, cost) in holds) {
            ledger(c, staff.tenant, member, program, cost, "RELEASE", hold)
            c.exec("UPDATE redemptions SET status='CANCELLED' WHERE tenant_id=? AND id=?", staff.tenant, hold)
        }
        c.exec("DELETE FROM member_sessions WHERE tenant_id=? AND member_id=?", staff.tenant, member)
        c.exec("DELETE FROM member_restore_links WHERE tenant_id=? AND member_id=?", staff.tenant, member)
        c.exec("DELETE FROM member_preferences WHERE tenant_id=? AND member_id=?", staff.tenant, member)
        changed(c, staff.tenant, member)
        audit(c, staff.tenant, staff.id, "CUSTOMER_REMOVED", member)
        obj("removed" to true)
    }
}
