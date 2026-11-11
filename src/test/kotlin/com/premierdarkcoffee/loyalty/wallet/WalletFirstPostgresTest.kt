package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.application.web
import com.premierdarkcoffee.loyalty.billing.AccessChange
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Enrollment
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Login
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.presentation.appleActivityFields

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
class WalletFirstPostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var schema: String
    private val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val clock = FlowClock()
    @BeforeAll fun setup() {
        schema = "wallet_first_" + id().replace("-", "")
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url; username=user; this.password=this@WalletFirstPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt()
            connectionInitSql="SET search_path TO ${this@WalletFirstPostgresTest.schema}"
        }))
        db.migrate(); service=LoyaltyService(db,"wallet-first-test-identity-pepper-32chars",clock)
    }
    @AfterAll fun cleanup() {
        if (::db.isInitialized) db.close()
        if (::schema.isInitialized) DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private data class Fixture(val slug:String,val owner:String,val staff:Staff,val a:String,val b:String,val program:String,val reward:String,val member:Member,val token:String)
    private fun fixture(kind:Kind=Kind.POINTS):Fixture {
        val slug="first-"+id().take(12);val t=service.createTenant(NewTenant("Negocio",slug));val staff=service.staff(t.str("ownerToken"))
        val a=service.newBranch(staff,NewBranch("Centro","A")).str("id");val b=service.newBranch(staff,NewBranch("Norte","B")).str("id")
        val program=service.newProgram(staff,Program("Programa",kind,cashbackBps=500)).str("id")
        val r=service.enrollWithoutPassword(slug,WalletEnrollment("Ana","DEMO10001",true));val member=service.member(r.str("token"))
        val reward=service.saveReward(staff,Reward(program,"Premio",5)).str("id")
        return Fixture(slug,t.str("ownerToken"),staff,a,b,program,reward,member,r.str("token"))
    }
    private fun earn(f:Fixture, amount:Long=2000)=service.purchase(f.staff,Purchase(f.member.id,f.a,id(),amount,"USD"),id())
    private fun card(f:Fixture)=service.card(f.member)
    private fun balance(f:Fixture)=card(f).getValue("balances").jsonArray.firstOrNull{it.jsonObject.str("programId")==f.program}?.jsonObject?.getValue("available")?.jsonPrimitive?.long ?: 0L
    private fun request(f:Fixture)=CounterRedemption(f.member.id,f.b,f.reward,card(f).getValue("member").jsonObject.getValue("revision").jsonPrimitive.long,1,true,true)
    private fun issue(f:Fixture)=service.issueRestore(f.staff,RestoreIssue(f.member.id,"DEVICE_CHANGE",true)).str("path").substringAfter("#restore=")
    private fun count(table:String,f:Fixture)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.staff.tenant){it.getLong(1)}!!}
    private fun parallel(n:Int, action:()->JsonObject):List<Any> {
        val pool=Executors.newFixedThreadPool(n);val barrier=CyclicBarrier(n)
        return try{(1..n).map{pool.submit<Any>{barrier.await(10,TimeUnit.SECONDS);try{action()}catch(p:Problem){p}}}.map{it.get(30,TimeUnit.SECONDS)}}finally{pool.shutdownNow()}
    }
    @Test fun `registration stores no password and document alone never retrieves card`() {
        val f=fixture()
        assertNull(db.tx{c->c.one("SELECT password_hash FROM members WHERE tenant_id=? AND id=?",f.staff.tenant,f.member.id){it.getString(1)}})
        assertEquals(401,assertFailsWith<Problem>{service.login(f.slug,Login("DEMO10001","dummy-password-never-used"))}.status)
        assertEquals(409,assertFailsWith<Problem>{service.enrollWithoutPassword(f.slug,WalletEnrollment("Otro"," demo10001 ",true))}.status)
        assertEquals(1,count("members",f));assertEquals(1,count("member_sessions",f))
    }
    @Test fun `same document creates independent memberships in different businesses`() {
        val a=fixture();val b=fixture();assertNotEquals(a.member.id,b.member.id)
        assertNotEquals(card(a).getValue("member").jsonObject.str("cardCode"),card(b).getValue("member").jsonObject.str("cardCode"))
        earn(a);assertEquals(20L,balance(a));assertEquals(0L,balance(b))
    }
    @Test fun `concurrent registration grants exactly one enrollment session`() {
        val t=service.createTenant(NewTenant("Concurrente","parallel-"+id().take(12)));val slug=t.str("enrollmentPath").substringAfterLast('/')
        val results=parallel(6){service.enrollWithoutPassword(slug,WalletEnrollment("Ana","0001234567",true))}
        assertEquals(1,results.count{it is JsonObject});assertEquals(5,results.filterIsInstance<Problem>().count{it.status==409})
    }
    @Test fun `counter redeem works across branches without customer login`() {
        val f=fixture();earn(f);service.logout(f.token)
        val result=service.redeemAtCounter(f.staff,request(f),id())
        assertEquals("CONSUMED",result.str("status"));assertEquals(f.b,result.str("branchId"));assertEquals(15L,balance(f))
        assertEquals(1,count("redemptions",f));assertEquals(2,count("ledger",f))
    }
    @Test fun `identical retry across staff returns original receipt with no second debit`() {
        val f=fixture();earn(f);val input=request(f);val key=id()
        val first=service.redeemAtCounter(f.staff,input,key)
        val other=service.staff(service.newStaff(f.staff,NewStaff("CASHIER",f.b)).str("token"))
        val replay=service.redeemAtCounter(other,input,key)
        assertEquals(first.str("receipt"),replay.str("receipt"));assertTrue(replay.getValue("replayed").jsonPrimitive.boolean);assertEquals(15L,balance(f))
        assertEquals("IDEMPOTENCY_CONFLICT",assertFailsWith<Problem>{service.redeemAtCounter(f.staff,input.copy(branchId=f.a),key)}.code)
    }
    @Test fun `different retry keys cannot redeem stale card even with enough balance`() {
        val f=fixture();earn(f);val input=request(f);service.redeemAtCounter(f.staff,input,id())
        assertEquals("CARD_CHANGED",assertFailsWith<Problem>{service.redeemAtCounter(f.staff,input,id())}.code);assertEquals(15L,balance(f))
    }
    @Test fun `concurrent counter requests with different keys produce one debit`() {
        val f=fixture();earn(f);val input=request(f)
        val results=parallel(8){service.redeemAtCounter(f.staff,input,id())}
        assertEquals(1,results.count{it is JsonObject});assertEquals(7,results.filterIsInstance<Problem>().count{it.code=="CARD_CHANGED"});assertEquals(15L,balance(f))
    }
    @Test fun `insufficient balance rolls back receipt history and notification`() {
        val f=fixture();val before=count("wallet_outbox",f)
        assertEquals("INSUFFICIENT_BALANCE",assertFailsWith<Problem>{service.redeemAtCounter(f.staff,request(f),id())}.code)
        assertEquals(0,count("redemptions",f));assertEquals(0,count("ledger",f));assertEquals(before,count("wallet_outbox",f))
    }
    @Test fun `edited or inactive reward requires renewed review`() {
        val f=fixture();earn(f);val input=request(f)
        service.saveReward(f.staff,Reward(f.program,"Premio nuevo",7),f.reward,1)
        assertEquals("REWARD_CHANGED",assertFailsWith<Problem>{service.redeemAtCounter(f.staff,input,id())}.code)
        service.saveReward(f.staff,Reward(f.program,"Premio nuevo",7,false),f.reward,2)
        assertEquals(404,assertFailsWith<Problem>{service.redeemAtCounter(f.staff,input.copy(expectedRewardVersion=3),id())}.status);assertEquals(20L,balance(f))
    }
    @Test fun `tenant and branch isolation applies to counter redemption`() {
        val a=fixture();val b=fixture();earn(a)
        assertFailsWith<Problem>{service.redeemAtCounter(a.staff,request(a).copy(memberId=b.member.id),id())}
        assertFailsWith<Problem>{service.redeemAtCounter(a.staff,request(a).copy(rewardId=b.reward),id())}
        val cashier=service.staff(service.newStaff(a.staff,NewStaff("CASHIER",a.a)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.redeemAtCounter(cashier,request(a),id())}.status);assertEquals(20L,balance(a))
    }
    @Test fun `suspension and missing customer confirmation block counter operations`() {
        val f=fixture();earn(f)
        assertEquals("CUSTOMER_CONFIRMATION_REQUIRED",assertFailsWith<Problem>{service.redeemAtCounter(f.staff,request(f).copy(identityVerified=false),id())}.code)
        assertFailsWith<Problem>{service.redeemAtCounter(f.staff,request(f).copy(customerConfirmed=false),id())}
        service.commercial.changeAccess(f.staff.tenant,AccessChange("SUSPENDED","Prueba",1))
        assertFailsWith<Problem>{service.redeemAtCounter(f.staff,request(f),id())}
        assertFailsWith<Problem>{service.enrollWithoutPassword(f.slug,WalletEnrollment("Otro","DEMO10003",true))}
        assertFailsWith<Problem>{issue(f)};assertEquals(20L,balance(f))
    }
    @Test fun `cashback and stamps preserve independent units during redemption`() {
        val cash=fixture(Kind.CASHBACK);earn(cash);service.redeemAtCounter(cash.staff,request(cash),id());assertEquals(95L,balance(cash))
        val stamps=fixture(Kind.STAMPS);repeat(6){earn(stamps)};service.redeemAtCounter(stamps.staff,request(stamps),id());assertEquals(1L,balance(stamps))
    }
    @Test fun `recovery requires owner verified identity and correct tenant`() {
        val f=fixture();val other=fixture();val cashier=service.staff(service.newStaff(f.staff,NewStaff("CASHIER",f.a)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.issueRestore(cashier,RestoreIssue(f.member.id,"DEVICE_CHANGE",true))}.status)
        assertFailsWith<Problem>{service.issueRestore(f.staff,RestoreIssue(f.member.id,"DEVICE_CHANGE",false))}
        assertFailsWith<Problem>{service.issueRestore(f.staff,RestoreIssue(other.member.id,"DEVICE_CHANGE",true))}
        assertFailsWith<Problem>{service.issueRestore(f.staff,RestoreIssue(f.member.id,"OTHER",true))}
    }
    @Test fun `single use recovery keeps membership balance and stable Wallet identity`() {
        val f=fixture();earn(f)
        val wallet=WalletService(service,"https://example.com",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){9})))
        val before=wallet.materialize(f.member);val token=issue(f)
        assertEquals(Security.hash(token),db.tx{c->c.one("SELECT token_hash FROM member_restore_links WHERE tenant_id=?",f.staff.tenant){it.getString(1)}})
        val result=service.useRestore(f.slug,RestoreUse(token));assertEquals(f.member,service.member(result.str("token")))
        assertFailsWith<Problem>{service.member(f.token)};assertEquals(410,assertFailsWith<Problem>{service.useRestore(f.slug,RestoreUse(token))}.status)
        val after=wallet.materialize(f.member);assertEquals(before.serial,after.serial);assertEquals(before.token,after.token);assertEquals(20L,balance(f));assertEquals(1,count("members",f))
    }
    @Test fun `recovery expiry replacement and wrong business cannot release session`() {
        val f=fixture();val old=issue(f);val current=issue(f)
        assertFailsWith<Problem>{service.useRestore(f.slug,RestoreUse(old))}
        assertFailsWith<Problem>{service.useRestore(fixture().slug,RestoreUse(current))}
        clock.time=clock.time.plusSeconds(301)
        assertEquals(410,assertFailsWith<Problem>{service.useRestore(f.slug,RestoreUse(current))}.status)
        assertEquals(1,count("member_sessions",f))
    }
    @Test fun `concurrent recovery admits exactly one use`() {
        val f=fixture();val token=issue(f)
        val results=parallel(6){service.useRestore(f.slug,RestoreUse(token))}
        assertEquals(1,results.count{it is JsonObject});assertEquals(5,results.filterIsInstance<Problem>().count{it.status==410});assertEquals(1,count("member_sessions",f))
    }
    @Test fun `pass contains recent purchases and canjes without documents or web instructions`() {
        val f=fixture();earn(f);service.redeemAtCounter(f.staff,request(f),id())
        val wallet=WalletService(service,"https://example.com",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){9})))
        val pass=wallet.materialize(f.member)
                val movements = pass.snapshot.getValue("recentActivity").jsonArray.map { it.jsonObject }
        assertEquals(2,movements.size)
        assertEquals("Centro", movements.single { it.str("kind") == "PURCHASE" }.str("branch"))
        assertEquals("Norte", movements.single { it.str("kind") == "REDEMPTION" }.str("branch"))
        assertTrue(pass.recentActivity().contains("Compra: 20.00 USD"));assertTrue(pass.recentActivity().contains("Canje: Premio"))
        for(content in listOf(pass.appleJson("pass.test","TEAM","https://example.com"),pass.googleJson("123.abc","123.def","https://example.com"))) {
                        assertFalse(content.toString().contains("DEMO10001"));assertFalse(content.toString().contains("genera un código"));assertTrue(content.toString().contains("Premio"))
        }
        val details = pass.appleActivityFields()
        assertTrue(details.any { it.str("label").startsWith("CANJE") && it.str("value") == "Premio\nSucursal: Norte" })
        assertTrue(details.any { it.str("label").startsWith("COMPRA") && it.str("value") == "20.00 USD\nSucursal: Centro" })
    }
    @Test fun `new migration is repeatable and keeps legacy login compatible`() {
        val f=fixture();db.migrate();assertEquals(14,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations"){it.getInt(1)}})
        val legacy=service.enroll(f.slug,Enrollment("Legacy","LEGACY123","test-password-123",true))
        assertEquals(service.member(legacy.str("token")),service.member(service.login(f.slug,Login("LEGACY123","test-password-123")).str("token")))
        assertEquals(2,count("members",f))
    }
    @Test fun `HTTP onboarding and counter enforce roles origins and no document login`() = testApplication {
        environment { config=MapApplicationConfig() }; application { loyaltyRoutes(service,"p".repeat(40),"http://localhost") }
        val f=fixture();earn(f)
        val joined=client.post("/api/public/${f.slug}/join"){contentType(ContentType.Application.Json);setBody("""{"name":"Nuevo","document":"DEMO10009","acceptedTerms":true}""")}
        assertEquals(HttpStatusCode.Created,joined.status)
        val session=json.parseToJsonElement(joined.bodyAsText()).jsonObject.str("token")
        assertEquals(HttpStatusCode.Unauthorized,client.post("/api/staff/counter-redemptions"){bearerAuth(session);contentType(ContentType.Application.Json);setBody(json.encodeToString(request(f)))}.status)
        assertEquals(HttpStatusCode.Forbidden,client.post("/api/public/${f.slug}/join"){header(HttpHeaders.Origin,"https://other.example");contentType(ContentType.Application.Json);setBody("{}")}.status)
        val redeemed=client.post("/api/staff/counter-redemptions"){bearerAuth(f.owner);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(json.encodeToString(request(f)))}
        assertEquals(HttpStatusCode.OK,redeemed.status)
        assertEquals(HttpStatusCode.Unauthorized,client.post("/api/staff/wallet/restore"){contentType(ContentType.Application.Json);setBody("{}")}.status)
        assertTrue(client.get("/join/${f.slug}").bodyAsText().contains("/scanner.js"))
    }
    private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
    private class FlowClock(var time:Instant=Instant.parse("2026-11-03T15:00:00Z")):Clock() {
        override fun getZone():ZoneId=ZoneOffset.UTC
        override fun withZone(zone:ZoneId):Clock=this
        override fun instant():Instant=time
    }
}
