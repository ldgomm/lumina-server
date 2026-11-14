package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
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
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BusinessProfilePostgresTest {
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var schema: String
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val admin="platform-profile-only-test-credential-32-chars"
    private fun profile()=BusinessProfile("Razón Única "+id().take(8),"1790012345001","Cafetería","Ana Privada","private@example.test","0991234567","Pichincha","Quito","Dirección privada 123")
    private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
    @BeforeAll fun setup(){
        schema="profile_test_"+id().replace("-","")
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@BusinessProfilePostgresTest.password;maximumPoolSize=5;connectionInitSql="SET search_path TO ${this@BusinessProfilePostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"profile-test-pepper-at-least-32-characters")
    }
    @AfterAll fun cleanup(){
        if(::db.isInitialized)db.close()
        if(::schema.isInitialized)DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}
    }
    private fun business(p:BusinessProfile?=profile(),name:String="Café "+id().take(8))=service.createTenant(NewTenant(name,"profile-"+id().take(12),firstBranch=NewBranch("Principal","MAIN"),profile=p))
    private fun enroll(t:JsonObject,name:String)=service.enrollWithoutPassword(t.str("enrollmentPath").substringAfterLast('/'),WalletEnrollment(name,"ID"+id().take(12),true))
    @Test fun `creation persists profile branch and owner together and migration repeats`() {
        val p=profile();val t=business(p);val tenant=t.str("tenantId")
        db.migrate();val saved=service.businessProfile(tenant)
        assertEquals(1,saved.getValue("version").jsonPrimitive.int);assertEquals("NOT_VERIFIED",saved.str("rucVerification"));assertEquals(p,json.decodeFromJsonElement<BusinessProfile>(saved.getValue("profile")))
        assertEquals(1,service.platformBranches(tenant).getValue("branches").jsonArray.size);assertEquals(tenant,service.staff(t.str("ownerToken")).tenant)
        assertEquals(16,db.tx{it.one("SELECT count(*) FROM comeback_migrations"){r->r.getInt(1)}})
    }
    @Test fun `invalid profile or branch creates no tenant or orphan profile`() {
        for(input in listOf(NewTenant("Inválido","invalid-"+id().take(12),profile=profile().copy(ruc="wrong")),NewTenant("Inválido","invalid-"+id().take(12),firstBranch=NewBranch(" ","MAIN"),profile=profile()))) {
            assertFailsWith<Problem>{service.createTenant(input)}
            assertEquals(0,db.tx{it.one("SELECT count(*) FROM tenants WHERE slug=?",input.slug){r->r.getInt(1)}})
        }
    }
    @Test fun `legacy business can operate and complete profile later without changing identity`() {
        val t=business(null);val owner=service.staff(t.str("ownerToken"));val member=service.member(enroll(t,"Ana Antigua").str("token"))
        val before=service.card(member);assertEquals(JsonNull,service.businessProfile(owner.tenant)["profile"])
        assertEquals(403,assertFailsWith<Problem>{service.saveBusinessProfile(owner.tenant,BusinessProfileChange(0,profile()),owner.id)}.status)
        val saved=service.saveBusinessProfile(owner.tenant,BusinessProfileChange(0,profile(),"Ficha inicial revisada con el dueño"),"platform")
        assertEquals(1,saved.getValue("version").jsonPrimitive.int);assertEquals(before,service.card(member))
        assertEquals(owner,service.staff(t.str("ownerToken")))
    }
    @Test fun `stale profile update cannot overwrite newer contact data`() {
        val t=business();val tenant=t.str("tenantId");val p=profile();service.saveBusinessProfile(tenant,BusinessProfileChange(1,p,"Corrección solicitada y verificada"),"platform")
        assertEquals("PROFILE_CHANGED",assertFailsWith<Problem>{service.saveBusinessProfile(tenant,BusinessProfileChange(1,p.copy(city="Otra ciudad")),"platform")}.code)
        assertEquals("Quito",service.businessProfile(tenant).getValue("profile").jsonObject.str("city"))
        assertEquals(1,db.tx{it.one("SELECT count(*) FROM audit_events WHERE tenant_id=? AND action='BUSINESS_PROFILE_UPDATED'",tenant){r->r.getInt(1)}})
    }
    @Test fun `simultaneous profile writes have one winner`() {
        val tenant=business().str("tenantId");val p=profile();val pool=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        try{val results=(1..2).map{pool.submit<String>{barrier.await(10,TimeUnit.SECONDS);try{service.saveBusinessProfile(tenant,BusinessProfileChange(1,p,"Corrección solicitada y verificada"),"platform");"OK"}catch(e:Problem){e.code}}}.map{it.get(30,TimeUnit.SECONDS)}
            assertEquals(listOf("OK","PROFILE_CHANGED"),results.sorted());assertEquals(2,service.businessProfile(tenant).getValue("version").jsonPrimitive.int)
        }finally{pool.shutdownNow()}
    }
    @Test fun `name suggestions stay inside business without exposing identity or contact data`() {
        val a=business();val b=business();val prefix="Búsqueda"+id().take(5)
        enroll(a,"$prefix Ana");enroll(b,"$prefix Privada")
        val result=service.memberSuggestions(service.staff(a.str("ownerToken")),normalizedSearch(prefix)).getValue("items").jsonArray
        assertEquals(1,result.size);assertEquals(setOf("name","cardCode"),result[0].jsonObject.keys);assertEquals("$prefix Ana",result[0].jsonObject.str("name"))
    }
    @Test fun `suggestions are bounded and empty input or wildcard does not enumerate members`() {
        val t=business();val owner=service.staff(t.str("ownerToken"));val prefix="Grupo"+id().take(5)
        (1..10).forEach{enroll(t,"$prefix $it")}
        assertEquals(8,service.memberSuggestions(owner,prefix).getValue("items").jsonArray.size)
        for(q in listOf(""," ","a","%_"))assertTrue(service.memberSuggestions(owner,q).getValue("items").jsonArray.isEmpty())
    }
    @Test fun `platform searches names legal names and RUC including legacy businesses`() {
        val p=profile().copy(ruc="1234567890001");val t=business(p);val legacy=business(null,"Árbol "+id().take(8))
        for(q in listOf(p.ruc,p.legalName,service.businessProfile(t.str("tenantId")).getValue("business").jsonObject.str("name"))) {
            assertTrue(service.businessSuggestions(q).getValue("items").jsonArray.any{it.jsonObject.str("id")==t.str("tenantId")})
            assertTrue(service.commercial.businesses(q).getValue("items").jsonArray.any{it.jsonObject.str("id")==t.str("tenantId")})
        }
        val name=service.businessProfile(legacy.str("tenantId")).getValue("business").jsonObject.str("name")
        assertTrue(service.businessSuggestions(normalizedSearch(name)).getValue("items").jsonArray.any{it.jsonObject.str("id")==legacy.str("tenantId")})
        assertTrue(service.businessSuggestions("%_").getValue("items").jsonArray.isEmpty())
    }
    @Test fun `private profile never enters public business or customer card data`() {
        val p=profile();val t=business(p);val member=service.member(enroll(t,"Ana Pública").str("token"))
        val public=service.publicTenant(t.str("enrollmentPath").substringAfterLast('/')).toString()+service.card(member).toString()
        for(secret in listOf(p.ruc,p.email,p.phone,p.contactName,p.address))assertFalse(public.contains(secret))
    }
    @Test fun `strict registration requires profile and branch while legacy endpoint remains usable`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,admin,"http://localhost:8080")}
        val input=NewTenant("Nuevo","http-"+id().take(12))
        val old=client.post("/api/platform/tenants"){bearerAuth(admin);contentType(ContentType.Application.Json);setBody(json.encodeToString(input))}
        assertEquals(HttpStatusCode.Created,old.status)
        for(v in listOf(input,input.copy(profile=profile()),input.copy(firstBranch=NewBranch("Principal","MAIN"))))assertEquals(HttpStatusCode.BadRequest,client.post("/api/platform/businesses"){bearerAuth(admin);contentType(ContentType.Application.Json);setBody(json.encodeToString(v))}.status)
        assertEquals(HttpStatusCode.Created,client.post("/api/platform/businesses"){bearerAuth(admin);contentType(ContentType.Application.Json);setBody(json.encodeToString(input.copy(slug="full-"+id().take(12),firstBranch=NewBranch("Principal","MAIN"),profile=profile())))}.status)
    }
    @Test fun `owner profile is tenant scoped and cashiers cannot read or edit fiscal data`()=testApplication {
        val a=business();val b=business();val owner=service.staff(a.str("ownerToken"));val cashier=service.newStaff(owner,NewStaff("CASHIER",a.str("firstBranchId"))).str("token")
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,admin,"http://localhost:8080")}
        val path="/api/staff/business-profile"
        assertEquals(HttpStatusCode.Unauthorized,client.get(path).status)
        assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(cashier)}.status)
        assertEquals(HttpStatusCode.Forbidden,client.put(path){bearerAuth(cashier);contentType(ContentType.Application.Json);setBody(json.encodeToString(BusinessProfileChange(1,profile())))}.status)
        val own=client.get(path+"?tenant="+b.str("tenantId")){bearerAuth(a.str("ownerToken"))}
        assertEquals(a.str("tenantId"),json.parseToJsonElement(own.bodyAsText()).jsonObject.getValue("business").jsonObject.str("id"))
        assertEquals(HttpStatusCode.OK,client.put(path){bearerAuth(a.str("ownerToken"));contentType(ContentType.Application.Json);setBody(json.encodeToString(BusinessProfileChange(1,json.decodeFromJsonElement<BusinessProfile>(service.businessProfile(owner.tenant).getValue("profile")).copy(contactName="Contacto nuevo"))))}.status)
        assertEquals(1,service.businessProfile(b.str("tenantId")).getValue("version").jsonPrimitive.int)
        assertEquals(HttpStatusCode.OK,client.get("/api/staff/member-suggestions?q=Ana"){bearerAuth(cashier)}.status)
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/member-suggestions?q=Ana").status)
    }
    @Test fun `platform profile and suggestions require platform credential`()=testApplication {
        val t=business();environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,admin,"http://localhost:8080")}
        for(path in listOf("/api/platform/tenant-suggestions?q=Cafe","/api/platform/tenants/${t.str("tenantId")}/profile")) {
            assertEquals(HttpStatusCode.Unauthorized,client.get(path).status)
            assertEquals(HttpStatusCode.Unauthorized,client.get(path){bearerAuth(t.str("ownerToken"))}.status)
            assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(admin)}.status)
        }
    }
}
