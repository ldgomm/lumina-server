package com.premierdarkcoffee.loyalty

import com.zaxxer.hikari.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.time.*
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class OperationsPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"));private val user=System.getenv("TEST_DATABASE_USER")?:"postgres";private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="operations_"+id().replace("-","");private lateinit var db:Database;private lateinit var service:LoyaltyService
    private val at=Instant.parse("2026-11-10T18:00:00Z");private val admin="operations-admin-test-only-long-token"
    @BeforeAll fun setup(){DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}};db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@OperationsPostgresTest.password;maximumPoolSize=8;connectionInitSql="SET search_path TO ${this@OperationsPostgresTest.schema}"}));db.migrate();service=atTime(at)}
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun atTime(at:Instant)=LoyaltyService(db,"operations-pepper-test-only-long",Clock.fixed(at,ZoneOffset.UTC))
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private fun JsonObject.rows(k:String)=getValue(k).jsonArray.map{it.jsonObject}
    private fun JsonObject.summary()=getValue("summary").jsonObject
    private data class F(val owner:Staff,val token:String,val member:Member,val branch:String,val north:String,val program:String,val reward:String)
    private fun fixture():F {val slug="ops-"+id().take(10);val t=service.createTenant(NewTenant("Prueba operaciones",slug));val token=t.str("ownerToken");val owner=service.staff(token);val b=service.newBranch(owner,NewBranch("Centro","C")).str("id");val n=service.newBranch(owner,NewBranch("Norte","N")).str("id");val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("=Cliente de prueba","DEMO12345",true)).str("token"));val p=service.newProgram(owner,Program("Club",Kind.POINTS)).str("id");val r=service.saveReward(owner,Reward(p,"Café de cortesía",5)).str("id");return F(owner,token,member,b,n,p,r)}
    private fun hire(f:F,p:StaffPermissions=StaffPermissions(),name:String="Ana Pérez"):JsonObject=service.newStaff(f.owner,NewStaff("CASHIER",f.branch,name,requestId=id(),permissions=p))
    private fun input(f:F,branch:String=f.branch,amount:Long=1000)=Purchase(f.member.id,branch,id(),amount,"USD",programIds=setOf(f.program))
    private fun buy(f:F,s:Staff=f.owner,time:Instant=at,branch:String=f.branch,amount:Long=1000)=atTime(time).purchase(s,input(f,branch,amount),id())
    private fun redeem(f:F,s:Staff=f.owner){val revision=service.card(f.member).getValue("member").jsonObject.num("revision");service.redeemAtCounter(s,CounterRedemption(f.member.id,f.branch,f.reward,revision,1,true,true),id())}
    private fun report(f:F,q:OperationsQuery=OperationsQuery())=service.operationsReport(f.owner,q)
    private fun count(f:F,table:String)=db.tx{it.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){r->r.getLong(1)}}!!
    @Test fun `purchase-only cashier cannot deliver direct reserved or receipt rewards`() {
        val f=fixture();buy(f);val s=service.staff(hire(f,StaffPermissions(true,false)).str("token"));buy(f,s)
        assertEquals("REWARD_FORBIDDEN",assertFailsWith<Problem>{redeem(f,s)}.code)
        assertEquals("REWARD_FORBIDDEN",assertFailsWith<Problem>{service.confirm(s,Confirm("x".repeat(43),f.branch),id())}.code)
        assertEquals("REWARD_FORBIDDEN",assertFailsWith<Problem>{service.purchase(s,input(f).copy(rewardId=f.reward),id())}.code)
        assertEquals("REWARD_FORBIDDEN",assertFailsWith<Problem>{service.receiptQuote(s,input(f).copy(rewardId=f.reward))}.code)
        assertEquals(0,count(f,"redemptions"));assertEquals(2,count(f,"purchases"))
    }
    @Test fun `reward-only cashier can deliver but cannot record or quote purchases`() {
        val f=fixture();buy(f);val s=service.staff(hire(f,StaffPermissions(false,true)).str("token"));redeem(f,s)
        assertEquals("PURCHASE_FORBIDDEN",assertFailsWith<Problem>{buy(f,s)}.code)
        assertEquals("PURCHASE_FORBIDDEN",assertFailsWith<Problem>{service.receiptQuote(s,input(f))}.code)
        assertEquals(1,count(f,"redemptions"));assertEquals(1,count(f,"purchases"))
    }
    @Test fun `direct service callers cannot forge permission booleans`() {
        val f=fixture();val s=service.staff(hire(f,StaffPermissions(false,true)).str("token"))
        assertEquals("PURCHASE_FORBIDDEN",assertFailsWith<Problem>{buy(f,s.copy(version=null,permissions=StaffPermissions()))}.code)
    }
    @Test fun `permission changes invalidate fetched staff and preserve omitted values`() {
        val f=fixture();val h=hire(f);val s=service.staff(h.str("token"));service.editTeamUser(f.owner,s.id,TeamChange(1,"Ana Pérez","","CASHIER",f.branch,"Revisar permisos",StaffPermissions(true,false)))
        assertEquals(401,assertFailsWith<Problem>{buy(f,s)}.status)
        service.editTeamUser(f.owner,s.id,TeamChange(2,"Ana corregida","","CASHIER",f.branch,"Corregir el nombre"))
        assertEquals(StaffPermissions(true,false),service.staff(h.str("token")).permissions)
        val hst=service.managementActivity(f.owner.tenant,ManagementQuery(actorId=f.owner.id,kind="ADMIN",asOf=Instant.now().plusSeconds(1).coerceAtMost(at).toString()))
        assertFalse(hst.toString().contains(h.str("token")))
    }
    @Test fun `legacy creation hashes accept explicit equivalent default grants`() {
        val f=fixture();val input=NewStaff("CASHIER",f.branch,"Nombre",requestId=id());val a=service.newStaff(f.owner,input);val b=service.newStaff(f.owner,input.copy(permissions=StaffPermissions()))
        assertEquals(a["id"],b["id"]);assertNull(b["token"])
        assertEquals(409,assertFailsWith<Problem>{service.newStaff(f.owner,input.copy(permissions=StaffPermissions(true,false)))}.status)
    }
    @Test fun `no-operation and restricted-owner grants are rejected without adding users`() {
        val f=fixture();assertFailsWith<Problem>{hire(f,StaffPermissions(false,false))};assertFailsWith<Problem>{service.newStaff(f.owner,NewStaff("OWNER",permissions=StaffPermissions(false,true)))}
        assertEquals(1,count(f,"staff_tokens"))
    }
    @Test fun `permission removal serializes before a waiting purchase`() {
        val f=fixture();val h=hire(f);val s=service.staff(h.str("token"));val pool=Executors.newSingleThreadExecutor()
        DriverManager.getConnection(url,user,password).use{c->c.autoCommit=false;c.createStatement().use{it.execute("SET search_path TO $schema")};c.prepareStatement("SELECT tenant_id FROM business_access WHERE tenant_id=? FOR UPDATE").use{it.setString(1,f.owner.tenant);it.executeQuery().close()}
            try {val future=pool.submit<Any>{try{buy(f,s)}catch(e:Problem){e}};assertFailsWith<TimeoutException>{future.get(150,TimeUnit.MILLISECONDS)}
                c.prepareStatement("UPDATE staff_tokens SET allow_purchases=false,version=version+1 WHERE tenant_id=? AND id=?").use{it.setString(1,f.owner.tenant);it.setString(2,s.id);it.executeUpdate()};c.commit()
                assertEquals(401,(future.get(20,TimeUnit.SECONDS) as Problem).status);assertEquals(0,count(f,"purchases"))
            }finally{c.rollback();pool.shutdownNow()}}
    }
    @Test fun `old purchase replay cannot bypass newly restricted permissions`() {
        val f=fixture();val h=hire(f);val s=service.staff(h.str("token"));val p=input(f);val key=id();service.purchase(s,p,key)
        service.editTeamUser(f.owner,s.id,TeamChange(1,"Ana","","CASHIER",f.branch,"Solo entrega de premios",StaffPermissions(false,true)))
        assertEquals("PURCHASE_FORBIDDEN",assertFailsWith<Problem>{service.purchase(service.staff(h.str("token")),p,key)}.code);assertEquals(1,count(f,"purchases"))
    }
    @Test fun `report counts money once and distinct customers without summing groups`() {
        val f=fixture();val s=service.staff(hire(f).str("token"));buy(f,s,time=at.minusSeconds(86400));buy(f,s);buy(f,branch=f.north,amount=1500);redeem(f,s);redeem(f,s)
        val d=report(f);assertEquals(3,d.summary().num("purchases"));assertEquals(3500,d.summary().num("paidMinor"));assertEquals(2,d.summary().num("redemptions"));assertEquals(1,d.summary().num("buyers"));assertEquals(1,d.num("returningOnAnotherDay"));assertEquals(2,d.rows("users").size);assertEquals(2,d.rows("branches").size);assertEquals(3500,d.rows("users").sumOf{it.num("paidMinor")});assertEquals(3500,d.rows("branches").sumOf{it.num("paidMinor")})
    }
    @Test fun `report filters all metrics series users rewards and hours consistently`() {
        val f=fixture();val s=service.staff(hire(f).str("token"));buy(f,s);buy(f,branch=f.north,amount=5000);redeem(f,s)
        val d=report(f,OperationsQuery(branchId=f.branch,actorId=s.id));assertEquals(1000,d.summary().num("paidMinor"));assertEquals(1,d.summary().num("redemptions"));assertEquals(1,d.rows("daily").sumOf{it.num("purchases")});assertEquals(1,d.rows("hours").sumOf{it.num("purchases")});assertEquals(1,d.rows("rewards").sumOf{it.num("claims")});assertEquals(1,d.rows("users").size)
    }
    @Test fun `custom dates compare equal previous calendar periods and local hours`() {
        val f=fixture();buy(f,time=Instant.parse("2026-11-02T06:15:00Z"),amount=2000);buy(f,time=Instant.parse("2026-11-03T04:59:59Z"),amount=3000);buy(f,time=Instant.parse("2026-11-01T18:00:00Z"),amount=7000);buy(f,time=Instant.parse("2026-11-03T05:00:00Z"),amount=9000)
        val d=report(f,OperationsQuery(fromDate="2026-11-02",throughDate="2026-11-02"));assertEquals(5000,d.summary().num("paidMinor"));assertEquals(7000,d.getValue("previous").jsonObject.num("paidMinor"));assertEquals(listOf(1L,23L),d.rows("hours").map{it.num("hour")});assertEquals(1,d.num("days"));assertEquals(1,d.rows("daily").size)
    }
    @Test fun `zero activity includes zero daily series and no invented customers`() {
        val d=report(fixture(),OperationsQuery(days=7));assertEquals(0,d.summary().num("purchases"));assertEquals(7,d.rows("daily").size);assertTrue(d.rows("daily").all{it.num("paidMinor")==0L});assertTrue(d.rows("users").isEmpty());assertEquals(0,d.num("returningOnAnotherDay"))
    }
    @Test fun `reports reject foreign filters and keep archived actors identifiable`() {
        val f=fixture();val foreign=fixture();val h=hire(f);val s=service.staff(h.str("token"));buy(f,s)
        service.teamAction(f.owner,s.id,TeamAction(1,"ARCHIVE","Retiro definitivo",true));val d=report(f,OperationsQuery(actorId=s.id));assertEquals("ARCHIVED",d.rows("users").single().str("state"));assertEquals("Ana Pérez",d.rows("users").single().str("name"))
        assertEquals(404,assertFailsWith<Problem>{report(f,OperationsQuery(branchId=foreign.branch))}.status);assertEquals(404,assertFailsWith<Problem>{report(f,OperationsQuery(actorId=foreign.owner.id))}.status)
    }
    @Test fun `report and csv reads leave accounting member revision and audit untouched`() {
        val f=fixture();buy(f);redeem(f);val tables=listOf("purchases","redemptions","ledger","audit_events");val before=tables.associateWith{count(f,it)};val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        report(f);service.activityExport(f.owner,ManagementQuery(kind="OPERATIONS"));assertEquals(before,tables.associateWith{count(f,it)});assertEquals(revision,service.card(f.member).getValue("member").jsonObject.num("revision"))
    }
    @Test fun `export includes every page with exact money names receipt and safe formula text`() {
        val f=fixture();repeat(53){service.purchase(f.owner,input(f,amount=1234).copy(receipt="REC-$it",items=listOf(PurchaseItem("Café; grande","cafe",1,1234))),id())}
        val q=ManagementQuery(kind="OPERATIONS",branchId=f.branch);val page=service.managementActivity(f.owner.tenant,q);assertEquals(50,page.rows("items").size)
        val csv=service.activityExport(f.owner,q);assertTrue(csv.startsWith("\uFEFF"));assertEquals(55,csv.split("\r\n").size);assertTrue(csv.contains("\"12.34\""));assertTrue(csv.contains("\"'=Cliente de prueba\""));assertTrue(csv.contains("REC-52"));assertFalse(csv.contains(f.token));assertFalse(csv.contains("card_code"));assertFalse(csv.contains("identity_hash"));assertTrue(csv.contains("Café; grande"))
    }
    @Test fun `export snapshot cutoff filters dates and excludes newer operations`() {
        val f=fixture();buy(f,time=at.minusSeconds(60));val q=ManagementQuery(kind="OPERATIONS",asOf=at.minusSeconds(30).toString());val before=service.activityExport(f.owner,q);buy(f)
        assertEquals(before,service.activityExport(f.owner,q));assertEquals(1,service.managementActivity(f.owner.tenant,q).num("total"));assertEquals(1,report(f,OperationsQuery(asOf=q.asOf)).summary().num("purchases"))
    }
    @Test fun `export refuses excessive histories instead of truncating and requires first page`() {
        val f=fixture();db.tx{c->c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at) SELECT md5(i::text),?,?,'LOOKUP_MEMBER',?,?::timestamptz FROM generate_series(1,10001) i",f.owner.tenant,f.owner.id,f.member.id,at.toString())}
        assertEquals("EXPORT_TOO_LARGE",assertFailsWith<Problem>{service.activityExport(f.owner,ManagementQuery())}.code)
        assertEquals("EXPORT_PAGE",assertFailsWith<Problem>{service.activityExport(f.owner,ManagementQuery(offset=50))}.code)
        assertTrue(service.activityExport(f.owner,ManagementQuery(kind="PURCHASE")).startsWith("\uFEFF"))
    }
    @Test fun `suspended businesses retain reports and export without operational access`() {
        val f=fixture();buy(f);db.tx{it.exec("UPDATE business_access SET state='SUSPENDED' WHERE tenant_id=?",f.owner.tenant)}
        assertEquals(1,report(f).summary().num("purchases"));assertTrue(service.activityExport(f.owner,ManagementQuery(kind="PURCHASE")).contains("Compra"));assertEquals(423,assertFailsWith<Problem>{buy(f)}.status)
    }
    @Test fun `private endpoints authorize owner and platform and enforce date and csv contracts`()=testApplication {
        val f=fixture();val h=hire(f);buy(f);application{loyaltyRoutes(service,admin,"https://loyalty.test")}
        for(path in listOf("/api/staff/operations","/api/staff/activity.csv")){assertEquals(HttpStatusCode.Unauthorized,client.get(path).status);assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(h.str("token"))}.status);assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(f.token)}.status)}
        for(suffix in listOf("operations","activity.csv")){val path="/api/platform/tenants/${f.owner.tenant}/$suffix";assertEquals(HttpStatusCode.Unauthorized,client.get(path){bearerAuth(f.token)}.status);assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(admin)}.status)}
        val csv=client.get("/api/staff/activity.csv?kind=OPERATIONS"){bearerAuth(f.token)};assertTrue(csv.headers[HttpHeaders.ContentType]!!.startsWith("text/csv"));assertEquals("no-store",csv.headers[HttpHeaders.CacheControl]);assertTrue(csv.headers[HttpHeaders.ContentDisposition]!!.contains("attachment"));assertFalse(csv.bodyAsText().contains(f.token))
        assertEquals(HttpStatusCode.BadRequest,client.get("/api/staff/operations?fromDate=2026-11-02"){bearerAuth(f.token)}.status)
    }
    @Test fun `migration reruns preserve credentials grants and ledger`() {
        val f=fixture();val h=hire(f,StaffPermissions(false,true));buy(f);db.migrate();assertEquals(StaffPermissions(false,true),service.staff(h.str("token")).permissions);assertEquals(f.owner,service.staff(f.token));assertEquals(1,count(f,"purchases"));assertEquals(12,db.tx{it.one("SELECT count(*) FROM comeback_migrations"){r->r.getLong(1)}})
    }
}
