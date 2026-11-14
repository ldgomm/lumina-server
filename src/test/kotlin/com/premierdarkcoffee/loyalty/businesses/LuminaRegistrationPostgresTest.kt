package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.util.concurrent.Callable
import java.util.concurrent.Executors
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class LuminaRegistrationPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="lumina_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val admin="lumina-registration-platform-test-token"
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@LuminaRegistrationPostgresTest.password;maximumPoolSize=6;connectionInitSql="SET search_path TO ${this@LuminaRegistrationPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"lumina-registration-test-pepper")
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun input()=LuminaRegistration(id(),"Panadería de prueba","Ana Responsable","ana@example.test","0991234567")
    private fun tenant(result:JsonObject)=result.getValue("business").jsonObject.getValue("id").jsonPrimitive.content
    private fun count(table:String,tenant:String)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",tenant){it.getLong(1)}!!}

    @Test fun `registration creates one active business and primary branch without demo balances or credentials`() {
        val value=input();val result=service.registerLuminaBusiness(value);val tenant=tenant(result)
        assertEquals(value.companyId,result.getValue("companyId").jsonPrimitive.content)
        assertEquals(1L,count("branches",tenant));assertEquals(1L,count("business_access",tenant))
        for(table in listOf("members","programs","rewards","staff_tokens","wallet_outbox"))assertEquals(0L,count(table,tenant),table)
        val profile=service.businessProfile(tenant)
        assertEquals(JsonNull,profile["profile"]);assertEquals("ana@example.test",profile.getValue("registration").jsonObject.getValue("email").jsonPrimitive.content)
        val staff=service.newStaff(Staff(tenant,"platform","OWNER",null),NewStaff("OWNER",name="Lúmina · Ana",requestId=id()))
        assertTrue(staff.getValue("credentialIssued").jsonPrimitive.boolean)
    }
    @Test fun `lost response and restart replay the persistent identity without replacing business data`() {
        val value=input();val first=service.registerLuminaBusiness(value);val tenant=tenant(first)
        db.tx{it.exec("UPDATE tenants SET name='Nombre corregido' WHERE id=?",tenant)}
        val restarted=LoyaltyService(db,"lumina-registration-test-pepper").registerLuminaBusiness(value)
        assertEquals(tenant,tenant(restarted));assertTrue(restarted.getValue("replayed").jsonPrimitive.boolean)
        assertEquals("Nombre corregido",restarted.getValue("business").jsonObject.getValue("name").jsonPrimitive.content)
        assertEquals(1L,count("branches",tenant))
    }
    @Test fun `concurrent registration resolves to one tenant and one branch`() {
        val value=input();val executor=Executors.newFixedThreadPool(4)
        try {
            val values=executor.invokeAll((1..4).map{Callable{tenant(service.registerLuminaBusiness(value))}}).map{it.get()}
            assertEquals(1,values.distinct().size);assertEquals(1L,count("branches",values.first()))
        }finally{executor.shutdownNow()}
    }
    @Test fun `same business name never links another registration or the existing demo`() {
        val original=service.createTenant(NewTenant("Panadería de prueba","demo-"+id().take(8)))
        val a=tenant(service.registerLuminaBusiness(input()));val b=tenant(service.registerLuminaBusiness(input()))
        assertNotEquals(a,b);assertNotEquals(original.getValue("tenantId").jsonPrimitive.content,a)
        val token=original.getValue("ownerToken").jsonPrimitive.content;assertEquals(original.getValue("tenantId").jsonPrimitive.content,service.staff(token).tenant)
    }
    @Test fun `migration is repeatable and retains old tenant credentials and wallet identity`() {
        val old=service.createTenant(NewTenant("Negocio anterior","old-"+id().take(8)));val token=old.getValue("ownerToken").jsonPrimitive.content
        val value=input();val tenant=tenant(service.registerLuminaBusiness(value));db.migrate();db.migrate()
        assertEquals(tenant,tenant(service.registerLuminaBusiness(value)));assertEquals(old.getValue("tenantId").jsonPrimitive.content,service.staff(token).tenant)
        assertEquals(1,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations WHERE version=14"){it.getInt(1)}})
    }
    @Test fun `HTTP endpoint requires platform auth and never returns a bootstrap token`() = testApplication {
        application { loyaltyRoutes(service,admin,"http://localhost") }
        val value=input();val body=json.encodeToString(value)
        val rejected=client.post("/api/platform/lumina/businesses"){contentType(ContentType.Application.Json);setBody(body)}
        assertEquals(HttpStatusCode.Unauthorized,rejected.status)
        val response=client.post("/api/platform/lumina/businesses"){bearerAuth(admin);contentType(ContentType.Application.Json);setBody(body)}
        assertEquals(HttpStatusCode.Created,response.status);val text=response.bodyAsText();assertFalse(text.contains("ownerToken"));assertFalse(text.contains("staffId"))
        assertEquals(value.companyId,json.parseToJsonElement(text).jsonObject.getValue("companyId").jsonPrimitive.content)
    }
    @Test fun `email free registration remains replay safe and creates no customers or agreement`() {
        val value=input().copy(email="",phone="+593991234567")
        val first=service.registerLuminaBusiness(value);val tenant=tenant(first)
        assertEquals(tenant,tenant(service.registerLuminaBusiness(value)))
        val registration=service.businessProfile(tenant).getValue("registration").jsonObject
        assertEquals("",registration.getValue("email").jsonPrimitive.content)
        assertEquals(value.phone,registration.getValue("phone").jsonPrimitive.content)
        assertEquals(0L,count("members",tenant));assertEquals(0L,count("billing_invoices",tenant))
    }

}
