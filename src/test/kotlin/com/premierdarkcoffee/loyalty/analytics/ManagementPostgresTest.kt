package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.TeamAction
import com.premierdarkcoffee.loyalty.access.TeamChange
import com.premierdarkcoffee.loyalty.access.editTeamUser
import com.premierdarkcoffee.loyalty.access.team
import com.premierdarkcoffee.loyalty.access.teamAction
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.marketing.PurchaseItem
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
import com.premierdarkcoffee.loyalty.wallet.CounterRedemption
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.redeemAtCounter
import com.premierdarkcoffee.loyalty.wallet.summary

import com.zaxxer.hikari.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.testing.*
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.time.*
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class ManagementPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="management_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val admin="management-platform-test-token-long-enough"
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@ManagementPostgresTest.password;maximumPoolSize=10;connectionInitSql="SET search_path TO ${this@ManagementPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"management-test-pepper-long-enough")
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private fun JsonObject.rows(k:String)=getValue(k).jsonArray.map{it.jsonObject}
    private data class F(val owner:Staff,val token:String,val member:Member,val branch:String,val otherBranch:String,val program:String,val reward:String)
    private fun fixture(currency:String="USD"):F {
        val slug="management-"+id().take(10);val t=service.createTenant(NewTenant("Negocio de prueba",slug,currency=currency))
        val token=t.str("ownerToken");val owner=service.staff(token);val branch=service.newBranch(owner,NewBranch("Centro","C")).str("id");val other=service.newBranch(owner,NewBranch("Norte","N")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente de prueba","DEMO12345",true)).str("token"))
        val program=service.newProgram(owner,Program("Puntos por compra",Kind.POINTS)).str("id");val reward=service.saveReward(owner,Reward(program,"Café de cortesía",5)).str("id")
        return F(owner,token,member,branch,other,program,reward)
    }
    private fun hire(f:F,name:String="Ana Pérez")=service.newStaff(f.owner,NewStaff("CASHIER",f.branch,name,"contacto interno",id()))
    private fun purchase(f:F,s:Staff=f.owner,receipt:String=id(),currency:String="USD")=service.purchase(s,Purchase(f.member.id,f.branch,receipt,1000,currency,items=listOf(PurchaseItem("Café","bebidas",1,1000)),programIds=setOf(f.program)),id())
    private fun activity(f:F,q:ManagementQuery=ManagementQuery())=service.managementActivity(f.owner.tenant,q)
    private fun change(version:Int,action:String)=TeamAction(version,action,"Cambio autorizado por el dueño",true)
    private fun user(f:F,id:String)=service.team(f.owner).rows("users").single{it.str("id")==id}
    private fun redeem(f:F,s:Staff){val revision=service.card(f.member).getValue("member").jsonObject.num("revision");service.redeemAtCounter(s,CounterRedemption(f.member.id,f.branch,f.reward,revision,1,true,true),id())}
    @Test fun `create list and replay expose the credential only on first creation`() {
        val f=fixture();val input=NewStaff("CASHIER",f.branch,"Ana Pérez","",id());val a=service.newStaff(f.owner,input);val b=service.newStaff(f.owner,input)
        assertEquals(a["id"],b["id"]);assertNull(b["token"]);assertEquals(2,service.team(f.owner).rows("users").size)
        assertFalse(service.team(f.owner).toString().contains(a.str("token")));assertFalse(service.team(f.owner).toString().contains("token_hash"))
        assertEquals("Ana Pérez",user(f,a.str("id")).str("name"));assertEquals(409,assertFailsWith<Problem>{service.newStaff(f.owner,input.copy(name="Otra persona"))}.status)
    }
    @Test fun `cashier and foreign tenant cannot administer team`() {
        val f=fixture();val other=fixture();val a=hire(f);val s=service.staff(a.str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.team(s)}.status)
        assertEquals(403,assertFailsWith<Problem>{service.newStaff(s,NewStaff("OWNER"))}.status)
        assertEquals(404,assertFailsWith<Problem>{service.editTeamUser(other.owner,s.id,TeamChange(1,"Intruso","","OWNER",reason="No permitido"))}.status)
        assertEquals(404,assertFailsWith<Problem>{service.newStaff(f.owner,NewStaff("CASHIER",other.branch,"Intruso"))}.status)
    }
    @Test fun `versioned editing preserves id and rejects a lost update`() {
        val f=fixture();val a=hire(f);val target=a.str("id")
        service.editTeamUser(f.owner,target,TeamChange(1,"Ana nueva","","CASHIER",f.otherBranch,"Traslado de sucursal"))
        assertEquals(2,user(f,target).num("version"));assertEquals(f.otherBranch,service.staff(a.str("token")).branch)
        assertEquals(409,assertFailsWith<Problem>{service.editTeamUser(f.owner,target,TeamChange(1,"Ana vieja","","CASHIER",f.branch,"Edición desactualizada"))}.status)
    }
    @Test fun `deactivation rejects old authentication and already obtained staff snapshot`() {
        val f=fixture();val a=hire(f);val s=service.staff(a.str("token"));service.teamAction(f.owner,s.id,change(1,"DEACTIVATE"))
        assertEquals(401,assertFailsWith<Problem>{service.staff(a.str("token"))}.status)
        assertEquals(401,assertFailsWith<Problem>{purchase(f,s)}.status)
        assertEquals(0,activity(f,ManagementQuery(kind="PURCHASE")).num("total"))
    }
    @Test fun `reactivation issues a new credential and never revives the old one`() {
        val f=fixture();val a=hire(f);service.teamAction(f.owner,a.str("id"),change(1,"DEACTIVATE"))
        val b=service.teamAction(f.owner,a.str("id"),change(2,"REACTIVATE"));assertNotEquals(a["token"],b["token"])
        assertEquals(401,assertFailsWith<Problem>{service.staff(a.str("token"))}.status);assertEquals(a.str("id"),service.staff(b.str("token")).id)
    }
    @Test fun `rotation leaves operational history attached to the same user`() {
        val f=fixture();val a=hire(f);purchase(f,service.staff(a.str("token")));val b=service.teamAction(f.owner,a.str("id"),change(1,"ROTATE"))
        assertEquals(a.str("id"),service.staff(b.str("token")).id);assertEquals(401,assertFailsWith<Problem>{service.staff(a.str("token"))}.status)
        assertEquals(1,activity(f,ManagementQuery(actorId=a.str("id"),kind="PURCHASE")).num("total"))
    }
    @Test fun `archive cannot be reversed and retains historical purchases and rewards`() {
        val f=fixture();val a=hire(f);val s=service.staff(a.str("token"));purchase(f,s);redeem(f,s)
        service.teamAction(f.owner,s.id,change(1,"ARCHIVE"));assertEquals("ARCHIVED",user(f,s.id).str("state"))
        assertEquals(409,assertFailsWith<Problem>{service.teamAction(f.owner,s.id,change(2,"REACTIVATE"))}.status)
        val h=activity(f,ManagementQuery(actorId=s.id));assertEquals(1,h.getValue("summary").jsonObject.num("purchases"));assertEquals(1,h.getValue("summary").jsonObject.num("redemptions"))
    }
    @Test fun `last active owner and self access are protected`() {
        val f=fixture();val platform=Staff(f.owner.tenant,"platform","OWNER",null)
        assertEquals("LAST_OWNER",assertFailsWith<Problem>{service.teamAction(platform,f.owner.id,change(1,"ARCHIVE"))}.code)
        assertEquals("SELF_REVOKE",assertFailsWith<Problem>{service.teamAction(f.owner,f.owner.id,change(1,"ROTATE"))}.code)
        assertEquals("SELF_ACCESS_CHANGE",assertFailsWith<Problem>{service.editTeamUser(f.owner,f.owner.id,TeamChange(1,"Dueño","","CASHIER",f.branch,"Cambio de rol"))}.code)
    }
    @Test fun `renaming and changing branch do not rewrite actor names on past operations`() {
        val f=fixture();val a=hire(f);val s=service.staff(a.str("token"));purchase(f,s);redeem(f,s)
        service.editTeamUser(f.owner,s.id,TeamChange(1,"Nombre nuevo","","CASHIER",f.otherBranch,"Traslado y corrección"))
        val rows=activity(f,ManagementQuery(actorId=s.id)).rows("items");assertEquals(setOf("Ana Pérez"),rows.filter{it.str("kind")!="ADMIN"}.map{it.str("actorName")}.toSet())
        assertTrue(rows.all{it["historicalName"]==JsonPrimitive(true)});assertTrue(rows.all{it.str("branch")=="Centro"})
        assertEquals(401,assertFailsWith<Problem>{purchase(f,s)}.status)
        assertEquals(403,assertFailsWith<Problem>{purchase(f,service.staff(a.str("token")))}.status)
    }
    @Test fun `audit contains recipient reward program receipt date and actor without secrets`() {
        val f=fixture();val a=hire(f);val s=service.staff(a.str("token"));purchase(f,s,"DEMO-001");redeem(f,s)
        val h=activity(f);val p=h.rows("items").single{it.str("kind")=="PURCHASE"};val r=h.rows("items").single{it.str("kind")=="REWARD"}
        assertEquals("DEMO-001",p.str("receipt"));assertEquals(10,p.rows("earnings").single().num("amount"));assertEquals("Café de cortesía",r.str("reward"));assertEquals("Cliente de prueba",r.str("customer"));assertEquals("Ana Pérez",r.str("actorName"));assertEquals("Centro",r.str("branch"));assertEquals("Puntos por compra",r.str("program"));assertNotNull(r["at"])
        for(secret in listOf(a.str("token"),f.token,"identity_hash","token_hash","card_code"))assertFalse(h.toString().contains(secret))
    }
    @Test fun `activity is read only scoped and supports search type branch actor and fixed paging cutoff`() {
        val f=fixture();val other=fixture();val a=hire(f);purchase(f,service.staff(a.str("token")),"REC-SEARCH");purchase(other)
        val before=db.tx{c->c.one("SELECT count(*) FROM audit_events"){it.getLong(1)}}
        val q=ManagementQuery(kind="PURCHASE",branchId=f.branch,actorId=a.str("id"),search="perez");val page=activity(f,q);assertEquals(1,page.num("total"))
        purchase(f,service.staff(a.str("token")),"AFTER-CUTOFF");assertEquals(1,activity(f,q.copy(asOf=page.str("asOf"))).num("total"))
        assertEquals(0,activity(f,q.copy(branchId=f.otherBranch)).num("total"));assertEquals(404,assertFailsWith<Problem>{activity(f,q.copy(branchId=other.branch))}.status)
        assertEquals(404,assertFailsWith<Problem>{activity(f,q.copy(actorId=other.owner.id))}.status)
        assertEquals(before!!+1,db.tx{c->c.one("SELECT count(*) FROM audit_events"){it.getLong(1)}})
    }
    @Test fun `concurrent rotations yield one current credential and a version conflict`() {
        val f=fixture();val a=hire(f);val pool=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        try{val results=(1..2).map{pool.submit<Any>{barrier.await();try{service.teamAction(f.owner,a.str("id"),change(1,"ROTATE"))}catch(e:Problem){e}}}.map{it.get(20,TimeUnit.SECONDS)}
            assertEquals(1,results.filterIsInstance<JsonObject>().size);assertEquals("VERSION_CONFLICT",results.filterIsInstance<Problem>().single().code)
            service.staff(results.filterIsInstance<JsonObject>().single().str("token"))
        }finally{pool.shutdownNow()}
    }
    @Test fun `removing simultaneous owners cannot leave the business without one`() {
        val f=fixture();val b=service.newStaff(f.owner,NewStaff("OWNER",name="Segundo dueño"));val platform=Staff(f.owner.tenant,"platform","OWNER",null);val pool=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        try{val results=listOf(f.owner.id,b.str("id")).map{target->pool.submit<Any>{barrier.await();try{service.teamAction(platform,target,change(1,"DEACTIVATE"))}catch(e:Problem){e}}}.map{it.get(20,TimeUnit.SECONDS)}
            assertEquals(1,results.filterIsInstance<JsonObject>().size);assertEquals("LAST_OWNER",results.filterIsInstance<Problem>().single().code)
        }finally{pool.shutdownNow()}
    }
    @Test fun `platform statistics group currencies and do not confuse registrations with people`() {
        val usd=fixture();val eur=fixture("EUR");purchase(usd);purchase(eur,currency="EUR")
        val data=service.platformOverview();assertTrue(data.rows("currencies").any{it.str("currency")=="USD"&&it.num("paidMinor")>=1000});assertTrue(data.rows("currencies").any{it.str("currency")=="EUR"&&it.num("paidMinor")>=1000})
        assertFalse(data.getValue("summary").jsonObject.containsKey("paidMinor"));val filter=service.platformOverview(search="no existe qxyz");assertEquals(0,filter.num("total"));assertEquals(data["summary"],filter["summary"])
    }
    @Test fun `suspended business keeps team revocation and reporting available`() {
        val f=fixture();val a=hire(f);db.tx{it.exec("UPDATE business_access SET state='SUSPENDED' WHERE tenant_id=?",f.owner.tenant)}
        assertEquals(2,service.team(f.owner).rows("users").size);service.teamAction(f.owner,a.str("id"),change(1,"DEACTIVATE"));activity(f)
        assertEquals(423,assertFailsWith<Problem>{hire(f)}.status)
    }
    @Test fun `migration rerun keeps old credentials and snapshots immutable`() {
        val f=fixture();val a=hire(f);purchase(f,service.staff(a.str("token")));db.migrate();assertEquals(f.owner.id,service.staff(f.token).id)
        assertEquals(15,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations"){it.getInt(1)}})
        assertFailsWith<java.sql.SQLException>{db.tx{it.exec("UPDATE audit_events SET actor_name='Changed' WHERE tenant_id=?",f.owner.tenant)}}
    }
    @Test fun `platform endpoints require platform authentication and never expose scannable customer cards`()=testApplication {
        val f=fixture();val a=hire(f);application{loyaltyRoutes(service,admin,"https://loyalty.test")}
        val paths=listOf("/api/platform/overview","/api/platform/tenants/${f.owner.tenant}/activity","/api/platform/tenants/${f.owner.tenant}/team","/api/platform/tenants/${f.owner.tenant}/customer-activity","/api/platform/tenants/${f.owner.tenant}/customer-workspace/${f.member.id}")
        for(path in paths){assertEquals(HttpStatusCode.Unauthorized,client.get(path){bearerAuth(f.token)}.status);assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(admin)}.status)}
        val card=client.get(paths.last()){bearerAuth(admin)}.bodyAsText();assertFalse(card.contains("cardCode"));assertFalse(card.contains("token"))
        for(path in listOf("/api/staff/team","/api/staff/activity"))assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(a.str("token"))}.status)
        assertEquals(HttpStatusCode.BadRequest,client.get("/api/platform/overview?days=abc"){bearerAuth(admin)}.status)
    }
    @Test fun `staff actions over http enforce confirmation version and ownership`()=testApplication {
        val f=fixture();val other=fixture();val a=hire(f);application{loyaltyRoutes(service,admin,"https://loyalty.test")};val path="/api/staff/team/${a.str("id")}/actions"
        suspend fun send(token:String,input:TeamAction)=client.post(path){bearerAuth(token);contentType(ContentType.Application.Json);setBody(json.encodeToString(input))}
        assertEquals(HttpStatusCode.BadRequest,send(f.token,change(1,"ARCHIVE").copy(confirmed=false)).status)
        assertEquals(HttpStatusCode.NotFound,send(other.token,change(1,"ARCHIVE")).status)
        assertEquals(HttpStatusCode.OK,send(f.token,change(1,"ARCHIVE")).status)
        assertEquals(HttpStatusCode.Conflict,send(f.token,change(1,"ARCHIVE")).status)
    }
}
