package com.premierdarkcoffee.loyalty

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
import java.time.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class CustomerActivityPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="activity_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val at=Instant.parse("2026-11-05T05:30:00Z") // 00:30 Ecuador
    private val pepper="customer-activity-test-pepper-long-enough"
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("CREATE SCHEMA $schema") } }
        db=Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url;username=user;this.password=this@CustomerActivityPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt()
            connectionInitSql="SET search_path TO ${this@CustomerActivityPostgresTest.schema}"
        }))
        db.migrate();service=atTime(at)
    }
    @AfterAll fun cleanup() {
        if(::db.isInitialized)db.close()
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun atTime(time:Instant)=LoyaltyService(db,pepper,Clock.fixed(time,ZoneOffset.UTC))
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private fun JsonObject.rows()=getValue("customers").jsonArray.map{it.jsonObject}
    private fun JsonObject.summary()=getValue("summary").jsonObject
    private data class F(val owner:Staff,val token:String,val slug:String,val member:Member,val a:String,val b:String,val program:String,val reward:String)
    private fun fixture(name:String="Ana"):F {
        val slug="activity-"+id().take(12)
        val t=service.createTenant(NewTenant("Negocio",slug));val token=t.str("ownerToken");val s=service.staff(token)
        val a=service.newBranch(s,NewBranch("Centro","A")).str("id");val b=service.newBranch(s,NewBranch("Norte","B")).str("id")
        val m=service.member(service.enrollWithoutPassword(slug,WalletEnrollment(name,"DEMO10001",true)).str("token"))
        val p=service.createPromotion(s,PromotionTemplate("Sexta pizza","pizza",6,rewardName="Pizza gratis"),id())
        return F(s,token,slug,m,a,b,p.str("programId"),p.str("rewardId"))
    }
    private fun member(f:F,name:String,doc:String)=service.member(service.enrollWithoutPassword(f.slug,WalletEnrollment(name,doc,true)).str("token"))
    private fun buy(f:F,qty:Int=1,time:Instant=at,m:Member=f.member,branch:String=f.a):JsonObject {
        return atTime(time).purchase(f.owner,Purchase(m.id,branch,id(),qty*100L,"USD",listOf(PurchaseItem("Pizza","pizza",qty,100))),id())
    }
    private fun activity(f:F,segment:String="ALL",days:Int=30,inactive:Int=30,q:String="",offset:Int=0)=service.customerActivity(f.owner,CustomerActivityQuery(days,inactive,segment,q,offset))
    private fun remove(f:F) {
        val p=service.previewPromotionRemoval(f.owner,f.program)
        service.deletePromotion(f.owner,f.program,DeletePromotion(p.num("version").toInt(),p.str("impactHash"),"ELIMINAR",true),id())
    }
    @Test fun `period totals count net payments and confirmed rewards across branches`() {
        val f=fixture();buy(f,5,at.minusSeconds(40*86400))
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        val p=Purchase(f.member.id,f.b,id(),0,"USD",listOf(PurchaseItem("Pizza","pizza",1,100)),rewardId=f.reward,expectedRevision=revision,expectedRewardVersion=1,identityVerified=true,customerConfirmed=true)
        service.purchase(f.owner,p,id());val second=member(f,"Luis","DEMO10002");buy(f,2,m=second)
        val s=activity(f).summary()
        assertEquals(2,s.num("periodPurchases"));assertEquals(200,s.num("periodSpentMinor"));assertEquals(100,s.num("periodDiscountMinor"))
        assertEquals(1,s.num("periodClaimedRewards"));assertEquals(2,s.num("periodBuyers"));assertEquals(1,s.num("periodReturningBuyers"))
        val ana=activity(f,"RETURNING").rows().single();assertEquals(2,ana.num("purchases"));assertEquals(500,ana.num("spentMinor"));assertEquals(1,ana.num("claimedRewards"))
        remove(f);assertEquals(1,activity(f).summary().num("periodClaimedRewards"))
    }
    @Test fun `near and ready filters use available stamps and hide paused or deleted promotions`() {
        val f=fixture();buy(f,4)
        assertEquals(f.member.id,activity(f,"NEAR").rows().single().str("id"));assertTrue(activity(f,"READY").rows().isEmpty())
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Sexta pizza",Kind.STAMPS,active=false,productGroup="pizza",countUnits=true)))
        assertTrue(activity(f,"NEAR").rows().isEmpty());assertTrue(service.customerDetail(f.owner,f.member.id).getValue("rewardProgress").jsonArray.isEmpty())
        service.editProgram(f.owner,f.program,ProgramChange(2,Program("Sexta pizza",Kind.STAMPS,productGroup="pizza",countUnits=true)))
        buy(f);assertEquals(1,activity(f,"READY").num("total"));assertTrue(activity(f,"NEAR").rows().isEmpty())
        remove(f);assertTrue(activity(f,"READY").rows().isEmpty());assertEquals(2,activity(f).rows().single().num("purchases"))
    }
    @Test fun `inactive rewards disappear and reserved balances cannot count as ready`() {
        val f=fixture();val p=service.newProgram(f.owner,Program("Visitas",Kind.STAMPS)).str("id")
        val r=service.saveReward(f.owner,Reward(p,"Otro premio",1)).str("id");buy(f)
        assertEquals(1,activity(f,"READY").num("total"));service.reserve(f.member,Reserve(r),id())
        assertTrue(activity(f,"READY").rows().isEmpty())
        buy(f);assertEquals(1,activity(f,"READY").num("total"))
        service.saveReward(f.owner,Reward(p,"Otro premio",1,active=false),r,1)
        assertTrue(activity(f,"READY").rows().isEmpty())
    }
    @Test fun `one missing point or cent is not one missing stamp`() {
        val f=fixture();val p=service.newProgram(f.owner,Program("Puntos",Kind.POINTS,unitMinor=100,pointsPerUnit=1)).str("id")
        service.saveReward(f.owner,Reward(p,"Premio por puntos",2));buy(f)
        assertTrue(activity(f,"NEAR").rows().isEmpty())
        val progress=service.customerDetail(f.owner,f.member.id).getValue("rewardProgress").jsonArray
        assertEquals(1,progress.first{it.jsonObject.str("kind")=="POINTS"}.jsonObject.num("remaining"))
    }
    @Test fun `period begins at business midnight and never includes future receipts`() {
        val f=fixture();val from=Instant.parse("2026-10-30T05:00:00Z")
        buy(f,time=from.minusSeconds(1));buy(f,2,time=from);buy(f,3,time=at);buy(f,4,time=at.plusSeconds(1))
        val r=activity(f,days=7)
        assertEquals(from.toString(),r.str("from"));assertEquals(2,r.summary().num("periodPurchases"));assertEquals(500,r.summary().num("periodSpentMinor"))
        assertEquals(3,r.rows().single().num("purchases"))
    }
    @Test fun `inactivity uses calendar days and excludes clients who have never bought`() {
        val f=fixture();buy(f,time=Instant.parse("2026-10-07T04:59:59Z")) // Oct 6 local, 30 days ago
        val b=member(f,"Luis","DEMO10002");buy(f,time=Instant.parse("2026-10-07T05:00:00Z"),m=b)
        val n=member(f,"Nueva","DEMO10003")
        assertEquals(f.member.id,activity(f,"INACTIVE").rows().single().str("id"));assertEquals(n.id,activity(f,"NEW").rows().single().str("id"))
        assertEquals(2,activity(f,"INACTIVE",inactive=29).num("total"));assertEquals(1,activity(f).summary().num("newCustomers"))
    }
    @Test fun `search is literal and case insensitive and summary is not narrowed`() {
        val f=fixture("Ana 100%_ O'Neil");member(f,"Luis","DEMO10002")
        assertEquals(1,activity(f,q="%_").num("total"));assertEquals(1,activity(f,q="o'neil").num("total"))
        assertEquals(0,activity(f,q="% OR 1=1 --").num("total"));assertEquals(2,activity(f,q="no existe").summary().num("registeredCustomers"))
    }
    @Test fun `pagination is stable and counts all filtered customers including an empty page`() {
        val f=fixture();repeat(50){member(f,"Cliente $it","DEMO${10002+it}")}
        val first=activity(f);val second=activity(f,offset=50);val beyond=activity(f,offset=100)
        assertEquals(51,first.num("total"));assertEquals(50,first.rows().size);assertTrue(first.getValue("hasMore").jsonPrimitive.boolean)
        assertEquals(1,second.rows().size);assertFalse(second.getValue("hasMore").jsonPrimitive.boolean)
        assertTrue(first.rows().map{it.str("id")}.intersect(second.rows().map{it.str("id")}.toSet()).isEmpty())
        assertEquals(51,beyond.num("total"));assertTrue(beyond.rows().isEmpty())
    }
    @Test fun `reports are tenant scoped and cannot be read by cashiers`() {
        val a=fixture("Ana");val b=fixture("Private customer");buy(b,5)
        assertEquals(1,activity(a).summary().num("registeredCustomers"));assertEquals(0,activity(a).summary().num("readyCustomers"))
        assertTrue(activity(a,q="Private").rows().isEmpty())
        assertFailsWith<Problem>{service.customerDetail(a.owner,b.member.id)}
        val cashier=service.staff(service.newStaff(a.owner,NewStaff("CASHIER",a.a)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.customerActivity(cashier)}.status)
    }
    @Test fun `read report does not alter balances revisions or histories`() {
        val f=fixture();buy(f,4);val card=service.card(f.member)
        val before=db.tx{c->c.one("SELECT count(*) FROM ledger WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}}
        repeat(3){activity(f);service.customerDetail(f.owner,f.member.id)}
        assertEquals(card,service.card(f.member));assertEquals(before,db.tx{c->c.one("SELECT count(*) FROM ledger WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}})
    }
    @Test fun `empty tenant has zero metrics without null numeric values`() {
        val s=service.staff(service.createTenant(NewTenant("Vacío","empty-"+id().take(12))).str("ownerToken"))
        val r=service.customerActivity(s);assertTrue(r.rows().isEmpty());assertEquals(0,r.num("total"));r.summary().values.forEach{assertEquals(0,it.jsonPrimitive.long)}
    }
    @Test fun `http rejects unauthorized invalid and non owner requests`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")};val f=fixture()
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/customer-activity").status)
        val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token")
        assertEquals(HttpStatusCode.Forbidden,client.get("/api/staff/customer-activity"){bearerAuth(cashier)}.status)
        listOf("days=no","days=8","inactiveDays=0","inactiveDays=366","offset=-1","segment=BOGUS","q="+"x".repeat(101)).forEach { q->
            assertEquals(HttpStatusCode.BadRequest,client.get("/api/staff/customer-activity?$q"){bearerAuth(f.token)}.status,q)
        }
        assertEquals(HttpStatusCode.OK,client.get("/api/staff/customer-activity?segment=NEW"){bearerAuth(f.token)}.status)
    }
}
