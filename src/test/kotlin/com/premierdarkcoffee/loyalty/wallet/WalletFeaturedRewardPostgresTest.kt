package com.premierdarkcoffee.loyalty.wallet

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.marketing.Benefit
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.WalletDesignChange
import com.premierdarkcoffee.loyalty.marketing.design
import com.premierdarkcoffee.loyalty.marketing.saveDesign
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.ProgramChange
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.presentation.journey
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

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
class WalletFeaturedRewardPostgresTest {
    private val url = requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user = System.getenv("TEST_DATABASE_USER") ?: "postgres"
    private val password = System.getenv("TEST_DATABASE_PASSWORD") ?: ""
    private val schema = "featured_" + id().replace("-", "")
    private val at = Instant.parse("2026-11-08T12:00:00Z")
    private lateinit var db: Database
    private lateinit var service: LoyaltyService
    private lateinit var wallet: WalletService
    @BeforeAll fun setup() {
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s -> s.execute("CREATE SCHEMA $schema") } }
        db = Database(HikariDataSource(HikariConfig().apply {
            jdbcUrl=url;username=user;this.password=this@WalletFeaturedRewardPostgresTest.password
            maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE") ?: "10").toInt()
            connectionInitSql="SET search_path TO ${this@WalletFeaturedRewardPostgresTest.schema}"
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
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente de prueba","DEMO10001",true, phone = "0991234567")).str("token"))
        val input=Reward(program,"Premio",goal,benefit=benefit)
        return F(owner,member,branch,program,service.saveReward(owner,input).str("id"),input)
    }
    private fun earn(f:F,amount:Long)=service.purchase(f.owner,Purchase(f.member.id,f.branch,id(),amount,"USD"),id())
    private fun balance(f:F)=db.tx { c -> c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.program){it.getLong(1)} ?: 0L }
    private fun count(f:F,table:String)=db.tx { c -> c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!! }
    private fun choice(f:F,reward:String?,version:Int=0)=service.saveDesign(f.owner,WalletDesignChange(version,WalletDesign(featuredProgramId=f.program,featuredRewardId=reward)))
    private fun extra(f:F,cost:Long=200)=service.saveReward(f.owner,f.input.copy(name="Premio destacado",cost=cost)).str("id")
    private fun assertChoice(p:WalletPass,goal:Long,name:String) {
        assertEquals(goal,p.journey()!!.goal)
        for(fields in listOf(p.appleExperienceFields(),p.applePosterFields(),p.googleExperienceFields()))assertContains(fields.toString(),name)
    }
    @Test fun `chosen reward persists versions queues both providers and preserves identity ledger and other business`() {
        val f=fixture();val other=fixture();val reward=extra(f);earn(f,15000)
        val before=wallet.materialize(f.member);val untouched=wallet.materialize(other.member)
        db.tx{c->c.exec("UPDATE wallet_passes SET apple_type='pass.test',google_id='issuer.object',google_class='issuer.class' WHERE serial=?",before.serial)}
        val bound=wallet.materialize(f.member);val ledger=count(f,"ledger");val purchases=count(f,"purchases")
        fun wakes()=db.tx{c->c.rows("SELECT provider,wake_revision FROM wallet_delivery WHERE serial=? ORDER BY provider",before.serial){it.getString(1) to it.getLong(2)}}
        val wake=wakes();assertEquals(1,choice(f,reward).num("version"))
        assertTrue(db.tx{c->c.one("SELECT next_scan_at<=? FROM wallet_passes WHERE serial=?",Timestamp.from(at),before.serial){it.getBoolean(1)}}!!)
        assertFalse(db.tx{c->c.one("SELECT next_scan_at<=? FROM wallet_passes WHERE serial=?",Timestamp.from(at),untouched.serial){it.getBoolean(1)}}!!)
        val after=wallet.materialize(f.member);assertChoice(after,200,"Premio destacado")
        assertEquals(50,after.journey()!!.remaining);assertEquals(before.serial,after.serial);assertEquals(before.token,after.token)
        assertEquals(bound.googleId,after.googleId);assertEquals(bound.googleClass,after.googleClass);assertEquals(bound.appleType,after.appleType)
        assertEquals(before.snapshot["cardCode"],after.snapshot["cardCode"]);assertTrue(after.tag>bound.tag)
        assertEquals(listOf("APPLE","GOOGLE"),wakes().map{it.first});assertTrue(wakes().zip(wake).all{(a,b)->a.second>b.second})
        assertEquals(JsonPrimitive(reward),service.design(f.owner).getValue("design").jsonObject["featuredRewardId"])
        assertEquals(ledger,count(f,"ledger"));assertEquals(purchases,count(f,"purchases"));assertEquals(150,balance(f));assertEquals(100,wallet.materialize(other.member).journey()!!.goal)
        assertEquals("VERSION_CONFLICT",assertFailsWith<Problem>{choice(f,null)}.code)
        // Choosing what the card shows does not alter which reward the customer can redeem.
        val revision=service.card(f.member).getValue("member").jsonObject.num("revision")
        service.redeemAtCounter(f.owner,CounterRedemption(f.member.id,f.branch,f.reward,revision,1,true,true),id())
        assertEquals(50,balance(f));assertEquals(150,wallet.materialize(f.member).journey()!!.remaining)
        choice(f,null,1);assertEquals(100,wallet.materialize(f.member).journey()!!.goal)
    }
    @Test fun `choice validates tenant program permissions and requires a paired program`() {
        val f=fixture();val foreign=fixture();val ownOtherProgram=service.newProgram(f.owner,Program("Otra promoción",Kind.POINTS)).str("id")
        val otherReward=service.saveReward(f.owner,Reward(ownOtherProgram,"Otro premio",50)).str("id")
        for(r in listOf(foreign.reward,otherReward,id()))assertEquals(404,assertFailsWith<Problem>{choice(f,r)}.status)
        assertEquals("FEATURED_PROGRAM_REQUIRED",assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign(featuredRewardId=f.reward)))}.code)
        assertEquals(400,assertFailsWith<Problem>{choice(f,"not-an-id")}.status)
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token"))
        assertEquals(403,assertFailsWith<Problem>{service.saveDesign(cashier,WalletDesignChange(0,WalletDesign(featuredProgramId=f.program,featuredRewardId=f.reward)))}.status)
        assertEquals(0,service.design(f.owner).num("version"));assertEquals(0,count(f,"wallet_designs"))
    }
    @Test fun `paused chosen reward disappears falls back and resumes with current name and goal`() {
        val f=fixture();val reward=extra(f);earn(f,15000);choice(f,reward)
        val before=wallet.materialize(f.member);assertChoice(before,200,"Premio destacado")
        service.saveReward(f.owner,f.input.copy(name="Premio destacado",cost=200,active=false),reward,1)
        val paused=wallet.materialize(f.member);assertEquals(100,paused.journey()!!.goal)
        assertFalse(paused.appleExperienceFields().toString().contains("Premio destacado"));assertFalse(paused.googleExperienceFields().toString().contains("Premio destacado"))
        // Retaining an inactive preference must not block edits to other design fields.
        choice(f,reward,1)
        service.saveReward(f.owner,f.input.copy(name="Premio renovado",cost=300),reward,2)
        val active=wallet.materialize(f.member);assertChoice(active,300,"Premio renovado");assertEquals(before.serial,active.serial);assertEquals(150,balance(f))
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Promoción",Kind.POINTS,active=false)))
        val hidden=wallet.materialize(f.member);assertNull(hidden.journey());assertTrue(hidden.snapshot.getValue("rewardProgress").jsonArray.isEmpty())
    }
    @Test fun `explicit expensive reward survives bounded snapshot with more than twenty alternatives`() {
        val f=fixture();repeat(23){service.saveReward(f.owner,f.input.copy(name="Alternativa $it",cost=(it+1).toLong()))}
        val reward=extra(f,500);choice(f,reward);val p=wallet.materialize(f.member)
        assertEquals(20,p.snapshot.getValue("rewardProgress").jsonArray.size);assertChoice(p,500,"Premio destacado");assertEquals(0,p.journey()!!.available)
        assertEquals(JsonPrimitive(reward),p.snapshot.getValue("rewardProgress").jsonArray.first().jsonObject["id"])
        service.saveReward(f.owner,f.input.copy(name="Premio destacado",cost=500,active=false),reward,1)
        assertEquals(1,wallet.materialize(f.member).journey()!!.goal)
    }
    @Test fun `concurrent design choices keep exactly one winner and no transaction side effects`() {
        val f=fixture();val reward=extra(f);val executor=Executors.newFixedThreadPool(2);val barrier=CyclicBarrier(2)
        val results=try{listOf(f.reward,reward).map{r->executor.submit<Any>{barrier.await(10,TimeUnit.SECONDS);try{choice(f,r)}catch(e:Problem){e}}}.map{it.get(40,TimeUnit.SECONDS)}}finally{executor.shutdownNow()}
        assertEquals(1,results.count{it is JsonObject});assertEquals("VERSION_CONFLICT",results.filterIsInstance<Problem>().single().code)
        val selected=service.design(f.owner);assertEquals(1,selected.num("version"));assertTrue(selected.getValue("design").jsonObject.str("featuredRewardId") in listOf(f.reward,reward))
        assertEquals(0,count(f,"ledger"));assertEquals(0,count(f,"purchases"));assertEquals(0,count(f,"redemptions"))
    }
}
