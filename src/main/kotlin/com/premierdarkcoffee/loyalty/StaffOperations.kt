package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import java.sql.Connection

object StaffOperationsMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V011.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val old = c.one("SELECT checksum FROM comeback_migrations WHERE version=11") { it.getString(1) }
        check(old == null || old == checksum) { "Migration V011 changed beyond formatting." }
        if (old == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(11,?)", checksum)
        }
    }
}

@Serializable data class StaffPermissions(val purchases: Boolean = true, val rewards: Boolean = true) {
    fun validate(role: String) {
        need(purchases || rewards, "NO_OPERATIONS", "Permite al menos una operación. Para retirar todo el acceso, desactiva al usuario.")
        need(role != "OWNER" || (purchases && rewards), "OWNER_PERMISSIONS", "El dueño conserva todos los permisos del negocio.")
    }
}
enum class StaffOperation { PURCHASE, REWARD }
internal fun purchaseOperations(p: Purchase) = if (p.rewardId == null) setOf(StaffOperation.PURCHASE) else setOf(StaffOperation.PURCHASE, StaffOperation.REWARD)
