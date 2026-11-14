package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.access.contactPhone
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.uuid
import kotlinx.serialization.Serializable
import java.sql.Connection

object CustomerContactMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V017.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=17") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V017 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(17,?)", checksum)
        }
    }
}

@Serializable data class CustomerContactChange(val phone: String, val expectedVersion: Int, val customerConfirmed: Boolean = false)

fun LoyaltyService.updateCustomerContact(staff: Staff, memberId: String, input: CustomerContactChange) = run {
    staff.owner(); uuid(memberId)
    val phone = contactPhone(input.phone)
    need(input.customerConfirmed, "CONTACT_CONFIRMATION_REQUIRED", "Confirma el teléfono con el cliente antes de guardarlo.")
    need(input.expectedVersion >= 0, "INVALID_VERSION", "Recarga los datos del cliente.")
    db.tx { c ->
        authorizeStaff(c, staff); commercial.requireActive(c, staff.tenant)
        lockMember(c, staff.tenant, memberId)
        val current = c.one("SELECT contact_phone,contact_version FROM members WHERE tenant_id=? AND id=?", staff.tenant, memberId) {
            it.getString(1) to it.getInt(2)
        }!!
        // A lost success response can be retried; a different newer value cannot be overwritten.
        need(current.second == input.expectedVersion || current.second == input.expectedVersion + 1 && current.first == phone,
            "CONTACT_CHANGED", "El teléfono cambió. Recarga la ficha antes de editarlo.", 409)
        val version = if (current.first == phone) current.second else {
            c.exec("UPDATE members SET contact_phone=?,contact_version=contact_version+1 WHERE tenant_id=? AND id=?", phone, staff.tenant, memberId)
            audit(c, staff.tenant, staff.id, "CUSTOMER_CONTACT_UPDATED", memberId)
            current.second + 1
        }
        // No changed(): this edit never reissues a pass, increments card revision or sends a message.
        obj("phone" to phone, "version" to version)
    }
}
