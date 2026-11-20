package com.premierdarkcoffee.loyalty.infrastructure.persistence

import com.premierdarkcoffee.loyalty.access.Security
import java.sql.Connection

object MembershipSchema {
    private val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/extensions/membership-calendar.sql")).readText()
    val checksum = Security.hash(sql)
    fun verify(c: Connection) {
        check(c.one("SELECT checksum FROM lumina_extensions WHERE name='membership-calendar'"){it.getString(1)}==checksum) {
            "MEMBERSHIP_SCHEMA_MISMATCH"
        }
    }
    fun apply(c: Connection) {
        c.exec("CREATE TABLE IF NOT EXISTS lumina_extensions(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)")
        if(c.one("SELECT checksum FROM lumina_extensions WHERE name='membership-calendar'"){it.getString(1)}==null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO lumina_extensions VALUES('membership-calendar',?)",checksum)
        }
        verify(c)
    }
}
