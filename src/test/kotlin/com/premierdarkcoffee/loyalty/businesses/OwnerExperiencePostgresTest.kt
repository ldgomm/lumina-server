package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.billing.AccessChange
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.marketing.BirthdaySettings
import com.premierdarkcoffee.loyalty.marketing.BirthdaySettingsChange
import com.premierdarkcoffee.loyalty.marketing.CustomerPreferences
import com.premierdarkcoffee.loyalty.marketing.CustomerPreferencesChange
import com.premierdarkcoffee.loyalty.marketing.PurchaseItem
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.WalletDesignChange
import com.premierdarkcoffee.loyalty.marketing.birthdayConfiguration
import com.premierdarkcoffee.loyalty.marketing.birthdaySuggestions
import com.premierdarkcoffee.loyalty.marketing.saveBirthdayConfiguration
import com.premierdarkcoffee.loyalty.marketing.saveDesign
import com.premierdarkcoffee.loyalty.marketing.savePreferences
import com.premierdarkcoffee.loyalty.shared.Bonus
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.CounterRedemption
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.redeemAtCounter

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OwnerExperiencePostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="owner_experience_"+id().replace("-","")
    private val at=Instant.parse("2026-11-07T15:00:00Z")
    private val pepper="owner-experience-pepper-at-least-32-characters"
    private val admin="platform-experience-only-test-token-32-characters"
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@OwnerExperiencePostgresTest.password;maximumPoolSize=5;connectionInitSql="SET search_path TO ${this@OwnerExperiencePostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,pepper,Clock.fixed(at,ZoneOffset.UTC))
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private fun profile()=BusinessProfile("Razón de prueba","1790012345001","Servicios","Ana","ana@example.test","0991234567","Pichincha","Quito","Dirección de prueba")
    private data class F(val owner:Staff,val token:String,val member:Member,val a:String,val b:String)
    private fun fixture():F {
        val slug="owner-"+id().take(12);val t=service.createTenant(NewTenant("Negocio",slug,profile=profile(),firstBranch=NewBranch("Centro","A")))
        val token=t.str("ownerToken");val owner=service.staff(token);val b=service.newBranch(owner,NewBranch("Norte","B")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Ana","TEST"+id().take(12),true)).str("token"))
        db.tx{it.exec("UPDATE members SET created_at=? WHERE tenant_id=?",Timestamp.from(at),owner.tenant)}
        return F(owner,token,member,t.str("firstBranchId"),b)
    }
    private fun count(table:String,f:F)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!!}
    private fun wallet(f:F,time:Instant=at)=WalletService(LoyaltyService(db,pepper,Clock.fixed(time,ZoneOffset.UTC)),"https://example.test",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){7}))).materialize(f.member)
    private fun preferences(f:F,day:String="11-07",consent:Boolean=true)=service.savePreferences(f.owner,f.member.id,CustomerPreferencesChange(CustomerPreferences(day,consent),true))
    private fun suspend(f:F){val version=service.commercial.account(f.owner.tenant).getValue("access").jsonObject.num("version").toInt();service.commercial.changeAccess(f.owner.tenant,AccessChange("SUSPENDED","Solicitud de prueba",version))}
    private fun purchase(f:F,amount:Long,branch:String=f.a,items:List<PurchaseItem> = emptyList())=service.purchase(f.owner,Purchase(f.member.id,branch,id(),amount,"USD",items),id())
    private fun parallel(work:()->JsonObject):List<Any>{val pool=Executors.newFixedThreadPool(3);val barrier=CyclicBarrier(3);return try{(1..3).map{pool.submit<Any>{barrier.await();try{work()}catch(e:Problem){e}}}.map{it.get(40,TimeUnit.SECONDS)}}finally{pool.shutdownNow()}}

    @Test fun `owner cannot modify any protected identity field even with a reason`() {
        val f=fixture();val p=profile();val before=service.businessProfile(f.owner.tenant)
        for(changed in listOf(p.copy(legalName="Otra razón"),p.copy(ruc="1234567890123"),p.copy(activity="Otra actividad"),p.copy(province="Azuay"),p.copy(city="Cuenca"),p.copy(address="Otra dirección")))
            assertEquals("PROFILE_ADMIN_REQUIRED",assertFailsWith<Problem>{service.saveBusinessProfile(f.owner.tenant,BusinessProfileChange(1,changed,"Dueño dice que verificó"),f.owner.id)}.code)
        assertEquals(before,service.businessProfile(f.owner.tenant));assertEquals(0,count("business_profile_corrections",f))
    }
    @Test fun `owner can update contacts and social links without changing legal identity`() {
        val f=fixture();val changed=profile().copy(contactName="Nuevo contacto",socialLinks=mapOf("instagram" to "https://instagram.com/ejemplo"))
        val saved=service.saveBusinessProfile(f.owner.tenant,BusinessProfileChange(1,changed),f.owner.id)
        assertEquals(changed,json.decodeFromJsonElement<BusinessProfile>(saved.getValue("profile")));assertEquals(0,count("business_profile_corrections",f))
    }
    @Test fun `administrator correction requires reason and retains before after history`() {
        val f=fixture();val changed=profile().copy(city="Cuenca")
        assertEquals("CORRECTION_REASON_REQUIRED",assertFailsWith<Problem>{service.saveBusinessProfile(f.owner.tenant,BusinessProfileChange(1,changed),"platform")}.code)
        service.saveBusinessProfile(f.owner.tenant,BusinessProfileChange(1,changed,"Verificado con el dueño"),"platform")
        val row=db.tx{c->c.one("SELECT before_config->>'city',after_config->>'city',reason,actor_id FROM business_profile_corrections WHERE tenant_id=?",f.owner.tenant){listOf(it.getString(1),it.getString(2),it.getString(3),it.getString(4))}}
        assertEquals(listOf("Quito","Cuenca","Verificado con el dueño","platform"),row)
    }
    @Test fun `correction requests replay and concurrent requests create one pending item`() {
        val f=fixture();val input=ProfileCorrectionRequest("Corregir la dirección del establecimiento");val key=id()
        val results=parallel{service.requestProfileCorrection(f.owner,input,key)}
        assertTrue(results.all{it is JsonObject});assertEquals(1,count("business_profile_requests",f))
        assertEquals(1,results.map{(it as JsonObject).str("id")}.distinct().size)
        assertEquals("REQUEST_PENDING",assertFailsWith<Problem>{service.requestProfileCorrection(f.owner,input,id())}.code)
        assertEquals(profile(),json.decodeFromJsonElement<BusinessProfile>(service.businessProfile(f.owner.tenant).getValue("profile")))
    }
    @Test fun `request resolution is tenant scoped repeatable and does not silently change profile`() {
        val f=fixture();val other=fixture();val request=service.requestProfileCorrection(f.owner,ProfileCorrectionRequest("Necesito corregir la ciudad"),id()).str("id")
        val resolution=ProfileCorrectionResolution("RESOLVED","Datos revisados con el dueño")
        assertEquals(404,assertFailsWith<Problem>{service.resolveProfileCorrection(other.owner.tenant,request,resolution)}.status)
        repeat(2){service.resolveProfileCorrection(f.owner.tenant,request,resolution)}
        assertEquals("REQUEST_RESOLVED",assertFailsWith<Problem>{service.resolveProfileCorrection(f.owner.tenant,request,resolution.copy(status="REJECTED"))}.code)
        assertEquals(1,service.businessProfile(f.owner.tenant).num("version"));assertEquals(0,service.businessProfile(other.owner.tenant).getValue("requests").jsonArray.size)
        service.requestProfileCorrection(f.owner,ProfileCorrectionRequest("Una nueva solicitud de revisión"),id());assertEquals(2,count("business_profile_requests",f))
    }
    @Test fun `suspended owner can request correction but cannot enable new promotions`() {
        val f=fixture();suspend(f)
        service.requestProfileCorrection(f.owner,ProfileCorrectionRequest("Revisar los datos antes de reactivar"),id())
        assertEquals("BUSINESS_SUSPENDED",assertFailsWith<Problem>{service.createSimplePromotion(f.owner,SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio",10),id())}.code)
        assertEquals(0,count("programs",f));assertEquals(1,count("business_profile_requests",f))
    }
    @Test fun `birthday defaults preserve old custom greeting and random choice is shared by Wallet providers`() {
        val f=fixture();service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign(birthdayMessage="Saludo anterior de la tienda")))
        assertEquals("Saludo anterior de la tienda",service.birthdayConfiguration(f.owner).getValue("settings").jsonObject.str("message"))
        val before=wallet(f);preferences(f)
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(0,BirthdaySettings(mode="RANDOM",templates=birthdaySuggestions)))
        val first=wallet(f);val greeting=first.snapshot.getValue("announcements").jsonArray.single().jsonObject
        assertTrue(birthdaySuggestions.any{it.title==greeting.str("title")&&it.message==greeting.str("body")})
        assertTrue(first.appleExperienceFields().toString().contains(greeting.str("body")))
        assertTrue(first.googleExperienceFields().toString().contains(greeting.str("body")))
        repeat(3){assertEquals(first.snapshot.getValue("announcements"),wallet(f).snapshot.getValue("announcements"))}
        assertEquals(before.serial,first.serial);assertEquals(before.token,first.token);assertEquals(before.snapshot.getValue("cardCode"),first.snapshot.getValue("cardCode"));assertEquals(1,count("birthday_greetings",f));assertEquals(0,count("ledger",f))
    }
    @Test fun `birthday selected text stays stable through edits pause and resume`() {
        val f=fixture();preferences(f)
        val settings=BirthdaySettings(mode="RANDOM",templates=birthdaySuggestions)
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(0,settings));val original=wallet(f).snapshot.getValue("announcements")
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(1,BirthdaySettings(title="Otro título",message="Otro texto")))
        assertEquals(original,wallet(f).snapshot.getValue("announcements"))
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(2,settings.copy(enabled=false)))
        assertTrue(wallet(f).snapshot.getValue("announcements").jsonArray.isEmpty())
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(3,settings))
        assertEquals(original,wallet(f).snapshot.getValue("announcements"));assertEquals(1,count("birthday_greetings",f))
    }
    @Test fun `birthday requires consent active business and local date and handles leap birthday`() {
        val f=fixture();preferences(f,consent=false);assertTrue(wallet(f).snapshot.getValue("announcements").jsonArray.isEmpty());assertEquals(0,count("birthday_greetings",f))
        preferences(f);assertTrue(wallet(f,Instant.parse("2026-11-07T04:59:59Z")).snapshot.getValue("announcements").jsonArray.isEmpty())
        assertEquals(1,wallet(f,Instant.parse("2026-11-07T05:00:00Z")).snapshot.getValue("announcements").jsonArray.size)
        assertTrue(wallet(f,Instant.parse("2026-11-08T05:00:00Z")).snapshot.getValue("announcements").jsonArray.isEmpty())
        suspend(f);assertTrue(wallet(f).snapshot.getValue("announcements").jsonArray.isEmpty())
        val leap=fixture();preferences(leap,"02-29")
        assertEquals(1,wallet(leap,Instant.parse("2027-02-28T15:00:00Z")).snapshot.getValue("announcements").jsonArray.size)
        assertTrue(wallet(leap,Instant.parse("2028-02-28T15:00:00Z")).snapshot.getValue("announcements").jsonArray.isEmpty())
        assertEquals(1,wallet(leap,Instant.parse("2028-02-29T15:00:00Z")).snapshot.getValue("announcements").jsonArray.size)
        assertEquals(2,count("birthday_greetings",leap))
    }
    @Test fun `concurrent birthday generation produces one stored greeting and stale settings do not overwrite`() {
        val f=fixture();preferences(f);val settings=BirthdaySettings(mode="RANDOM",templates=birthdaySuggestions)
        service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(0,settings))
        val results=parallel{obj("announcement" to wallet(f).snapshot.getValue("announcements"))}
        assertTrue(results.all{it is JsonObject});assertEquals(1,results.distinct().size);assertEquals(1,count("birthday_greetings",f))
        assertEquals("VERSION_CONFLICT",assertFailsWith<Problem>{service.saveBirthdayConfiguration(f.owner,BirthdaySettingsChange(0,BirthdaySettings()))}.code)
    }
    @Test fun `simple promotion creation is atomic replayable and uses matching reward units`() {
        val f=fixture();val input=SimplePromotionSetup(Program("Saldo",Kind.CASHBACK,cashbackBps=500,branchIds=setOf(f.a,f.b)),"Premio a elección",500);val key=id()
        val results=parallel{service.createSimplePromotion(f.owner,input,key)}
        assertTrue(results.all{it is JsonObject});assertEquals(1,results.map{(it as JsonObject).str("programId")}.distinct().size)
        assertEquals(1,count("programs",f));assertEquals(1,count("rewards",f));assertEquals(1,count("reward_versions",f));purchase(f,10000)
        assertEquals(500,service.card(f.member).getValue("balances").jsonArray.single().jsonObject.num("available"))
        assertEquals(500,service.card(f.member).getValue("rewards").jsonArray.single().jsonObject.num("cost"))
    }
    @Test fun `foreign branches and changed idempotency payload leave no partial promotion`() {
        val f=fixture();val other=fixture();val p=Program("Puntos",Kind.POINTS)
        for(program in listOf(p.copy(branchIds=setOf(other.a)),p.copy(bonuses=listOf(Bonus(1,2,branchIds=setOf(other.a))))))
            assertFailsWith<Problem>{service.createSimplePromotion(f.owner,SimplePromotionSetup(program,"Premio",10),id())}
        assertEquals(0,count("programs",f));assertEquals(0,count("rewards",f))
        val key=id();val input=SimplePromotionSetup(p,"Premio",10);service.createSimplePromotion(f.owner,input,key)
        assertEquals(409,assertFailsWith<Problem>{service.createSimplePromotion(f.owner,input.copy(rewardCost=20),key)}.status)
        assertEquals(1,count("programs",f));assertEquals(1,count("rewards",f))
    }
    @Test fun `reports aggregate receipts categories branches and confirmed rewards without multiplication`() {
        val f=fixture();val other=fixture();val ids=service.createSimplePromotion(f.owner,SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio histórico",1),id())
        purchase(f,300,f.a,listOf(PurchaseItem("Café","café",2,150)));purchase(f,700,f.b);purchase(other,99000)
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        service.redeemAtCounter(f.owner,CounterRedemption(f.member.id,f.a,ids.str("rewardId"),revision,1,true,true),id())
        val before=service.card(f.member);val ledgers=count("ledger",f);val audit=count("audit_events",f)
        val m=service.commercial.ownerMetrics(f.owner,7)
        assertEquals(1000,m.num("salesMinor"));assertEquals(2,m.num("purchases"));assertEquals(1,m.num("activeClients"));assertEquals(1,m.num("repeatClients"));assertEquals(1,m.num("redemptions"))
        val branches=m.getValue("branches").jsonArray.map{it.jsonObject}
        assertEquals(listOf(f.b,f.a),branches.map{it.str("id")});assertEquals(1000,branches.sumOf{it.num("salesMinor")});assertEquals(1,branches.sumOf{it.num("redemptions")})
        assertEquals(2,m.getValue("categories").jsonArray.single().jsonObject.num("units"));assertEquals("Premio histórico",m.getValue("topRewards").jsonArray.single().jsonObject.str("name"))
        assertEquals(before,service.card(f.member));assertEquals(ledgers,count("ledger",f));assertEquals(audit,count("audit_events",f));assertEquals(0,count("birthday_greetings",f))
    }
    @Test fun `report periods use local midnight inclusive start and exclude future and foreign receipts`() {
        val f=fixture();val ids=listOf(100L,200L,300L,400L).map{purchase(f,it).str("purchaseId")}
        val start=Instant.parse("2026-11-01T05:00:00Z")
        db.tx{c->listOf(start,start.minusSeconds(1),at.plusSeconds(1),start.minusSeconds(7*86400+1)).forEachIndexed{i,t->c.exec("UPDATE purchases SET created_at=? WHERE tenant_id=? AND id=?",Timestamp.from(t),f.owner.tenant,ids[i])}}
        val m=service.commercial.ownerMetrics(f.owner,7)
        assertEquals(100,m.num("salesMinor"));assertEquals(200,m.num("previousSalesMinor"));assertEquals(1,m.num("previousPurchases"))
        assertEquals("2026-11-01",m.str("fromDate"));assertEquals("2026-10-25",m.str("previousFromDate"));assertEquals("2026-10-31",m.str("previousThroughDate"))
        assertEquals("2026-11-01",m.getValue("daily").jsonArray.single().jsonObject.str("day"))
        assertEquals(0,m.getValue("categories").jsonArray.size)
        assertEquals(365,service.commercial.ownerMetrics(f.owner,365).num("days"))
    }
    @Test fun `empty reports stay zero and suspended owner retains report access`() {
        val f=fixture();suspend(f);val m=service.commercial.ownerMetrics(f.owner,30)
        assertEquals(0,m.num("purchases"));assertEquals(0,m.num("salesMinor"));assertEquals(0.0,m.getValue("repeatRate").jsonPrimitive.double)
        assertTrue(m.getValue("daily").jsonArray.isEmpty());assertTrue(m.getValue("topRewards").jsonArray.isEmpty())
        assertEquals(2,m.getValue("branches").jsonArray.size);assertTrue(m.getValue("branches").jsonArray.all{it.jsonObject.num("salesMinor")==0L})
    }
    @Test fun `new routes enforce owner and platform scopes and request tenant cannot be overridden`()=testApplication {
        val f=fixture();val other=fixture();val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token")
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,admin,"http://localhost")}
        for(path in listOf("/api/staff/birthday-settings","/api/staff/metrics?days=365")){
            assertEquals(HttpStatusCode.Unauthorized,client.get(path).status);assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(cashier)}.status);assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(f.token)}.status)
        }
        val mutations=listOf("/api/staff/promotion-setups" to json.encodeToString(SimplePromotionSetup(Program("Puntos",Kind.POINTS),"Premio",10)),"/api/staff/business-profile/requests" to json.encodeToString(ProfileCorrectionRequest("Corregir la dirección registrada")))
        for((path,body) in mutations){assertEquals(HttpStatusCode.Forbidden,client.post(path){bearerAuth(cashier);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(body)}.status)}
        assertEquals(HttpStatusCode.Forbidden,client.put("/api/staff/birthday-settings"){bearerAuth(cashier);contentType(ContentType.Application.Json);setBody(json.encodeToString(BirthdaySettingsChange(0,BirthdaySettings())))}.status)
        val response=client.post("/api/staff/business-profile/requests?tenantId=${other.owner.tenant}"){bearerAuth(f.token);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(json.encodeToString(ProfileCorrectionRequest("Corregir la dirección registrada")))}
        assertEquals(HttpStatusCode.Created,response.status);assertEquals(1,count("business_profile_requests",f));assertEquals(0,count("business_profile_requests",other))
        val request=json.parseToJsonElement(response.bodyAsText()).jsonObject.str("id")
        val route="/api/platform/tenants/${f.owner.tenant}/profile-requests/$request"
        assertEquals(HttpStatusCode.Unauthorized,client.put(route){bearerAuth(f.token);contentType(ContentType.Application.Json);setBody(json.encodeToString(ProfileCorrectionResolution("REJECTED","Faltan los datos de respaldo")))}.status)
        assertEquals(HttpStatusCode.OK,client.put(route){bearerAuth(admin);contentType(ContentType.Application.Json);setBody(json.encodeToString(ProfileCorrectionResolution("REJECTED","Faltan los datos de respaldo")))}.status)
    }
}
