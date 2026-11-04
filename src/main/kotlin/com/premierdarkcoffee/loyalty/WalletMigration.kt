package com.premierdarkcoffee.loyalty

import java.sql.Connection

object WalletMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V003.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val existing = c.one("SELECT checksum FROM comeback_migrations WHERE version=3") { it.getString(1) }
        check(existing == null || existing == checksum) { "Migration V003 changed beyond formatting." }
        if (existing == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(3,?)", checksum)
        }
    }
}
