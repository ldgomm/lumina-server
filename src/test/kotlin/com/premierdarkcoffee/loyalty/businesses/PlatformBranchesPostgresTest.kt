package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.billing.AccessChange
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.TestInstance
import java.sql.DriverManager
import java.time.*
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PlatformBranchesPostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var schema: String
    private val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val clock = Clock.systemUTC()
    @BeforeAll fun setup() {
        schema = "platform_branches_" + id().replace("-", "")
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url; username=user; this.password=this@PlatformBranchesPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt()
            connectionInitSql="SET search_path TO ${this@PlatformBranchesPostgresTest.schema}"
        }))
        db.migrate(); service=LoyaltyService(db,"wallet-first-test-identity-pepper-32chars",clock)
    }
    @AfterAll fun cleanup() {
        if (::db.isInitialized) db.close()
        if (::schema.isInitialized) DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun JsonObject.str(key: String) = getValue(key).jsonPrimitive.content
    private fun business(): JsonObject = service.createTenant(NewTenant("Negocio", "admin-" + id().take(12), firstBranch = NewBranch("Principal", "MAIN")))
    @Test fun `new business and first branch commit together while legacy creation stays compatible`() {
        val created = business(); val tenant = created.str("tenantId")
        val branches = service.platformBranches(tenant).getValue("branches").jsonArray
        assertEquals(1, branches.size); assertEquals(created.str("firstBranchId"), branches[0].jsonObject.str("id"))
        assertEquals(tenant, service.staff(created.str("ownerToken")).tenant)
        val old = service.createTenant(NewTenant("Anterior", "old-" + id().take(12)))
        assertTrue(service.platformBranches(old.str("tenantId")).getValue("branches").jsonArray.isEmpty())
    }
    @Test fun `invalid first branch leaves no orphan business owner or branch`() {
        val slug = "invalid-" + id().take(12)
        assertFailsWith<Problem> { service.createTenant(NewTenant("Negocio", slug, firstBranch = NewBranch(" ", "X"))) }
        assertEquals(0L, db.tx { c -> c.one("SELECT count(*) FROM tenants WHERE slug=?", slug) { it.getLong(1) } })
    }
    @Test fun `platform retry creates only one new local and rejects different payload`() {
        val tenant = business().str("tenantId"); val key = id(); val input = NewBranch("Norte", "NORTH")
        val first = service.platformNewBranch(tenant, input, key)
        assertEquals(first.str("id"), service.platformNewBranch(tenant, input, key).str("id"))
        assertTrue(service.platformNewBranch(tenant, input, key).getValue("replayed").jsonPrimitive.boolean)
        assertEquals(409, assertFailsWith<Problem> { service.platformNewBranch(tenant, input.copy(name = "Changed"), key) }.status)
        assertEquals(2, service.platformBranches(tenant).getValue("branches").jsonArray.size)
    }
    @Test fun `branch identifiers and credentials never cross business boundaries`() {
        val a = business(); val b = business(); val owner = service.staff(a.str("ownerToken"))
        service.platformNewBranch(a.str("tenantId"), NewBranch("Local", "SAME"), id())
        service.platformNewBranch(b.str("tenantId"), NewBranch("Local", "SAME"), id())
        assertEquals(404, assertFailsWith<Problem> { service.newStaff(owner, NewStaff("CASHIER", b.str("firstBranchId"))) }.status)
        assertFalse(service.platformBranches(a.str("tenantId")).toString().contains(b.str("firstBranchId")))
    }
    @Test fun `new local contributes to the same membership and existing all branch program`() {
        val t = business(); val owner = service.staff(t.str("ownerToken"))
        service.newProgram(owner, Program("Puntos", Kind.POINTS))
        val slug = t.str("enrollmentPath").substringAfterLast('/')
        val member = service.member(service.enrollWithoutPassword(slug, WalletEnrollment("Ana", "DEMO00001", true)).str("token"))
        val second = service.platformNewBranch(owner.tenant, NewBranch("Norte", "NORTH"), id()).str("id")
        service.purchase(owner, Purchase(member.id, t.str("firstBranchId"), id(), 1000, "USD"), id())
        service.purchase(owner, Purchase(member.id, second, id(), 2000, "USD"), id())
        assertEquals(30L, service.card(member).getValue("balances").jsonArray[0].jsonObject.getValue("available").jsonPrimitive.long)
        assertEquals(1L, db.tx { c -> c.one("SELECT count(*) FROM members WHERE tenant_id=?", owner.tenant) { it.getLong(1) } })
    }
    @Test fun `suspended business allows branch inspection but blocks new locals and credentials`() {
        val t = business(); val tenant = t.str("tenantId")
        service.commercial.changeAccess(tenant, AccessChange("SUSPENDED", "Prueba", 1))
        assertEquals(1, service.platformBranches(tenant).getValue("branches").jsonArray.size)
        assertEquals(423, assertFailsWith<Problem> { service.platformNewBranch(tenant, NewBranch("Nuevo", "NEW"), id()) }.status)
        assertEquals(423, assertFailsWith<Problem> { service.newStaff(Staff(tenant, "platform", "OWNER", null), NewStaff("OWNER", null)) }.status)
    }
    @Test fun `only platform credential can create locals or staff through administrative routes`() = testApplication {
        val t = business(); val tenant = t.str("tenantId"); val token = "platform-test-credential-at-least-32-characters"
        environment { config = MapApplicationConfig() }
        application { loyaltyRoutes(service, token, "http://localhost:8080") }
        val path = "/api/platform/tenants/$tenant/branches"
        assertEquals(HttpStatusCode.Unauthorized, client.get(path).status)
        assertEquals(HttpStatusCode.Unauthorized, client.get(path) { bearerAuth(t.str("ownerToken")) }.status)
        assertEquals(HttpStatusCode.Created, client.post(path) { bearerAuth(token); header("Idempotency-Key", id()); contentType(ContentType.Application.Json); setBody(json.encodeToString(NewBranch("Sur", "SOUTH"))) }.status)
        val staffPath = "/api/platform/tenants/$tenant/credentials"
        assertEquals(HttpStatusCode.Unauthorized, client.post(staffPath) { bearerAuth(t.str("ownerToken")); contentType(ContentType.Application.Json); setBody(json.encodeToString(NewStaff("OWNER", null))) }.status)
        val response = client.post(staffPath) { bearerAuth(token); contentType(ContentType.Application.Json); setBody(json.encodeToString(NewStaff("CASHIER", t.str("firstBranchId")))) }
        assertEquals(HttpStatusCode.Created, response.status)
        val cashier = service.staff(json.parseToJsonElement(response.bodyAsText()).jsonObject.str("token"))
        assertEquals("CASHIER", cashier.role); assertEquals(t.str("firstBranchId"), cashier.branch)
    }
    @Test fun `concurrent platform retries create one branch`() {
        val t = business(); val key = id(); val pool = Executors.newFixedThreadPool(4); val barrier = CyclicBarrier(4)
        try {
            val ids = (1..4).map { pool.submit<String> { barrier.await(10, TimeUnit.SECONDS); service.platformNewBranch(t.str("tenantId"), NewBranch("Norte", "NORTH"), key).str("id") } }.map { it.get(30, TimeUnit.SECONDS) }
            assertEquals(1, ids.toSet().size)
            assertEquals(2, service.platformBranches(t.str("tenantId")).getValue("branches").jsonArray.size)
        } finally { pool.shutdownNow() }
    }
}
