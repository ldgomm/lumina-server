package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Confirm
import com.premierdarkcoffee.loyalty.shared.Enrollment
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Login
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reserve
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.summary

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.TestInstance
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CommercialPostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var billing: CommercialService
    private lateinit var schema: String
    private lateinit var url: String
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val time = TestClock(Instant.parse("2026-11-03T15:00:00Z"))
    @BeforeAll fun setup() {
        url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
        schema = "commercial_test_" + id().replace("-", "")
        DriverManager.getConnection(url, user, password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl = url; username = user; this.password = this@CommercialPostgresTest.password
            maximumPoolSize = (System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt()
            connectionInitSql = "SET search_path TO ${this@CommercialPostgresTest.schema}"
        }))
        db.migrate(); service = LoyaltyService(db, "commercial-only-test-pepper-32-characters", time); billing = service.commercial
    }
    @BeforeEach fun resetClock() { time.value = Instant.parse("2026-11-03T15:00:00Z") }
    @AfterAll fun cleanup() {
        if (::db.isInitialized) db.close()
        if (::schema.isInitialized) DriverManager.getConnection(url, user, password).use { it.createStatement().use { s -> s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private data class Fixture(val tenant: String, val staff: Staff, val token: String, val slug: String)
    private fun fixture(): Fixture {
        val slug = "business-" + id().take(12)
        val r = service.createTenant(NewTenant("Negocio", slug, timezone = "UTC"))
        return Fixture(r.str("tenantId"), service.staff(r.str("ownerToken")), r.str("ownerToken"), slug)
    }
    private fun plan(fee: Long = 1000, auto: Boolean = false, due: Int = 0, grace: Int = 0) = MembershipPlan("Plan", fee, "2026-11-03", "2026-11-03", dueDays = due, graceDays = grace, autoSuspend = auto)
    private fun charge(f: Fixture, amount: Long = 1000, due: String = "2026-11-03") = billing.charge(f.tenant, NewCharge("Cargo", amount, due), id()).str("id")
    private fun pay(f: Fixture, invoice: String, amount: Long = 1000, ref: String = id(), key: String = id()) = billing.pay(f.tenant, RecordPayment(invoice, amount, ref, "TRANSFER", LocalDate.ofInstant(time.instant(), ZoneOffset.UTC).toString()), key)
    private fun account(f: Fixture) = billing.ownerAccount(f.staff)
    private fun balance(f: Fixture) = account(f).getValue("summary").jsonObject.getValue("balanceMinor").jsonPrimitive.long
    private fun setState(f: Fixture, state: String) = billing.changeAccess(f.tenant, AccessChange(state, "Cambio solicitado", account(f).getValue("access").jsonObject.getValue("version").jsonPrimitive.int))
    private fun operational(f: Fixture): Triple<Member, String, String> {
        val branch = service.newBranch(f.staff, NewBranch("Centro", "CENTRO")).str("id")
        val p = service.newProgram(f.staff, Program("Puntos", Kind.POINTS)).str("id")
        val reward = service.saveReward(f.staff, Reward(p, "Premio", 5)).str("id")
        val member = service.member(service.enroll(f.slug, Enrollment("Cliente", "ID123456", "test-password-123", true)).str("token"))
        db.tx { it.exec("UPDATE members SET created_at=? WHERE tenant_id=? AND id=?", Timestamp.from(time.instant()), f.tenant, member.id) }
        service.purchase(f.staff, Purchase(member.id, branch, id(), 1000, "USD"), id())
        return Triple(member, branch, reward)
    }
    private fun parallel(n: Int, action: () -> Any): List<Any> {
        val pool = Executors.newFixedThreadPool(n); val barrier = CyclicBarrier(n)
        return try { (1..n).map { pool.submit<Any> { barrier.await(10, TimeUnit.SECONDS); try { action() } catch (p: Problem) { p } } }.map { it.get(30, TimeUnit.SECONDS) } } finally { pool.shutdownNow() }
    }
    @Test fun `migration is repeatable and backfills existing tenants`() {
        val f = fixture(); db.migrate()
        assertTrue(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
                assertEquals(16, db.tx { c -> c.one("SELECT count(*) FROM comeback_migrations") { it.getInt(1) } })
        db.tx { c ->
            val oldSchema = "upgrade_" + id().replace("-", "")
            c.exec("CREATE SCHEMA $oldSchema"); c.exec("SET LOCAL search_path TO $oldSchema")
            c.createStatement().use { it.execute(requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V001.sql")).readText()) }
            c.exec("CREATE TABLE comeback_migrations(version INT PRIMARY KEY,checksum TEXT NOT NULL)")
            c.exec("INSERT INTO tenants(id,name,slug,currency,timezone) VALUES(?,'Existing','existing','USD','UTC')", f.tenant)
            CommercialMigration.apply(c); CommercialMigration.apply(c)
            assertEquals("ACTIVE", c.one("SELECT state FROM business_access WHERE tenant_id=?", f.tenant) { it.getString(1) })
            assertEquals(0, c.one("SELECT count(*) FROM billing_memberships") { it.getInt(1) })
            c.exec("SET LOCAL search_path TO $schema"); c.exec("DROP SCHEMA $oldSchema CASCADE")
        }
    }
    @Test fun `new businesses are active without invented fees`() {
        val f = fixture(); val a = account(f)
        assertEquals(JsonNull, a["membership"]); assertEquals(0L, balance(f)); assertTrue(a.getValue("invoices").jsonArray.isEmpty())
    }
    @Test fun `recurring invoices are emitted once with calendar boundaries`() {
        val f = fixture(); time.value = Instant.parse("2027-01-31T12:00:00Z")
        billing.configure(f.tenant, MembershipChange(0, plan().copy(startedOn = "2027-01-31", nextChargeOn = "2027-01-31", anchorDay = 31)))
        time.value = Instant.parse("2027-03-31T12:00:00Z"); account(f); account(f)
        val a = account(f); assertEquals(3, a.getValue("invoices").jsonArray.size)
        assertEquals("2027-04-30", a.getValue("membership").jsonObject.str("nextChargeOn")); assertEquals(3000L, balance(f))
    }
    @Test fun `plan changes preserve issued prices and require current version`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan()))
        billing.configure(f.tenant, MembershipChange(1, plan(2000).copy(nextChargeOn = "2026-12-03")))
        assertEquals("VERSION_CONFLICT", assertFailsWith<Problem> { billing.configure(f.tenant, MembershipChange(1, plan(3000).copy(nextChargeOn = "2027-01-03"))) }.code)
        time.value = Instant.parse("2026-12-03T15:00:00Z")
        assertEquals(3000L, balance(f)); assertEquals(setOf(1000L, 2000L), account(f).getValue("invoices").jsonArray.map { it.jsonObject.getValue("amountMinor").jsonPrimitive.long }.toSet())
    }
    @Test fun `manual charge retries preserve one invoice and reject changed body`() {
        val f = fixture(); val input = NewCharge("Alta", 1500, "2026-11-03"); val key = id()
        val first = billing.charge(f.tenant, input, key); val again = billing.charge(f.tenant, input, key)
        assertEquals(first.str("id"), again.str("id")); assertTrue(again.getValue("replayed").jsonPrimitive.boolean)
        assertFailsWith<Problem> { billing.charge(f.tenant, input.copy(amountMinor = 2000), key) }; assertEquals(1500L, balance(f))
    }
    @Test fun `partial payments reject overpayment and duplicate references`() {
        val f = fixture(); val invoice = charge(f); pay(f, invoice, 400, " ABC ")
        assertEquals(600L, balance(f))
        assertEquals("DUPLICATE_PAYMENT", assertFailsWith<Problem> { pay(f, invoice, 100, "abc") }.code)
        assertEquals("PAYMENT_EXCEEDS_BALANCE", assertFailsWith<Problem> { pay(f, invoice, 601) }.code)
        pay(f, invoice, 600); assertEquals(0L, balance(f))
    }
    @Test fun `payment retry returns same receipt after full settlement`() {
        val f = fixture(); val invoice = charge(f); val ref = id(); val key = id()
        assertEquals(pay(f, invoice, ref = ref, key = key).str("id"), pay(f, invoice, ref = ref, key = key).str("id"))
        assertEquals(1, account(f).getValue("payments").jsonArray.size)
    }
    @Test fun `reversal preserves original payment and restores debt once`() {
        val f = fixture(); val invoice = charge(f); val p = pay(f, invoice).str("id"); val key = id()
        billing.reverse(f.tenant, p, Correction("Error"), key); billing.reverse(f.tenant, p, Correction("Error"), key)
        assertEquals(1000L, balance(f)); assertFailsWith<Problem> { billing.reverse(f.tenant, p, Correction("Otra vez"), id()) }
        assertTrue(account(f).getValue("payments").jsonArray[0].jsonObject.getValue("reversed").jsonPrimitive.boolean)
    }
    @Test fun `void preserves invoice and disallows active payments`() {
        val f = fixture(); val invoice = charge(f); val p = pay(f, invoice, 200).str("id")
        assertFailsWith<Problem> { billing.void(f.tenant, invoice, Correction("Error"), id()) }
        billing.reverse(f.tenant, p, Correction("Error"), id()); billing.void(f.tenant, invoice, Correction("Duplicado"), id())
        assertEquals(0L, balance(f)); assertEquals("VOID", account(f).getValue("invoices").jsonArray[0].jsonObject.str("status"))
        assertFailsWith<Problem> { pay(f, invoice) }
    }
    @Test fun `billing cannot cross tenant boundaries`() {
        val a = fixture(); val b = fixture(); val invoice = charge(b)
        assertEquals("NOT_FOUND", assertFailsWith<Problem> { pay(a, invoice) }.code)
        val p = pay(b, invoice).str("id"); assertFailsWith<Problem> { billing.reverse(a.tenant, p, Correction("No"), id()) }
        assertEquals(0L, balance(a)); assertTrue(account(a).getValue("payments").jsonArray.isEmpty())
    }
    @Test fun `suspension blocks operations while login history and cancellation survive`() {
        val f = fixture(); val (member, branch, reward) = operational(f)
        val hold = service.reserve(member, Reserve(reward), id()); setState(f, "SUSPENDED")
        for (action in listOf<() -> Any>(
            { service.purchase(f.staff, Purchase(member.id, branch, id(), 1000, "USD"), id()) },
            { service.reserve(member, Reserve(reward), id()) },
            { service.confirm(f.staff, Confirm(hold.str("token"), branch), id()) },
            { service.newBranch(f.staff, NewBranch("Otra", "OTRA")) },
            { service.newProgram(f.staff, Program("Otro", Kind.POINTS)) },
            { service.enroll(f.slug, Enrollment("Otro", "ID987654", "test-password-123", true)) }
        )) assertEquals("BUSINESS_SUSPENDED", assertFailsWith<Problem> { action() }.code)
        service.login(f.slug, Login("ID123456", "test-password-123")); service.card(member); service.cancel(member, hold.str("id"), id())
        assertEquals("SUSPENDED", account(f).getValue("access").jsonObject.str("state"))
        assertTrue(billing.publicAccess(fixture().tenant).getValue("canOperate").jsonPrimitive.boolean)
    }
    @Test fun `automatic suspension respects grace and payment restores only automatic access`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan(auto = true, due = 2, grace = 2)))
        time.value = Instant.parse("2026-11-07T15:00:00Z"); assertTrue(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        time.value = Instant.parse("2026-11-08T15:00:00Z"); assertFalse(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        val invoice = account(f).getValue("invoices").jsonArray[0].jsonObject.str("id"); pay(f, invoice)
        assertTrue(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        setState(f, "SUSPENDED"); assertFalse(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
    }
    @Test fun `overdue gate works when worker has not generated later invoices`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan(auto = true)))
        pay(f, account(f).getValue("invoices").jsonArray[0].jsonObject.str("id"))
        time.value = Instant.parse("2026-12-04T15:00:00Z")
        assertFalse(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals(1000L, balance(f))
    }
    @Test fun `closing stops recurrence and reopening does not bill closed interval`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan()))
        setState(f, "CLOSED"); time.value = Instant.parse("2027-02-03T15:00:00Z")
        assertEquals(1000L, balance(f)); setState(f, "ACTIVE"); assertEquals(1000L, balance(f))
        assertFalse(account(f).getValue("membership").jsonObject.getValue("plan").jsonObject.getValue("recurring").jsonPrimitive.boolean)
    }
    @Test fun `notices have tenant specific acknowledgments and expiry`() {
        val f = fixture(); val other = fixture(); val n = billing.notify(f.tenant, BusinessNotice("Aviso", "Mensaje", expiresOn = "2026-11-03"), id()).str("id")
        billing.acknowledge(f.staff, n); billing.acknowledge(f.staff, n)
        assertTrue(account(f).getValue("notices").jsonArray[0].jsonObject.getValue("read").jsonPrimitive.boolean)
        assertFailsWith<Problem> { billing.acknowledge(other.staff, n) }; assertTrue(account(other).getValue("notices").jsonArray.isEmpty())
        time.value = Instant.parse("2026-11-04T15:00:00Z"); assertTrue(account(f).getValue("notices").jsonArray.isEmpty())
    }
    @Test fun `metrics count repeat buyers distinctly and exclude other businesses`() {
        val f = fixture(); val (member, branch, _) = operational(f)
        service.purchase(f.staff, Purchase(member.id, branch, id(), 1500, "USD"), id()); operational(fixture())
        val m = billing.ownerMetrics(f.staff, 30)
        assertEquals(1, m.getValue("totalClients").jsonPrimitive.int); assertEquals(1, m.getValue("newClients").jsonPrimitive.int)
        assertEquals(2, m.getValue("purchases").jsonPrimitive.int); assertEquals(2500, m.getValue("salesMinor").jsonPrimitive.int)
        assertEquals(100.0, m.getValue("repeatRate").jsonPrimitive.double); assertEquals(JsonNull, m["growthPercent"])
        assertFailsWith<Problem> { billing.metrics(f.tenant, 31) }
    }
    @Test fun `cashiers cannot view account or reports`() {
        val f = fixture(); val branch = service.newBranch(f.staff, NewBranch("A", "A")).str("id")
        val s = service.staff(service.newStaff(f.staff, NewStaff("CASHIER", branch)).str("token"))
        assertEquals(403, assertFailsWith<Problem> { billing.ownerAccount(s) }.status)
        assertEquals(403, assertFailsWith<Problem> { billing.ownerMetrics(s, 30) }.status)
    }
    @Test fun `HTTP platform routes require platform token and owner remains tenant scoped`() = testApplication {
        val f = fixture(); val other = fixture(); charge(other)
        application { loyaltyRoutes(service, "platform-token-for-tests-32-characters", "http://localhost") }
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/platform/tenants").status)
        assertEquals(HttpStatusCode.Unauthorized, client.get("/api/platform/tenants/${other.tenant}/account") { bearerAuth(f.token) }.status)
        assertEquals(HttpStatusCode.OK, client.get("/api/platform/tenants") { bearerAuth("platform-token-for-tests-32-characters") }.status)
        val response = client.get("/api/staff/account?tenantId=${other.tenant}") { bearerAuth(f.token) }
        assertEquals(HttpStatusCode.OK, response.status); assertTrue(json.parseToJsonElement(response.bodyAsText()).jsonObject.getValue("invoices").jsonArray.isEmpty())
        assertEquals(HttpStatusCode.OK, client.get("/platform").status)
        assertTrue(client.get("/").bodyAsText().contains("/commercial.js"))
    }
    @Test fun `economic history cannot be silently updated or removed`() {
        val f = fixture(); val invoice = charge(f); val payment = pay(f, invoice).str("id")
        assertFailsWith<java.sql.SQLException> { db.tx { it.exec("UPDATE billing_invoices SET amount_minor=2000 WHERE tenant_id=? AND id=?", f.tenant, invoice) } }
        assertFailsWith<java.sql.SQLException> { db.tx { it.exec("DELETE FROM billing_payments WHERE tenant_id=? AND id=?", f.tenant, payment) } }
    }
    @Test fun `free memberships never suspend and optimistic access prevents stale changes`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan(0, auto = true)))
        time.value = Instant.parse("2027-01-04T15:00:00Z")
        assertTrue(billing.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        setState(f, "SUSPENDED")
        assertEquals("VERSION_CONFLICT", assertFailsWith<Problem> { billing.changeAccess(f.tenant, AccessChange("ACTIVE", "Viejo", 1)) }.code)
    }
    @Test fun `concurrent distinct payments never overcollect`() {
        val f = fixture(); val invoice = charge(f)
        val results = parallel(2) { pay(f, invoice, 700) }
        assertEquals(1, results.filterIsInstance<JsonObject>().size); assertEquals(300L, balance(f))
    }
    @Test fun `concurrent reversal returns funds to debt once`() {
        val f = fixture(); val p = pay(f, charge(f)).str("id")
        val results = parallel(2) { billing.reverse(f.tenant, p, Correction("Error"), id()) }
        assertEquals(1, results.filterIsInstance<JsonObject>().size); assertEquals(1000L, balance(f))
    }
    @Test fun `concurrent account synchronization emits one recurring charge`() {
        val f = fixture(); billing.configure(f.tenant, MembershipChange(0, plan()))
        time.value = Instant.parse("2026-12-03T15:00:00Z")
        parallel(4) { account(f) }; assertEquals(2, account(f).getValue("invoices").jsonArray.size)
    }
    @Test fun `concurrent suspension finishes before waiting purchase checks access`() {
        val f = fixture(); val (member, branch, _) = operational(f)
        val pool = Executors.newSingleThreadExecutor(); var waiting: Future<Any>? = null
        try {
            db.tx { c ->
                c.one("SELECT tenant_id FROM business_access WHERE tenant_id=? FOR UPDATE", f.tenant) { it.getString(1) }
                waiting = pool.submit<Any> { try { service.purchase(f.staff, Purchase(member.id, branch, id(), 1000, "USD"), id()) } catch (p: Problem) { p } }
                assertFailsWith<TimeoutException> { waiting!!.get(200, TimeUnit.MILLISECONDS) }
                c.exec("UPDATE business_access SET state='SUSPENDED',version=version+1 WHERE tenant_id=?", f.tenant)
            }
            assertEquals("BUSINESS_SUSPENDED", (waiting!!.get(10, TimeUnit.SECONDS) as Problem).code)
        } finally { pool.shutdownNow() }
    }
    private class TestClock(@Volatile var value: Instant, private val zone: ZoneId = ZoneOffset.UTC) : Clock() {
        override fun getZone() = zone
        override fun withZone(zone: ZoneId): Clock = object : Clock() {
            override fun getZone() = zone
            override fun withZone(zone: ZoneId) = this@TestClock.withZone(zone)
            override fun instant() = this@TestClock.instant()
        }
        override fun instant() = value
    }
}
private fun JsonObject.str(key: String) = getValue(key).jsonPrimitive.content
