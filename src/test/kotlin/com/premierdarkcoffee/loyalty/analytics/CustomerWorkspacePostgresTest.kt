package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.DeletePromotion
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.deletePromotion
import com.premierdarkcoffee.loyalty.fidelity.previewPromotionRemoval
import com.premierdarkcoffee.loyalty.marketing.PromotionTemplate
import com.premierdarkcoffee.loyalty.marketing.PurchaseItem
import com.premierdarkcoffee.loyalty.marketing.createPromotion
import com.premierdarkcoffee.loyalty.shared.Enrollment
import com.premierdarkcoffee.loyalty.shared.Lookup
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.ProgramChange
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reserve
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.summary

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
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
class CustomerWorkspacePostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="workspace_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val at=Instant.parse("2026-11-05T05:30:00Z") // 00:30 Ecuador
    private val pepper="customer-activity-test-pepper-long-enough"
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("CREATE SCHEMA $schema") } }
        db=Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url;username=user;this.password=this@CustomerWorkspacePostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt()
            connectionInitSql="SET search_path TO ${this@CustomerWorkspacePostgresTest.schema}"
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
        val m=service.member(service.enrollWithoutPassword(slug,WalletEnrollment(name,"DEMO10001",true, phone = "0991234567")).str("token"))
        val p=service.createPromotion(s,PromotionTemplate("Sexta pizza","pizza",6,rewardName="Pizza gratis"),id())
        return F(s,token,slug,m,a,b,p.str("programId"),p.str("rewardId"))
    }
    private fun member(f:F,name:String,doc:String)=service.member(service.enrollWithoutPassword(f.slug,WalletEnrollment(name,doc,true, phone = "0991234567")).str("token"))
    private fun buy(f:F,qty:Int=1,time:Instant=at,m:Member=f.member,branch:String=f.a):JsonObject {
        return atTime(time).purchase(f.owner,Purchase(m.id,branch,id(),qty*100L,"USD",listOf(PurchaseItem("Pizza","pizza",qty,100))),id())
    }
    private fun activity(f:F,segment:String="ALL",days:Int=30,inactive:Int=30,q:String="",offset:Int=0)=service.customerActivity(f.owner,CustomerActivityQuery(days,inactive,segment,q,offset))
    private fun remove(f:F) {
        val p=service.previewPromotionRemoval(f.owner,f.program)
        service.deletePromotion(f.owner,f.program,DeletePromotion(p.num("version").toInt(),p.str("impactHash"),"ELIMINAR",true),id())
    }
    private fun workspace(f:F,query:CustomerTimelineQuery=CustomerTimelineQuery())=service.customerWorkspace(f.owner,f.member.id,query)
    private fun JsonObject.events()=getValue("timeline").jsonObject.getValue("items").jsonArray.map{it.jsonObject}
    private fun claim(f:F) {
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        service.purchase(f.owner,Purchase(f.member.id,f.b,"RECEIPT-REWARD",0,"USD",listOf(PurchaseItem("Pizza","pizza",1,100)),rewardId=f.reward,expectedRevision=revision,expectedRewardVersion=1,identityVerified=true,customerConfirmed=true),id())
    }
    @Test fun `history preserves receipt products net total and confirmed reward snapshot`() {
        val f=fixture();buy(f,5,at.minusSeconds(100));claim(f)
        val d=workspace(f);assertEquals(3,d.events().size);assertEquals(500,d.summary().num("spentMinor"));assertEquals(100,d.summary().num("discountMinor"));assertEquals(1,d.summary().num("claimedRewards"))
        val purchase=d.events().first{it.str("kind")=="PURCHASE"&&it.str("receipt")=="RECEIPT-REWARD"}
        assertEquals(100,purchase.num("grossMinor"));assertEquals(0,purchase.num("paidMinor"));assertEquals(100,purchase.num("discountMinor"));assertEquals("Pizza",purchase.getValue("items").jsonArray.single().jsonObject.str("name"))
        val reward=d.events().single{it.str("kind")=="REWARD"};assertEquals("Pizza gratis",reward.str("name"));assertEquals("Norte",reward.str("branch"));assertEquals(5,reward.num("cost"))
    }
    @Test fun `deleting promotion hides current progress but retains purchases and claims`() {
        val f=fixture();buy(f,5,at.minusSeconds(100));claim(f);val before=workspace(f)
        remove(f);val after=workspace(f)
        assertEquals(before.events(),after.events());assertEquals(before.summary(),after.summary());assertTrue(after.getValue("rewardProgress").jsonArray.isEmpty())
    }
    @Test fun `paused promotion is absent from current progress`() {
        val f=fixture();buy(f,4);assertTrue(workspace(f).getValue("rewardProgress").jsonArray.isNotEmpty())
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Sexta pizza",Kind.STAMPS,active=false,productGroup="pizza",countUnits=true)))
        assertTrue(workspace(f).getValue("rewardProgress").jsonArray.isEmpty());assertEquals(1,workspace(f).events().size)
    }
    @Test fun `filters affect movements but not all time metrics`() {
        val f=fixture();buy(f,5,at.minusSeconds(100));claim(f);val full=workspace(f)
        val only=workspace(f,CustomerTimelineQuery("REWARD",f.b));assertEquals(1,only.events().size);assertEquals(full.summary(),only.summary())
        val branch=workspace(f,CustomerTimelineQuery(branchId=f.a));assertEquals(1,branch.events().size);assertEquals(f.a,branch.events().single().str("branchId"))
        assertTrue(workspace(f,CustomerTimelineQuery("REWARD",f.a)).events().isEmpty())
    }
    @Test fun `pagination has stable ties no overlap and total on empty page`() {
        val f=fixture();repeat(23){buy(f)}
        val first=workspace(f);val second=workspace(f,CustomerTimelineQuery(offset=20));val empty=workspace(f,CustomerTimelineQuery(offset=40))
        assertEquals(20,first.events().size);assertEquals(3,second.events().size);assertEquals(23,empty.getValue("timeline").jsonObject.num("total"));assertTrue(empty.events().isEmpty())
        assertTrue(first.events().map{it.str("id")}.intersect(second.events().map{it.str("id")}.toSet()).isEmpty());assertEquals(first.events(),workspace(f).events())
    }
    @Test fun `opening profile cannot release expired holds or mutate wallet revision and ledger`() {
        val f=fixture();val p=service.newProgram(f.owner,Program("Visitas",Kind.STAMPS)).str("id");val r=service.saveReward(f.owner,Reward(p,"Premio",1)).str("id");buy(f)
        service.reserve(f.member,Reserve(r),id())
        fun snapshot()=db.tx{c->listOf("members","balances","ledger","redemptions","wallet_passes","wallet_outbox").map{table->c.rows("SELECT row_to_json(t)::text FROM $table t WHERE tenant_id=? ORDER BY row_to_json(t)::text",f.owner.tenant){it.getString(1)}}}
        val before=snapshot();repeat(3){atTime(at.plusSeconds(86400)).customerWorkspace(f.owner,f.member.id)};assertEquals(before,snapshot())
        assertTrue(workspace(f,CustomerTimelineQuery("REWARD")).events().isEmpty())
    }
    @Test fun `future operations are excluded from summary and history`() {
        val f=fixture();buy(f,5,at.minusSeconds(100));buy(f,1,at.plusSeconds(100))
        val d=workspace(f);assertEquals(1,d.events().size);assertEquals(500,d.summary().num("spentMinor"));assertEquals(at.toString(),d.str("asOf"))
    }
    @Test fun `profiles suggestions and branch filter are isolated by business and role`() {
        val a=fixture("Ana");val b=fixture("Privada");buy(b,5)
        assertEquals(404,assertFailsWith<Problem>{service.customerWorkspace(a.owner,b.member.id)}.status)
        assertEquals(404,assertFailsWith<Problem>{workspace(a,CustomerTimelineQuery(branchId=b.a))}.status)
        assertTrue(service.customerSuggestions(a.owner,"Priv").getValue("items").jsonArray.isEmpty())
        val cashier=service.staff(service.newStaff(a.owner,NewStaff("CASHIER",a.a)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.customerWorkspace(cashier,a.member.id)}.status)
        assertEquals(403,assertFailsWith<Problem>{service.customerSuggestions(cashier,"Ana")}.status)
    }
    @Test fun `suggestions and list search ignore Spanish accents without treating wildcards as sql`() {
        val f=fixture("Ángela Ñandú 100%_");repeat(10){member(f,"Ángela $it","DEMO${10002+it}")}
        assertEquals(8,service.customerSuggestions(f.owner,"angela").getValue("items").jsonArray.size)
        val match=service.customerSuggestions(f.owner,"nandu").getValue("items").jsonArray.single().jsonObject
        assertEquals(setOf("id","name","cardSuffix"),match.keys);assertEquals(6,match.str("cardSuffix").length)
        assertEquals(1,activity(f,q="nandu").num("total"));assertEquals(1,activity(f,q="%_").num("total"));assertTrue(service.customerSuggestions(f.owner,"x' OR true --").getValue("items").jsonArray.isEmpty())
        assertTrue(service.customerSuggestions(f.owner,"a").getValue("items").jsonArray.isEmpty())
    }
    @Test fun `customer sorting uses money visits names and registration without changing totals`() {
        val f = fixture("Zoe")
        val a = member(f, "Ángela", "DEMO10002")
        val b = member(f, "Bruno", "DEMO10003")
        buy(f, 5, m = a, time = at.minusSeconds(100))
        buy(f, m = b)
        buy(f, m = b)
        // Enrollment uses PostgreSQL now(), not the service's fixed test clock.
        // Set every fixture registration explicitly so NEWEST is independent of the real date.
        val joined = mapOf(a.id to at.minusSeconds(3 * 86400), b.id to at.minusSeconds(2 * 86400), f.member.id to at.minusSeconds(86400))
        db.tx { c ->
            joined.forEach { (memberId, time) ->
                assertEquals(1, c.exec("UPDATE members SET created_at=? WHERE tenant_id=? AND id=?", java.sql.Timestamp.from(time), f.owner.tenant, memberId))
            }
        }
        val expected = linkedMapOf(
            "SPENT" to listOf(a.id, b.id, f.member.id),
            "VISITS" to listOf(b.id, a.id, f.member.id),
            "NAME" to listOf(a.id, b.id, f.member.id),
            "NEWEST" to listOf(f.member.id, b.id, a.id),
            "RECENT" to listOf(b.id, a.id, f.member.id)
        )
        val summary = service.customerActivity(f.owner).summary()
        expected.forEach { (sort, ids) ->
            val result = service.customerActivity(f.owner, CustomerActivityQuery(sort = sort))
            assertEquals(ids, result.rows().map { it.str("id") }, "Order for $sort")
            assertEquals(summary, result.summary(), "Totals must not change with $sort")
        }
    }
    @Test fun `http rejects invalid filters and unauthenticated users`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")};val f=fixture();val path="/api/staff/customer-workspace/"+f.member.id
        assertEquals(HttpStatusCode.Unauthorized,client.get(path).status)
        for(q in listOf("offset=bad","offset=-1","offset=2147483648","kind=UNKNOWN","branchId=bad")) assertEquals(HttpStatusCode.BadRequest,client.get("$path?$q"){bearerAuth(f.token)}.status,q)
        assertEquals(HttpStatusCode.BadRequest,client.get("/api/staff/customer-activity?sort=bad"){bearerAuth(f.token)}.status)
        assertEquals(HttpStatusCode.OK,client.get(path){bearerAuth(f.token)}.status)
    }

    @Test fun `registration requires contact without creating partial member and allows shared family number`() {
        val f=fixture()
        for(phone in listOf(null,"","bad"))assertFailsWith<Problem>{service.enrollWithoutPassword(f.slug,WalletEnrollment("Nuevo","DEMO20001",true,phone=phone))}
        val joined=service.enrollWithoutPassword(f.slug,WalletEnrollment("Nuevo","DEMO20001",true,phone="0991234567"));val m=service.member(joined.str("token"))
        assertEquals("+593991234567",service.customerWorkspace(f.owner,m.id).getValue("member").jsonObject.str("contactPhone"))
        assertNotEquals(m.id,f.member.id)
        assertFailsWith<Problem>{service.enroll(f.slug,Enrollment("Otro","DEMO20002","test-password-123",true))}
    }
    @Test fun `contact change preserves installed card identity balances and public response`() {
        val f=fixture();buy(f,5);val before=service.card(f.member);val summary=workspace(f).summary()
        val updated=service.updateCustomerContact(f.owner,f.member.id,CustomerContactChange("0981234567",0,true))
        assertEquals("+593981234567",updated.str("phone"));assertEquals(1,updated.num("version"))
        assertEquals(before,service.card(f.member));assertEquals(summary,workspace(f).summary())
        assertFalse(service.card(f.member).toString().contains("981234567"));assertFalse(service.customerSuggestions(f.owner,"Ana").toString().contains("981234567"))
    }
    @Test fun `contact needs explicit confirmation and safe version and supports lost response retry`() {
        val f=fixture();assertFailsWith<Problem>{service.updateCustomerContact(f.owner,f.member.id,CustomerContactChange("0981234567",0))}
        val input=CustomerContactChange("0981234567",0,true);val saved=service.updateCustomerContact(f.owner,f.member.id,input)
        assertEquals(saved,service.updateCustomerContact(f.owner,f.member.id,input))
        assertEquals(409,assertFailsWith<Problem>{service.updateCustomerContact(f.owner,f.member.id,CustomerContactChange("0971234567",0,true))}.status)
        assertEquals("+593981234567",workspace(f).getValue("member").jsonObject.str("contactPhone"))
    }
    @Test fun `contact is business scoped and cashier cannot edit or use owner member lookup`() {
        val f=fixture();val other=fixture();val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token"))
        assertEquals(404,assertFailsWith<Problem>{service.updateCustomerContact(other.owner,f.member.id,CustomerContactChange("0981234567",0,true))}.status)
        assertEquals(403,assertFailsWith<Problem>{service.updateCustomerContact(cashier,f.member.id,CustomerContactChange("0981234567",0,true))}.status)
        assertEquals(403,assertFailsWith<Problem>{service.lookup(cashier,Lookup(memberId=f.member.id))}.status)
        assertEquals(404,assertFailsWith<Problem>{service.lookup(other.owner,Lookup(memberId=f.member.id))}.status)
        assertEquals(f.member.id,service.lookup(f.owner,Lookup(memberId=f.member.id)).getValue("member").jsonObject.str("id"))
    }
    @Test fun `existing member without phone keeps card and migrations never backfill another phone`() {
        val f=fixture();val before=service.card(f.member)
        db.tx{it.exec("UPDATE members SET contact_phone=NULL WHERE tenant_id=? AND id=?",f.owner.tenant,f.member.id)};db.migrate();db.migrate()
        assertEquals(before,service.card(f.member));assertEquals(JsonNull,workspace(f).getValue("member").jsonObject["contactPhone"])
        service.updateCustomerContact(f.owner,f.member.id,CustomerContactChange("0991234567",0,true));assertEquals(before,service.card(f.member))
    }
    @Test fun `http contact update is authenticated and returns no identity material`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")};val f=fixture();val path="/api/staff/customer-workspace/${f.member.id}/contact"
        assertEquals(HttpStatusCode.Unauthorized,client.put(path){contentType(ContentType.Application.Json);setBody("{}")}.status)
        val result=client.put(path){bearerAuth(f.token);contentType(ContentType.Application.Json);setBody("""{"phone":"0981234567","expectedVersion":0,"customerConfirmed":true}""")}
        assertEquals(HttpStatusCode.OK,result.status)
        assertEquals(setOf("phone","version"),json.parseToJsonElement(result.bodyAsText()).jsonObject.keys)
        val payload="""{"phone":"0971234567","expectedVersion":1,"customerConfirmed":true}"""
        val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token")
        assertEquals(HttpStatusCode.Forbidden,client.put(path){bearerAuth(cashier);contentType(ContentType.Application.Json);setBody(payload)}.status)
        assertEquals(HttpStatusCode.NotFound,client.put(path){bearerAuth(fixture().token);contentType(ContentType.Application.Json);setBody(payload)}.status)
        assertEquals(HttpStatusCode.NotFound,client.put("/api/platform/tenants/${f.owner.tenant}/customer-workspace/${f.member.id}/contact"){bearerAuth("p".repeat(40));contentType(ContentType.Application.Json);setBody(payload)}.status)
        assertEquals("+593981234567",workspace(f).getValue("member").jsonObject.str("contactPhone"))
    }
}
