package com.premierdarkcoffee.loyalty.marketing

import com.premierdarkcoffee.loyalty.analytics.ManagementQuery
import com.premierdarkcoffee.loyalty.analytics.activityExport
import com.premierdarkcoffee.loyalty.analytics.customerWorkspace
import com.premierdarkcoffee.loyalty.analytics.managementActivity
import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.SaleCorrection
import com.premierdarkcoffee.loyalty.fidelity.correctSale
import com.premierdarkcoffee.loyalty.fidelity.description
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Lookup
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
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.wallet.CounterRedemption
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import com.premierdarkcoffee.loyalty.wallet.WalletEnrollment
import com.premierdarkcoffee.loyalty.wallet.WalletService
import com.premierdarkcoffee.loyalty.wallet.appleJson
import com.premierdarkcoffee.loyalty.wallet.artwork.artwork
import com.premierdarkcoffee.loyalty.wallet.artwork.googleArtwork
import com.premierdarkcoffee.loyalty.wallet.enrollWithoutPassword
import com.premierdarkcoffee.loyalty.wallet.presentation.googleWalletTemplate
import com.premierdarkcoffee.loyalty.wallet.providers.appleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.providers.applePosterFields
import com.premierdarkcoffee.loyalty.wallet.providers.googleExperienceFields
import com.premierdarkcoffee.loyalty.wallet.redeemAtCounter

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
class EngagementPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="engagement_"+id().replace("-","")
    private lateinit var db:Database
    private lateinit var service:LoyaltyService
    private val at=Instant.parse("2026-11-04T17:00:00Z")
    @BeforeAll fun setup(){DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@EngagementPostgresTest.password;maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt();connectionInitSql="SET search_path TO ${this@EngagementPostgresTest.schema}"}))
        db.migrate();service=LoyaltyService(db,"engagement-test-pepper-long-enough",Clock.fixed(at,ZoneOffset.UTC))
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(k:String)=getValue(k).jsonPrimitive.content
    private fun JsonObject.num(k:String)=getValue(k).jsonPrimitive.long
    private data class F(val owner:Staff,val token:String,val member:Member,val a:String,val b:String,val program:String,val reward:String)
    private fun fixture(group:String="pizza",nth:Int=6,percent:Int=10000,units:Boolean=true):F {
        val slug="engage-"+id().take(12);val t=service.createTenant(NewTenant("Negocio",slug));val token=t.str("ownerToken");val owner=service.staff(token)
        val a=service.newBranch(owner,NewBranch("Centro","A")).str("id");val b=service.newBranch(owner,NewBranch("Norte","B")).str("id")
        val joined=service.enrollWithoutPassword(slug,WalletEnrollment("Cliente","DEMO10001",true, phone = "0991234567"));val member=service.member(joined.str("token"))
        val promotion=service.createPromotion(owner,PromotionTemplate("Promoción",group,nth,percent,units,"Premio $group"),id())
        return F(owner,token,member,a,b,promotion.str("programId"),promotion.str("rewardId"))
    }
    private fun purchase(f:F,quantity:Int=1,price:Long=1000,group:String="pizza",branch:String=f.a)=Purchase(f.member.id,branch,id(),quantity*price,"USD",listOf(PurchaseItem("Producto",group,quantity,price)))
    private fun balance(f:F)=service.card(f.member).getValue("balances").jsonArray.firstOrNull{it.jsonObject.str("programId")==f.program}?.jsonObject?.num("available")?:0
    private fun revision(f:F)=service.card(f.member).getValue("member").jsonObject.num("revision")
    private fun redeem(f:F,group:String="pizza",price:Long=1000,branch:String=f.b):Purchase {val p=purchase(f,price=price,group=group,branch=branch).copy(rewardId=f.reward,expectedRevision=revision(f),expectedRewardVersion=1,identityVerified=true,customerConfirmed=true);return p.copy(amountMinor=service.receiptQuote(f.owner,p).num("amountMinor"))}
    private fun count(table:String,f:F)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!!}
    private fun wallet(f:F)=WalletService(service,"https://example.com",WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){5}))).materialize(f.member)
    private fun parallel(work:()->JsonObject):List<Any>{val executor=Executors.newFixedThreadPool(4);val barrier=CyclicBarrier(4);return try{(1..4).map{executor.submit<Any>{barrier.await();try{work()}catch(e:Problem){e}}}.map{it.get(40,TimeUnit.SECONDS)}}finally{executor.shutdownNow()}}
    @Test fun `front focus persists versioned without touching artwork identity balances or another business`() {
        val f=fixture();val other=fixture();service.purchase(f.owner,purchase(f,4),id())
        val before=wallet(f);val balances=service.card(f.member).getValue("balances");val ledger=count("ledger",f)
        val original=WalletDesign(featuredProgramId=f.program)
        for ((index,focus) in listOf("REWARD","PROGRESS","AUTO").withIndex()) {
            service.saveDesign(f.owner,WalletDesignChange(index,original.copy(frontFocus=focus)))
            val changed=wallet(f)
            assertEquals(focus,changed.design().frontFocus);assertEquals(before.serial,changed.serial)
            assertEquals(before.token,changed.token);assertEquals(before.googleId,changed.googleId)
            assertEquals(before.snapshot["cardCode"],changed.snapshot["cardCode"]);assertTrue(changed.tag>before.tag)
            assertEquals(googleWalletTemplate("SIGNATURE",focus),changed.googleBrand("https://example.com")["classTemplateInfo"])
            assertEquals("AUTO",wallet(other).design().frontFocus)
            assertEquals(balances,service.card(f.member).getValue("balances"));assertEquals(ledger,count("ledger",f))
        }
        assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,original.copy(frontFocus="REWARD")))}
        assertEquals("AUTO",wallet(f).design().frontFocus);assertEquals(0,count("redemptions",f))
    }
    @Test fun `artwork accent persists with optimistic versioning and updates the same card in both providers`() {
        val f=fixture();val other=fixture();service.purchase(f.owner,purchase(f,4),id())
        val before=wallet(f);val balances=service.card(f.member).getValue("balances");val ledger=count("ledger",f)
        val design=WalletDesign(composition="ATELIER",artworkAccent="#204e41",featuredProgramId=f.program)
        service.saveDesign(f.owner,WalletDesignChange(0,design))
        val changed=wallet(f)
        assertEquals(design,changed.design());assertEquals(before.serial,changed.serial);assertEquals(before.token,changed.token)
        assertEquals(before.googleId,changed.googleId);assertEquals(before.snapshot["cardCode"],changed.snapshot["cardCode"])
        assertTrue(changed.tag>before.tag);assertContains(changed.googleArtwork("https://example.com").toString(),"/204e41/")
        assertFalse(before.artwork().png(1).contentEquals(changed.artwork().png(1)))
        assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,design.copy(artworkAccent="#ffbb55")))}
        assertEquals("#204e41",wallet(f).design().artworkAccent);assertNull(wallet(other).design().artworkAccent)
        service.saveDesign(f.owner,WalletDesignChange(1,design.copy(artworkAccent=null)))
        assertNull(wallet(f).design().artworkAccent)
        assertEquals(before.serial,wallet(f).serial);assertEquals(balances,service.card(f.member).getValue("balances"))
        assertEquals(ledger,count("ledger",f));assertEquals(0,count("redemptions",f))
    }
    @Test fun `composition persists with version guard and updates the same pass without changing balances or another tenant`() {
        val f=fixture();val other=fixture();service.purchase(f.owner,purchase(f,4),id())
        val before=wallet(f);val balances=service.card(f.member).getValue("balances");val ledger=count("ledger",f);val receipts=count("purchases",f)
        val design=WalletDesign(background="#0b1f3a",foreground="#ffffff",label="#ffffff",stampSymbol="☕",featuredProgramId=f.program,composition="EDITORIAL")
        service.saveDesign(f.owner,WalletDesignChange(0,design))
        val first=wallet(f)
        assertEquals(design,first.design());assertEquals(before.serial,first.serial);assertEquals(before.token,first.token);assertEquals(before.snapshot["cardCode"],first.snapshot["cardCode"]);assertTrue(first.tag>before.tag)
        assertEquals(googleWalletTemplate("EDITORIAL"),first.googleBrand("https://example.com")["classTemplateInfo"])
        assertContains(first.applePosterFields().toString(),"Premio pizza")
        assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,design.copy(composition="PATH")))}
        assertEquals("EDITORIAL",wallet(f).design().composition)
        service.saveDesign(f.owner,WalletDesignChange(1,design.copy(composition="STAMPBOOK")))
        assertEquals("STAMPBOOK",wallet(f).design().composition)
        for ((index,composition) in listOf("PANORAMA","PRECISION","ATELIER").withIndex()) {
            service.saveDesign(f.owner,WalletDesignChange(index+2,design.copy(composition=composition)))
            val updated=wallet(f)
            assertEquals(composition,updated.design().composition)
            assertEquals(first.serial,updated.serial);assertEquals(first.token,updated.token);assertEquals(first.googleId,updated.googleId)
            assertEquals(googleWalletTemplate(composition),updated.googleBrand("https://example.com")["classTemplateInfo"])
        }
        assertEquals("SIGNATURE",wallet(other).design().composition)
        assertEquals(balances,service.card(f.member).getValue("balances"));assertEquals(ledger,count("ledger",f));assertEquals(receipts,count("purchases",f));assertEquals(0,count("redemptions",f))
    }
    @Test fun `cashier and both Wallet expose identical conditions without changing money`() {
        val f=fixture("servicio",6,3725)
        service.purchase(f.owner,purchase(f,5,group="servicio"),id())
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token"))
        val before=service.card(f.member);val ledger=count("ledger",f);val receipts=count("purchases",f)
        val lookup=service.lookup(cashier,Lookup(cardCode=before.getValue("member").jsonObject.str("cardCode")))
        val description=lookup.getValue("rewards").jsonArray.single().jsonObject.str("benefitText")
        assertEquals(Benefit(3725,"servicio").description(),description)
        val pass=wallet(f)
        assertEquals(description,pass.snapshot.getValue("rewardProgress").jsonArray.single().jsonObject.str("benefitText"))
        assertTrue(pass.appleExperienceFields().getValue("backFields").jsonArray.any{it.jsonObject.str("value").contains(description)})
        assertTrue(pass.googleExperienceFields().getValue("textModulesData").jsonArray.any{it.jsonObject.str("body").contains(description)})
        assertEquals(before.getValue("balances"),service.card(f.member).getValue("balances"))
        assertEquals(ledger,count("ledger",f));assertEquals(receipts,count("purchases",f));assertEquals(0,count("redemptions",f))
    }
    @Test fun `paused promotion hides conditions from cashier and both Wallet without mixing tenants`() {
        val f=fixture("ropa",2,1234,false);val other=fixture("ropa",2,9876,false)
        service.purchase(f.owner,purchase(f,group="ropa"),id())
        val first=wallet(f)
        assertEquals(Benefit(1234,"ropa","BASKET").description(),first.snapshot.getValue("rewardProgress").jsonArray.single().jsonObject.str("benefitText"))
        service.editProgram(f.owner,f.program,ProgramChange(1,Program("Promoción",Kind.STAMPS,active=false,productGroup="ropa",countUnits=false)))
        val lookup=service.lookup(f.owner,Lookup(cardCode=service.card(f.member).getValue("member").jsonObject.str("cardCode")))
        assertTrue(lookup.getValue("rewards").jsonArray.isEmpty())
        val paused=wallet(f);assertTrue(paused.snapshot.getValue("rewardProgress").jsonArray.isEmpty())
        assertEquals(first.serial,paused.serial);assertEquals(first.token,paused.token)
        assertFalse(paused.appleExperienceFields().toString().contains("12,34%"));assertFalse(paused.googleExperienceFields().toString().contains("12,34%"))
        assertEquals(Benefit(9876,"ropa","BASKET").description(),service.card(other.member).getValue("rewards").jsonArray.single().jsonObject.str("benefitText"))
        assertEquals(1,db.tx{c->c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.program){it.getLong(1)}})
    }
    @Test fun `five pizzas on one receipt count five and another category does not count`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());service.purchase(f.owner,purchase(f,4,group="bebida"),id());assertEquals(5,balance(f))}
    @Test fun `sixth pizza is free across branches and no new stamps are earned`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());val r=service.purchase(f.owner,redeem(f),id());assertEquals(0,r.num("amountMinor"));assertEquals(1000,r.num("discountMinor"));assertEquals(0,balance(f));assertEquals(1,count("redemptions",f))}
    @Test fun `fifth coffee gets fifty percent after four paid coffees`(){val f=fixture("café",5,5000);service.purchase(f.owner,purchase(f,4,price=300,group="café"),id());val p=redeem(f,"café",300);assertEquals(150,p.amountMinor);service.purchase(f.owner,p,id());assertEquals(0,balance(f))}
    @Test fun `second clothing receipt discounts the eligible category only`(){val f=fixture("ropa",2,2000,false);service.purchase(f.owner,purchase(f,4,group="ropa"),id());assertEquals(1,balance(f));val p=purchase(f,group="ropa").copy(items=listOf(PurchaseItem("Camisa","ropa",2,1000),PurchaseItem("Envío","envío",1,500)),rewardId=f.reward,expectedRevision=revision(f),expectedRewardVersion=1,identityVerified=true,customerConfirmed=true);val q=service.receiptQuote(f.owner,p);assertEquals(2100,q.num("amountMinor"));service.purchase(f.owner,p.copy(amountMinor=2100),id());assertEquals(0,balance(f))}
    @Test fun `wrong total rolls back discount balance receipt and history`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());val p=redeem(f).copy(amountMinor=1);assertFailsWith<Problem>{service.purchase(f.owner,p,id())};assertEquals(5,balance(f));assertEquals(0,count("redemptions",f));assertEquals(1,count("purchases",f))}
    @Test fun `unknown selected promotion rolls back the entire purchase`(){val f=fixture();assertFailsWith<Problem>{service.purchase(f.owner,purchase(f).copy(programIds=setOf(id())),id())};assertEquals(0,count("purchases",f));assertEquals(0,balance(f))}
    @Test fun `receipt redemption replay returns same receipt and never a second reward`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());val p=redeem(f);val key=id();val first=service.purchase(f.owner,p,key);val again=service.purchase(f.owner,p,key);assertEquals(first.str("purchaseId"),again.str("purchaseId"));assertTrue(again.getValue("replayed").jsonPrimitive.boolean);assertEquals(1,count("redemptions",f))}
    @Test fun `typed benefits cannot bypass purchase verification through counter or reservation`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());assertFailsWith<Problem>{service.redeemAtCounter(f.owner,CounterRedemption(f.member.id,f.a,f.reward,revision(f),1,true,true),id())};assertFailsWith<Problem>{service.reserve(f.member,Reserve(f.reward),id())};assertEquals(5,balance(f))}
    @Test fun `other tenant member reward and branch cannot be used`(){val a=fixture();val b=fixture();service.purchase(a.owner,purchase(a,5),id());assertFailsWith<Problem>{service.purchase(b.owner,redeem(a),id())};assertFailsWith<Problem>{service.purchase(a.owner,purchase(a,branch=b.a),id())};assertEquals(5,balance(a));assertEquals(0,count("redemptions",a))}
    @Test fun `concurrent different receipts cannot redeem the same reviewed balance twice`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());val p=redeem(f);val result=parallel{service.purchase(f.owner,p.copy(receipt=id()),id())};assertEquals(1,result.count{it is JsonObject});assertEquals(3,result.count{it is Problem});assertEquals(1,count("redemptions",f));assertEquals(0,balance(f))}
    @Test fun `concurrent identical purchase idempotency produces one receipt`(){val f=fixture();val p=purchase(f,5);val key=id();val result=parallel{service.purchase(f.owner,p,key)};assertEquals(4,result.count{it is JsonObject});assertEquals(1,count("purchases",f));assertEquals(5,balance(f))}
    @Test fun `theme updates same pass without changing identifiers and prevents stale edits`(){val f=fixture();val first=wallet(f);service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign(displayName="Marca",background="#112233",featuredProgramId=f.program,stampSymbol="★")));val next=wallet(f);assertEquals(first.serial,next.serial);assertEquals(first.token,next.token);assertTrue(next.tag>first.tag);assertEquals("rgb(17,34,51)",next.appleJson("pass.test","TEAM","https://example.com").str("backgroundColor"));assertFailsWith<Problem>{service.saveDesign(f.owner,WalletDesignChange(0,WalletDesign()))}}
    @Test fun `birthday and scheduled announcements require consent and respect timezone and cancellation`(){val f=fixture();val event=service.createCustomerEvent(f.owner,CustomerEvent("Evento","Ven mañana",at.minusSeconds(60).toString(),at.plusSeconds(3600).toString()),id()).str("id");assertTrue(wallet(f).snapshot.getValue("announcements").jsonArray.isEmpty());service.savePreferences(f.owner,f.member.id,CustomerPreferencesChange(CustomerPreferences("11-04",true),true));assertEquals(2,wallet(f).snapshot.getValue("announcements").jsonArray.size);service.cancelCustomerEvent(f.owner,event);assertEquals(1,wallet(f).snapshot.getValue("announcements").jsonArray.size);service.savePreferences(f.owner,f.member.id,CustomerPreferencesChange(CustomerPreferences("11-04",false),true));assertTrue(wallet(f).snapshot.getValue("announcements").jsonArray.isEmpty())}
    @Test fun `customer metrics use paid totals and detail purchased products and rewards`(){val f=fixture();service.purchase(f.owner,purchase(f,5),id());service.purchase(f.owner,redeem(f),id());val row=service.customerInsights(f.owner).getValue("customers").jsonArray.single().jsonObject;assertEquals(2,row.num("purchases"));assertEquals(5000,row.num("spentMinor"));assertEquals(1,row.num("claimedRewards"));assertEquals(2,service.customerDetail(f.owner,f.member.id).getValue("purchases").jsonArray.size)}
    @Test fun `routes enforce authentication and owner permissions`()=testApplication{environment{config=MapApplicationConfig()};application{loyaltyRoutes(service,"p".repeat(40),"http://localhost")};val f=fixture();assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/customer-insights").status);val cashier=service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token");assertEquals(HttpStatusCode.Forbidden,client.get("/api/staff/wallet-design"){bearerAuth(cashier)}.status);assertEquals(HttpStatusCode.OK,client.get("/api/staff/customer-insights"){bearerAuth(f.token)}.status)}
    @Test fun `migration and template replay preserve existing purchases`(){val f=fixture();service.purchase(f.owner,purchase(f),id());db.migrate();assertEquals(17,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations"){it.getInt(1)}});assertEquals(1,count("purchases",f));val p=PromotionTemplate("Corte","corte",8,rewardName="Corte gratis");val key=id();val one=service.createPromotion(f.owner,p,key);val two=service.createPromotion(f.owner,p,key);assertEquals(one.str("programId"),two.str("programId"));assertEquals(2,count("programs",f))
        val legacy=purchase(f).copy(items=emptyList(),receipt="LEGACY-RETRY");val retry=id()
        val oldPayload=obj("memberId" to legacy.memberId,"branchId" to legacy.branchId,"receipt" to legacy.receipt,"amountMinor" to legacy.amountMinor,"currency" to legacy.currency)
        val saved=obj("purchaseId" to "original-receipt","replayed" to false)
        db.tx{c->c.exec("INSERT INTO idempotency(tenant_id,operation,key,request_hash,response) VALUES(?,?,?,?,?::jsonb)",f.owner.tenant,"purchase:${f.owner.id}",retry,Security.hash(oldPayload.toString()),saved.toString())}
        assertEquals("original-receipt",service.purchase(f.owner,legacy,retry).str("purchaseId"));assertEquals(1,count("purchases",f))
    }
    @Test fun `a legacy sale can correct its description and retains the original gross and receipt`() {
        val f=fixture();val buy=Purchase(f.member.id,f.a,id(),600,"USD",programIds=emptySet(),description="Almuerzo")
        val sale=service.purchase(f.owner,buy,id()).str("purchaseId")
        db.tx{it.exec("UPDATE purchases SET review_programs=NULL,gross_minor=NULL WHERE tenant_id=? AND id=?",f.owner.tenant,sale)}
        val input=SaleCorrection(0,"El pedido era para llevar",600,description="Almuerzo para llevar")
        val preview=service.correctSale(f.owner,sale,input)
        assertTrue(preview.getValue("historical").jsonPrimitive.boolean)
        assertEquals(600L,preview.getValue("before").jsonObject.num("grossMinor"))
        service.correctSale(f.owner,sale,input.copy(review=preview.str("review")),id())
        val saved=service.managementActivity(f.owner.tenant,ManagementQuery(kind="PURCHASE"),f.owner).getValue("items").jsonArray.single().jsonObject
        assertEquals("Almuerzo para llevar",saved.str("concept"));assertEquals(buy.receipt.uppercase(),saved.str("receipt"))
        assertEquals("Almuerzo",saved.getValue("corrections").jsonArray.single().jsonObject.str("previousDetail"))
    }
    @Test fun `owner previews corrects and replays a sale with a permanent original and one ledger adjustment`() {
        val f=fixture();val bought=purchase(f,4);val sale=service.purchase(f.owner,bought,id()).str("purchaseId")
        val fix=SaleCorrection(0,"Se anotaron cuatro productos y fueron dos",2000,listOf(bought.items.single().copy(quantity=2)))
        val cashier=service.staff(service.newStaff(f.owner,NewStaff("CASHIER",f.a)).str("token"))
        assertFailsWith<Problem>{service.correctSale(cashier,sale,fix)}
        assertFailsWith<Problem>{service.correctSale(fixture().owner,sale,fix)}
        val preview=service.correctSale(f.owner,sale,fix)
        assertEquals(4L,balance(f));assertTrue(preview.getValue("canSave").jsonPrimitive.boolean)
        val confirmed=fix.copy(review=preview.str("review"));val key=id()
        service.correctSale(f.owner,sale,confirmed,key)
        assertTrue(service.correctSale(f.owner,sale,confirmed,key).getValue("replayed").jsonPrimitive.boolean)
        assertEquals(2L,balance(f));assertEquals(1,count("purchase_corrections",f))
        val row=service.managementActivity(f.owner.tenant,ManagementQuery(kind="PURCHASE"),f.owner).getValue("items").jsonArray.single().jsonObject
        val audit=row.getValue("corrections").jsonArray.single().jsonObject
        assertEquals(4000L,audit.num("before"));assertEquals(2000L,audit.num("after"));assertEquals(fix.reason,audit.str("reason"));assertEquals(2000L,row.num("paidMinor"))
        assertFailsWith<Problem>{service.correctSale(f.owner,sale,confirmed,id())}
    }
    @Test fun `correcting a receipt preserves redeemed rewards and prevents spending the same points twice`() {
        val f=fixture();val buy=purchase(f,5);val original=service.purchase(f.owner,buy,id()).str("purchaseId")
        val redemption=service.purchase(f.owner,redeem(f),id()).str("purchaseId")
        val reduction=SaleCorrection(0,"Cantidad incorrecta",2000,listOf(buy.items.single().copy(quantity=2)))
        val denied=service.correctSale(f.owner,original,reduction)
        assertFalse(denied.getValue("canSave").jsonPrimitive.boolean)
        assertFailsWith<Problem>{service.correctSale(f.owner,original,reduction.copy(review=denied.str("review")),id())}
        val changed=SaleCorrection(0,"El producto tenía otro precio",1250,listOf(buy.items.single().copy(quantity=1,unitMinor=1250)))
        val quote=service.correctSale(f.owner,redemption,changed)
        assertEquals(1250L,quote.getValue("after").jsonObject.num("discountMinor"))
        service.correctSale(f.owner,redemption,changed.copy(review=quote.str("review")),id())
        assertEquals(1,count("redemptions",f));assertEquals(0L,balance(f))
    }
    @Test fun `quick sale description survives review retry and private history`() {
        val f = fixture()
        val cashier = service.staff(service.newStaff(f.owner, NewStaff("CASHIER", f.a)).str("token"))
        val detail = "Almuerzo para dos & café"
        val sale = purchase(f).copy(items=emptyList(), programIds=emptySet(), description="  $detail  ")
        val quote = service.receiptQuote(cashier, sale)
        assertEquals(detail, quote.str("description"))
        val reviewed = sale.copy(expectedEarningReview=quote.str("earningReview"))
        val key = id()
        val changed = assertFailsWith<Problem> { service.purchase(cashier, reviewed.copy(description="Otro pedido"), key) }
        assertEquals("EARNING_REVIEW_CHANGED", changed.code)
        val saved = service.purchase(cashier, reviewed, key)
        assertEquals(detail, saved.str("description"))
        val again = service.purchase(cashier, reviewed.copy(description=detail), key)
        assertTrue(again.getValue("replayed").jsonPrimitive.boolean)
        assertEquals(saved.str("purchaseId"), again.str("purchaseId"))
        val conflict = assertFailsWith<Problem> { service.purchase(cashier, reviewed.copy(description="Otro pedido"), key) }
        assertEquals("IDEMPOTENCY_CONFLICT", conflict.code)
        assertEquals(1L, count("purchases", f))
        val row = service.customerWorkspace(f.owner,f.member.id).getValue("timeline").jsonObject.getValue("items").jsonArray.single().jsonObject
        assertEquals(detail, row.str("description"))
        assertEquals(0, row.getValue("items").jsonArray.size)
        val filter = ManagementQuery(kind="PURCHASE", search="almuerzo para dos")
        val activity = service.managementActivity(f.owner.tenant, filter, f.owner).getValue("items").jsonArray.single().jsonObject
        assertEquals(detail, activity.str("concept"))
        assertTrue(service.activityExport(f.owner, filter).contains(detail))
    }

    @Test fun `optional description preserves legacy hashes products and promotion amounts`() {
        val f = fixture()
        val sale = purchase(f, quantity=2).copy(programIds=setOf(f.program))
        val before = service.receiptQuote(f.owner, sale)
        val blank = sale.copy(description="   ")
        assertEquals(before.str("earningReview"), service.receiptQuote(f.owner, blank).str("earningReview"))
        val oldFields = json.parseToJsonElement(json.encodeToString(sale)).jsonObject.filterKeys {
            it != "expectedEarningReview" && it != "description"
        }
        assertEquals(JsonObject(oldFields).toString(), sale.idempotencyPayload())
        val detail = "Pedido para llevar"
        val described = sale.copy(description=detail)
        val quote = service.receiptQuote(f.owner, described)
        assertEquals(before.getValue("earnings"), quote.getValue("earnings"))
        assertEquals(before.num("amountMinor"), quote.num("amountMinor"))
        for (invalid in listOf("a".repeat(161), "Dos\nproductos")) {
            assertEquals("INVALID_PURCHASE_DESCRIPTION",assertFailsWith<Problem> { service.receiptQuote(f.owner, sale.copy(description=invalid)) }.code)
            assertEquals("INVALID_PURCHASE_DESCRIPTION",assertFailsWith<Problem> { service.purchase(f.owner, sale.copy(description=invalid), id()) }.code)
        }
        service.purchase(f.owner, described.copy(expectedEarningReview=quote.str("earningReview")), id())
        val line = service.managementActivity(f.owner.tenant, ManagementQuery(search="producto",kind="PURCHASE"), f.owner).getValue("items").jsonArray.single().jsonObject
        assertEquals(detail, line.str("concept"))
        assertEquals("Producto", line.getValue("items").jsonArray.single().jsonObject.str("name"))
        val unlabelled = service.purchase(f.owner, blank.copy(receipt=id()), id())
        assertEquals(JsonNull, unlabelled.getValue("description"))
        assertEquals(2L, count("purchases", f))
    }

    @Test fun `promotion category and discount meaning cannot be overwritten by editing`() {
        val f=fixture();service.purchase(f.owner,purchase(f,5),id())
        assertFailsWith<Problem>{service.editProgram(f.owner,f.program,ProgramChange(1,Program("Otra",Kind.STAMPS,productGroup="pizza",countUnits=false)))}
        assertFailsWith<Problem>{service.saveReward(f.owner,Reward(f.program,"Otro descuento",5,benefit=Benefit(5000,group="pizza")),f.reward,1)}
        service.saveReward(f.owner,Reward(f.program,"Pizza de regalo",5,benefit=Benefit(group="pizza")),f.reward,1)
        assertEquals(5,balance(f));assertEquals(2,service.card(f.member).getValue("rewards").jsonArray.first{it.jsonObject.str("id")==f.reward}.jsonObject.num("version"))
    }

}
