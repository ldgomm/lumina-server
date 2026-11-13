package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.access.*
import com.premierdarkcoffee.loyalty.businesses.*
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.*
import com.premierdarkcoffee.loyalty.shared.*
import com.zaxxer.hikari.*
import kotlinx.serialization.json.*
import kotlinx.serialization.encodeToString
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class WalletSubscriptionPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="wallet_subscription_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private class Time(var value:Instant):Clock(){override fun instant()=value;override fun getZone()=ZoneOffset.UTC;override fun withZone(zone:ZoneId):Clock=object:Clock(){override fun instant():Instant=this@Time.instant();override fun getZone():ZoneId=zone;override fun withZone(other:ZoneId):Clock=this@Time.withZone(other)}}
    private val time=Time(Instant.parse("2026-11-19T15:00:00Z"))
    private val provider=WalletProviderLegal("Agencia ficticia","1234567890001","Quito, prueba","legal@example.test","0991234567","https://example.test/privacidad")
    private data class Fixture(val registration:LuminaRegistration,val tenant:String,val staff:Staff,val token:String,val offer:WalletOfferInput)
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@WalletSubscriptionPostgresTest.password;maximumPoolSize=6;connectionInitSql="SET search_path TO ${this@WalletSubscriptionPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"subscription-test-identity-pepper",time)
    }
    @BeforeEach fun reset(){time.value=Instant.parse("2026-11-19T15:00:00Z")}
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
    private fun fixture():Fixture {
        val input=LuminaRegistration(id(),"Café de prueba","Responsable","owner@example.test","0991234567",category="CAFE")
        val registered=service.registerLuminaBusiness(input);val tenant=registered.getValue("business").jsonObject.str("id")
        val issued=service.newStaff(Staff(tenant,"platform","OWNER",null),NewStaff("OWNER",name="Responsable",requestId=id()))
        val token=issued.str("token")
        db.tx{it.exec("UPDATE branches SET created_at=? WHERE tenant_id=?",Timestamp.from(time.instant()),tenant)}
        return Fixture(input,tenant,service.staff(token),token,WalletOfferInput(input.companyId,id(),"Responsable","owner@example.test",provider))
    }
    private fun accept(f:Fixture,key:String=id(),quote:JsonObject=service.walletSubscriptionOffer(f.staff,f.offer))=service.acceptWalletSubscription(f.staff,WalletAcceptInput(f.offer,quote.str("hash"),true),key)
    private fun status(f:Fixture)=service.walletSubscriptionStatus(f.staff)
    private fun invoices(f:Fixture):JsonArray=service.commercial.ownerAccount(f.staff).getValue("invoices").jsonArray
    private fun balance(f:Fixture)=service.commercial.ownerAccount(f.staff).getValue("summary").jsonObject.getValue("balanceMinor").jsonPrimitive.long
    private fun cancel(f:Fixture)=service.cancelWalletSubscription(f.staff,WalletCancelInput(status(f).getValue("version").jsonPrimitive.int,true),id())
    private fun branch(f:Fixture):String {
        val result=service.newBranch(f.staff,NewBranch("Local adicional",id().take(8)))
        db.tx{it.exec("UPDATE branches SET created_at=? WHERE tenant_id=? AND id=?",Timestamp.from(time.instant()),f.tenant,result.str("id"))}
        return result.str("id")
    }
    @Test fun `HTTP subscription requires owner and explicit versioned consent`() = testApplication {
        val f=fixture()
        application { loyaltyRoutes(service,"platform-token-for-tests-32-characters","http://localhost") }
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/lumina-subscription").status)
        val response=client.post("/api/staff/lumina-subscription/offer") { bearerAuth(f.token);contentType(ContentType.Application.Json);setBody(json.encodeToString(f.offer)) }
        assertEquals(HttpStatusCode.OK,response.status)
        val q=json.parseToJsonElement(response.bodyAsText()).jsonObject
        val key=id()
        suspend fun send(accepted:Boolean)=client.post("/api/staff/lumina-subscription/accept") {
            bearerAuth(f.token);contentType(ContentType.Application.Json);header("Idempotency-Key",key)
            setBody(json.encodeToString(WalletAcceptInput(f.offer,q.str("hash"),accepted)))
        }
        assertEquals(HttpStatusCode.BadRequest,send(false).status)
        assertEquals(HttpStatusCode.OK,send(true).status)
        assertEquals(HttpStatusCode.OK,send(true).status)
        val saved=client.get("/api/staff/lumina-subscription") { bearerAuth(f.token) }
        val state=json.parseToJsonElement(saved.bodyAsText()).jsonObject
        assertTrue(state.getValue("accepted").jsonPrimitive.boolean)
        assertEquals(f.offer.ownerId,state.getValue("agreement").jsonObject.str("ownerId"))
        assertEquals(1,state.getValue("version").jsonPrimitive.int)
    }
    @Test fun `trial creates no charges until January first in Ecuador`() {
        val f=fixture();accept(f);assertEquals(0L,balance(f));assertEquals("2026-12-31",status(f).str("trialUntil"))
        time.value=Instant.parse("2027-01-01T04:59:59Z");assertEquals(0L,balance(f))
        time.value=Instant.parse("2027-01-01T05:00:00Z");assertEquals(499L,balance(f));assertEquals(1,invoices(f).size)
        assertEquals("2027-02-01",status(f).str("nextChargeOn"))
    }
    @Test fun `no agreement means no invented acceptance or charges`() {
        val f=fixture();time.value=Instant.parse("2027-03-01T12:00:00Z")
        service.commercial.sweep();assertEquals(0L,balance(f));assertFalse(status(f).getValue("accepted").jsonPrimitive.boolean)
    }
    @Test fun `consent owner and correct company are enforced`() {
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer)
        assertFailsWith<Problem>{service.acceptWalletSubscription(f.staff,WalletAcceptInput(f.offer,q.str("hash"),false),id())}
        assertFailsWith<Problem>{service.walletSubscriptionOffer(f.staff.copy(role="CASHIER"),f.offer)}
        assertFailsWith<Problem>{service.walletSubscriptionOffer(f.staff,f.offer.copy(companyId=id()))}
        assertEquals(0L,balance(f))
    }
    @Test fun `quote cannot silently change branches provider or date`() {
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer);branch(f)
        assertEquals("OFFER_CHANGED",assertFailsWith<Problem>{accept(f,quote=q)}.code)
        val fresh=service.walletSubscriptionOffer(f.staff,f.offer)
        assertFailsWith<Problem>{service.acceptWalletSubscription(f.staff,WalletAcceptInput(f.offer.copy(provider=provider.copy(legalName="Otro proveedor")),fresh.str("hash"),true),id())}
        time.value=Instant.parse("2026-11-20T15:00:00Z");assertFailsWith<Problem>{accept(f,quote=fresh)}
    }
    @Test fun `retries and concurrent acceptances create only one version`() {
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer);val key=id();val pool=Executors.newFixedThreadPool(4)
        try{val results=pool.invokeAll((1..4).map{Callable{accept(f,key,q)}}).map{it.get()};assertTrue(results.all{it.str("version")=="1"})}finally{pool.shutdownNow()}
        assertEquals(1,status(f).getValue("version").jsonPrimitive.int);assertEquals(0L,balance(f))
        assertFailsWith<Problem>{accept(f,quote=q)}
    }
    @Test fun `revoked owner cannot accept with captured authority`() {
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer)
        db.tx{it.exec("UPDATE staff_tokens SET revoked_at=now() WHERE tenant_id=? AND id=?",f.tenant,f.staff.id)}
        assertFailsWith<Problem>{accept(f,quote=q)}
    }
    @Test fun `catch up charges use historical branches once per period`() {
        val f=fixture();accept(f);time.value=Instant.parse("2026-12-03T12:00:00Z");branch(f)
        time.value=Instant.parse("2027-01-15T12:00:00Z");branch(f)
        time.value=Instant.parse("2027-03-01T12:00:00Z");service.commercial.sweep();service.commercial.sweep()
        assertEquals(3,invoices(f).size);assertEquals(3992L,balance(f)) // Jan 2, Feb 3, Mar 3 branches.
        assertEquals(setOf(998L,1497L),invoices(f).map{it.jsonObject.getValue("amountMinor").jsonPrimitive.long}.toSet())
    }
    @Test fun `new branch starts at next cut and paid activation never bills earlier months`() {
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture();accept(f);assertEquals(499L,balance(f))
        branch(f);assertEquals(499L,balance(f));time.value=Instant.parse("2027-04-19T12:00:00Z");assertEquals(1497L,balance(f))
    }
    @Test fun `cancel trial preserves card identities and issues no January charge`() {
        val f=fixture();val original=service.businessProfile(f.tenant);accept(f);cancel(f)
        time.value=Instant.parse("2027-02-01T12:00:00Z");assertEquals(0L,balance(f));assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals(f.tenant,service.staff(f.token).tenant);assertEquals(original.getValue("business"),service.businessProfile(f.tenant).getValue("business"))
        assertEquals(f.tenant,service.registerLuminaBusiness(f.registration).getValue("business").jsonObject.str("id"))
    }
    @Test fun `cancel paid period retains its charge and resume cannot double bill it`() {
        time.value=Instant.parse("2027-01-31T12:00:00Z");val f=fixture();accept(f);cancel(f);assertEquals(499L,balance(f))
        time.value=Instant.parse("2027-02-10T12:00:00Z");accept(f);assertEquals(499L,balance(f))
        time.value=Instant.parse("2027-02-28T12:00:00Z");assertEquals(998L,balance(f));assertEquals("2027-03-31",status(f).str("nextChargeOn"))
    }
    @Test fun `legacy plans cannot be replaced and platform cannot overwrite accepted rate`() {
        val f=fixture();service.commercial.configure(f.tenant,MembershipChange(0,MembershipPlan("Anterior",2000,"2026-11-19","2027-01-01")))
        assertEquals("EXISTING_AGREEMENT",assertFailsWith<Problem>{service.walletSubscriptionOffer(f.staff,f.offer)}.code)
        val other=fixture();accept(other)
        assertEquals("WALLET_ACCEPTANCE_REQUIRED",assertFailsWith<Problem>{service.commercial.configure(other.tenant,MembershipChange(1,MembershipPlan("Alterado",999,"2026-11-19","2027-01-01")))}.code)
    }
    @Test fun `registration seeds category design once and replay preserves later edits`() {
        val f=fixture();val design=db.tx{it.one("SELECT config::text FROM wallet_designs WHERE tenant_id=?",f.tenant){r->r.getString(1)}}!!
        db.tx{it.exec("UPDATE wallet_designs SET config=jsonb_set(config,'{displayName}','\"Diseño propio\"'::jsonb) WHERE tenant_id=?",f.tenant)}
        service.registerLuminaBusiness(f.registration.copy(name="Otra petición",category="GENERAL"));db.migrate()
        val saved=db.tx{it.one("SELECT config::text FROM wallet_designs WHERE tenant_id=?",f.tenant){r->r.getString(1)}}!!
        assertNotEquals(design,saved);assertEquals("Diseño propio",json.parseToJsonElement(saved).jsonObject.str("displayName"))
        assertEquals("CAFE",db.tx{it.one("SELECT category FROM lumina_business_registrations WHERE tenant_id=?",f.tenant){r->r.getString(1)}})
        assertEquals(16,db.tx{it.one("SELECT count(*) FROM comeback_migrations"){r->r.getInt(1)}})
    }

    @Test fun `annual promotion and historical branches charge one full year once`() {
        val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f)
        assertEquals(0L,balance(f));time.value=Instant.parse("2026-12-03T12:00:00Z");branch(f)
        time.value=Instant.parse("2027-01-01T05:00:00Z");assertEquals(10000L,balance(f));assertEquals("2028-01-01",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2027-06-15T12:00:00Z");branch(f);service.commercial.sweep();assertEquals(10000L,balance(f))
        time.value=Instant.parse("2028-01-01T05:00:00Z");service.commercial.sweep();service.commercial.sweep()
        assertEquals(25000L,balance(f));assertEquals(2,invoices(f).size)
    }
    @Test fun `monthly to annual change starts at next paid cut and preserves first invoice`() {
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture();accept(f);assertEquals(499L,balance(f))
        time.value=Instant.parse("2027-04-02T12:00:00Z");val annual=f.copy(offer=f.offer.copy(cycle="ANNUAL"));accept(annual)
        assertEquals(499L,balance(f));assertEquals("2027-04-19",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2027-04-19T12:00:00Z");assertEquals(5499L,balance(f));assertEquals("2028-04-19",status(f).str("nextChargeOn"))
    }
    @Test fun `annual to monthly preserves leap day anchor and avoids overlapping periods`() {
        time.value=Instant.parse("2028-02-29T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f)
        assertEquals(5000L,balance(f));time.value=Instant.parse("2028-03-03T12:00:00Z");accept(f.copy(offer=f.offer.copy(cycle="MONTHLY")))
        assertEquals(5000L,balance(f));assertEquals("2029-02-28",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2029-02-28T12:00:00Z");assertEquals(5499L,balance(f));assertEquals("2029-03-29",status(f).str("nextChargeOn"))
    }
    @Test fun `annual cancellation retains agreed year and resume does not recharge it`() {
        time.value=Instant.parse("2027-01-31T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f);cancel(f)
        assertEquals("2028-01-31",status(f).str("endsOn"));assertEquals(5000L,balance(f))
        time.value=Instant.parse("2027-02-10T12:00:00Z");accept(f);assertEquals(5000L,balance(f))
        time.value=Instant.parse("2028-01-31T12:00:00Z");assertEquals(10000L,balance(f))
    }
    @Test fun `access commands replay once preserve concurrency and close stops renewals`() {
        val f=fixture();accept(f);val access=service.commercial.accessState(f.tenant)
        val initial=access.getValue("version").jsonPrimitive.int
        val suspend=AccessChange("SUSPENDED","Revisión administrativa",initial,id())
        val first=service.commercial.changeAccess(f.tenant,suspend)
        assertEquals(initial+1,first.getValue("version").jsonPrimitive.int)
        assertTrue(service.commercial.changeAccess(f.tenant,suspend).getValue("replayed").jsonPrimitive.boolean)
        assertFailsWith<Problem>{service.commercial.changeAccess(f.tenant,suspend.copy(state="ACTIVE"))}
        service.commercial.changeAccess(f.tenant,AccessChange("CLOSED","Terminación del servicio",initial+1,id()))
        time.value=Instant.parse("2027-02-01T12:00:00Z");assertEquals(0L,balance(f));assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
        service.commercial.changeAccess(f.tenant,AccessChange("ACTIVE","Reabrir el negocio",initial+2,id()))
        assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
        assertEquals(f.tenant,service.staff(f.token).tenant)
    }
    @Test fun `annual quote cannot be accepted as monthly or at an injected price`() {
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer)
        assertEquals("OFFER_CHANGED",assertFailsWith<Problem>{service.acceptWalletSubscription(f.staff,WalletAcceptInput(f.offer.copy(cycle="ANNUAL"),q.str("hash"),true),id())}.code)
        assertEquals(0L,balance(f));assertFalse(status(f).getValue("accepted").jsonPrimitive.boolean)
    }


    @Test fun `close and reopen annual business retain the paid year without double charge`() {
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f);assertEquals(5000L,balance(f))
        val version=service.commercial.accessState(f.tenant).getValue("version").jsonPrimitive.int
        time.value=Instant.parse("2027-04-02T12:00:00Z");service.commercial.changeAccess(f.tenant,AccessChange("CLOSED","Cierre solicitado",version,id()))
        assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals("2028-03-19",status(f).str("endsOn"));assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
        service.commercial.changeAccess(f.tenant,AccessChange("ACTIVE","Negocio reabierto",version+1,id()))
        assertTrue(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        accept(f);assertEquals(5000L,balance(f));assertEquals("2028-03-19",status(f).str("nextChargeOn"))
    }
}
