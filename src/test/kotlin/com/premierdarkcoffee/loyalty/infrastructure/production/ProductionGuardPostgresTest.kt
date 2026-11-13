package com.premierdarkcoffee.loyalty.infrastructure.production

import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.obj
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.util.Base64
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertFails

@Tag("postgres")
class ProductionGuardPostgresTest {
    private lateinit var db: Database
    private lateinit var schema: String
    private val url get()=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user get()=System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password get()=System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val env=mapOf("WALLET_DATA_KEY" to Base64.getEncoder().encodeToString(ByteArray(32) { 8 }))
    @BeforeEach fun setup() {
        val testSchema = "production_test_" + UUID.randomUUID().toString().replace("-", "")
        DriverManager.getConnection(url, user, password).use { connection ->
            connection.createStatement().use { it.execute("CREATE SCHEMA $testSchema") }
        }
        schema = testSchema
        val poolConfig = HikariConfig().apply {
            jdbcUrl = url
            username = user
            password = this@ProductionGuardPostgresTest.password
            maximumPoolSize = 2
            connectionInitSql = "SET search_path TO $testSchema"
        }
        db = Database(HikariDataSource(poolConfig))
    }
    @AfterEach fun close() {
        if(::db.isInitialized)db.close()
        if(::schema.isInitialized)DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun seal()=db.tx { c->obj("database" to obj("name" to c.one("SELECT current_database()") { it.getString(1) },"created" to c.one("SELECT floor(extract(epoch FROM applied_at)*1000)::bigint FROM comeback_migrations WHERE version=1") { it.getLong(1).toString() })) }
    @Test fun emptyDatabaseIsNotInitializedByProduction() {
        assertFails { ProductionGuard.verifyDatabase(db,obj(),env) }
        assertEquals(0L,db.tx { c->c.one("SELECT count(*) FROM information_schema.tables WHERE table_schema=?",schema) { it.getLong(1) } })
    }
    @Test fun currentDatabaseCanBeCheckedRepeatedlyWithoutMigration() {
        db.migrate();val s=seal();repeat(2) { ProductionGuard.verifyDatabase(db,s,env) }
        assertEquals(16L,db.tx { c->c.one("SELECT count(*) FROM comeback_migrations") { it.getLong(1) } })
    }
    @Test fun oldSchemaIsRejectedWithoutReapplyingMigrations() {
        db.migrate();val s=seal();db.tx { c->c.exec("DELETE FROM comeback_migrations WHERE version=16") }
        assertFails { ProductionGuard.verifyDatabase(db,s,env) }
        assertEquals(15L,db.tx { c->c.one("SELECT count(*) FROM comeback_migrations") { it.getLong(1) } })
    }
    @Test fun changedDatabaseOrEncryptionKeyCannotStart() {
        db.migrate();assertFails { ProductionGuard.verifyDatabase(db,obj("database" to obj("name" to "another","created" to "0")),env) }
        val s=seal();db.tx { c->c.exec("INSERT INTO wallet_key_identity(singleton,fingerprint) VALUES(true,?)","0".repeat(64)) }
        assertFails { ProductionGuard.verifyDatabase(db,s,env) }
        assertEquals("0".repeat(64),db.tx { c->c.one("SELECT fingerprint FROM wallet_key_identity WHERE singleton=true") { it.getString(1) } })
    }
}
