package com.premierdarkcoffee.loyalty.infrastructure.persistence

import com.premierdarkcoffee.loyalty.access.Security
import java.sql.Connection

object MembershipSchema {
    private val migrations = listOf("membership-calendar", "subscription-periods", "wallet-consent", "purchase-description").associateWith { name ->
        requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/extensions/$name.sql")).readText()
    }
    val checksum = Security.hash(migrations.getValue("membership-calendar"))
    fun verify(c: Connection) {
        migrations.forEach { (name, sql) ->
            check(c.one("SELECT checksum FROM lumina_extensions WHERE name=?", name) { it.getString(1) } == Security.hash(sql)) {
                "MEMBERSHIP_SCHEMA_MISMATCH"
            }
        }
    }
    fun apply(c: Connection) {
        c.exec("CREATE TABLE IF NOT EXISTS lumina_extensions(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)")
        migrations.forEach { (name, sql) ->
            if(c.one("SELECT checksum FROM lumina_extensions WHERE name=?", name) { it.getString(1) } == null) {
                c.createStatement().use { it.execute(sql) }
                c.exec("INSERT INTO lumina_extensions VALUES(?,?)", name, Security.hash(sql))
            }
        }
        verify(c)
    }
}
