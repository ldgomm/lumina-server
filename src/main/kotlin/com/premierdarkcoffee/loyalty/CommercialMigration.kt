package com.premierdarkcoffee.loyalty

import java.sql.Connection

object CommercialMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/db/V002.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val existing = c.one("SELECT checksum FROM comeback_migrations WHERE version=2") { it.getString(1) }
        check(existing == null || existing == checksum) { "Migration V002 changed beyond formatting. Keep applied history." }
        if (existing == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(2,?)", checksum)
        }
    }
}
