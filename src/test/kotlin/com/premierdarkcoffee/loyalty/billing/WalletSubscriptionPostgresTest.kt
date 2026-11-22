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
import com.premierdarkcoffee.loyalty.wallet.appleJson
import com.premierdarkcoffee.loyalty.wallet.googleJson
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
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
    @BeforeEach fun reset(){time.value=Instant.parse("2027-01-01T15:00:00Z")}
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
    private fun seedBranch(f:Fixture) {
        db.tx { c->c.exec("INSERT INTO branches(tenant_id,id,name,code,created_at) VALUES(?,?,?,?,?)",f.tenant,id(),"Sucursal previamente registrada",id().take(8),Timestamp.from(time.instant())) }
    }
    private fun branch(f:Fixture):String {
        val shown=db.tx{c->service.commercial.branchOffer(c,f.tenant)?.str("hash")}
        val result=service.newBranch(f.staff,NewBranch("Local adicional",id().take(8),shown))
        db.tx{it.exec("UPDATE branches SET created_at=? WHERE tenant_id=? AND id=?",Timestamp.from(time.instant()),f.tenant,result.str("id"))}
        return result.str("id")
    }
    @Test fun `branch opening quote and closing reconcile monthly and annual through payment and retry`() {
        for((months,unit,prorated) in listOf(Triple(1,500L,161L),Triple(12,5000L,4712L))) {
            time.value=Instant.parse("2027-01-01T15:00:00Z");val f=fixture()
            val terms=CatalogSchedule(id(),"Wallet","2027-01-01",null,unit,if(months==1)"2027-02-01" else "2028-01-01",months=months,consentOn="2027-01-01",perBranch=true)
            service.commercial.updateCalendar(f.tenant,CatalogCalendar(f.registration.companyId,1,listOf(terms)))
            time.value=Instant.parse("2027-01-22T16:00:00Z")
            val preview=db.tx{service.commercial.branchOffer(it,f.tenant)}!!
            assertEquals(prorated,preview.getValue("amountMinor").jsonPrimitive.long)
            assertEquals(unit*2,preview.getValue("renewalMinor").jsonPrimitive.long)
            assertFailsWith<Problem>{service.newBranch(f.staff,NewBranch("Nueva","N"))}
            branch(f)
            fun close()=service.commercial.walletOutlook(f.tenant,"2027-02-01")
            fun sum(key:String,field:String)=close().getValue(key).jsonArray.sumOf{it.jsonObject.getValue(field).jsonPrimitive.long}
            assertEquals(unit+prorated,sum("lines","walletMinor"));assertEquals(0L,sum("bills","issued"))
            time.value=Instant.parse("2027-02-01T05:00:00Z");repeat(2){service.commercial.sweep()}
            assertEquals(unit+prorated,sum("bills","issued"));assertEquals(unit+prorated,sum("lines","walletMinor"))
            val bill=invoices(f).first{it.jsonObject.getValue("amountMinor").jsonPrimitive.long==prorated}.jsonObject
            service.commercial.pay(f.tenant,RecordPayment(bill.str("id"),100,"Pago parcial","TRANSFER","2027-02-01"),id())
            assertEquals(100L,sum("bills","paid"));assertEquals(unit+prorated-100,balance(f))
        }
    }
    @Test fun `a branch opened at the renewal instant appears once in the branch census`() {
        val f=fixture();accept(f)
        time.value=Instant.parse("2027-02-01T05:00:00Z")
        val offered=db.tx{c->service.commercial.branchOffer(c,f.tenant)}!!
        assertTrue(offered.getValue("inBase").jsonPrimitive.boolean);assertEquals(500L,offered.getValue("amountMinor").jsonPrimitive.long)
        branch(f);assertEquals(500L,balance(f))
        time.value=Instant.parse("2027-03-01T05:00:00Z");service.commercial.sweep()
        assertEquals(1500L,balance(f));assertEquals(2,invoices(f).size)
    }
    @Test fun `forecast matches the issued catalog charge for two branches and both renewal cycles`() {
        for ((months,unit) in listOf(1 to 500L,12 to 5000L)) {
            time.value=Instant.parse("2027-01-01T15:00:00Z")
            val f=fixture()
            seedBranch(f)
            val end=if(months==12)"2028-01-01" else "2027-02-01"
            val terms=CatalogSchedule(id(),"Wallet", "2027-01-01",null,unit,end,months=months,consentOn="2027-01-01",perBranch=true,initialBranches=2)
            val calendar=CatalogCalendar(f.registration.companyId,1,listOf(terms))
            service.commercial.updateCalendar(f.tenant,calendar)
            fun forecast()=service.commercial.walletOutlook(f.tenant)["lines"]!!.jsonArray
            fun amount()=forecast().single().jsonObject["walletMinor"]!!.jsonPrimitive.long
            time.value=Instant.parse("2027-01-22T15:00:00Z")
            seedBranch(f)
            repeat(2){assertEquals(unit*2,amount())}
            assertEquals(2,forecast().single().jsonObject["branchCount"]!!.jsonPrimitive.int)
            assertEquals(0,db.tx { c->c.one("SELECT count(*) FROM billing_invoices WHERE tenant_id=?",f.tenant){it.getInt(1)} })
            time.value=Instant.parse("2027-02-01T05:00:00Z")
            assertEquals(unit*2,balance(f))
            assertTrue(db.tx { c->c.one("SELECT description FROM billing_invoices WHERE tenant_id=? AND wallet_due",f.tenant){it.getString(1)} }!!.contains("2 sucursales"))
            if(months==12){
                assertTrue(forecast().isEmpty())
                time.value=Instant.parse("2028-01-01T05:00:00Z")
            }
            val secondEnd=if(months==12)"2029-01-01" else "2027-03-01"
            service.commercial.updateCalendar(f.tenant,calendar.copy(revision=2,entries=listOf(terms.copy(billBefore=secondEnd))))
            assertEquals(unit*3,amount())
            assertEquals(3,forecast().single().jsonObject["branchNames"]!!.jsonArray.size)
            time.value=Instant.parse(if(months==12)"2028-02-01T05:00:00Z" else "2027-03-01T05:00:00Z")
            assertEquals(unit*5,balance(f))
        }
    }
    @Test fun `preview preserves consent and rounding without posting any charge`() {
        time.value=Instant.parse("2026-12-31T15:00:00Z")
        val f=fixture()
        val trial=CatalogCalendar(f.registration.companyId,1,emptyList(),true)
        service.commercial.updateCalendar(f.tenant,trial)
        val empty=service.commercial.walletOutlook(f.tenant)
        assertEquals("2027-02-01",empty.str("cut"))
        assertTrue(empty["lines"]!!.jsonArray.isEmpty())
        time.value=Instant.parse("2027-01-22T15:00:00Z")
        val monthly=CatalogSchedule(id(),"Wallet","2027-01-22",null,500L,"2027-02-01",consentOn="2027-01-22",perBranch=true,initialBranches=1)
        service.commercial.updateCalendar(f.tenant,trial.copy(revision=2,entries=listOf(monthly)))
        assertEquals(161L,service.commercial.walletOutlook(f.tenant)["lines"]!!.jsonArray.single().jsonObject["walletMinor"]!!.jsonPrimitive.long)
        val withoutPurchase=service.commercial.firstPurchaseStates(WalletBusinessList(listOf(f.tenant)))["rows"]!!.jsonArray.single().jsonObject
        assertTrue(withoutPurchase["active"]!!.jsonPrimitive.boolean)
        assertFalse(withoutPurchase["purchased"]!!.jsonPrimitive.boolean)
        time.value=Instant.parse("2027-02-01T05:00:00Z")
        assertEquals(161L,balance(f))
    }
    @Test fun `catalogue trial is free and January usage suspends on February sixteen only for unpaid Wallet`() {
        val f=fixture();val schedule=CatalogSchedule(id(),"Wallet y contenido","2026-11-22",null,499)
        val request=CatalogCalendar(f.registration.companyId,1,listOf(schedule),trialActive=true)
        time.value=Instant.parse("2026-11-22T16:00:00Z")
        service.commercial.updateCalendar(f.tenant,request)
        val customer=service.member(service.enrollWithoutPassword("lumina-"+f.registration.companyId.replace("-",""),com.premierdarkcoffee.loyalty.wallet.WalletEnrollment("Cliente","DEMO12345",true,phone="0991234567")).str("token"))
        val cipher=com.premierdarkcoffee.loyalty.wallet.WalletCipher(java.util.Base64.getEncoder().encodeToString(ByteArray(32){5}))
        val wallet=com.premierdarkcoffee.loyalty.wallet.WalletService(service,"https://example.test",cipher)
        val original=wallet.materialize(customer)
        time.value=Instant.parse("2026-12-01T05:00:00Z");val december=request.copy(revision=2,entries=listOf(schedule.copy(billBefore="2027-01-01")))
        repeat(2){service.commercial.sweep();service.commercial.updateCalendar(f.tenant,december)}
        assertEquals(0L,balance(f));assertTrue(invoices(f).isEmpty())
        val closed=schedule.copy(endsBefore="2027-01-01",billBefore="2027-01-01")
        val january=december.copy(revision=3,entries=listOf(closed,CatalogSchedule(id(),"Wallet mensual","2027-01-01",null,499,"2027-02-01",consentOn="2027-01-01")))
        time.value=Instant.parse("2027-01-01T05:00:00Z")
        assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        time.value=Instant.parse("2027-01-01T05:00:00Z");service.commercial.updateCalendar(f.tenant,january)
        time.value=Instant.parse("2027-02-01T04:59:59Z");assertTrue(invoices(f).isEmpty())
        time.value=Instant.parse("2027-02-01T05:00:00Z");repeat(2){service.commercial.sweep()}
        assertEquals(499L,balance(f));assertEquals(1,invoices(f).size)
        time.value=Instant.parse("2027-02-16T04:59:59Z");assertEquals("ACTIVE",service.commercial.publicAccess(f.tenant).str("state"))
        time.value=Instant.parse("2027-02-16T05:00:00Z");assertEquals("SUSPENDED",service.commercial.publicAccess(f.tenant).str("state"))
        val suspended=wallet.materialize(customer)
        assertEquals(original.serial,suspended.serial)
        assertTrue(suspended.appleJson("pass.example","TEAM","https://example.test").getValue("voided").jsonPrimitive.boolean)
        assertEquals("INACTIVE",suspended.googleJson("issuer.object","issuer.class","https://example.test").str("state"))
        val other=fixture();accept(other);assertEquals("ACTIVE",service.commercial.publicAccess(other.tenant).str("state"))
        service.commercial.charge(f.tenant,NewCharge("Web",5000,"2026-12-05"),id())
        val charges=invoices(f).map{it.jsonObject}.filter{it.str("description")!="Web"}
        val first=charges.first()
        service.commercial.pay(f.tenant,RecordPayment(first.str("id"),1,"PARCIAL","CASH","2027-02-16"),id())
        assertEquals("SUSPENDED",service.commercial.publicAccess(f.tenant).str("state"))
        val paged=service.commercial.account(f.tenant,offset=100)
        assertTrue(paged.getValue("invoices").jsonArray.isEmpty())
        val walletBilling=paged.getValue("walletBilling").jsonObject
        assertEquals(498L,walletBilling.getValue("balanceMinor").jsonPrimitive.long)
        assertEquals(498L,walletBilling.getValue("overdueMinor").jsonPrimitive.long)
        val cut=walletBilling.getValue("nextCut").jsonObject
        assertEquals(first.str("id"),cut.str("invoiceId"))
        assertEquals("2027-02-15",cut.str("dueOn"))
        assertEquals(498L,cut.getValue("remainingMinor").jsonPrimitive.long)
        assertEquals(1,cut.getValue("invoiceCount").jsonPrimitive.int)
        val tender=RecordPayment(first.str("id"),498,"PAGO DEL CORTE","TRANSFER","2027-02-16",walletCut=true)
        val reference=id()
        val payment=service.commercial.pay(f.tenant,tender,reference).str("id")
        assertEquals(payment,service.commercial.pay(f.tenant,tender,reference).str("id"))
        val receipt=service.commercial.paymentReceipt(f.tenant,payment,f.staff)
        assertEquals(1,receipt.getValue("allocations").jsonArray.size)
        val settled=service.commercial.account(f.tenant).getValue("walletBilling").jsonObject
        assertEquals(0L,settled.getValue("balanceMinor").jsonPrimitive.long)
        assertEquals(JsonNull,settled.getValue("nextCut"))
        service.commercial.reverse(f.tenant,payment,Correction("Corrección de prueba"),id())
        assertEquals("SUSPENDED",service.commercial.publicAccess(f.tenant).str("state"))
        service.commercial.pay(f.tenant,tender.copy(reference="PAGO VERIFICADO"),id())
        assertEquals("ACTIVE",service.commercial.publicAccess(f.tenant).str("state"));assertEquals(5000L,balance(f))
        val restored=wallet.materialize(customer)
        assertEquals(original.serial,restored.serial)
        assertFalse(restored.appleJson("pass.example","TEAM","https://example.test").getValue("voided").jsonPrimitive.boolean)
        assertEquals("ACTIVE",restored.googleJson("issuer.object","issuer.class","https://example.test").str("state"))
    }

    @Test fun `replacing the signed Wallet with a bundle keeps its prepaid period and charges one rate at the cut`() {
        val f=fixture(); accept(f)
        val combo=CatalogSchedule(id(),"Wallet con Contenido","2027-01-01",null,2000,"2027-02-01",consentOn="2027-01-01")
        val transfer=CatalogCalendar(f.registration.companyId,1,listOf(combo))
        service.commercial.updateCalendar(f.tenant,transfer)
        assertEquals(0L,balance(f))
        assertEquals("ACTIVE",service.commercial.publicAccess(f.tenant).str("state"))
        time.value=Instant.parse("2027-01-01T05:00:00Z"); repeat(2){service.commercial.sweep()}
        assertTrue(invoices(f).isEmpty())
        assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
        assertEquals(409,assertFailsWith<Problem>{service.commercial.updateCalendar(f.tenant,transfer.copy(entries=listOf(combo.copy(feeMinor=499))))}.status)
        time.value=Instant.parse("2027-02-01T05:00:00Z");service.commercial.sweep()
        assertEquals(listOf(2000L),invoices(f).map{it.jsonObject.getValue("amountMinor").jsonPrimitive.long})
        service.commercial.updateCalendar(f.tenant,transfer.copy(revision=2,entries=listOf(combo.copy(billBefore="2027-03-01"))))
        assertEquals(1,invoices(f).size)
        time.value=Instant.parse("2027-03-01T05:00:00Z");repeat(2){service.commercial.sweep()}
        assertEquals(2,invoices(f).size)

        // This agreement has an explicit price for the other services. Only Wallet is free.
        time.value=Instant.parse("2026-12-01T15:00:00Z")
        val bundle=fixture()
        val split=CatalogSchedule(id(),"Contenido y Wallet","2026-12-01",null,2499,"2027-02-01",otherMinor=2000)
        service.commercial.updateCalendar(bundle.tenant,CatalogCalendar(bundle.registration.companyId,1,listOf(split)))
        time.value=Instant.parse("2027-01-01T05:00:00Z");assertEquals(2000L,balance(bundle))
        assertFalse(invoices(bundle).single().jsonObject.getValue("walletDue").jsonPrimitive.boolean)
        assertEquals("SUSPENDED",service.commercial.publicAccess(bundle.tenant).str("state"))
        val consent=CatalogSchedule(id(),"Wallet mensual","2027-01-01",null,499,"2027-02-01",consentOn="2027-01-01")
        service.commercial.updateCalendar(bundle.tenant,CatalogCalendar(bundle.registration.companyId,2,listOf(split,consent)))
        time.value=Instant.parse("2027-01-22T15:00:00Z");assertEquals("ACTIVE",service.commercial.publicAccess(bundle.tenant).str("state"))
        val partial=fixture()
        val partialSchedule=CatalogSchedule(id(),"Wallet mensual","2027-01-22",null,499,"2027-02-01",consentOn="2027-01-22")
        service.commercial.updateCalendar(partial.tenant,CatalogCalendar(partial.registration.companyId,1,listOf(partialSchedule)))
        time.value=Instant.parse("2027-02-01T05:00:00Z")
        assertEquals(161L,balance(partial));assertEquals(4499L,balance(bundle))
        time.value=Instant.parse("2027-02-16T05:00:00Z")
        assertEquals("SUSPENDED",service.commercial.publicAccess(bundle.tenant).str("state"))
        val wallet=invoices(bundle).map{it.jsonObject}.single{it.getValue("walletDue").jsonPrimitive.boolean}
        service.commercial.pay(bundle.tenant,RecordPayment(wallet.str("id"),499,id(),"TRANSFER","2027-02-16"),id())
        assertEquals("ACTIVE",service.commercial.publicAccess(bundle.tenant).str("state"));assertEquals(4000L,balance(bundle))

        time.value=Instant.parse("2027-01-01T15:00:00Z")
        val annual=fixture()
        val yearly=CatalogSchedule(id(),"Wallet anual","2027-01-01",null,5000,"2028-01-01",months=12,consentOn="2027-01-01")
        service.commercial.updateCalendar(annual.tenant,CatalogCalendar(annual.registration.companyId,1,listOf(yearly)))
        time.value=Instant.parse("2027-01-31T15:00:00Z");assertTrue(invoices(annual).isEmpty())
        time.value=Instant.parse("2027-02-01T05:00:00Z");assertEquals(5000L,balance(annual))
        time.value=Instant.parse("2027-12-31T15:00:00Z");repeat(2){service.commercial.sweep()};assertEquals(1,invoices(annual).size)
        val overlap=yearly.copy(id=id(),startsOn="2027-07-01",feeMinor=499,months=1)
        assertEquals("OVERLAPPING_PERIOD",assertFailsWith<Problem>{service.commercial.updateCalendar(annual.tenant,CatalogCalendar(annual.registration.companyId,2,listOf(yearly,overlap)))}.code)
    }

    @Test fun `a returning owner keeps prepaid days only after consent and is charged after the next uncovered month`() {
        val f=fixture()
        val prepaid=CatalogSchedule(id(),"Período anterior","2026-12-15","2027-02-01",0,"2027-02-01",replacesLegacy=false)
        val old=CatalogCalendar(f.registration.companyId,1,listOf(prepaid),trialActive=true)
        service.commercial.updateCalendar(f.tenant,old)
        assertEquals("SUSPENDED",service.commercial.publicAccess(f.tenant).str("state"))
        time.value=Instant.parse("2027-01-22T15:00:00Z")
        val chosen=CatalogSchedule(id(),"Wallet mensual","2027-02-01",null,499,"2027-03-01",consentOn="2027-01-22",perBranch=true,initialBranches=2)
        seedBranch(f)
        service.commercial.updateCalendar(f.tenant,old.copy(revision=2,entries=listOf(prepaid,chosen)))
        assertEquals("ACTIVE",service.commercial.publicAccess(f.tenant).str("state"))
        time.value=Instant.parse("2027-02-01T15:00:00Z")
        assertTrue(invoices(f).isEmpty())
        time.value=Instant.parse("2027-03-01T15:00:00Z")
        repeat(2){service.commercial.sweep()}
        assertEquals(listOf(998L),invoices(f).map{it.jsonObject.getValue("amountMinor").jsonPrimitive.long})
    }

    @Test fun `a late calendar handover replaces an unpaid advance and respects a recorded payment`() {
        for(alreadyPaid in listOf(false,true)){
            time.value=Instant.parse("2027-01-01T15:00:00Z");val f=fixture();accept(f)
            time.value=Instant.parse("2027-02-01T15:00:00Z");service.commercial.sweep()
            val old=invoices(f).single().jsonObject
            if(alreadyPaid)service.commercial.pay(f.tenant,RecordPayment(old.str("id"),500,id(),"CASH","2027-02-01"),id())
            val combo=CatalogSchedule(id(),"Wallet y redes","2027-01-01",null,2000,"2027-02-01",consentOn="2027-01-01")
            service.commercial.updateCalendar(f.tenant,CatalogCalendar(f.registration.companyId,1,listOf(combo)))
            val active=invoices(f).map{it.jsonObject}.filter{it.str("status")!="VOID"}
            assertEquals(1,active.size)
            assertEquals(if(alreadyPaid)500L else 2000L,active.first().getValue("amountMinor").jsonPrimitive.long)
        }
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
    @Test fun `trial and January create no invoice until February first in Ecuador`() {
        time.value=Instant.parse("2027-01-01T04:59:59Z")
        val f=fixture()
        service.commercial.updateCalendar(f.tenant,CatalogCalendar(f.registration.companyId,1,emptyList(),trialActive=true))
        assertEquals("TRIAL_ACTIVE",assertFailsWith<Problem>{accept(f)}.code);assertEquals(0L,balance(f))
        time.value=Instant.parse("2027-01-01T05:00:00Z")
        assertEquals("INACTIVE",service.commercial.accessState(f.tenant).str("walletSubscriptionState"));accept(f)
        time.value=Instant.parse("2027-02-01T04:59:59Z");assertEquals(0L,balance(f));assertTrue(invoices(f).isEmpty())
        assertEquals("2027-02-01",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2027-02-01T05:00:00Z");assertEquals(500L,balance(f));assertEquals(1,invoices(f).size)
        assertEquals("2027-03-01",status(f).str("nextChargeOn"))
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
        val f=fixture();val q=service.walletSubscriptionOffer(f.staff,f.offer);seedBranch(f)
        assertEquals("OFFER_CHANGED",assertFailsWith<Problem>{accept(f,quote=q)}.code)
        val fresh=service.walletSubscriptionOffer(f.staff,f.offer)
        assertFailsWith<Problem>{service.acceptWalletSubscription(f.staff,WalletAcceptInput(f.offer.copy(provider=provider.copy(legalName="Otro proveedor")),fresh.str("hash"),true),id())}
        time.value=Instant.parse("2027-01-02T15:00:00Z");assertFailsWith<Problem>{accept(f,quote=fresh)}
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
        val f=fixture();seedBranch(f);accept(f)
        time.value=Instant.parse("2027-01-15T12:00:00Z");branch(f)
        time.value=Instant.parse("2027-03-01T12:00:00Z");service.commercial.sweep();service.commercial.sweep()
        assertEquals(3,invoices(f).size);assertEquals(2774L,balance(f)) // Two full branches in January, 17/31 of the third, then three in February.
        assertEquals(setOf(1000L,274L,1500L),invoices(f).map{it.jsonObject.getValue("amountMinor").jsonPrimitive.long}.toSet())
    }
    @Test fun `midmonth signup bills only its days and counts a new branch at the first cut`() {
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture();accept(f);assertEquals(0L,balance(f))
        branch(f);assertEquals(0L,balance(f));time.value=Instant.parse("2027-04-01T05:00:00Z")
        assertEquals(420L,balance(f)) // Both locations operated 13 of 31 March days.
        assertEquals(2,invoices(f).size);assertTrue(invoices(f).all { it.jsonObject.str("dueOn")=="2027-04-15" })
        time.value=Instant.parse("2027-05-01T05:00:00Z");assertEquals(1420L,balance(f))
    }
    @Test fun `cancel trial preserves card identities and issues no January charge`() {
        time.value=Instant.parse("2026-12-10T15:00:00Z")
        val f=fixture();val original=service.businessProfile(f.tenant)
        service.commercial.updateCalendar(f.tenant,CatalogCalendar(f.registration.companyId,1,emptyList(),true))
        service.commercial.updateCalendar(f.tenant,CatalogCalendar(f.registration.companyId,2,emptyList(),false))
        time.value=Instant.parse("2027-02-01T12:00:00Z");assertEquals(0L,balance(f));assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals(f.tenant,service.staff(f.token).tenant);assertEquals(original.getValue("business"),service.businessProfile(f.tenant).getValue("business"))
        assertEquals(f.tenant,service.registerLuminaBusiness(f.registration).getValue("business").jsonObject.str("id"))
    }
    @Test fun `cancelling an opening period retains just the days used and resuming avoids overlapping fees`() {
        time.value=Instant.parse("2027-01-31T12:00:00Z");val f=fixture();accept(f);cancel(f);assertEquals(0L,balance(f))
        assertEquals("2027-02-01",status(f).str("endsOn"))
        time.value=Instant.parse("2027-02-10T12:00:00Z");accept(f);assertEquals(16L,balance(f))
        time.value=Instant.parse("2027-03-01T12:00:00Z");assertEquals(355L,balance(f))
        assertEquals("2027-04-01",status(f).str("nextChargeOn"))
    }
    @Test fun `legacy plans cannot be replaced and platform cannot overwrite accepted rate`() {
        val f=fixture()
        assertEquals("WALLET_ACCEPTANCE_REQUIRED",assertFailsWith<Problem>{service.commercial.configure(f.tenant,MembershipChange(0,MembershipPlan("Anterior",2000,"2026-11-19","2027-01-01")))}.code)
        db.tx{c->service.commercial.savePlan(c,f.tenant,MembershipPlan("Anterior",2000,"2026-11-19","2027-01-01"),1)}
        time.value=Instant.parse("2027-02-01T12:00:00Z");assertEquals(0L,balance(f));accept(f)
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
        assertEquals(17,db.tx{it.one("SELECT count(*) FROM comeback_migrations"){r->r.getInt(1)}})
    }

    @Test fun `annual promotion and historical branches charge one full year once`() {
        val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};seedBranch(f);accept(f)
        assertEquals(0L,balance(f))
        time.value=Instant.parse("2027-01-31T15:00:00Z");assertEquals(0L,balance(f))
        time.value=Instant.parse("2027-02-01T05:00:00Z");assertEquals(10000L,balance(f));assertEquals("2028-02-01",status(f).str("nextChargeOn"))
        val january=invoices(f).single().jsonObject
        service.commercial.pay(f.tenant,RecordPayment(january.str("id"),10000L,"January","TRANSFER","2027-02-01"),id())
        time.value=Instant.parse("2027-06-15T12:00:00Z");branch(f);service.commercial.sweep();assertEquals(0L,balance(f))
        assertEquals("2027-07-01", status(f).str("nextChargeOn"))
        val beforeCut = service.commercial.ownerAccount(f.staff)
        assertEquals("2027-07-01", beforeCut.str("nextWalletChargeOn"))
        assertEquals("2027-07-15", beforeCut.getValue("membership").jsonObject.str("nextDueOn"))
        assertEquals(2740L, beforeCut.getValue("nextBranchCharge").jsonObject.getValue("amountMinor").jsonPrimitive.long)
        time.value=Instant.parse("2027-07-01T05:00:00Z");repeat(2){service.commercial.sweep()}
        assertEquals(JsonNull, service.commercial.ownerAccount(f.staff)["nextBranchCharge"])
        assertEquals("2028-02-01", status(f).str("nextChargeOn"))
        assertEquals(2740L,db.tx{c->c.one("SELECT sum(amount_minor-paid_minor) FROM billing_invoices WHERE tenant_id=?",f.tenant){it.getLong(1)}})
        time.value=Instant.parse("2028-02-01T05:00:00Z");service.commercial.sweep();service.commercial.sweep()
        assertEquals(17740L,balance(f));assertEquals(3,invoices(f).size) // 200/365 of the prior year plus the renewal for three branches.
    }
    @Test fun `the same branch cutoff reaches the owner and agency after cancelling an annual catalog renewal`() {
        val f = fixture()
        val terms = CatalogSchedule(id(), "Wallet anual", "2027-01-01", null, 5000, "2028-01-01",
            months = 12, consentOn = "2027-01-01", perBranch = true)
        val calendar = CatalogCalendar(f.registration.companyId, 1, listOf(terms))
        service.commercial.updateCalendar(f.tenant, calendar)
        time.value = Instant.parse("2027-02-01T12:00:00Z")
        val initial = invoices(f).single().jsonObject
        service.commercial.pay(f.tenant, RecordPayment(initial.str("id"), 5000, "Año pagado", "TRANSFER", "2027-02-01"), id())
        time.value = Instant.parse("2027-06-15T12:00:00Z")
        branch(f)
        time.value = Instant.parse("2027-06-16T12:00:00Z")
        branch(f)
        service.commercial.updateCalendar(f.tenant, calendar.copy(revision = 2, entries = listOf(terms.copy(endsBefore = "2028-01-01"))))
        val account = service.commercial.ownerAccount(f.staff)
        val adjustment = account.getValue("nextBranchCharge").jsonObject
        assertEquals("2027-07-01", account.str("nextWalletChargeOn"))
        assertEquals("2027-07-01", adjustment.str("cutOn"))
        assertEquals("2027-07-15", adjustment.str("dueOn"))
        assertEquals(2, adjustment.getValue("branchCount").jsonPrimitive.int)
        assertEquals(5466L, adjustment.getValue("amountMinor").jsonPrimitive.long)
        val directory = service.commercial.businesses("lumina-" + f.registration.companyId.replace("-", ""))
        assertEquals("2027-07-01", directory.getValue("items").jsonArray.single().jsonObject.str("nextChargeOn"))
        assertEquals(0L, balance(f))
        time.value = Instant.parse("2027-07-01T05:00:00Z")
        repeat(2) { service.commercial.sweep() }
        val afterCut = service.commercial.ownerAccount(f.staff)
        val issued = afterCut.getValue("walletBilling").jsonObject.getValue("nextCut").jsonObject
        assertEquals(adjustment.str("dueOn"), issued.str("dueOn"))
        assertEquals(5466L, afterCut.getValue("walletBilling").jsonObject.getValue("balanceMinor").jsonPrimitive.long)
        assertEquals(JsonNull, afterCut["nextBranchCharge"])
        assertEquals(JsonNull, afterCut["nextWalletChargeOn"])
        time.value = Instant.parse("2027-07-16T04:59:59Z")
        assertTrue(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        time.value = Instant.parse("2027-07-16T05:00:00Z")
        assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        val bill = issued.str("invoiceId")
        service.commercial.pay(f.tenant, RecordPayment(bill, 1000, "Abono", "CASH", "2027-07-16"), id())
        assertEquals(4466L, balance(f))
        assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        val payment = RecordPayment(bill, 4466, "Saldo de las dos sucursales", "TRANSFER", "2027-07-16", walletCut = true)
        val key = id()
        repeat(2) { service.commercial.pay(f.tenant, payment, key) }
        assertTrue(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals(0L, balance(f))
    }
    @Test fun `monthly to annual change begins after the paid calendar month`() {
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture();accept(f);assertEquals(0L,balance(f))
        time.value=Instant.parse("2027-04-02T12:00:00Z");accept(f.copy(offer=f.offer.copy(cycle="ANNUAL")))
        assertEquals(210L,balance(f));assertEquals("2027-05-01",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2027-05-01T12:00:00Z");assertEquals(710L,balance(f))
        time.value=Instant.parse("2027-06-01T12:00:00Z");assertEquals(5710L,balance(f));assertEquals("2028-06-01",status(f).str("nextChargeOn"))
    }
    @Test fun `leap-day annual opening is prorated and changing to monthly preserves the paid year`() {
        time.value=Instant.parse("2028-02-29T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f)
        assertEquals(0L,balance(f));time.value=Instant.parse("2028-03-03T12:00:00Z");accept(f.copy(offer=f.offer.copy(cycle="MONTHLY")))
        assertEquals(14L,balance(f));assertEquals("2028-04-01",status(f).str("nextChargeOn"))
        time.value=Instant.parse("2029-03-01T12:00:00Z");assertEquals(5014L,balance(f))
        time.value=Instant.parse("2029-04-01T12:00:00Z");assertEquals(5514L,balance(f));assertEquals("2029-05-01",status(f).str("nextChargeOn"))
    }
    @Test fun `annual cancellation after the first cut retains the full covered year`() {
        time.value=Instant.parse("2027-01-31T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f)
        time.value=Instant.parse("2027-02-02T12:00:00Z");cancel(f)
        assertEquals("2028-02-01",status(f).str("endsOn"));assertEquals(13L,balance(f))
        time.value=Instant.parse("2027-02-10T12:00:00Z");accept(f);assertEquals(13L,balance(f))
        time.value=Instant.parse("2028-02-01T12:00:00Z");assertEquals(5013L,balance(f))
        time.value=Instant.parse("2028-03-01T12:00:00Z");assertEquals(10013L,balance(f))
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
        time.value=Instant.parse("2027-02-01T12:00:00Z");assertEquals(500L,balance(f));assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
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
        time.value=Instant.parse("2027-03-19T12:00:00Z");val f=fixture().let{it.copy(offer=it.offer.copy(cycle="ANNUAL"))};accept(f);assertEquals(0L,balance(f))
        val version=service.commercial.accessState(f.tenant).getValue("version").jsonPrimitive.int
        time.value=Instant.parse("2027-04-02T12:00:00Z");service.commercial.changeAccess(f.tenant,AccessChange("CLOSED","Cierre solicitado",version,id()))
        assertFalse(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        assertEquals("2028-04-01",status(f).str("endsOn"));assertFalse(status(f).getValue("recurring").jsonPrimitive.boolean)
        service.commercial.changeAccess(f.tenant,AccessChange("ACTIVE","Negocio reabierto",version+1,id()))
        assertTrue(service.commercial.publicAccess(f.tenant).getValue("canOperate").jsonPrimitive.boolean)
        accept(f);assertEquals(175L,balance(f));time.value=Instant.parse("2027-05-01T12:00:00Z");assertEquals(5175L,balance(f));assertEquals("2028-05-01",status(f).str("nextChargeOn"))
    }
    @Test fun `cedula replaces owner email and remains bound to the accepted offer`() {
        val f=fixture().let { it.copy(offer=it.offer.copy(ownerEmail="",ownerDocument="1748639844")) }
        val quote=service.walletSubscriptionOffer(f.staff,f.offer)
        val changed=f.offer.copy(ownerDocument="1748225842")
        assertEquals("OFFER_CHANGED",assertFailsWith<Problem>{service.acceptWalletSubscription(f.staff,WalletAcceptInput(changed,quote.str("hash"),true),id())}.code)
        accept(f,quote=quote)
        val agreement=status(f).getValue("agreement").jsonObject
        assertEquals("1748639844",agreement.str("ownerDocument"));assertEquals("",agreement.str("ownerEmail"))
        assertEquals(0L,balance(f))
    }
    @Test fun `a supplied malformed document cannot fall back to a legacy email`() {
        val f=fixture()
        for(document in listOf("1712345678","0000000000","letters","17486398440")) {
            assertEquals("INVALID_OWNER_IDENTITY",assertFailsWith<Problem>{service.walletSubscriptionOffer(f.staff,f.offer.copy(ownerDocument=document))}.code)
        }
        assertFalse(status(f).getValue("accepted").jsonPrimitive.boolean)
    }

}
