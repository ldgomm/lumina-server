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
        @Test fun `zero progress starts before purchase without creating ledger balance and keeps identity after earning`() {
        val f=fixture()
        service.saveReward(f.staff,Reward(f.program,"Premio de puntos",50))
        val before=count("SELECT count(*) FROM balances WHERE tenant_id=? AND member_id=?",f.staff.tenant,f.member.id)
        wallet.materialize(f.member,"apple");val first=wallet.materialize(f.member,"google")
        assertEquals("0 de 50 puntos",first.journey()!!.summary)
        assertEquals(0,first.artwork().filled);assertEquals(100,first.artwork().total)
        assertEquals(before,count("SELECT count(*) FROM balances WHERE tenant_id=? AND member_id=?",f.staff.tenant,f.member.id))
        assertTrue(first.snapshot.getValue("balances").jsonArray.isEmpty())
        earn(f);val updated=wallet.materialize(f.member)
        assertEquals(first.serial,updated.serial);assertEquals(first.token,updated.token);assertEquals(first.googleId,updated.googleId)
        assertEquals(first.snapshot.getValue("cardCode"),updated.snapshot.getValue("cardCode"))
        assertEquals("10 de 50 puntos",updated.journey()!!.summary)
        assertEquals(1,updated.presentationBalances().size)
    }
    @Test fun `pausing unearned promotion removes its preview and reactivating restores zero safely`() {
        val f=fixture();service.saveReward(f.staff,Reward(f.program,"Premio",50))
        val first=wallet.materialize(f.member,"google");assertNotNull(first.journey())
        service.editProgram(f.staff,f.program,ProgramChange(1,Program("Puntos",Kind.POINTS,active=false)))
        val paused=wallet.materialize(f.member);assertNull(paused.journey());assertEquals(0,paused.artwork().total)
        assertTrue(paused.presentationBalances().isEmpty());assertFalse(paused.googleExperienceFields().toString().contains("0 de 50"))
        service.editProgram(f.staff,f.program,ProgramChange(2,Program("Puntos",Kind.POINTS,active=true)))
        val restored=wallet.materialize(f.member);assertEquals("0 de 50 puntos",restored.journey()!!.summary)
        assertEquals(first.serial,restored.serial);assertEquals(first.googleId,restored.googleId)
        assertEquals(0,count("SELECT count(*) FROM balances WHERE tenant_id=? AND member_id=?",f.staff.tenant,f.member.id))
    }
    @Test fun `presentation upgrade refreshes installed card without changing its money or identity`() {
        for (previousVersion in listOf(8, 17, 20, 22, 23, 24, 27, 29, 30, 32)) {
            val f=fixture();earn(f)
            wallet.materialize(f.member,"apple")
            val initial=wallet.materialize(f.member,"google");register(initial)
            val balances=service.card(f.member).getValue("balances")
            db.tx { c -> c.exec("UPDATE wallet_passes SET snapshot=jsonb_set(snapshot,'{presentationVersion}',?::jsonb) WHERE serial=?",previousVersion.toString(),initial.serial) }
            time.value=time.value.plusSeconds(1)
            val upgraded=wallet.materialize(f.member)
            assertTrue(upgraded.tag>initial.tag)
            assertEquals(34,upgraded.snapshot.getValue("presentationVersion").jsonPrimitive.int)
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

    private fun health(f:Fixture,provider:String="ALL",state:String="ALL",search:String="")=service.walletHealth(f.staff,WalletHealthQuery(provider,state,search))
    private fun healthRows(f:Fixture,provider:String="ALL")=health(f,provider).getValue("items").jsonArray.map{it.jsonObject}
    private fun retry(f:Fixture,p:WalletPass,provider:String="GOOGLE",key:String=id())=service.retryWallet(f.staff,f.member.id,provider,WalletRetry(p.tag,"El cliente no ve cambios"),key)

    @Test fun `health report is read only and includes both unprepared provider slots`() {
        val f=fixture();val audit=count("SELECT count(*) FROM audit_events WHERE tenant_id=?",f.staff.tenant)
        val a=health(f);assertEquals(2,a.getValue("summary").jsonObject.getValue("total").jsonPrimitive.int)
        assertTrue(healthRows(f).all{it.str("state")=="NOT_ISSUED"})
        assertEquals(a,health(f));assertEquals(0,count("SELECT count(*) FROM wallet_passes WHERE tenant_id=?",f.staff.tenant))
        assertEquals(audit,count("SELECT count(*) FROM audit_events WHERE tenant_id=?",f.staff.tenant))
    }
    @Test fun `health separates apple connection google delivery and unobserved device receipt`() {
        val f=fixture();wallet.materialize(f.member,"apple");val p=wallet.materialize(f.member,"google")
        assertEquals("NEEDS_CONNECTION",healthRows(f,"APPLE").single().str("state"))
        assertEquals("PENDING",healthRows(f,"GOOGLE").single().str("state"))
        register(p);wallet.deliver(p.serial,"APPLE",true);wallet.deliver(p.serial,"GOOGLE",true)
        assertTrue(healthRows(f).all{it.str("state")=="PROVIDER_ACCEPTED" && it["lastAcceptedAt"]!=JsonNull})
        assertEquals("NOT_OBSERVED",health(f).str("deviceVerification"));assertEquals("NOT_CHECKED",health(f).str("httpsVerification"))
    }
    @Test fun `health filters stay inside business and treat search characters literally`() {
        val f=fixture();val foreign=fixture();wallet.materialize(foreign.member,"google")
        db.tx{c->c.exec("UPDATE members SET name=? WHERE tenant_id=?","Carla 50%_club",f.staff.tenant)}
        assertEquals(1,health(f,"GOOGLE",search="50%_").getValue("items").jsonArray.size)
        assertEquals(0,health(f,search="does-not-exist").getValue("items").jsonArray.size)
        assertFalse(health(f).toString().contains(foreign.member.id));assertEquals(0,health(f,state="ATTENTION").getValue("items").jsonArray.size)
    }
    @Test fun `health never exposes card codes secrets or raw provider error messages`() {
        val f=fixture();val p=wallet.materialize(f.member,"google")
        db.tx{c->c.exec("UPDATE wallet_delivery SET last_error=?,attempts=2 WHERE serial=?","secret-raw-provider-body",p.serial)}
        val data=health(f).toString()
        for(value in listOf(p.serial,p.token,p.googleId!!,p.snapshot.str("cardCode"),"ID123456","secret-raw-provider-body",encryptionKey))assertFalse(data.contains(value))
        assertEquals("GOOGLE_DELIVERY_FAILED",healthRows(f,"GOOGLE").single().str("errorCode"))
        assertEquals(1,health(f,state="ATTENTION").getValue("summary").jsonObject.getValue("total").jsonPrimitive.int)
    }
    @Test fun `new purchase becomes pending before materialization and no read alters money`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");wallet.deliver(p.serial,"GOOGLE",true);earn(f)
        val balances=service.card(f.member).getValue("balances");assertEquals("PENDING",healthRows(f,"GOOGLE").single().str("state"))
        assertEquals(balances,service.card(f.member).getValue("balances"));assertEquals(p.tag,count("SELECT update_tag FROM wallet_passes WHERE serial=?",p.serial))
    }
    @Test fun `existing provider with missing configuration is distinguished from unissued cards`() {
        val f=fixture();wallet.materialize(f.member,"google");service.wallets=WalletService(service)
        assertEquals("NOT_CONFIGURED",healthRows(f,"GOOGLE").single().str("state"))
        assertEquals("NOT_ISSUED",healthRows(f,"APPLE").single().str("state"))
        assertFalse(healthRows(f,"GOOGLE").single().getValue("canRetry").jsonPrimitive.boolean)
    }
    @Test fun `manual retry is idempotent audited and preserves identity and balances`() {
        val f=fixture();earn(f);val p=wallet.materialize(f.member,"google");wallet.deliver(p.serial,"GOOGLE",true)
        val balances=service.card(f.member).getValue("balances");val key=id();val first=retry(f,p,key=key);val second=retry(f,p,key=key)
        assertEquals("QUEUED",first.str("status"));assertTrue(second.getValue("replayed").jsonPrimitive.boolean)
        assertEquals(1,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
        assertEquals(0,count("SELECT sent_tag FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial))
        val same=wallet.materialize(f.member);assertEquals(p.serial,same.serial);assertEquals(p.googleId,same.googleId);assertEquals(p.token,same.token);assertEquals(p.tag,same.tag)
        assertEquals(balances,service.card(f.member).getValue("balances"))
        assertEquals(409,assertFailsWith<Problem>{service.retryWallet(f.staff,f.member.id,"GOOGLE",WalletRetry(p.tag,"Otro motivo documentado"),key)}.status)
    }
    @Test fun `retry cooldown is per existing provider and server enforced`() {
        val f=fixture();wallet.materialize(f.member,"apple");val p=wallet.materialize(f.member,"google");register(p)
        retry(f,p);assertEquals(429,assertFailsWith<Problem>{retry(f,p)}.status)
        assertFalse(healthRows(f,"GOOGLE").single().getValue("canRetry").jsonPrimitive.boolean)
        retry(f,p,"APPLE");time.value=time.value.plusSeconds(60);retry(f,p)
        assertEquals(3,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
    }
    @Test fun `retry rejects changed tags and members from another business atomically`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");earn(f);wallet.materialize(f.member)
        assertEquals(409,assertFailsWith<Problem>{retry(f,p)}.status)
        val foreign=fixture();assertEquals(404,assertFailsWith<Problem>{service.retryWallet(f.staff,foreign.member.id,"GOOGLE",WalletRetry(p.tag,"Revisión solicitada"),id())}.status)
        assertEquals(0,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
    }
    @Test fun `cashier cannot read or retry wallet delivery`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val token=service.newStaff(f.staff,NewStaff("CASHIER",f.branch,"Caja Principal")).str("token");val cashier=service.staff(token)
        assertEquals(403,assertFailsWith<Problem>{service.walletHealth(cashier)}.status)
        assertEquals(403,assertFailsWith<Problem>{service.retryWallet(cashier,f.member.id,"GOOGLE",WalletRetry(p.tag,"Revisión solicitada"),id())}.status)
    }
    @Test fun `revoked owner is rejected even for an idempotent replay`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val key=id();retry(f,p,key=key)
        db.tx{c->c.exec("UPDATE staff_tokens SET revoked_at=now(),version=version+1 WHERE tenant_id=? AND id=?",f.staff.tenant,f.staff.id)}
        assertEquals(401,assertFailsWith<Problem>{retry(f,p,key=key)}.status)
        assertEquals(401,assertFailsWith<Problem>{health(f)}.status)
    }
    @Test fun `retry refuses unissued unconfigured and disconnected apple cards`() {
        val f=fixture();val p=wallet.materialize(f.member,"apple")
        assertEquals("WALLET_CONNECTION_REQUIRED",assertFailsWith<Problem>{retry(f,p,"APPLE")}.code)
        assertEquals("WALLET_NOT_ISSUED",assertFailsWith<Problem>{retry(f,p,"GOOGLE")}.code)
        service.wallets=WalletService(service)
        assertEquals("WALLET_NOT_CONFIGURED",assertFailsWith<Problem>{retry(f,p,"APPLE")}.code)
        assertEquals(0,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
    }
    @Test fun `simultaneous distinct requests schedule only one manual retry`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val pool=Executors.newFixedThreadPool(4);val barrier=CyclicBarrier(4)
        try{
            val results=(1..4).map{pool.submit<Int>{barrier.await(5,TimeUnit.SECONDS);try{retry(f,p);200}catch(e:Problem){e.status}}}.map{it.get(15,TimeUnit.SECONDS)}
            assertEquals(1,results.count{it==200});assertEquals(3,results.count{it==429})
        }finally{pool.shutdownNow()}
        assertEquals(1,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
    }
    @Test fun `simultaneous repeated request replays without duplicate audit`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val key=id();val pool=Executors.newFixedThreadPool(4);val barrier=CyclicBarrier(4)
        try{
            val results=(1..4).map{pool.submit<JsonObject>{barrier.await(5,TimeUnit.SECONDS);retry(f,p,key=key)}}.map{it.get(15,TimeUnit.SECONDS)}
            assertEquals(1,results.count{!it.getValue("replayed").jsonPrimitive.boolean})
        }finally{pool.shutdownNow()}
        assertEquals(1,count("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='WALLET_RETRY'",f.staff.tenant))
    }
    @Test fun `in flight provider failure cannot delay a newly requested retry`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val entered=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newSingleThreadExecutor()
        google.callback={entered.countDown();check(release.await(10,TimeUnit.SECONDS))};google.fail=true
        try{
            val running=pool.submit<Boolean>{wallet.deliver(p.serial,"GOOGLE",true)};assertTrue(entered.await(5,TimeUnit.SECONDS));retry(f,p);release.countDown();assertFalse(running.get(10,TimeUnit.SECONDS))
            assertEquals(0,count("SELECT attempts FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial))
            assertEquals(time.value,db.tx{c->c.one("SELECT next_attempt_at FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial){it.getTimestamp(1).toInstant()}})
        }finally{release.countDown();pool.shutdownNow();google.callback=null}
        google.fail=false;assertTrue(wallet.deliver(p.serial,"GOOGLE"))
    }
    @Test fun `in flight failure cannot overwrite a newer purchase wakeup`() {
        val f=fixture();val p=wallet.materialize(f.member,"google");val entered=CountDownLatch(1);val release=CountDownLatch(1);val pool=Executors.newSingleThreadExecutor()
        google.callback={entered.countDown();check(release.await(10,TimeUnit.SECONDS))};google.fail=true
        try{
            val running=pool.submit<Boolean>{wallet.deliver(p.serial,"GOOGLE",true)};assertTrue(entered.await(5,TimeUnit.SECONDS));earn(f);val newer=wallet.materialize(f.member);release.countDown();assertFalse(running.get(10,TimeUnit.SECONDS))
            assertTrue(newer.tag>p.tag);assertEquals(0,count("SELECT attempts FROM wallet_delivery WHERE serial=? AND provider='GOOGLE'",p.serial))
        }finally{release.countDown();pool.shutdownNow();google.callback=null}
    }
    @Test fun `wallet center routes authenticate both administration scopes and reject client access`() = testApplication {
        val f=fixture();val p=wallet.materialize(f.member,"google");val token="platform-wallet-health-token-32-characters"
        application{loyaltyRoutes(service,token,origin)}
        val own="/api/staff/wallet-health";val platform="/api/platform/tenants/${f.staff.tenant}/wallet-health"
        assertEquals(HttpStatusCode.Unauthorized,client.get(own).status)
        assertEquals(HttpStatusCode.Unauthorized,client.get(own){bearerAuth(f.token)}.status)
        assertEquals(HttpStatusCode.OK,client.get(own){bearerAuth(f.owner)}.status)
        assertEquals(HttpStatusCode.BadRequest,client.get("$own?offset=1"){bearerAuth(f.owner)}.status)
        assertEquals(HttpStatusCode.Unauthorized,client.get(platform){bearerAuth(f.owner)}.status)
        assertEquals(HttpStatusCode.OK,client.get(platform){bearerAuth(token)}.status)
        val response=client.post("$platform/${f.member.id}/GOOGLE/retry"){bearerAuth(token);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody("""{"expectedTag":${p.tag},"reason":"Revisión desde soporte"}""")}
        assertEquals(HttpStatusCode.OK,response.status)
        assertEquals("Administrador de plataforma",health(f).getValue("recentRequests").jsonArray.first().jsonObject.str("actor"))
    }
    @Test fun `health pagination is bounded and unknown historical timestamps remain unknown`() {
        val f=fixture();val p=wallet.materialize(f.member,"google")
        db.tx{c->c.exec("UPDATE wallet_delivery SET sent_tag=? WHERE serial=? AND provider='GOOGLE'",p.tag,p.serial)
            (1..14).forEach{i->val member=id();c.exec("INSERT INTO members(tenant_id,id,name,identity_hash,card_code,password_hash,terms_version) SELECT tenant_id,?,? ,?,? ,password_hash,terms_version FROM members WHERE tenant_id=? AND id=?",member,"Extra $i",Security.hash(id()),Security.token(),f.staff.tenant,f.member.id)}
        }
        assertEquals(JsonNull,healthRows(f,"GOOGLE").first{it.str("memberId")==f.member.id}["lastAcceptedAt"])
        val first=health(f);val second=service.walletHealth(f.staff,WalletHealthQuery(offset=25));assertEquals(25,first.getValue("items").jsonArray.size);assertEquals(5,second.getValue("items").jsonArray.size)
        assertTrue(first.getValue("hasMore").jsonPrimitive.boolean);assertFalse(second.getValue("hasMore").jsonPrimitive.boolean)
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
