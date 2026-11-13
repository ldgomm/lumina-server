package com.premierdarkcoffee.loyalty.infrastructure.persistence

import com.premierdarkcoffee.loyalty.access.TeamManagementMigration
import com.premierdarkcoffee.loyalty.billing.CommercialMigration
import com.premierdarkcoffee.loyalty.businesses.LuminaRegistrationMigration
import com.premierdarkcoffee.loyalty.businesses.AdministrationMigration
import com.premierdarkcoffee.loyalty.businesses.BusinessProfileMigration
import com.premierdarkcoffee.loyalty.businesses.OwnerExperienceMigration
import com.premierdarkcoffee.loyalty.fidelity.PromotionLifecycleMigration
import com.premierdarkcoffee.loyalty.fidelity.StaffOperationsMigration
import com.premierdarkcoffee.loyalty.marketing.EngagementMigration
import com.premierdarkcoffee.loyalty.wallet.WalletConnectionMigration
import com.premierdarkcoffee.loyalty.wallet.WalletFirstMigration
import com.premierdarkcoffee.loyalty.wallet.WalletHealthMigration
import com.premierdarkcoffee.loyalty.wallet.WalletMigration

import com.premierdarkcoffee.loyalty.campaigns.BlackFridayMigration

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import java.sql.Connection
import java.sql.ResultSet
import java.time.Instant
import javax.sql.DataSource

class Database(val source: DataSource) : AutoCloseable {
    companion object {
        fun connect(url: String, user: String, password: String): Database = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl = url; username = user; this.password = password
            maximumPoolSize = 10; minimumIdle = 1; connectionTimeout = 10_000; validationTimeout = 3_000
            addDataSourceProperty("socketTimeout","30")
        }))
    }
    fun <T> tx(block: (Connection) -> T): T = source.connection.use { c ->
        c.autoCommit = false
        try {
            c.exec("SET LOCAL lock_timeout = '5s'")
            c.exec("SET LOCAL statement_timeout = '15s'")
            val result = block(c); c.commit(); result
        } catch (e: Throwable) { c.rollback(); throw e }
    }
    fun migrate() = tx { c ->
        c.rows("SELECT pg_advisory_xact_lock(6432001001)") { true }
        c.exec("CREATE TABLE IF NOT EXISTS comeback_migrations (version INT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())")
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V001.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val existing = c.one("SELECT checksum FROM comeback_migrations WHERE version=1") { it.getString(1) }
        check(SqlFingerprint.acceptsV001(existing, checksum)) { "Migration checksum mismatch. Do not edit applied migrations." }
        if (existing == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(1,?)",checksum)
        }
                CommercialMigration.apply(c)
        WalletMigration.apply(c)
        WalletFirstMigration.apply(c);
        EngagementMigration.apply(c)
        PromotionLifecycleMigration.apply(c)
        WalletConnectionMigration.apply(c)
        BusinessProfileMigration.apply(c)
        OwnerExperienceMigration.apply(c)
        TeamManagementMigration.apply(c)
        StaffOperationsMigration.apply(c)
        WalletHealthMigration.apply(c)
        AdministrationMigration.apply(c)
        LuminaRegistrationMigration.apply(c)
        BlackFridayMigration.apply(c)
        com.premierdarkcoffee.loyalty.businesses.WalletOnboardingMigration.apply(c)
        
    }
    override fun close() { (source as? AutoCloseable)?.close() }
}
fun Connection.exec(sql: String, vararg args: Any?): Int = prepareStatement(sql).use { p ->
    args.forEachIndexed { i, a -> p.setObject(i+1,a) }; p.executeUpdate()
}
fun <T> Connection.rows(sql: String, vararg args: Any?, read: (ResultSet) -> T): List<T> = prepareStatement(sql).use { p ->
    args.forEachIndexed { i,a -> p.setObject(i+1,a) }
    p.executeQuery().use { r -> buildList { while (r.next()) add(read(r)) } }
}
fun <T> Connection.one(sql: String, vararg args: Any?, read: (ResultSet) -> T): T? = rows(sql,*args, read=read).firstOrNull()
fun ResultSet.instant(column: String): Instant = getTimestamp(column).toInstant()
