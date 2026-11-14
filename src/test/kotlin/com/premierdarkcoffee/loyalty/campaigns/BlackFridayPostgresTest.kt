package com.premierdarkcoffee.loyalty.campaigns

import com.premierdarkcoffee.loyalty.access.*
import com.premierdarkcoffee.loyalty.businesses.*
import com.premierdarkcoffee.loyalty.fidelity.*
import com.premierdarkcoffee.loyalty.infrastructure.persistence.*
import com.premierdarkcoffee.loyalty.marketing.Benefit
import com.premierdarkcoffee.loyalty.shared.*
import com.premierdarkcoffee.loyalty.wallet.*
import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.junit.jupiter.api.AfterAll
import org.junit.jupiter.api.BeforeAll
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestInstance
import java.sql.DriverManager
import java.sql.Timestamp
import java.time.*
import java.util.Base64
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

@Tag("postgres") @TestInstance(TestInstance.Lifecycle.PER_CLASS)
class BlackFridayPostgresTest {
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val schema="black_friday_"+id().replace("-","")
    private val pepper="black-friday-pepper-long-enough"
    private val before=Instant.parse("2026-12-01T04:59:58Z")
    private lateinit var db:Database
    private fun service(at:Instant=before)=LoyaltyService(db,pepper,Clock.fixed(at,ZoneOffset.UTC))
    @BeforeAll fun setup(){
        DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("CREATE SCHEMA $schema")}}
        db=Database(HikariDataSource(HikariConfig().apply{jdbcUrl=url;username=user;this.password=this@BlackFridayPostgresTest.password;maximumPoolSize=4;connectionInitSql="SET search_path TO ${this@BlackFridayPostgresTest.schema}"}));db.migrate()
    }
    @AfterAll fun cleanup(){if(::db.isInitialized)db.close();DriverManager.getConnection(url,user,password).use{it.createStatement().use{s->s.execute("DROP SCHEMA $schema CASCADE")}}}
    private fun JsonObject.str(key:String)=getValue(key).jsonPrimitive.content
    private fun campaign()=Program("Viernes Negro",Kind.STAMPS,window=Window(startsAt="2026-11-01T05:00:00Z",endsAt="2026-12-01T05:00:00Z"),blackFridayYear=2026,blackFridayMessage="Un premio por una compra elegible.")
    private data class F(val owner:Staff,val member:Member,val branch:String,val program:String,val reward:String)
    private fun fixture(config:Program=campaign()):F {
        val s=service();val slug="bf-"+id().take(12);val tenant=s.createTenant(NewTenant("Negocio noviembre",slug));val owner=s.staff(tenant.str("ownerToken"));val branch=s.newBranch(owner,NewBranch("Centro","C")).str("id")
        val member=s.member(s.enrollWithoutPassword(slug,WalletEnrollment("Cliente","DEMO10001",true, phone = "0991234567")).str("token"));val setup=s.createSimplePromotion(owner,SimplePromotionSetup(config,"Premio noviembre",1),id())
        return F(owner,member,branch,setup.str("programId"),setup.str("rewardId"))
    }
    private fun count(f:F,table:String)=db.tx{c->c.one("SELECT count(*) FROM $table WHERE tenant_id=?",f.owner.tenant){it.getLong(1)}!!}
    private fun balance(f:F)=db.tx{c->c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",f.owner.tenant,f.member.id,f.program){it.getLong(1)}?:0}
    private fun buy(f:F,s:LoyaltyService=service(),selected:Set<String>?=null)=s.purchase(f.owner,Purchase(f.member.id,f.branch,id(),1000,"USD",programIds=selected),id())
    @Test fun `migration is idempotent and SQL clock matches inclusive November and exclusive December`() {
        db.migrate();val p=json.encodeToString(campaign())
        for((at,expected) in listOf("2026-11-01T04:59:59Z" to false,"2026-11-01T05:00:00Z" to true,"2026-12-01T04:59:59Z" to true,"2026-12-01T05:00:00Z" to false,"2027-11-27T12:00:00Z" to false))
            assertEquals(expected,db.tx{c->c.one("SELECT black_friday_available(?::jsonb,?::timestamptz)",p,at){it.getBoolean(1)}})
        assertEquals(true,db.tx{c->c.one("SELECT black_friday_available(?::jsonb,?::timestamptz)",json.encodeToString(Program("Normal",Kind.POINTS)),"2026-12-15T05:00:00Z"){it.getBoolean(1)}})
        assertEquals(1,db.tx{c->c.one("SELECT count(*) FROM comeback_migrations WHERE version=15"){it.getInt(1)}})
    }
    @Test fun `simple seasonal setup replays without duplicating reward program or discount`() {
        val f=fixture();val input=SimplePromotionSetup(campaign().copy(name="Descuento"),"Descuento en bebidas",2,Benefit(2000,"Bebidas","ITEM"));val key=id()
        val first=service().createSimplePromotion(f.owner,input,key);val replay=service().createSimplePromotion(f.owner,input,key);assertEquals(first.str("programId"),replay.str("programId"));assertEquals(first.str("rewardId"),replay.str("rewardId"));assertEquals(JsonPrimitive(true),replay["replayed"]);assertEquals(2,count(f,"programs"));assertEquals(2,count(f,"rewards"))
        assertEquals(2000,db.tx{c->c.one("SELECT (benefit->>'percentBps')::int FROM rewards WHERE tenant_id=? AND id=?",f.owner.tenant,first.str("rewardId")){it.getInt(1)}})
    }
    @Test fun `cashier and another business cannot create or modify owner campaigns`() {
        val f=fixture();val cashier=service().staff(service().newStaff(f.owner,NewStaff("CASHIER",f.branch)).str("token"));val other=fixture()
        assertEquals(403,assertFailsWith<Problem>{service().createSimplePromotion(cashier,SimplePromotionSetup(campaign(),"Premio",1),id())}.status)
        assertEquals(404,assertFailsWith<Problem>{service().editProgram(other.owner,f.program,ProgramChange(1,campaign()))}.status)
        assertEquals(1,count(f,"programs"))
    }
    @Test fun `existing seasonal year cannot be removed or moved to make a permanent promotion`() {
        val f=fixture()
        for(p in listOf(Program("Normal",Kind.STAMPS),campaign().copy(blackFridayYear=2027,window=Window(startsAt="2027-11-01T05:00:00Z",endsAt="2027-12-01T05:00:00Z"))))
            assertFailsWith<Problem>{service().editProgram(f.owner,f.program,ProgramChange(1,p))}
        assertEquals(1,db.tx{c->c.one("SELECT current_version FROM programs WHERE tenant_id=? AND id=?",f.owner.tenant,f.program){it.getInt(1)}})
    }
    @Test fun `December blocks selected purchases and all redemption paths without spending earned balance`() {
        val f=fixture();buy(f);val held=service().reserve(f.member,Reserve(f.reward),id());val after=service(blackFridayEnd(2026))
        assertEquals("CAMPAIGN_ENDED",assertFailsWith<Problem>{after.confirm(f.owner,Confirm(held.str("token"),f.branch),id())}.code)
        assertEquals("CAMPAIGN_ENDED",assertFailsWith<Problem>{after.reserve(f.member,Reserve(f.reward),id())}.code)
        assertFailsWith<Problem>{buy(f,after,setOf(f.program))}
        val counter=CounterRedemption(f.member.id,f.branch,f.reward,service().card(f.member).getValue("member").jsonObject.getValue("revision").jsonPrimitive.long,1,true,true)
        assertFailsWith<Problem>{after.redeemAtCounter(f.owner,counter,id())}
        after.cancel(f.member,held.str("id"),id());assertEquals(1,balance(f));assertEquals(1,count(f,"purchases"))
    }
    @Test fun `ordinary purchases after the season still work without earning seasonal stamps`() {
        val f=fixture();buy(f);buy(f,service(blackFridayEnd(2026)));assertEquals(1,balance(f));assertEquals(2,count(f,"purchases"))
        assertEquals(1,db.tx{c->c.one("SELECT count(*) FROM ledger WHERE tenant_id=? AND program_id=?",f.owner.tenant,f.program){it.getLong(1)}})
    }
    @Test fun `expired campaigns leave persistent wallet identity and ledger intact while customer view hides benefits`() {
        val expired=campaign().copy(window=Window(startsAt="2026-11-01T05:00:00Z",endsAt="2026-11-01T06:00:00Z"));val f=fixture(expired)
        val cipher=WalletCipher(Base64.getEncoder().encodeToString(ByteArray(32){5}));val first=WalletService(service(),"https://example.test",cipher).materialize(f.member)
        buy(f,service(Instant.parse("2026-11-01T05:30:00Z")));assertEquals(1,balance(f))
        db.migrate();val next=WalletService(service(),"https://example.test",cipher).materialize(f.member)
        assertEquals(first.serial,next.serial);assertEquals(first.token,next.token);assertEquals(1,balance(f));assertEquals(1,count(f,"ledger"))
        assertTrue(next.snapshot.getValue("rewardProgress").jsonArray.isEmpty());assertTrue(next.snapshot.getValue("balances").jsonArray.isEmpty())
        assertFalse(next.appleJson("pass.test","TEAM","https://example.test").toString().contains("Premio noviembre"));assertFalse(next.googleJson("object","class","https://example.test").toString().contains("Premio noviembre"))
    }
    @Test fun `foreign branch rejects setup atomically and another tenant remains unchanged`() {
        val f=fixture();val other=fixture();val input=SimplePromotionSetup(campaign().copy(branchIds=setOf(other.branch)),"Premio",1)
        assertFailsWith<Problem>{service().createSimplePromotion(f.owner,input,id())};assertEquals(1,count(f,"programs"));assertEquals(1,count(f,"rewards"));assertEquals(1,count(other,"programs"))
    }
}
