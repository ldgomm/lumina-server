package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.DeletePromotion
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.deletePromotion
import com.premierdarkcoffee.loyalty.fidelity.previewPromotionRemoval
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.ProgramChange
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reserve
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.summary

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ReturnRadarPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="radar_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val now=Instant.parse("2026-11-08T17:00:00Z")
    private fun serviceAt(at:Instant)=LoyaltyService(db,"radar-test-pepper-long-enough-for-tests",Clock.fixed(at,ZoneOffset.UTC))
    private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
    private fun JsonObject.num(key:String)=getValue(key).jsonPrimitive.long
    private fun JsonObject.rows()=getValue("items").jsonArray.map{it.jsonObject}
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@ReturnRadarPostgresTest.password;maximumPoolSize=4;connectionInitSql="SET search_path TO ${this@ReturnRadarPostgresTest.schema}"}))
        db.migrate();service=serviceAt(now)
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private data class F(val owner:Staff,val token:String,val slug:String,val member:Member,val branch:String,val program:String,val reward:String)
    private fun fixture(name:String="Ana"):F {
        val slug="radar-"+id().take(12);val t=service.createTenant(NewTenant("Café de prueba",slug));val token=t.str("ownerToken");val owner=service.staff(token)
        val branch=service.newBranch(owner,NewBranch("Centro","centro")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment(name,"DEMO10001",true, phone = "0991234567")).str("token"))
        val program=service.newProgram(owner,Program("Visitas",Kind.STAMPS)).str("id")
        val reward=service.saveReward(owner,Reward(program,"Tu premio",5)).str("id")
        return F(owner,token,slug,member,branch,program,reward)
    }
    private fun buy(f:F,daysAgo:Long,member:Member=f.member,branch:String=f.branch)=serviceAt(now.minusSeconds(daysAgo*86400)).purchase(f.owner,Purchase(member.id,branch,id(),100,"USD"),id())
    private fun radar(f:F,query:ReturnRadarQuery=ReturnRadarQuery("ALL"))=service.ownerReturnRadar(f.owner,query)
    private fun another(f:F,name:String="Luis",doc:String="DEMO10002")=service.member(service.enrollWithoutPassword(f.slug,WalletEnrollment(name,doc,true, phone = "0991234567")).str("token"))
    @Test fun `individual cadence differs by customer and is explained from real distinct days`() {
        val f=fixture();val slow=another(f)
        listOf(35L,28,21,14).forEach{buy(f,it)};listOf(110L,80,50,20).forEach{buy(f,it,slow)}
        val rows=radar(f).rows();val fast=rows.single{it.str("id")==f.member.id};val monthly=rows.single{it.str("id")==slow.id}
        assertEquals(7,fast.num("cadenceDays"));assertEquals(11,fast.num("attentionAfterDays"));assertTrue(fast.getValue("late").jsonPrimitive.boolean)
        assertEquals(30,monthly.num("cadenceDays"));assertFalse(monthly.getValue("late").jsonPrimitive.boolean)
        assertEquals(1,radar(f).getValue("summary").jsonObject.num("late"))
    }
    @Test fun `same local day across branches and future purchases do not inflate cadence`() {
        val f=fixture();val b=service.newBranch(f.owner,NewBranch("Norte","norte")).str("id")
        repeat(5){buy(f,20,branch=if(it%2==0)b else f.branch)};buy(f,13);buy(f,6);buy(f,-1)
        val r=radar(f).rows().single();assertEquals(7,r.num("purchases"));assertEquals(3,r.num("sampleDays"));assertEquals(JsonNull,r["cadenceDays"]);assertFalse(r.getValue("late").jsonPrimitive.boolean)
    }
    @Test fun `short history and old history do not invent a rhythm`() {
        val f=fixture();listOf(403L,402,401,400).forEach{buy(f,it)}
        assertEquals(0,radar(f).rows().single().num("sampleDays"))
        listOf(3L,2,1,0).forEach{buy(f,it)}
        assertEquals(JsonNull,radar(f).rows().single()["cadenceDays"])
    }
    @Test fun `median resists one long gap and sample is limited to nine days`() {
        val f=fixture();listOf(100L,30,23,16,9).forEach{buy(f,it)}
        assertEquals(7,radar(f).rows().single().num("cadenceDays"))
        (200L..209L).forEach{buy(f,it)};assertEquals(9,radar(f).rows().single().num("sampleDays"))
    }
    @Test fun `reward signals keep programs separate and hide paused or deleted promotions`() {
        val f=fixture();repeat(4){buy(f,0)}
        assertEquals(1,radar(f).getValue("summary").jsonObject.num("near"))
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Visitas",Kind.STAMPS,active=false)))
        assertEquals(0,radar(f).getValue("summary").jsonObject.num("near"))
        service.editProgram(f.owner,f.program,ProgramChange(2,Program("Visitas",Kind.STAMPS)))
        val p=service.previewPromotionRemoval(f.owner,f.program)
        service.deletePromotion(f.owner,f.program,DeletePromotion(p.num("version").toInt(),p.str("impactHash"),"ELIMINAR",true),id())
        assertEquals(0,radar(f).getValue("summary").jsonObject.num("near"));assertEquals(4,radar(f).rows().single().num("purchases"))
    }
    @Test fun `second visit cohorts exclude incomplete windows and same day duplicate receipts`() {
        val f=fixture();val same=another(f);val fresh=another(f,"Eva","DEMO10003")
        buy(f,40);buy(f,39);buy(f,40,same);buy(f,40,same);buy(f,5,fresh);buy(f,4,fresh)
        val cohorts=radar(f).getValue("cohorts").jsonArray.map{it.jsonObject}
        assertEquals(6,cohorts.size)
        val september=cohorts.single{it.str("month")=="2026-09-01"};assertEquals(2,september.num("eligible"));assertEquals(1,september.num("returned"));assertEquals(50.0,september.getValue("rate").jsonPrimitive.double)
        val november=cohorts.single{it.str("month")=="2026-11-01"};assertEquals(1,november.num("starters"));assertEquals(0,november.num("eligible"));assertEquals(JsonNull,november["rate"])
    }
    @Test fun `completed window boundary excludes today's partial final day`() {
        val f=fixture();buy(f,30);buy(f,29)
        var row=radar(f).getValue("cohorts").jsonArray.map{it.jsonObject}.single{it.str("month")=="2026-10-01"}
        assertEquals(0,row.num("eligible"))
        row=serviceAt(now.plusSeconds(86400)).ownerReturnRadar(f.owner,ReturnRadarQuery()).getValue("cohorts").jsonArray.map{it.jsonObject}.single{it.str("month")=="2026-10-01"}
        assertEquals(1,row.num("eligible"));assertEquals(1,row.num("returned"))
    }
    @Test fun `wallet rules follow current promotion version in both providers without changing identity`() {
        val f=fixture()
        val wallet=WalletService(service,"https://example.com",WalletCipher(java.util.Base64.getEncoder().encodeToString(ByteArray(32){9})))
        val before=wallet.materialize(f.member)
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Visitas",Kind.STAMPS,minimumSpendMinor=725)))
        val after=wallet.materialize(f.member)
        assertEquals(before.serial,after.serial);assertEquals(before.token,after.token);assertEquals(before.googleId,after.googleId)
        val apple=after.appleExperienceFields().getValue("backFields").jsonArray.map{it.jsonObject}.single{it["key"]==JsonPrimitive("earning")}.str("value")
        val google=after.googleExperienceFields().getValue("textModulesData").jsonArray.map{it.jsonObject}.single{it["id"]==JsonPrimitive("earning")}.str("body")
        assertEquals(apple,google);assertContains(apple,"7.25 USD")
        service.editProgram(f.owner,f.program,ProgramChange(2,Program("Visitas",Kind.STAMPS,active=false)))
        val paused=wallet.materialize(f.member)
        assertEquals(JsonArray(emptyList()),paused.snapshot["earningRules"])
        assertFalse(paused.appleExperienceFields().toString().contains("7.25 USD"));assertFalse(paused.googleExperienceFields().toString().contains("7.25 USD"))
    }
    @Test fun `read only radar leaves balance reservations ledger and wallet untouched`() {
        val f=fixture();repeat(5){buy(f,40)};service.reserve(f.member,Reserve(f.reward),id())
        fun snapshot()=db.tx{c->listOf("members","balances","ledger","redemptions","wallet_passes","wallet_outbox","audit_events").map{table->c.rows("SELECT row_to_json(t)::text FROM $table t WHERE tenant_id=? ORDER BY row_to_json(t)::text",f.owner.tenant){it.getString(1)}}}
        val before=snapshot();repeat(2){serviceAt(now.plusSeconds(86400)).ownerReturnRadar(f.owner,ReturnRadarQuery())};assertEquals(before,snapshot())
    }
    @Test fun `pagination search and tenant isolation have stable counts`() {
        val f=fixture("Ángela 100%_");val other=fixture("Privada");repeat(22){another(f,"Cliente $it","DEMO${20000+it}")}
        val a=radar(f);val b=radar(f,ReturnRadarQuery("ALL",offset=20));assertEquals(23,a.num("total"));assertEquals(20,a.rows().size);assertEquals(3,b.rows().size)
        assertTrue(a.rows().map{it.str("id")}.intersect(b.rows().map{it.str("id")}.toSet()).isEmpty())
        assertEquals(1,radar(f,ReturnRadarQuery("ALL","angela")).num("total"));assertEquals(1,radar(f,ReturnRadarQuery("ALL","%_")).num("total"))
        assertEquals(0,radar(f,ReturnRadarQuery("ALL","Privada")).num("total"));assertEquals(1,radar(other).num("total"))
        assertEquals(0,radar(f,ReturnRadarQuery("ALL","x' OR true --")).num("total"))
    }
    @Test fun `http rejects cashier unknown tenant bad filters and missing credentials`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")}
        val f=fixture();val path="/api/staff/return-radar";val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token")
        assertEquals(HttpStatusCode.Unauthorized,client.get(path).status)
        assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(cashier)}.status)
        for(q in listOf("offset=bad","offset=-1","offset=2147483648","segment=bad"))assertEquals(HttpStatusCode.BadRequest,client.get("$path?$q"){bearerAuth(f.token)}.status)
        assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(f.token)}.status)
        val admin="/api/platform/tenants/${f.owner.tenant}/return-radar"
        assertEquals(HttpStatusCode.Unauthorized,client.get(admin){bearerAuth(f.token)}.status)
        assertEquals(HttpStatusCode.OK,client.get(admin){bearerAuth("p".repeat(40))}.status)
        assertEquals(HttpStatusCode.NotFound,client.get("/api/platform/tenants/${id()}/return-radar"){bearerAuth("p".repeat(40))}.status)
    }
}
