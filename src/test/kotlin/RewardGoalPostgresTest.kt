package com.premierdarkcoffee.loyalty

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import java.util.Base64
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class RewardGoalPostgresTest {
    private val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val schema = "goal_" + id().replace("-", "")
    private val at = Instant.parse("2026-11-08T12:00:00Z")
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var wallet: WalletService
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url;username=user;this.password=this@RewardGoalPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt()
            connectionInitSql="SET search_path TO ${this@RewardGoalPostgresTest.schema}"
        }))
        db.migrate();service=LoyaltyService(db,"reward-goal-test-pepper-long-enough",Clock.fixed(at,ZoneOffset.UTC))
        wallet=WalletService(service,"https://example.test",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){6})))
    }
    @AfterAll fun cleanup() {
        if (::db.isInitialized) db.close()
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private data class F(val owner:Staff,val member:Member,val branch:String,val program:String,val reward:String,val input:Reward)
    private fun fixture(kind:Kind=Kind.POINTS,goal:Long=100,benefit:Benefit?=null):F {
        val slug="goal-"+id().take(12);val tenant=service.createTenant(NewTenant("Metas",slug));val owner=service.staff(tenant.str("ownerToken"))
        val branch=service.newBranch(owner,NewBranch("Centro","C")).str("id")
        val program=service.newProgram(owner,Program("Promoción",kind,cashbackBps=500,productGroup=benefit?.group ?: "",countUnits=kind==Kind.STAMPS)).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente de prueba","DEMO10001",true)).str("token"))
        val input=Reward(program,"Premio",goal,benefit=benefit)
        return F(owner,member,branch,program,service.saveReward(owner,input).str("id"),input)
    }
    private fun earn(f:F,amount:Long)=service.purchase(f.owner,Purchase(f.member.id,f.branch,id(),amount,"USD"),id())
    private fun balance(f:F)=db.tx { c -> c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.program){it.getLong(1)} ?: 0L }
    private fun count(f:F,table:String)=db.tx { c -> c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!! }
    private fun current(f:F)=service.dashboard(f.owner).getValue("rewards").jsonArray.first{it.jsonObject.str("id")==f.reward}.jsonObject
    private fun request(f:F)=CounterRedemption(f.member.id,f.branch,f.reward,service.card(f.member).getValue("member").jsonObject.num("revision"),1,true,true)
    private fun edit(f:F,cost:Long,version:Int=1)=service.saveReward(f.owner,f.input.copy(cost=cost),f.reward,version)
    private fun assertNative(pass:WalletPass,summary:String) {
        assertTrue(pass.appleExperienceFields().toString().contains(summary))
        assertTrue(pass.googleExperienceFields().toString().contains(summary))
    }
    @Test fun `sequential points goal queues both providers preserving identity ledger and other business`() {
        val f=fixture();val other=fixture();earn(f,15000)
        val before=wallet.materialize(f.member);val untouched=wallet.materialize(other.member)
        // Bind fictional IDs without signing, sending push messages or contacting either provider.
        db.tx { c -> c.exec("UPDATE wallet_passes SET apple_type='pass.test',google_id='issuer.object',google_class='issuer.class' WHERE serial=?",before.serial) }
        val bound=wallet.materialize(f.member);val ledger=count(f,"ledger");val purchases=count(f,"purchases")
        val wake=db.tx { c -> c.rows("SELECT provider,wake_revision FROM wallet_delivery WHERE serial=? ORDER BY provider",before.serial){it.getString(1) to it.getLong(2)} }
        val stale=request(f);assertEquals(2,edit(f,200).num("version"))
        assertTrue(db.tx { c -> c.one("SELECT next_scan_at<=? FROM wallet_passes WHERE serial=?",Timestamp.from(at),before.serial){it.getBoolean(1)} }!!)
        assertFalse(db.tx { c -> c.one("SELECT next_scan_at<=? FROM wallet_passes WHERE serial=?",Timestamp.from(at),untouched.serial){it.getBoolean(1)} }!!)
        val after=wallet.materialize(f.member)
        assertEquals(before.serial,after.serial);assertEquals(before.token,after.token);assertEquals(bound.googleId,after.googleId);assertEquals(bound.googleClass,after.googleClass);assertEquals(bound.appleType,after.appleType)
        assertEquals(before.snapshot["cardCode"],after.snapshot["cardCode"]);assertTrue(after.tag>before.tag)
        assertEquals(150,balance(f));assertEquals(50,after.journey()!!.remaining);assertNative(after,"150 de 200 puntos")
        val now=db.tx { c -> c.rows("SELECT provider,wake_revision FROM wallet_delivery WHERE serial=? ORDER BY provider",before.serial){it.getString(1) to it.getLong(2)} }
        assertEquals(listOf("APPLE","GOOGLE"),now.map{it.first});assertTrue(now.zip(wake).all{(a,b)->a.second>b.second})
        assertEquals("REWARD_CHANGED",assertFailsWith<Problem>{service.redeemAtCounter(f.owner,stale,id())}.code)
        assertEquals(ledger,count(f,"ledger"));assertEquals(purchases,count(f,"purchases"));assertEquals(100,current(other).num("cost"))
        edit(f,50,2);assertEquals(0,wallet.materialize(f.member).journey()!!.remaining);assertEquals(150,balance(f))
    }
    @Test fun `sequential discount goal changes invalidate quote and keep discount conditions`() {
        val f=fixture(Kind.STAMPS,4,Benefit(5000,"café"))
        service.purchase(f.owner,Purchase(f.member.id,f.branch,id(),1500,"USD",listOf(PurchaseItem("Café","café",5,300))),id())
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        val purchase=Purchase(f.member.id,f.branch,id(),150,"USD",listOf(PurchaseItem("Café","café",1,300)),rewardId=f.reward,expectedRevision=revision,expectedRewardVersion=1,identityVerified=true,customerConfirmed=true)
        assertEquals(150,service.receiptQuote(f.owner,purchase).num("discountMinor"))
        edit(f,7);assertEquals(5,balance(f));assertNative(wallet.materialize(f.member),"5 de 7 sellos")
        assertEquals("REWARD_CHANGED",assertFailsWith<Problem>{service.purchase(f.owner,purchase,id())}.code)
        assertEquals("INSUFFICIENT_BALANCE",assertFailsWith<Problem>{service.receiptQuote(f.owner,purchase.copy(expectedRewardVersion=2))}.code)
        assertEquals(json.encodeToJsonElement(f.input.benefit),current(f)["benefit"])
        edit(f,3,2);service.purchase(f.owner,purchase.copy(expectedRewardVersion=3),id());assertEquals(2,balance(f))
    }
    @Test fun `sequential cashback meta preserves cents and paused programs stay hidden`() {
        val f=fixture(Kind.CASHBACK,500);earn(f,15000);val before=wallet.materialize(f.member)
        edit(f,1025);val pass=wallet.materialize(f.member)
        assertEquals(750,balance(f));assertEquals(275,pass.journey()!!.remaining);assertNative(pass,"7.50 de 10.25 USD")
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Promoción",Kind.CASHBACK,active=false,cashbackBps=500)))
        edit(f,2000,2);val paused=wallet.materialize(f.member)
        assertEquals(before.serial,paused.serial);assertTrue(paused.snapshot.getValue("rewardProgress").jsonArray.isEmpty());assertEquals(750,balance(f))
        service.editProgram(f.owner,f.program,ProgramChange(2,Program("Promoción",Kind.CASHBACK,cashbackBps=500)))
        assertNative(wallet.materialize(f.member),"7.50 de 20.00 USD")
    }
    @Test fun `sequential existing reservations and consumed receipts retain original cost`() {
        val f=fixture();earn(f,40000);val used=service.redeemAtCounter(f.owner,request(f),id())
        val hold=service.reserve(f.member,Reserve(f.reward),id());assertEquals(200,balance(f))
        edit(f,200);val key=id();val confirmed=service.confirm(f.owner,Confirm(hold.str("token"),f.branch),key)
        assertEquals(confirmed.str("receipt"),service.confirm(f.owner,Confirm(hold.str("token"),f.branch),key).str("receipt"))
        val rows=db.tx { c -> c.rows("SELECT id,cost,reward_version,status FROM redemptions WHERE tenant_id=?",f.owner.tenant){listOf(it.getString(1),it.getLong(2),it.getInt(3),it.getString(4))} }
        assertEquals(2,rows.size);assertTrue(rows.all{it[1]==100L && it[2]==1 && it[3]=="CONSUMED"});assertTrue(rows.any{it[0]==used.str("receipt")});assertEquals(200,balance(f))
    }
    @Test fun `sequential goal edits enforce versions permissions bounds tenant and preserve other rewards`() {
        val f=fixture();val other=fixture();val sibling=service.saveReward(f.owner,f.input.copy(name="Alternativa",cost=300)).str("id")
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.saveReward(cashier,f.input.copy(cost=200),f.reward,1)}.status)
        assertEquals(404,assertFailsWith<Problem>{service.saveReward(other.owner,f.input.copy(cost=200),f.reward,1)}.status)
        for (cost in listOf(0L,-1L,1000000001L)) assertEquals("INVALID_COST",assertFailsWith<Problem>{edit(f,cost)}.code)
        edit(f,200);assertEquals("VERSION_CONFLICT",assertFailsWith<Problem>{edit(f,400)}.code);assertEquals(200,current(f).num("cost"))
        assertEquals(300,service.dashboard(f.owner).getValue("rewards").jsonArray.first{it.jsonObject.str("id")==sibling}.jsonObject.num("cost"))
        assertEquals(2,db.tx{c->c.one("SELECT count(*) FROM reward_versions WHERE tenant_id=? AND reward_id=?",f.owner.tenant,f.reward){it.getLong(1)}})
    }
    private fun parallel(first:()->JsonObject,second:()->JsonObject):List<Any> {
        val executor=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        return try { listOf(first,second).map { work -> executor.submit<Any>{barrier.await(10,TimeUnit.SECONDS);try{work()}catch(e:Problem){e}} }.map{it.get(40,TimeUnit.SECONDS)} } finally { executor.shutdownNow() }
    }
    @Test fun `concurrent editors create a single next version`() {
        val f=fixture();val results=parallel({edit(f,200)},{edit(f,300)})
        assertEquals(1,results.count{it is JsonObject});assertEquals("VERSION_CONFLICT",results.filterIsInstance<Problem>().single().code)
        assertEquals(2,current(f).num("version"));assertTrue(current(f).num("cost") in setOf(200L,300L))
    }
    @Test fun `concurrent edit and counter redemption never debit an unreviewed cost`() {
        val f=fixture();earn(f,20000);wallet.materialize(f.member);val input=request(f)
        val results=parallel({edit(f,200)},{service.redeemAtCounter(f.owner,input,id())})
        assertIs<JsonObject>(results[0]);val redemption=results[1]
        if (redemption is Problem) { assertEquals("REWARD_CHANGED",redemption.code);assertEquals(200,balance(f));assertEquals(0,count(f,"redemptions")) }
        else { assertIs<JsonObject>(redemption);assertEquals(100,balance(f));assertEquals(1,count(f,"redemptions")) }
        assertEquals(200,current(f).num("cost"))
    }
}
