package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.loyaltyRoutes
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
import java.time.*
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WalletPostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var wallet: WalletService
    private lateinit var schema: String
    private lateinit var url: String
    private lateinit var apple: TestApple
    private lateinit var google: TestGoogle
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val time = TestClock(Instant.parse("2026-11-03T15:00:00Z"))
    private val encryptionKey = Base64.getEncoder().encodeToString(ByteArray(32) { 7 })
    private val origin = "https://wallet.example.com"
    @BeforeAll fun setup() {
        url = requireNotNull(System.getenv("TEST_DATABASE_URL")); schema = "wallet_test_" + id().replace("-", "")
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url; username=user; this.password=this@WalletPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt();connectionInitSql="SET search_path TO ${this@WalletPostgresTest.schema}"
        }))
        db.migrate();service=LoyaltyService(db,"wallet-test-only-pepper-32-characters",time)
    }
    @BeforeEach fun reset() {
        time.value=Instant.parse("2026-11-03T15:00:00Z");apple=TestApple();google=TestGoogle();device="device-"+id()
        wallet=WalletService(service,origin,WalletCipher(encryptionKey),apple,google,emptyList());service.wallets=wallet
    }
    @AfterAll fun cleanup() {
        if(::db.isInitialized)db.close()
        if(::schema.isInitialized)DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private data class Fixture(val staff:Staff,val owner:String,val member:Member,val token:String,val branch:String,val program:String)
    private fun fixture():Fixture {
        val slug="wallet-"+id().take(12);val tenant=service.createTenant(NewTenant("Negocio Wallet",slug,timezone="UTC"));val owner=tenant.str("ownerToken");val staff=service.staff(owner)
        val branch=service.newBranch(staff,NewBranch("Principal","P01")).str("id");val program=service.newProgram(staff,Program("Puntos",Kind.POINTS)).str("id")
        val login=service.enroll(slug,Enrollment("Cliente","ID123456","test-password-123",true));return Fixture(staff,owner,service.member(login.str("token")),login.str("token"),branch,program)
    }
    private fun earn(f:Fixture)=service.purchase(f.staff,Purchase(f.member.id,f.branch,id(),1000,"USD"),id())
    private fun count(sql:String,vararg args:Any?)=db.tx { c->c.one(sql,*args){it.getLong(1)}!! }
    private lateinit var device: String
    private val push="a".repeat(64)
    private fun register(p:WalletPass,device:String=this.device,token:String=push)=wallet.register(device,apple.passType,p.serial,p.token,token)
    private fun parallel(n:Int,action:()->WalletPass):List<WalletPass> {
        val pool=Executors.newFixedThreadPool(n);val barrier=CyclicBarrier(n)
        return try{(1..n).map{pool.submit<WalletPass>{barrier.await(10,TimeUnit.SECONDS);action()}}.map{it.get(30,TimeUnit.SECONDS)}}finally{pool.shutdownNow()}
    }
    @Test fun `one stable pass across branches providers and repeated issuance`() {
        val f=fixture();val first=wallet.materialize(f.member,"apple");val again=wallet.materialize(f.member,"apple")
        assertEquals(first.serial,again.serial);assertEquals(first.token,again.token);assertEquals(first.tag,again.tag)
        service.newBranch(f.staff,NewBranch("Otra","P02"));val googlePass=wallet.materialize(f.member,"google")
        assertEquals(first.serial,googlePass.serial);assertEquals(first.token,googlePass.token)
        assertEquals(1,count("SELECT count(*) FROM wallet_passes WHERE tenant_id=?",f.staff.tenant))
    }
    @Test fun `registration retry changes push token without duplicating registration`() {
        val p=wallet.materialize(fixture().member,"apple")
        assertTrue(register(p));assertFalse(register(p,token="b".repeat(64)))
        assertEquals(1,count("SELECT count(*) FROM wallet_apple_registrations WHERE serial=?",p.serial))
        val cipher=db.tx { c->c.one("SELECT push_cipher FROM wallet_apple_registrations WHERE serial=?",p.serial){it.getString(1)}!! }
        assertFalse(cipher.contains(push));assertEquals("b".repeat(64),WalletCipher(encryptionKey).decrypt(cipher,"push:${Security.hash(device)}:${p.serial}"))
    }
    @Test fun `pass tokens cannot authorize another tenant or customer session`() {
        val a=fixture();val p=wallet.materialize(a.member,"apple");val q=wallet.materialize(fixture().member,"apple")
        assertEquals(401,assertFailsWith<Problem>{wallet.register(device,apple.passType,q.serial,p.token,push)}.status)
        assertEquals(401,assertFailsWith<Problem>{service.member(p.token)}.status)
        val code=service.card(a.member).getValue("member").jsonObject.str("cardCode")
        assertEquals(401,assertFailsWith<Problem>{wallet.authenticatedPass(apple.passType,p.serial,code)}.status)
    }
    @Test fun `update cursor returns committed changes and omits unchanged passes`() {
        val f=fixture();val p=wallet.materialize(f.member,"apple");register(p)
        val first=wallet.updates(device,apple.passType,null)!!;assertTrue(first.getValue("serialNumbers").jsonArray.contains(JsonPrimitive(p.serial)))
        assertNull(wallet.updates(device,apple.passType,first.str("lastUpdated")))
        earn(f);val updated=wallet.materialize(f.member);assertTrue(updated.tag>p.tag)
        assertEquals(updated.tag.toString(),wallet.updates(device,apple.passType,first.str("lastUpdated"))!!.str("lastUpdated"))
        assertFailsWith<Problem>{wallet.updates(device,apple.passType,"invalid")}
    }
    @Test fun `download ticket is short lived and safe for browser repeat downloads`() {
        val f=fixture();val link=wallet.appleLink(f.member);val ticket=link.str("url").substringAfterLast('/')
        assertTrue(wallet.ticketBytes(ticket).isNotEmpty());assertTrue(wallet.ticketBytes(ticket).isNotEmpty())
        val p=wallet.materialize(f.member);assertNotEquals(p.token,ticket)
        time.value=time.value.plusSeconds(121);assertEquals(404,assertFailsWith<Problem>{wallet.ticketBytes(ticket)}.status)
    }
    @Test fun `changing data key cannot recreate or silently replace pass secrets`() {
        val f=fixture();val p=wallet.materialize(f.member,"apple")
        val other=WalletService(service,origin,WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){8})),apple,google)
        assertEquals("WALLET_KEY_MISMATCH",assertFailsWith<Problem>{other.materialize(f.member,"apple")}.code)
        assertEquals(p.token,wallet.materialize(f.member).token)
    }
    @Test fun `suspension and renamed program update card without exposing business debt`() {
        val f=fixture();earn(f);val p=wallet.materialize(f.member,"apple")
        service.editProgram(f.staff,f.program,ProgramChange(1,Program("Nuevo nombre",Kind.POINTS)))
        service.commercial.changeAccess(f.staff.tenant,AccessChange("SUSPENDED","Deuda privada del negocio",1))
        val updated=wallet.materialize(f.member);assertTrue(updated.tag>p.tag);assertFalse(updated.snapshot.getValue("canOperate").jsonPrimitive.boolean)
        assertTrue(updated.summary().contains("Nuevo nombre"));assertFalse(updated.snapshot.toString().contains("Deuda privada"));assertEquals(p.token,updated.token)
    }
    @Test fun `Google failure keeps retry work and does not create duplicate identities`() {
        val f=fixture();google.fail=true
        assertEquals(503,assertFailsWith<Problem>{wallet.googleLink(f.member)}.status)
        val first=wallet.materialize(f.member);assertEquals(1,count("SELECT attempts FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",first.serial))
        google.fail=false;val link=wallet.googleLink(f.member);assertTrue(link.str("url").contains(first.googleId!!));assertEquals(first.serial,wallet.materialize(f.member).serial)
    }
    @Test fun `provider outage does not block purchases or another tenant`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");google.fail=true
        assertFalse(wallet.deliver(p.serial,"GOOGLE",true));earn(f);val other=fixture();earn(other)
        assertEquals(10,service.card(f.member).getValue("balances").jsonArray[0].jsonObject.getValue("available").jsonPrimitive.int)
        assertEquals(10,service.card(other.member).getValue("balances").jsonArray[0].jsonObject.getValue("available").jsonPrimitive.int)
    }
    @Test fun `invalid APNs token removes its registration while other device stays`() {
        val p=wallet.materialize(fixture().member,"apple");register(p);register(p,"second-device-library-identifier","b".repeat(64))
        apple.invalid=push;assertTrue(wallet.deliver(p.serial,"APPLE",true))
        assertEquals(1,count("SELECT count(*) FROM wallet_apple_registrations WHERE serial=?",p.serial))
        assertNull(wallet.updates(device,apple.passType,null));assertNotNull(wallet.updates("second-device-library-identifier",apple.passType,null))
    }
    @Test fun `HTTP Apple registration authorization update and removal follow protocol`() = testApplication {
        val f=fixture();val p=wallet.materialize(f.member,"apple")
        application { loyaltyRoutes(service,"platform-only-token-32-characters",origin) }
        val route="/wallet/apple/v1/devices/$device/registrations/${apple.passType}/${p.serial}"
        assertEquals(HttpStatusCode.Unauthorized,client.post(route){contentType(ContentType.Application.Json);setBody("{\"pushToken\":\"$push\"}")}.status)
        for(expected in listOf(HttpStatusCode.Created,HttpStatusCode.OK))assertEquals(expected,client.post(route){header(HttpHeaders.Authorization,"ApplePass ${p.token}");contentType(ContentType.Application.Json);setBody("{\"pushToken\":\"$push\"}")}.status)
        val response=client.get("/wallet/apple/v1/passes/${apple.passType}/${p.serial}"){header(HttpHeaders.Authorization,"ApplePass ${p.token}")}
        assertEquals(HttpStatusCode.OK,response.status);assertTrue(response.headers[HttpHeaders.ContentType]!!.contains("application/vnd.apple.pkpass"));assertNotNull(response.headers[HttpHeaders.LastModified])
        assertEquals(HttpStatusCode.OK,client.delete(route){header(HttpHeaders.Authorization,"ApplePass ${p.token}")}.status)
        assertEquals(HttpStatusCode.NoContent,client.get("/wallet/apple/v1/devices/$device/registrations/${apple.passType}").status)
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/platform/wallet/status"){bearerAuth(f.owner)}.status)
    }
    @Test fun `expired download tickets are cleaned while active links survive`() {
        val f=fixture();wallet.appleLink(f.member);time.value=time.value.plusSeconds(121);wallet.appleLink(f.member);wallet.sweep()
        assertEquals(1,count("SELECT count(*) FROM wallet_download_tickets t JOIN wallet_passes p ON p.serial=t.serial WHERE p.tenant_id=?",f.staff.tenant))
    }
    @Test fun `outbox materialization does not falsely mark failed provider as sent`() {
        val f=fixture();earn(f);val p=wallet.materialize(f.member,"google");google.fail=true;wallet.deliver(p.serial,"GOOGLE",true)
        assertTrue(count("SELECT count(*) FROM wallet_outbox WHERE tenant_id=? AND state='PENDING' AND materialized_at IS NOT NULL",f.staff.tenant)>0)
        google.fail=false;wallet.deliver(p.serial,"GOOGLE",true)
        assertEquals(0,count("SELECT count(*) FROM wallet_outbox WHERE tenant_id=? AND state='PENDING'",f.staff.tenant))
    }
    @Test fun `concurrent issuance creates exactly one serial and authentication token`() {
        val f=fixture();val passes=parallel(4){wallet.materialize(f.member,"apple")}
        assertEquals(1,passes.map{it.serial}.distinct().size);assertEquals(1,passes.map{it.token}.distinct().size)
    }
    @Test fun `concurrent provider response cannot acknowledge a newer queued update`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val entered=CountDownLatch(1);val release=CountDownLatch(1)
        google.callback={entered.countDown();check(release.await(10,TimeUnit.SECONDS))}
        val pool=Executors.newSingleThreadExecutor()
        try {
            val result=pool.submit<Boolean>{wallet.deliver(p.serial,"GOOGLE",true)};assertTrue(entered.await(5,TimeUnit.SECONDS))
            earn(f);val newer=wallet.materialize(f.member);assertTrue(newer.tag>p.tag)
            release.countDown();assertTrue(result.get(10,TimeUnit.SECONDS))
            assertTrue(count("SELECT sent_tag FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial)<newer.tag)
            google.callback=null;assertTrue(wallet.deliver(p.serial,"GOOGLE"));assertEquals(newer.tag,count("SELECT sent_tag FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial))
        }finally{release.countDown();pool.shutdownNow()}
    }
    @Test fun `concurrent passes use distinct ordered update tags visible to one device`() {
        val members=(1..4).map{fixture().member};val pool=Executors.newFixedThreadPool(4)
        try {
            val passes=members.map{member->pool.submit<WalletPass>{wallet.materialize(member,"apple")}}.map{it.get(20,TimeUnit.SECONDS)}
            assertEquals(4,passes.map{it.tag}.distinct().size);passes.forEach{register(it)}
            val latest=wallet.updates(device,apple.passType,null)!!;assertEquals(passes.maxOf{it.tag}.toString(),latest.str("lastUpdated"))
            assertTrue(latest.getValue("serialNumbers").jsonArray.map{it.jsonPrimitive.content}.containsAll(passes.map{it.serial}))
        }finally{pool.shutdownNow()}
    }
    @Test fun `presentation upgrade refreshes installed card without changing its money or identity`() {
        val f=fixture();earn(f)
        wallet.materialize(f.member,"apple")
        val initial=wallet.materialize(f.member,"google");register(initial)
        val balances=service.card(f.member).getValue("balances")
        db.tx { c -> c.exec("UPDATE wallet_passes SET snapshot=jsonb_set(snapshot,'{presentationVersion}','8'::jsonb) WHERE serial=?",initial.serial) }
        time.value=time.value.plusSeconds(1)
        val upgraded=wallet.materialize(f.member)
        assertTrue(upgraded.tag>initial.tag)
        assertEquals(16,upgraded.snapshot.getValue("presentationVersion").jsonPrimitive.int)
        assertEquals(initial.serial,upgraded.serial);assertEquals(initial.token,upgraded.token)
        assertEquals(initial.appleType,upgraded.appleType)
        assertEquals(initial.googleId,upgraded.googleId);assertEquals(initial.googleClass,upgraded.googleClass)
        assertEquals(2,count("SELECT count(*) FROM wallet_delivery WHERE serial=?",upgraded.serial))
        assertEquals(initial.snapshot.getValue("cardCode"),upgraded.snapshot.getValue("cardCode"))
        assertEquals(balances,service.card(f.member).getValue("balances"))
        assertEquals(1,count("SELECT count(*) FROM wallet_passes WHERE tenant_id=?",f.staff.tenant))
        assertEquals(1,count("SELECT count(*) FROM wallet_apple_registrations WHERE serial=?",upgraded.serial))
        assertNotNull(wallet.updates(device,apple.passType,initial.tag.toString()))
        assertEquals(upgraded.tag,wallet.materialize(f.member).tag)
    }
    @Test fun `delivery diagnostics preserve both provider codes without private data`() {
        val f = fixture()
        val p = wallet.materialize(f.member, "apple")
        wallet.materialize(f.member, "google")
        val other = wallet.materialize(fixture().member, "google")
        db.tx { c ->
            c.exec("UPDATE wallet_delivery SET last_error=?,attempts=33 WHERE serial=? AND provider='GOOGLE'", "GOOGLE_DESIGN_400", p.serial)
            c.exec("UPDATE wallet_delivery SET last_error=?,attempts=2 WHERE serial=? AND provider='APPLE'", "APPLE_HTTP_503", p.serial)
            c.exec("UPDATE wallet_delivery SET last_error=? WHERE serial=? AND provider='GOOGLE'", "PRIVATE_SENTINEL Bearer secret-value", other.serial)
        }
        val diagnostics = wallet.diagnostics()
        val errors = diagnostics.getValue("deliveryErrors").jsonArray.map { it.jsonObject }
        assertTrue(errors.any { it.str("provider") == "GOOGLE" && it.str("code") == "GOOGLE_DESIGN_400" && it.getValue("maxAttempts").jsonPrimitive.int >= 33 })
        assertTrue(errors.any { it.str("provider") == "APPLE" && it.str("code") == "APPLE_HTTP_503" })
        assertTrue(errors.any { it.str("code") == "GOOGLE_DELIVERY_FAILED" })
        for (privateValue in listOf("PRIVATE_SENTINEL", "secret-value", p.token, p.serial, f.member.id)) {
            assertFalse(diagnostics.toString().contains(privateValue))
        }
        assertTrue(errors.size <= 30)
    }

    @Test fun `delivery diagnostics require platform administration`() = testApplication {
        val f = fixture()
        val platformToken = "platform-wallet-diagnostics-token-32-characters"
        application { loyaltyRoutes(service, platformToken, origin) }
        val route = "/api/platform/wallet/status"
        assertEquals(HttpStatusCode.Unauthorized, client.get(route).status)
        for (token in listOf(f.owner, f.token)) {
            assertEquals(HttpStatusCode.Unauthorized, client.get(route) { bearerAuth(token) }.status)
        }
        val response = client.get(route) { bearerAuth(platformToken) }
        assertEquals(HttpStatusCode.OK, response.status)
        assertTrue(json.parseToJsonElement(response.bodyAsText()).jsonObject.containsKey("deliveryErrors"))
    }

    private class TestApple:AppleWalletProvider {
        override val passType="pass.com.example.loyalty";override val team="ABCDEFGHIJ";var invalid:String?=null
        override fun sign(manifest:ByteArray)=byteArrayOf(1,2,3)
        override fun push(token:String)=token!=invalid
    }
    private class TestGoogle:GoogleWalletProvider {
        override val issuer="12345";@Volatile var fail=false;@Volatile var callback:(()->Unit)?=null
        override fun sync(pass:WalletPass,origin:String){callback?.invoke();if(fail)throw WalletDeliveryFailure("GOOGLE_OBJECT_503")}
        override fun saveLink(objectId:String,origin:String)="https://pay.google.com/gp/v/save/$objectId"
    }
    private class TestClock(@Volatile var value:Instant):Clock(){override fun getZone()=ZoneOffset.UTC;override fun withZone(zone:ZoneId)=Clock.fixed(value,zone);override fun instant()=value}
}
private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
