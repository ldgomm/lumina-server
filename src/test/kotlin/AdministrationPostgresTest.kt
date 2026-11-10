package com.premierdarkcoffee.loyalty

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
class AdministrationPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="administration_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val admin="administration-platform-test-token-long-enough"
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@AdministrationPostgresTest.password;maximumPoolSize=10;connectionInitSql="SET search_path TO ${this@AdministrationPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"administration-test-pepper-long-enough")
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private fun JsonObject.rows(k:String)=getValue(k).jsonArray.map{it.jsonObject}
    private data class F(val owner:Staff,val token:String,val member:Member,val branch:String,val program:String,val reward:String)
    private fun fixture():F {
        val slug="admin-"+id().take(10);val t=service.createTenant(NewTenant("Negocio administración",slug))
        val token=t.str("ownerToken");val owner=service.staff(token);val branch=service.newBranch(owner,NewBranch("Centro","C")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente ficticio","DEMO12345",true)).str("token"))
        val program=service.newProgram(owner,Program("Puntos",Kind.POINTS)).str("id");val reward=service.saveReward(owner,Reward(program,"Premio",5)).str("id")
        return F(owner,token,member,branch,program,reward)
    }
    private fun purchase(f:F)=service.purchase(f.owner,Purchase(f.member.id,f.branch,id(),1234,"USD",programIds=setOf(f.program)),id())
    private fun row(f:F)=service.branchDirectory(f.owner).rows("items").single{it.str("id")==f.branch}
    private fun rename(f:F,name:String="Centro renovado",version:Int=1,key:String=id())=service.editManagedBranch(f.owner,f.branch,ManagedBranchChange(version,name,"CTR","Corrección verificada del nombre"),key)
    private fun counts(f:F)=db.tx{c->listOf("purchases","audit_events","billing_invoices","ledger","wallet_outbox").map{t->c.one("SELECT count(*) FROM $t WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}}}

    @Test fun `hub summary is isolated and does not expose credentials or customer identity`() {
        val f=fixture();val other=fixture();service.newStaff(other.owner,NewStaff("CASHIER",other.branch,"Persona ajena"))
        val d=service.administration(f.owner);assertEquals(1,d.getValue("team").jsonObject.num("active"));assertEquals(1,d.getValue("branches").jsonObject.num("total"))
        assertFalse(d.getValue("profile").jsonObject.getValue("present").jsonPrimitive.boolean)
        for(secret in listOf(f.token,"token_hash","card_code","DEMO12345","Cliente ficticio","Persona ajena"))assertFalse(d.toString().contains(secret))
    }
    @Test fun `viewing readiness never generates scheduled invoices or wallet work`() {
        val f=fixture();val today=LocalDate.now(ZoneId.of("America/Guayaquil"))
        service.commercial.configure(f.owner.tenant,MembershipChange(0,MembershipPlan("Mensual",1000,today.toString(),today.plusMonths(1).toString())))
        db.tx{it.exec("UPDATE billing_memberships SET next_on=?::date WHERE tenant_id=?",today.minusMonths(1).toString(),f.owner.tenant)}
        val before=counts(f);repeat(2){service.administration(f.owner);service.branchDirectory(f.owner)};assertEquals(before,counts(f))
    }
    @Test fun `hub counts active suspended and archived staff separately and unassigned branches accurately`() {
        val f=fixture();val a=service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Ana Cajera"));val b=service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Luis Cajero"))
        service.teamAction(f.owner,a.str("id"),TeamAction(1,"DEACTIVATE","Fin del turno",true));service.teamAction(f.owner,b.str("id"),TeamAction(1,"ARCHIVE","Salida definitiva",true))
        val d=service.administration(f.owner);val team=d.getValue("team").jsonObject
        assertEquals(1,team.num("active"));assertEquals(1,team.num("owners"));assertEquals(1,team.num("inactive"));assertEquals(1,team.num("archived"));assertEquals(1,d.getValue("branches").jsonObject.num("withoutCashier"))
        service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Cajera actual"));assertEquals(0,service.administration(f.owner).getValue("branches").jsonObject.num("withoutCashier"))
    }
    @Test fun `hub shows emitted balances and personally unread notices without marking read`() {
        val f=fixture();val today=LocalDate.now(ZoneId.of("America/Guayaquil"))
        service.commercial.charge(f.owner.tenant,NewCharge("Cargo",12345,today.minusDays(1).toString()),id())
        service.commercial.notify(f.owner.tenant,BusinessNotice("Aviso vigente","Consulta tu cuenta"),id())
        val d=service.administration(f.owner).getValue("account").jsonObject
        assertEquals(12345,d.getValue("summary").jsonObject.num("balanceMinor"));assertEquals(12345,d.getValue("summary").jsonObject.num("overdueMinor"));assertEquals(1,d.getValue("notices").jsonObject.num("unread"))
        assertEquals(1,service.administration(f.owner).getValue("account").jsonObject.getValue("notices").jsonObject.num("unread"))
        assertEquals(JsonNull,service.administration(Staff(f.owner.tenant,"platform","OWNER",null)).getValue("account").jsonObject.getValue("notices").jsonObject["unread"])
    }
    @Test fun `revoked owner snapshots cannot read or replay branch mutations`() {
        val f=fixture();val another=service.newStaff(f.owner,NewStaff("OWNER",name="Otro dueño"));val s=service.staff(another.str("token"));val key=id();val input=ManagedBranch("Nuevo","N")
        service.createManagedBranch(s,input,key);service.teamAction(f.owner,s.id,TeamAction(1,"DEACTIVATE","Retiro de acceso",true))
        assertEquals(401,assertFailsWith<Problem>{service.administration(s)}.status);assertEquals(401,assertFailsWith<Problem>{service.branchDirectory(s)}.status)
        assertEquals(401,assertFailsWith<Problem>{service.createManagedBranch(s,input,key)}.status)
    }
    @Test fun `cashiers cannot use any administration operation and tenants cannot edit foreign branches`() {
        val f=fixture();val other=fixture();val staff=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Cajera" )).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.administration(staff)}.status);assertEquals(403,assertFailsWith<Problem>{service.branchDirectory(staff)}.status)
        assertEquals(403,assertFailsWith<Problem>{service.createManagedBranch(staff,ManagedBranch("Nuevo","N"),id())}.status)
        assertEquals(403,assertFailsWith<Problem>{service.editManagedBranch(staff,f.branch,ManagedBranchChange(1,"Nuevo","N","Corrección solicitada"),id())}.status)
        assertEquals(404,assertFailsWith<Problem>{service.editManagedBranch(other.owner,f.branch,ManagedBranchChange(1,"Nuevo","N","Corrección solicitada"),id())}.status)
    }
    @Test fun `directory uses literal accent insensitive search and bounded nonoverlapping pages`() {
        val f=fixture();for(i in 1..27)service.createManagedBranch(f.owner,ManagedBranch("Óptica % Local ${i.toString().padStart(2,'0')}","O$i"),id())
        val first=service.branchDirectory(f.owner,BranchDirectoryQuery("optica %"));val second=service.branchDirectory(f.owner,BranchDirectoryQuery("optica %",25))
        assertEquals(27,first.num("total"));assertEquals(25,first.rows("items").size);assertEquals(2,second.rows("items").size)
        assertTrue(first.rows("items").map{it.str("id")}.intersect(second.rows("items").map{it.str("id")}.toSet()).isEmpty())
        assertEquals(0,service.branchDirectory(f.owner,BranchDirectoryQuery("' OR true --")).num("total"));assertEquals(0,service.branchDirectory(f.owner,BranchDirectoryQuery("_")).num("total"))
    }
    @Test fun `directory totals do not multiply purchases by cashiers or rewards`() {
        val f=fixture();repeat(2){service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Caja $it"));purchase(f)}
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision");service.redeemAtCounter(f.owner,CounterRedemption(f.member.id,f.branch,f.reward,revision,1,true,true),id())
        val r=row(f);assertEquals(2,r.num("cashiers"));assertEquals(2,r.num("purchases"));assertEquals(2468,r.num("paidMinor"));assertEquals(1,r.num("rewards"))
        db.tx{it.exec("UPDATE purchases SET created_at=now()-interval '31 days' WHERE tenant_id=?",f.owner.tenant)}
        assertEquals(0,row(f).num("paidMinor"))
    }
    @Test fun `new branch normalizes and retries idempotently but key collision is rejected`() {
        val f=fixture();val key=id();val x=ManagedBranch("  Sucursal Dos  ","  DOS  ")
        val a=service.createManagedBranch(f.owner,x,key);val b=service.createManagedBranch(f.owner,x.normalized(),key);assertEquals(a-"replayed",b-"replayed");assertEquals(JsonPrimitive(true),b["replayed"])
        assertEquals(2,service.branchDirectory(f.owner).num("total"));assertEquals(409,assertFailsWith<Problem>{service.createManagedBranch(f.owner,x.copy(name="Otra"),key)}.status)
        assertEquals("BRANCH_CODE_EXISTS",assertFailsWith<Problem>{service.createManagedBranch(f.owner,ManagedBranch("Otra","DOS"),id())}.code)
    }
    @Test fun `rename preserves branch membership wallet and economic history and records reason`() {
        val f=fixture();purchase(f);val before=service.card(f.member);val key=id();val change=rename(f,key=key);val replay=rename(f,key=key);assertEquals(change-"replayed",replay-"replayed");assertEquals(JsonPrimitive(true),replay["replayed"])
        assertEquals(2,row(f).num("version"));assertEquals(f.branch,row(f).str("id"));assertEquals("Centro renovado",row(f).str("name"));assertEquals(before,service.card(f.member))
        assertEquals(1234,row(f).num("paidMinor"));val e=service.managementActivity(f.owner.tenant,ManagementQuery(kind="ADMIN")).rows("items").single{it["action"]==JsonPrimitive("EDIT_BRANCH")}
        val detail=e.getValue("details").jsonObject;assertEquals("Centro",detail.getValue("before").jsonObject.str("name"));assertEquals("CTR",detail.getValue("after").jsonObject.str("code"));assertEquals("Corrección verificada del nombre",detail.str("reason"));assertEquals(f.owner.id,e.str("actorId"))
    }
    @Test fun `concurrent edits have exactly one winner and clear conflict`() {
        val f=fixture();val pool=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        try{val results=(1..2).map{n->pool.submit<Any>{barrier.await();try{rename(f,"Nuevo $n")}catch(e:Problem){e}}}.map{it.get(20,TimeUnit.SECONDS)}
            assertEquals(1,results.filterIsInstance<JsonObject>().size);assertEquals("BRANCH_CHANGED",results.filterIsInstance<Problem>().single().code);assertEquals(2,row(f).num("version"))
        }finally{pool.shutdownNow()}
    }
    @Test fun `duplicate branch code conflict makes no partial edit or audit`() {
        val f=fixture();service.createManagedBranch(f.owner,ManagedBranch("Otro","DUP"),id());val before=counts(f)
        assertEquals("BRANCH_CODE_EXISTS",assertFailsWith<Problem>{service.editManagedBranch(f.owner,f.branch,ManagedBranchChange(1,"Modificado","DUP","Cambio solicitado"),id())}.code)
        assertEquals("Centro",row(f).str("name"));assertEquals(1,row(f).num("version"));assertEquals(before,counts(f))
    }
    @Test fun `suspension preserves reads and metadata editing but blocks opening new branches`() {
        val f=fixture();db.tx{it.exec("UPDATE business_access SET state='SUSPENDED' WHERE tenant_id=?",f.owner.tenant)}
        assertEquals("SUSPENDED",service.administration(f.owner).getValue("account").jsonObject.getValue("access").jsonObject.str("effectiveState"));service.branchDirectory(f.owner);rename(f)
        assertEquals(423,assertFailsWith<Problem>{service.createManagedBranch(f.owner,ManagedBranch("Nuevo","N"),id())}.status)
    }
    @Test fun `migration rerun preserves existing version labels and credentials`() {
        val f=fixture();rename(f);db.migrate();assertEquals(2,row(f).num("version"));assertEquals("Centro renovado",row(f).str("name"));assertEquals(f.owner.id,service.staff(f.token).id)
        assertEquals(13,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations"){it.getInt(1)}})
    }
    @Test fun `HTTP routes enforce authentication roles method input and no-store`()=testApplication {
        val f=fixture();val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.branch,"Cajera")).str("token");application{loyaltyRoutes(service,admin,"https://loyalty.test")}
        for(path in listOf("/api/staff/administration","/api/staff/branch-directory")){
            assertEquals(HttpStatusCode.Unauthorized,client.get(path).status);assertEquals(HttpStatusCode.Forbidden,client.get(path){bearerAuth(cashier)}.status)
            val r=client.get(path){bearerAuth(f.token)};assertEquals(HttpStatusCode.OK,r.status);assertEquals("no-store",r.headers[HttpHeaders.CacheControl])
        }
        for(path in listOf("/api/platform/tenants/${f.owner.tenant}/administration","/api/platform/tenants/${f.owner.tenant}/branch-directory")){
            assertEquals(HttpStatusCode.Unauthorized,client.get(path){bearerAuth(f.token)}.status);assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(admin)}.status)
        }
        assertEquals(HttpStatusCode.BadRequest,client.get("/api/staff/branch-directory?offset=oops"){bearerAuth(f.token)}.status)
        assertEquals(HttpStatusCode.BadRequest,client.post("/api/staff/branch-directory"){bearerAuth(f.token);contentType(ContentType.Application.Json);setBody(json.encodeToString(ManagedBranch("Nuevo","N")))}.status)
    }
    @Test fun `owner and platform HTTP mutations require fresh versions and audit platform actor`()=testApplication {
        val f=fixture();application{loyaltyRoutes(service,admin,"https://loyalty.test")}
        val path="/api/platform/tenants/${f.owner.tenant}/branch-directory"
        val a=client.post(path){bearerAuth(admin);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(json.encodeToString(ManagedBranch("Platform","P")))}
        assertEquals(HttpStatusCode.Created,a.status);val target=json.parseToJsonElement(a.bodyAsText()).jsonObject.str("id")
        val input=ManagedBranchChange(1,"Platform corregido","PC","Corrección verificada")
        val b=client.put("$path/$target"){bearerAuth(admin);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(json.encodeToString(input))};assertEquals(HttpStatusCode.OK,b.status)
        val stale=client.put("/api/staff/branch-directory/$target"){bearerAuth(f.token);header("Idempotency-Key",id());contentType(ContentType.Application.Json);setBody(json.encodeToString(input))};assertEquals(HttpStatusCode.Conflict,stale.status)
        val events=service.managementActivity(f.owner.tenant,ManagementQuery(kind="ADMIN",actorId="platform")).rows("items");assertTrue(events.any{it.str("action")=="EDIT_BRANCH"});assertTrue(events.all{it.str("actorName")=="Administrador de plataforma"})
    }
}
