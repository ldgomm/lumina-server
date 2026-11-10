package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one

import java.sql.Connection

object WalletConnectionMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V007.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=7") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V007 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(7,?)", checksum)
        }
    }
}
