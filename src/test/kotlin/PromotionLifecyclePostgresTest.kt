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
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PromotionLifecyclePostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="lifecycle_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val at=Instant.parse("2026-11-04T17:00:00Z")
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@PromotionLifecyclePostgresTest.password;maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt();connectionInitSql="SET search_path TO ${this@PromotionLifecyclePostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"lifecycle-pepper-long-enough",Clock.fixed(at,ZoneOffset.UTC))
    }
    @AfterAll fun cleanup() { if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}} }
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private data class F(val owner:Staff,val token:String,val member:Member,val branch:String,val program:String,val reward:String,val slug:String)
    private fun fixture():F {
        val slug="lifecycle-"+id().take(12);val t=service.createTenant(NewTenant("Negocio",slug));val token=t.str("ownerToken");val owner=service.staff(token)
        val branch=service.newBranch(owner,NewBranch("Centro","A")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente","DEMO10001",true)).str("token"))
        val program=service.newProgram(owner,Program("Promoción de prueba",Kind.STAMPS)).str("id")
        val reward=service.saveReward(owner,Reward(program,"Premio",1)).str("id")
        return F(owner,token,member,branch,program,reward,slug)
    }
    private fun purchase(f:F,selected:Set<String>?=null)=Purchase(f.member.id,f.branch,id(),1000,"USD",programIds=selected)
    private fun earn(f:F)=service.purchase(f.owner,purchase(f),id())
    private fun rawBalance(f:F)=db.tx{c->c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.program){it.getLong(1)}?:0}
    private fun review(f:F):DeletePromotion {val r=service.previewPromotionRemoval(f.owner,f.program);return DeletePromotion(r.num("version").toInt(),r.str("impactHash"),"ELIMINAR",true)}
    private fun remove(f:F,input:DeletePromotion=review(f),key:String=id())=service.deletePromotion(f.owner,f.program,input,key)
    private fun wallet(f:F)=WalletService(service,"https://example.com",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){5}))).materialize(f.member)
    private fun change(f:F,active:Boolean,version:Int)=service.editProgram(f.owner,f.program,ProgramChange(version,Program("Promoción de prueba",Kind.STAMPS,active=active)))
    private fun counter(f:F)=CounterRedemption(f.member.id,f.branch,f.reward,service.card(f.member).getValue("member").jsonObject.num("revision"),1,true,true)
    private fun count(table:String,f:F)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!!}
    private fun race(vararg work:()->Any):List<Any> {val gate=CountDownLatch(1);val pool=Executors.newFixedThreadPool(work.size);try{val futures=work.map{task->pool.submit<Any>{gate.await();try{task()}catch(p:Problem){p}}};gate.countDown();return futures.map{it.get(25,TimeUnit.SECONDS)}}finally{pool.shutdownNow()}}

    @Test fun `pause hides customer balances rewards and signup then resume restores earned balance`() {
        val f=fixture();earn(f);val first=wallet(f);assertEquals(JsonPrimitive(34),first.snapshot["presentationVersion"]);assertTrue(first.artwork().total>0);change(f,false,1)
        assertEquals(1,rawBalance(f));assertTrue(service.card(f.member).getValue("balances").jsonArray.isEmpty())
        val public=service.publicTenant(f.slug);assertTrue(public.getValue("programs").jsonArray.isEmpty());assertTrue(public.getValue("rewards").jsonArray.isEmpty())
        val paused=wallet(f);assertEquals(first.serial,paused.serial);assertEquals(first.token,paused.token);assertEquals(0,paused.artwork().total);assertNotEquals(first.googleArtwork("https://example.com"),paused.googleArtwork("https://example.com"));assertTrue(paused.snapshot.getValue("balances").jsonArray.isEmpty());assertTrue(paused.snapshot.getValue("rewardProgress").jsonArray.isEmpty())
        assertFalse(paused.appleJson("pass.test","TEAM","https://example.com").toString().contains("Promoción de prueba"));assertFalse(paused.googleJson("object","class","https://example.com").toString().contains("Premio"))
        assertEquals(1,service.dashboard(f.owner).getValue("programs").jsonArray.size)
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token"));assertTrue(service.dashboard(cashier).getValue("programs").jsonArray.isEmpty())
        change(f,true,2);assertEquals(1,service.card(f.member).getValue("balances").jsonArray.single().jsonObject.num("available"));assertEquals(1,wallet(f).snapshot.getValue("rewardProgress").jsonArray.size)
    }
    @Test fun `pause blocks all redemption paths and stale explicitly selected purchases`() {
        val f=fixture();earn(f);val counter=counter(f);val held=service.reserve(f.member,Reserve(f.reward),id());change(f,false,1)
        assertEquals("PROMOTION_PAUSED",assertFailsWith<Problem>{service.confirm(f.owner,Confirm(held.str("token"),f.branch),id())}.code)
        assertEquals("PROMOTION_PAUSED",assertFailsWith<Problem>{service.reserve(f.member,Reserve(f.reward),id())}.code)
        assertFailsWith<Problem>{service.redeemAtCounter(f.owner,counter,id())}
        assertEquals("PROMOTION_PAUSED",assertFailsWith<Problem>{service.purchase(f.owner,purchase(f,setOf(f.program)),id())}.code)
        service.cancel(f.member,held.str("id"),id());assertEquals(1,rawBalance(f));change(f,true,2);assertEquals(1,rawBalance(f))
    }
    @Test fun `delete funded promotion is irreversible and preserves other programs tenants receipts and pass identity`() {
        val f=fixture();val other=fixture();val second=service.newProgram(f.owner,Program("Otra",Kind.POINTS)).str("id");earn(f);earn(other);val pass=wallet(f)
        val impact=service.previewPromotionRemoval(f.owner,f.program);assertEquals(1,impact.num("customersWithBalance"));assertEquals(1,impact.num("available"));assertEquals(1,impact.num("rewards"))
        remove(f);assertEquals(0,rawBalance(f));assertEquals(1,rawBalance(other));assertEquals(1,count("purchases",f));assertEquals(1,count("program_deletions",f))
        assertEquals(second,service.dashboard(f.owner).getValue("programs").jsonArray.single().jsonObject.str("id"));assertTrue(service.dashboard(f.owner).getValue("rewards").jsonArray.isEmpty())
        val next=wallet(f);assertEquals(pass.serial,next.serial);assertEquals(pass.token,next.token);assertFalse(next.snapshot.getValue("balances").jsonArray.any{it.jsonObject.str("programId")==f.program})
        assertEquals(10,service.card(f.member).getValue("balances").jsonArray.single().jsonObject.num("available"))
        assertEquals(0,db.tx{c->c.one("SELECT sum(delta) FROM ledger WHERE tenant_id=? AND program_id=?",f.owner.tenant,f.program){it.getLong(1)}})
        assertEquals(1,service.customerDetail(f.owner,f.member.id).getValue("purchases").jsonArray.size)
    }
    @Test fun `deletion cancels reserved rewards and later cancellation or expiry cannot resurrect balance`() {
        val f=fixture();earn(f);earn(f);val held=service.reserve(f.member,Reserve(f.reward),id());val r=service.previewPromotionRemoval(f.owner,f.program)
        assertEquals(1,r.num("available"));assertEquals(1,r.num("reserved"));assertEquals(1,r.num("pendingRedemptions"));assertEquals(1,r.num("customersWithBalance"));remove(f)
        assertEquals(0,rawBalance(f));assertFailsWith<Problem>{service.confirm(f.owner,Confirm(held.str("token"),f.branch),id())}
        service.cancel(f.member,held.str("id"),id());service.expireBatch();assertEquals(0,rawBalance(f))
        assertEquals("CANCELLED",service.card(f.member).getValue("redemptions").jsonArray.single().jsonObject.str("status"))
    }
    @Test fun `deletion requires fresh impact explicit acknowledgement and owner authorization`() {
        val f=fixture();val r=review(f)
        assertEquals("DELETION_CONFIRMATION_REQUIRED",assertFailsWith<Problem>{remove(f,r.copy(acknowledged=false))}.code)
        assertFailsWith<Problem>{remove(f,r.copy(confirmation="eliminar"))};assertFailsWith<Problem>{remove(f,r.copy(expectedImpact="x"))}
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token"));assertEquals(403,assertFailsWith<Problem>{service.previewPromotionRemoval(cashier,f.program)}.status)
        assertEquals(403,assertFailsWith<Problem>{service.deletePromotion(cashier,f.program,r,id())}.status)
        val other=fixture();assertEquals(404,assertFailsWith<Problem>{service.deletePromotion(other.owner,f.program,r,id())}.status);assertEquals(0,count("program_deletions",f))
    }
    @Test fun `a changed balance reward or program invalidates the warning`() {
        val f=fixture();val before=review(f);earn(f);assertEquals("DELETION_REVIEW_CHANGED",assertFailsWith<Problem>{remove(f,before)}.code);assertEquals(1,rawBalance(f))
        val funded=review(f);service.saveReward(f.owner,Reward(f.program,"Nuevo premio",2),f.reward,1);assertEquals("DELETION_REVIEW_CHANGED",assertFailsWith<Problem>{remove(f,funded)}.code)
        val renamed=review(f);change(f,false,1);assertEquals("DELETION_REVIEW_CHANGED",assertFailsWith<Problem>{remove(f,renamed)}.code);remove(f);assertEquals(0,rawBalance(f))
    }
    @Test fun `deleted promotion cannot be edited selected featured or redeemed through old endpoints`() {
        val f=fixture();earn(f);val counter=counter(f);remove(f)
        assertFailsWith<Problem>{change(f,true,1)};assertFailsWith<Problem>{service.saveReward(f.owner,Reward(f.program,"Otro",1))}
        assertFailsWith<Problem>{service.saveReward(f.owner,Reward(f.program,"Otro",1),f.reward,1)}
        assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign(featuredProgramId=f.program)))}
        assertFailsWith<Problem>{service.purchase(f.owner,purchase(f,setOf(f.program)),id())}
        assertFailsWith<Problem>{service.redeemAtCounter(f.owner,counter,id())};assertFailsWith<Problem>{service.reserve(f.member,Reserve(f.reward),id())}
        earn(f);assertEquals(0,rawBalance(f));assertEquals(2,count("purchases",f))
    }
    @Test fun `all issued cards including unfunded customers are queued and lose deleted progress`() {
        val f=fixture();val first=wallet(f);assertEquals(1,first.snapshot.getValue("rewardProgress").jsonArray.size);remove(f)
        assertTrue(db.tx{c->c.one("SELECT next_scan_at<=? FROM wallet_passes WHERE serial=?",java.sql.Timestamp.from(at),first.serial){it.getBoolean(1)}}!!)
        val next=wallet(f);assertTrue(next.tag>first.tag);assertEquals(first.serial,next.serial);assertTrue(next.snapshot.getValue("rewardProgress").jsonArray.isEmpty())
        assertTrue(service.publicTenant(f.slug).getValue("programs").jsonArray.isEmpty())
    }
    @Test fun `consumed rewards remain in merchant history but disappear from hidden promotion in Wallet`() {
        val f=fixture();earn(f);service.redeemAtCounter(f.owner,counter(f),id());assertTrue(wallet(f).recentActivity().contains("Premio"));change(f,false,1)
        assertFalse(wallet(f).recentActivity().contains("Premio"));remove(f)
        assertEquals(1,service.customerDetail(f.owner,f.member.id).getValue("rewards").jsonArray.size);assertEquals(1,count("redemptions",f))
    }
    @Test fun `migration repeats and database prevents deleted program restoration`() {
        val f=fixture();remove(f);db.migrate();assertEquals(13,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations"){it.getInt(1)}})
        assertFails{db.tx{c->c.exec("UPDATE programs SET deleted_at=NULL WHERE tenant_id=? AND id=?",f.owner.tenant,f.program)}}
        assertFails{db.tx{c->c.exec("DELETE FROM program_deletions WHERE tenant_id=?",f.owner.tenant)}}
    }
    @Test fun `typed discount quotes cannot bypass pause or deletion`() {
        val f=fixture();val made=service.createPromotion(f.owner,PromotionTemplate("Ropa","ropa",2,2000,false,"Descuento"),id())
        val typed=f.copy(program=made.str("programId"),reward=made.str("rewardId"))
        val paid=purchase(f).copy(items=listOf(PurchaseItem("Prenda","ropa",1,1000)));service.purchase(f.owner,paid,id())
        val request=paid.copy(receipt=id(),rewardId=typed.reward,expectedRevision=service.card(f.member).getValue("member").jsonObject.num("revision"),expectedRewardVersion=1,identityVerified=true,customerConfirmed=true)
        val quote=service.receiptQuote(f.owner,request);assertEquals(800,quote.num("amountMinor"))
        service.editProgram(f.owner,typed.program,ProgramChange(1,Program("Ropa",Kind.STAMPS,active=false,productGroup="ropa",countUnits=false)))
        assertEquals("PROMOTION_PAUSED",assertFailsWith<Problem>{service.receiptQuote(f.owner,request)}.code)
        remove(typed);assertFailsWith<Problem>{service.purchase(f.owner,request.copy(amountMinor=800),id())}
        assertEquals(1,count("purchases",f));assertEquals(0,count("redemptions",f))
    }
    @Test fun `deletion HTTP contract checks authorization preview and replay`()=testApplication {
        environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")};val f=fixture();val route="/api/staff/programs/${f.program}"
        assertEquals(HttpStatusCode.Unauthorized,client.get("$route/deletion-preview").status)
        assertEquals(HttpStatusCode.OK,client.get("$route/deletion-preview"){bearerAuth(f.token)}.status)
        val payload=json.encodeToString(review(f));val key=id()
        repeat(2){assertEquals(HttpStatusCode.OK,client.delete(route){bearerAuth(f.token);contentType(ContentType.Application.Json);header("Idempotency-Key",key);setBody(payload)}.status)}
        assertEquals(1,count("program_deletions",f))
    }
    @Test fun `repairing a dead connection retains the same card and excludes the deleted promotion`() {
        val f=fixture();val other=service.newProgram(f.owner,Program("Puntos vigentes",Kind.POINTS)).str("id");earn(f)
        val before=wallet(f);remove(f)
        assertEquals("IDENTITY_VERIFICATION_REQUIRED",assertFailsWith<Problem>{service.issueRestore(f.owner,RestoreIssue(f.member.id,"CONNECTION_REPAIR",false))}.code)
        val link=service.issueRestore(f.owner,RestoreIssue(f.member.id,"CONNECTION_REPAIR",true)).str("path")
        val token=link.substringAfter("#restore=");val restored=service.member(service.useRestore(f.slug,RestoreUse(token)).str("token"))
        val next=WalletService(service,"https://new-connection.example.org",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){5}))).materialize(restored)
        assertEquals(f.member,restored);assertEquals(before.serial,next.serial);assertEquals(before.token,next.token)
        assertEquals(before.snapshot["cardCode"],next.snapshot["cardCode"]);assertEquals(1,count("members",f));assertEquals(1,count("wallet_passes",f))
        assertEquals(other,next.snapshot.getValue("balances").jsonArray.single().jsonObject.str("programId"));assertEquals(10,next.snapshot.getValue("balances").jsonArray.single().jsonObject.num("available"))
        val pass=next.appleJson("pass.test","TEAM","https://new-connection.example.org")
        assertTrue(pass.str("webServiceURL").startsWith("https://new-connection.example.org/"));assertFalse(pass.toString().contains("Promoción de prueba"))
        assertFailsWith<Problem>{service.useRestore(f.slug,RestoreUse(token))}
    }
    @Test fun `concurrent identical deletion writes only one forfeiture and receipt`() {
        val f=fixture();earn(f);val r=review(f);val key=id();val results=race({remove(f,r,key)},{remove(f,r,key)},{remove(f,r,key)})
        assertEquals(3,results.filterIsInstance<JsonObject>().size);assertEquals(1,count("program_deletions",f));assertEquals(0,rawBalance(f))
        assertEquals(1,db.tx{c->c.one("SELECT count(*) FROM ledger WHERE tenant_id=? AND kind='FORFEIT'",f.owner.tenant){it.getLong(1)}})
    }
    @Test fun `concurrent purchase and deletion serialize or require a renewed impact review`() {
        val f=fixture();earn(f);val r=review(f);val results=race({remove(f,r)},{earn(f)})
        assertTrue(results[1] is JsonObject)
        if(results[0] is JsonObject){assertEquals(0,rawBalance(f));assertTrue((results[1] as JsonObject).getValue("earned").jsonArray.isEmpty())}
        else{assertEquals("DELETION_REVIEW_CHANGED",(results[0] as Problem).code);assertEquals(2,rawBalance(f));assertEquals(0,count("program_deletions",f))}
    }
    @Test fun `concurrent redemption and deletion cannot both consume the same reviewed balance`() {
        val f=fixture();earn(f);val r=review(f);val claim=counter(f);val results=race({remove(f,r)},{service.redeemAtCounter(f.owner,claim,id())})
        assertEquals(1,results.filterIsInstance<JsonObject>().size);assertEquals(0,rawBalance(f))
        if(results[0] is JsonObject)assertEquals(0,count("redemptions",f))else assertEquals("DELETION_REVIEW_CHANGED",(results[0] as Problem).code)
    }
    @Test fun `concurrent pause and purchase never earn after the pause commits`() {
        val f=fixture();val results=race({change(f,false,1)},{earn(f)});assertEquals(2,results.filterIsInstance<JsonObject>().size)
        val amount=rawBalance(f);assertTrue(amount in 0..1);earn(f);assertEquals(amount,rawBalance(f));assertTrue(service.card(f.member).getValue("balances").jsonArray.isEmpty())
    }
}
