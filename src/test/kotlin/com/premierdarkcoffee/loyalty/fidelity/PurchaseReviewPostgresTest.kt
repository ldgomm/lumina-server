package com.premierdarkcoffee.loyalty.fidelity

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.marketing.PurchaseItem
import com.premierdarkcoffee.loyalty.marketing.WalletDesign
import com.premierdarkcoffee.loyalty.marketing.WalletDesignChange
import com.premierdarkcoffee.loyalty.marketing.receiptQuote
import com.premierdarkcoffee.loyalty.marketing.saveDesign
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.NewTenant
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.ProgramChange
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reserve
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.Window
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.presentation.prioritizedBalances
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields

import com.zaxxer.hikari.*
import kotlinx.serialization.json.*
import org.junit.jupiter.api.*
import org.junit.jupiter.api.Test
import java.sql.DriverManager
import java.time.*
import java.util.concurrent.*
import java.util.Base64
import kotlin.test.*

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PurchaseReviewPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="review_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val now=Instant.parse("2026-11-09T17:00:00Z")
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@PurchaseReviewPostgresTest.password;maximumPoolSize=10;connectionInitSql="SET search_path TO ${this@PurchaseReviewPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"purchase-review-test-pepper-long-enough",Clock.fixed(now,ZoneOffset.UTC))
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private data class F(val owner:Staff,val member:Member,val branch:String,val points:String,val stamps:String)
    private fun fixture():F {
        val slug="review-"+id().take(12);val t=service.createTenant(NewTenant("Negocio ficticio",slug));val owner=service.staff(t.str("ownerToken"))
        val branch=service.newBranch(owner,NewBranch("Centro","C")).str("id")
        val member=service.member(service.enrollWithoutPassword(slug,WalletEnrollment("Cliente ficticio","DEMO10001",true)).str("token"))
        val points=service.newProgram(owner,Program("Puntos",Kind.POINTS)).str("id")
        val stamps=service.newProgram(owner,Program("Sellos",Kind.STAMPS,minimumSpendMinor=2000)).str("id")
        return F(owner,member,branch,points,stamps)
    }
    private fun purchase(f:F)=Purchase(f.member.id,f.branch,id(),1500,"USD",programIds=setOf(f.points,f.stamps))
    private fun quote(f:F,p:Purchase)=service.receiptQuote(f.owner,p)
    private fun checked(f:F,p:Purchase):Purchase {val q=quote(f,p);return p.copy(amountMinor=q.num("amountMinor"),expectedEarningReview=q.str("earningReview"))}
    private fun rows(q:JsonObject)=q.getValue("earnings").jsonArray.map{it.jsonObject}
    private fun count(f:F,table:String)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!!}
    @Test fun `quote explains each selection without changing balances ledger audit or redemptions`() {
        val f=fixture();val tables=listOf("purchases","ledger","balances","redemptions","audit_events")
        val before=tables.associateWith{count(f,it)};val q=quote(f,purchase(f))
        assertEquals(15,rows(q).single{it.str("programId")==f.points}.num("amount"))
        assertEquals("MINIMUM_SPEND",rows(q).single{it.str("programId")==f.stamps}.str("reason"))
        assertEquals(before,tables.associateWith{count(f,it)})
    }
    @Test fun `confirmed earnings match quote and an identical retry recovers the same purchase`() {
        val f=fixture();val p=checked(f,purchase(f));val key=id();val result=service.purchase(f.owner,p,key)
        assertEquals(15,result.getValue("earned").jsonArray.single().jsonObject.num("amount"))
        val again=service.purchase(f.owner,p,key);assertEquals(result["purchaseId"],again["purchaseId"]);assertEquals(JsonPrimitive(true),again["replayed"])
        assertEquals(1,count(f,"purchases"));assertEquals(1,count(f,"ledger"))
    }
    @Test fun `editing a promotion after review rejects the write atomically`() {
        val f=fixture();val p=checked(f,purchase(f))
        service.editProgram(f.owner,f.points,ProgramChange(1,Program("Puntos",Kind.POINTS,pointsPerUnit=2)))
        assertEquals("EARNING_REVIEW_CHANGED",assertFailsWith<Problem>{service.purchase(f.owner,p,id())}.code)
        assertEquals(0,count(f,"purchases"));assertEquals(0,count(f,"ledger"));assertEquals(30,rows(quote(f,p)).single{it.str("programId")==f.points}.num("amount"))
    }
    @Test fun `another purchase invalidates an old review but does not prevent a new review`() {
        val f=fixture();val p=checked(f,purchase(f));service.purchase(f.owner,purchase(f),id())
        assertEquals("EARNING_REVIEW_CHANGED",assertFailsWith<Problem>{service.purchase(f.owner,p,id())}.code)
        service.purchase(f.owner,checked(f,p.copy(expectedEarningReview=null)),id());assertEquals(2,count(f,"purchases"))
    }
    @Test fun `window transition cannot silently change the reviewed benefit`() {
        val f=fixture();service.editProgram(f.owner,f.points,ProgramChange(1,Program("Puntos",Kind.POINTS,window=Window(endsAt=now.plusSeconds(10).toString()))))
        val p=checked(f,purchase(f));val later=LoyaltyService(db,"purchase-review-test-pepper-long-enough",Clock.fixed(now.plusSeconds(11),ZoneOffset.UTC))
        assertEquals("EARNING_REVIEW_CHANGED",assertFailsWith<Problem>{later.purchase(f.owner,p,id())}.code);assertEquals(0,count(f,"purchases"))
    }
    @Test fun `empty selection records history without promotional earnings`() {
        val f=fixture();val p=purchase(f).copy(programIds=emptySet());assertTrue(rows(quote(f,p)).isEmpty())
        val result=service.purchase(f.owner,checked(f,p),id());assertTrue(result.getValue("earned").jsonArray.isEmpty());assertEquals(1,count(f,"purchases"));assertEquals(0,count(f,"ledger"))
    }
    @Test fun `expiring a reservation during confirmation cannot cause an endless review conflict`() {
        for (quoteSecond in listOf(299L, 301L)) {
            val f=fixture();service.purchase(f.owner,purchase(f),id())
            val reward=service.saveReward(f.owner,Reward(f.points,"Premio de prueba",10)).str("id")
            val hold=service.reserve(f.member,Reserve(reward),id()).str("id")
            val quoteService=LoyaltyService(db,"purchase-review-test-pepper-long-enough",Clock.fixed(now.plusSeconds(quoteSecond),ZoneOffset.UTC))
            val p=purchase(f);val q=quoteService.receiptQuote(f.owner,p)
            assertEquals("RESERVED",db.tx { c -> c.one("SELECT status FROM redemptions WHERE tenant_id=? AND id=?",f.owner.tenant,hold){it.getString(1)} })
            val later=LoyaltyService(db,"purchase-review-test-pepper-long-enough",Clock.fixed(now.plusSeconds(301),ZoneOffset.UTC))
            later.purchase(f.owner,p.copy(expectedEarningReview=q.str("earningReview")),id())
            assertEquals("EXPIRED",db.tx { c -> c.one("SELECT status FROM redemptions WHERE tenant_id=? AND id=?",f.owner.tenant,hold){it.getString(1)} })
            assertEquals(30L,db.tx { c -> c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.points){it.getLong(1)} })
            assertEquals(2,count(f,"purchases"))
        }
    }
    @Test fun `quote rejects foreign customer promotion branch wrong currency and paused selection`() {
        val f=fixture();val other=fixture();val p=purchase(f)
        for(bad in listOf(p.copy(memberId=other.member.id),p.copy(programIds=setOf(other.points)),p.copy(branchId=other.branch),p.copy(currency="EUR")))assertFailsWith<Problem>{quote(f,bad)}
        service.editProgram(f.owner,f.points,ProgramChange(1,Program("Puntos",Kind.POINTS,active=false)))
        assertEquals("PROMOTION_PAUSED",assertFailsWith<Problem>{quote(f,p)}.code)
        assertEquals(0,count(f,"purchases"))
    }
    @Test fun `concurrent confirmations of a reviewed purchase create one ledger movement`() {
        val f=fixture();val p=checked(f,purchase(f));val key=id();val pool=Executors.newFixedThreadPool(3);val barrier=CyclicBarrier(3)
        try {val results=(1..3).map{pool.submit<JsonObject>{barrier.await();service.purchase(f.owner,p,key)}}.map{it.get(30,TimeUnit.SECONDS)}
            assertEquals(1,results.map{it["purchaseId"]}.distinct().size);assertEquals(2,results.count{it["replayed"]==JsonPrimitive(true)})
        } finally {pool.shutdownNow()}
        assertEquals(1,count(f,"purchases"));assertEquals(1,count(f,"ledger"))
    }
    @Test fun `detailed purchase coverage is scoped to tenant and time window`() {
        val f=fixture();val other=fixture();service.purchase(f.owner,purchase(f),id())
        service.purchase(f.owner,purchase(f).copy(items=listOf(PurchaseItem("Café","cafe",1,1500))),id())
        service.purchase(other.owner,purchase(other).copy(items=listOf(PurchaseItem("Otro","other",1,1500))),id())
        val report=service.commercial.ownerMetrics(f.owner,7);assertEquals(2,report.num("purchases"));assertEquals(1,report.num("detailedPurchases"))
        assertEquals(1,service.commercial.ownerMetrics(other.owner,7).num("detailedPurchases"));assertEquals(2,count(f,"purchases"))
    }
    @Test fun `smart wallet chooses a ready reward outside the old twenty reward snapshot`() {
        val f=fixture();val first=service.dashboard(f.owner).getValue("programs").jsonArray.map{it.jsonObject.str("id")}.sorted().first()
        val other=if(first==f.points)f.stamps else f.points
        for(i in 1..21)service.saveReward(f.owner,Reward(first,"Premio $i",1000+i.toLong()))
        service.saveReward(f.owner,Reward(other,"Premio cercano",1))
        service.purchase(f.owner,purchase(f).copy(amountMinor=2000,programIds=setOf(other)),id())
        val wallet=WalletService(service,"https://example.com",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){5})))
        val before=wallet.materialize(f.member)
        service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign(automaticPriority="PROGRESS")))
        val after=wallet.materialize(f.member)
        assertEquals(before.serial,after.serial);assertEquals(before.token,after.token);assertEquals(before.googleId,after.googleId)
        assertEquals(other,after.prioritizedBalances().first()["programId"]!!.jsonPrimitive.content)
        assertContains(after.appleExperienceFields().toString(),"Premio cercano");assertContains(after.googleExperienceFields().toString(),"Premio cercano")
        assertEquals(1,count(f,"purchases"));assertEquals(1,count(f,"ledger"))
    }
}
