package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.loyaltyRoutes
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.TestInstance
import java.sql.DriverManager
import java.time.*
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var schema: String
    private lateinit var url: String
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val time = MutableClock(Instant.parse("2026-11-03T15:00:00Z"))
    @BeforeAll fun setup() {
        url = requireNotNull(System.getenv("TEST_DATABASE_URL")) { "TEST_DATABASE_URL is required. No database tests were run." }
        schema = "loyalty_test_" + id().replace("-","")
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db=Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url;username=user;this.password=this@PostgresTest.password;maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt().also { require(it in 1..10) }
            connectionInitSql="SET search_path TO ${this@PostgresTest.schema}";connectionTimeout=10000
        }))
        db.migrate();service=LoyaltyService(db,"test-only-pepper-with-at-least-32-characters",time)
    }
    @AfterAll fun cleanup() {
        if (::db.isInitialized) db.close()
        if (::schema.isInitialized && ::url.isInitialized) DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun fixture(kind: Kind = Kind.POINTS): Fixture {
        val slug="test-"+id().take(12)
        val t=service.createTenant(NewTenant("Prueba",slug));val staff=service.staff(t.str("ownerToken"))
        val a=service.newBranch(staff,NewBranch("A","A")).str("id");val b=service.newBranch(staff,NewBranch("B","B")).str("id")
        val program=service.newProgram(staff,Program("Programa",kind,cashbackBps=500)).str("id")
        val login=service.enroll(slug,Enrollment("Cliente de prueba","TEST12345","test-password-123",true))
        val member=service.member(login.str("token"));val reward=service.saveReward(staff,Reward(program,"Premio",5)).str("id")
        return Fixture(slug,staff,t.str("ownerToken"),a,b,program,member,login.str("token"),reward)
    }
    private fun earn(f: Fixture, receipt: String=id(), amount: Long=1000, branch: String=f.a, key: String=id()) = service.purchase(f.staff,Purchase(f.member.id,branch,receipt,amount,"USD"),key)
    private fun balance(f: Fixture) = service.card(f.member).getValue("balances").jsonArray.firstOrNull { it.jsonObject.str("programId")==f.program }?.jsonObject?.getValue("available")?.jsonPrimitive?.long ?: 0
    private fun parallel(n: Int, action: (Int) -> Any): List<Any> {
        val executor=Executors.newFixedThreadPool(n);val barrier=CyclicBarrier(n)
        return try { (0 until n).map { i -> executor.submit<Any> { barrier.await(10,TimeUnit.SECONDS);try{action(i)}catch(e: Problem){e} } }.map { it.get(30,TimeUnit.SECONDS) } } finally {executor.shutdownNow()}
    }
    @Test fun `one card across branches and repeated enrollment never steals account`() {
        val f=fixture();earn(f,branch=f.a);earn(f,branch=f.b);assertEquals(20L,balance(f))
        assertEquals(f.member.id,service.member(service.login(f.slug,Login("TEST12345","test-password-123")).str("token")).id)
        assertFailsWith<Problem>{service.enroll(f.slug,Enrollment("Intruso","TEST12345","another-password-123",true))}
    }
    @Test fun `concurrent duplicate purchase credits exactly once`() {
        val f=fixture();val responses=parallel(8){earn(f,receipt="invoice-1",key="same-request-key")}
        assertTrue(responses.all{it is JsonObject});assertEquals(1,responses.filterIsInstance<JsonObject>().map{it.str("purchaseId")}.distinct().size);assertEquals(10L,balance(f))
    }
    @Test fun `receipt uniqueness survives different idempotency keys and cashiers`() {
        val f=fixture();earn(f,receipt="invoice-2")
        val p=assertFailsWith<Problem>{earn(f,receipt=" INVOICE-2 ")};assertEquals("DUPLICATE_RECEIPT",p.code);assertEquals(10L,balance(f))
    }
    @Test fun `idempotency key cannot be reused with changed body`() {
        val f=fixture();earn(f,receipt="a",key="fixed-key-123")
        assertEquals("IDEMPOTENCY_CONFLICT",assertFailsWith<Problem>{earn(f,receipt="b",key="fixed-key-123")}.code)
    }
    @Test fun `isolates members programs rewards and branches across tenants`() {
        val a=fixture();val b=fixture()
        assertFailsWith<Problem>{service.purchase(a.staff,Purchase(b.member.id,a.a,"x",1000,"USD"),id())}
        assertFailsWith<Problem>{service.purchase(a.staff,Purchase(a.member.id,b.a,"x",1000,"USD"),id())}
        assertFailsWith<Problem>{service.reserve(a.member,Reserve(b.reward),id())}
        assertFailsWith<Problem>{service.lookup(a.staff,Lookup(cardCode=service.card(b.member).getValue("member").jsonObject.str("cardCode")))}
    }
    @Test fun `concurrent reservations never overspend and confirm consumes once`() {
        val f=fixture();earn(f,amount=500)
        val reservations=parallel(8){service.reserve(f.member,Reserve(f.reward),id())}
        assertEquals(1,reservations.count{it is JsonObject});assertEquals(0L,balance(f))
        val hold=reservations.filterIsInstance<JsonObject>().single()
        val confirmed=parallel(8){service.confirm(f.staff,Confirm(hold.str("token"),f.b),id())}
        assertEquals(1,confirmed.count{it is JsonObject});assertEquals(7,confirmed.count{it is Problem});assertEquals(0L,balance(f))
    }
    @Test fun `confirm retries return original receipt and cancel cannot refund delivered prize`() {
        val f=fixture();earn(f);val hold=service.reserve(f.member,Reserve(f.reward),id())
        val input=Confirm(hold.str("token"),f.a);val result=service.confirm(f.staff,input,"confirm-key-123")
        val replay=service.confirm(f.staff,input,"confirm-key-123");assertEquals(result.str("receipt"),replay.str("receipt"));assertTrue(replay.getValue("replayed").jsonPrimitive.boolean)
        assertFailsWith<Problem>{service.cancel(f.member,hold.str("id"),id())};assertEquals(5L,balance(f))
    }
    @Test fun `cancellation and expiry refund once`() {
        val f=fixture();earn(f);val hold=service.reserve(f.member,Reserve(f.reward),id())
        service.cancel(f.member,hold.str("id"),id());service.cancel(f.member,hold.str("id"),id());assertEquals(10L,balance(f))
        val expired=service.reserve(f.member,Reserve(f.reward),id());time.value=time.value.plusSeconds(301)
        try {
            assertFailsWith<Problem>{service.confirm(f.staff,Confirm(expired.str("token"),f.a),id())}
            service.expireBatch();service.expireBatch();assertEquals(10L,balance(f))
        } finally {time.value=time.value.minusSeconds(301)}
    }
    @Test fun `concurrent cancel versus confirm has one outcome`() {
        val f=fixture();earn(f,amount=500);val hold=service.reserve(f.member,Reserve(f.reward),id())
        parallel(2){if(it==0)service.cancel(f.member,hold.str("id"),id()) else service.confirm(f.staff,Confirm(hold.str("token"),f.b),id())}
        val status=service.card(f.member).getValue("redemptions").jsonArray.single().jsonObject.str("status")
        assertTrue(status in setOf("CANCELLED","CONSUMED"));assertEquals(if(status=="CANCELLED")5L else 0L,balance(f))
    }
    @Test fun `version change preserves old earnings and old reservations`() {
        val f=fixture();earn(f);val hold=service.reserve(f.member,Reserve(f.reward),id())
        service.editProgram(f.staff,f.program,ProgramChange(1,Program("Doble",Kind.POINTS,pointsPerUnit=2)))
        service.saveReward(f.staff,Reward(f.program,"Premio nuevo",100,false),f.reward,1)
        earn(f);assertEquals(25L,balance(f));assertEquals("CONSUMED",service.confirm(f.staff,Confirm(hold.str("token"),f.b),id()).str("status"))
        assertFailsWith<Problem>{service.editProgram(f.staff,f.program,ProgramChange(1,Program("Obsoleto",Kind.POINTS)))}
        assertFailsWith<Problem>{service.editProgram(f.staff,f.program,ProgramChange(2,Program("Sellos",Kind.STAMPS)))}
    }
    @Test fun `cashier scope and revocation are enforced`() {
        val f=fixture();val key=service.newStaff(f.staff,NewStaff("CASHIER",f.a));val cashier=service.staff(key.str("token"))
        assertFailsWith<Problem>{service.newProgram(cashier,Program("P",Kind.POINTS))}
        assertFailsWith<Problem>{service.purchase(cashier,Purchase(f.member.id,f.b,"x",500,"USD"),id())}
        service.revokeStaff(f.staff,key.str("id"));assertFailsWith<Problem>{service.staff(key.str("token"))}
    }
    @Test fun `migration is repeatable and financial history rejects mutations`() {
        db.migrate(); db.tx { it.exec("UPDATE comeback_migrations SET checksum=? WHERE version=1", SqlFingerprint.LEGACY_V001_SHA256) }; db.migrate();val f=fixture();earn(f)
        assertFailsWith<java.sql.SQLException>{db.tx{it.exec("UPDATE ledger SET delta=999 WHERE tenant_id=?",f.staff.tenant)}}
        assertEquals(10L,balance(f))
    }
    @Test fun `insufficient reservation rolls back redemption ledger and outbox`() {
        val f=fixture();assertFailsWith<Problem>{service.reserve(f.member,Reserve(f.reward),id())}
        assertTrue(service.card(f.member).getValue("redemptions").jsonArray.isEmpty());assertEquals(0L,balance(f))
        val count=db.tx{it.one("SELECT count(*) FROM ledger WHERE tenant_id=?",f.staff.tenant){r->r.getInt(1)}}
        assertEquals(0,count)
    }
    @Test fun `http authentication input validation safe errors QR and wallet pending`() = testApplication {
        environment { config=MapApplicationConfig() }
        application { loyaltyRoutes(service,"platform-test-token-long-enough-12345","http://localhost:8080") }
        val f=fixture()
        assertEquals(HttpStatusCode.OK,client.get("/health/live").status)
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/dashboard").status)
        val dashboard=client.get("/api/staff/dashboard"){bearerAuth(f.ownerToken)}
        assertEquals(HttpStatusCode.OK,dashboard.status)
        assertEquals(HttpStatusCode.OK,client.get("/api/me/qr"){bearerAuth(f.memberToken)}.status)
        assertEquals(HttpStatusCode.ServiceUnavailable,client.get("/api/me/wallet/apple"){bearerAuth(f.memberToken)}.status)
        val bad=client.post("/api/staff/purchases"){bearerAuth(f.ownerToken);contentType(ContentType.Application.Json);setBody("{}")}
        assertEquals(HttpStatusCode.BadRequest,bad.status);assertFalse(bad.bodyAsText().contains("SQLException"))
        assertEquals(HttpStatusCode.Forbidden,client.post("/api/me/logout"){bearerAuth(f.memberToken);header("Origin","https://evil.invalid")}.status)
    }
    @Test fun `rate limit persists and reports explicit rejection`() { val key=id();repeat(2){service.rateLimit(key,2)};assertEquals(429,assertFailsWith<Problem>{service.rateLimit(key,2)}.status) }
    data class Fixture(val slug:String,val staff:Staff,val ownerToken:String,val a:String,val b:String,val program:String,val member:Member,val memberToken:String,val reward:String)
    class MutableClock(@Volatile var value:Instant):Clock(){override fun getZone()=ZoneOffset.UTC;override fun withZone(zone:ZoneId)=this;override fun instant()=value}
}
private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
