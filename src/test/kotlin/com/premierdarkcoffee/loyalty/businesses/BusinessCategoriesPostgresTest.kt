package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.marketing.createPromotion
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

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
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BusinessCategoriesPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="category_"+id().replace("-","")
    private val admin="category-platform-credential-for-tests-only"
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun profile(category:String="CAFE",activity:String="Cafetería")=BusinessProfile("Razón privada","1790012345001",activity,"Contacto privado","private@example.test","0991234567","Pichincha","Quito","Dirección privada",category=category)
    private fun business(p:BusinessProfile?=profile())=service.createTenant(NewTenant("Negocio de prueba","category-"+id().take(12),firstBranch=NewBranch("Centro","C"),profile=p))
    private fun staff(b:JsonObject)=service.staff(b.str("ownerToken"))
    private fun suggestions(b:JsonObject)=service.dashboard(staff(b)).getValue("promotionSuggestions").jsonObject
    private fun category(b:JsonObject)=suggestions(b).getValue("category").jsonObject.str("id")
    private fun count(b:JsonObject,table:String)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",b.str("tenantId")){it.getLong(1)}!!}
    private fun member(b:JsonObject)=service.member(service.enrollWithoutPassword(b.str("enrollmentPath").substringAfterLast('/'),WalletEnrollment("Cliente","DEMO10001",true)).str("token"))
    private fun wallet()=WalletService(service,"https://example.test",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){8})))
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@BusinessCategoriesPostgresTest.password;maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"8").toInt();connectionInitSql="SET search_path TO ${this@BusinessCategoriesPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"business-category-test-pepper-long-enough")
    }
    @AfterAll fun cleanup() {
        if(::db.isInitialized)db.close()
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}
    }
    @Test fun `sequential selected types persist and suggestions never cross businesses or create promotions`() {
        val cafe=business();val barber=business(profile("BARBER","Barbería"))
        assertEquals("CAFE",category(cafe));assertEquals("BARBER",category(barber))
        assertEquals("CAFE",service.businessProfile(cafe.str("tenantId")).getValue("profile").jsonObject.str("category"))
        assertTrue(suggestions(cafe).getValue("examples").jsonArray.all{it.jsonObject.str("id").startsWith("cafe-")})
        assertFalse(suggestions(cafe).toString().contains("barba"));assertFalse(suggestions(barber).toString().contains("café"))
        repeat(3){suggestions(cafe)};assertEquals(0,count(cafe,"programs"));assertEquals(0,count(cafe,"rewards"))
        for(secret in listOf("1790012345001","private@example.test","0991234567"))assertFalse(suggestions(cafe).toString().contains(secret))
    }
    @Test fun `sequential unknown type rejects registration without partial tenant or credentials`() {
        val input=NewTenant("Inválido","invalid-"+id().take(12),firstBranch=NewBranch("Centro","C"),profile=profile("UNKNOWN"))
        assertEquals("INVALID_BUSINESS_CATEGORY",assertFailsWith<Problem>{service.createTenant(input)}.code)
        assertNull(db.tx{c->c.one("SELECT id FROM tenants WHERE slug=?",input.slug){it.getString(1)}})
    }
    @Test fun `sequential old profiles infer exact activity read only and old clients retain selected category`() {
        val legacy=business(profile("","  CAFETERÍA  "));val unknown=business(profile("","Cafetería y pizzería"));val missing=business(null)
        val before=service.businessProfile(legacy.str("tenantId"));assertEquals("CAFE",category(legacy));assertEquals("GENERAL",category(unknown));assertEquals("GENERAL",category(missing))
        assertEquals(before,service.businessProfile(legacy.str("tenantId")));assertEquals(0,count(legacy,"business_profile_corrections"))
        val selected=business(profile("BARBER"));val owner=staff(selected)
        val result=service.saveBusinessProfile(owner.tenant,BusinessProfileChange(1,profile("").copy(phone="0999999999")),owner.id)
        assertEquals("BARBER",result.getValue("profile").jsonObject.str("category"));assertEquals("BARBER",category(selected))
    }
    @Test fun `sequential administrator category correction is audited without changing wallets or balances`() {
        val b=business();val s=staff(b);val m=member(b);val p=service.newProgram(s,Program("Existente",Kind.POINTS)).str("id")
        service.saveReward(s,Reward(p,"Premio existente",100));service.purchase(s,Purchase(m.id,b.str("firstBranchId"),id(),15000,"USD"),id())
        val wallet=wallet();val before=wallet.materialize(m);val ledger=count(b,"ledger")
        val change=BusinessProfileChange(1,profile("CLOTHING"),"Tipo confirmado por el administrador")
        assertEquals("PROFILE_ADMIN_REQUIRED",assertFailsWith<Problem>{service.saveBusinessProfile(s.tenant,change,s.id)}.code)
        assertEquals("CORRECTION_REASON_REQUIRED",assertFailsWith<Problem>{service.saveBusinessProfile(s.tenant,change.copy(reason=""),"platform")}.code)
        service.saveBusinessProfile(s.tenant,change,"platform");assertEquals("CLOTHING",category(b));assertEquals(1,count(b,"business_profile_corrections"))
        assertEquals("PROFILE_CHANGED",assertFailsWith<Problem>{service.saveBusinessProfile(s.tenant,change,"platform")}.code)
        val after=wallet.materialize(m);assertEquals(before.serial,after.serial);assertEquals(before.token,after.token);assertEquals(before.snapshot,after.snapshot)
        assertEquals(before.appleExperienceFields(),after.appleExperienceFields());assertEquals(before.googleExperienceFields(),after.googleExperienceFields());assertEquals(ledger,count(b,"ledger"))
    }
    @Test fun `sequential chosen examples create normal editable promotions visible in both wallets`() {
        for (categoryId in listOf("CAFE","CLOTHING","OIL","APPLIANCES")) {
            val b=business(profile(categoryId));val s=staff(b);val m=member(b)
            val example=BusinessCategories.all.single{it.id==categoryId}.examples.first().template().copy(name="Promoción personalizada",nth=4,percentBps=3500,rewardName="35% en la categoría elegida")
            val created=service.createPromotion(s,example,id());assertEquals(1,count(b,"programs"));assertEquals(1,count(b,"rewards"))
            val pass=wallet().materialize(m)
            for(fields in listOf(pass.appleExperienceFields(),pass.googleExperienceFields()))assertTrue(fields.toString().contains(example.rewardName))
            val reward=service.dashboard(s).getValue("rewards").jsonArray.single().jsonObject
            assertEquals(3,reward.getValue("cost").jsonPrimitive.long)
            assertEquals(3500,reward.getValue("benefit").jsonObject.getValue("percentBps").jsonPrimitive.int)
            assertEquals(created.str("programId"),reward.str("programId"))
        }
    }
    @Test fun `sequential catalog HTTP access requires platform and cashier gets no suggestions`()=testApplication {
        val b=business();val owner=staff(b);val cashier=service.newStaff(owner,NewStaff("CASHIER",b.str("firstBranchId"))).str("token")
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,admin,"http://localhost:8080")}
        val path="/api/platform/business-categories"
        assertEquals(HttpStatusCode.Unauthorized,client.get(path).status)
        assertEquals(HttpStatusCode.Unauthorized,client.get(path){bearerAuth(b.str("ownerToken"))}.status)
        val result=client.get(path){bearerAuth(admin)};assertEquals(HttpStatusCode.OK,result.status)
        assertEquals(42,json.parseToJsonElement(result.bodyAsText()).jsonObject.getValue("categories").jsonArray.size)
        val dashboard=client.get("/api/staff/dashboard"){bearerAuth(cashier)};assertEquals(HttpStatusCode.OK,dashboard.status)
        assertEquals(JsonNull,json.parseToJsonElement(dashboard.bodyAsText()).jsonObject["promotionSuggestions"])
        assertEquals(HttpStatusCode.Forbidden,client.get("/api/staff/business-profile"){bearerAuth(cashier)}.status)
    }
    @Test fun `concurrent category corrections create only one next profile version`() {
        val b=business();val pool=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        try {
            val result=listOf("BARBER","CLOTHING").map{category->pool.submit<String>{barrier.await(10,TimeUnit.SECONDS);try{service.saveBusinessProfile(b.str("tenantId"),BusinessProfileChange(1,profile(category),"Corrección verificada del tipo"),"platform");"OK"}catch(e:Problem){e.code}}}.map{it.get(40,TimeUnit.SECONDS)}
            assertEquals(listOf("OK","PROFILE_CHANGED"),result.sorted());assertEquals(1,count(b,"business_profile_corrections"));assertTrue(category(b) in setOf("BARBER","CLOTHING"))
        }finally{pool.shutdownNow()}
    }
}
