package com.premierdarkcoffee.loyalty

import com.zaxxer.hikari.HikariConfig
import com.zaxxer.hikari.HikariDataSource
import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Tag
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.AfterEach
import java.sql.DriverManager
import java.util.concurrent.*
import kotlin.test.*

@Tag("postgres")
class LocalStagingPostgresTest {
    private lateinit var db: Database
    private lateinit var schema: String
    private lateinit var service: LoyaltyService
    private val url=requireNotNull(System.getenv("TEST_DATABASE_URL"))
    private val user=System.getenv("TEST_DATABASE_USER")?:"postgres"
    private val password=System.getenv("TEST_DATABASE_PASSWORD")?:""
    private val pepper="staging-test-only-identity-pepper-32chars"
    private val config=LocalStagingConfig(id(),"a".repeat(40),"b".repeat(40),"c".repeat(40),"d".repeat(40))
    @BeforeEach fun setup() {
        schema="local_stage_"+id().replace("-","")
        DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("CREATE SCHEMA $schema") } }
        db=Database(HikariDataSource(HikariConfig().apply { jdbcUrl=url;username=user;this.password=this@LocalStagingPostgresTest.password;maximumPoolSize=(System.getenv("TEST_DATABASE_POOL_SIZE")?:"10").toInt();connectionInitSql="SET search_path TO ${this@LocalStagingPostgresTest.schema}" }))
        db.migrate();service=LoyaltyService(db,pepper)
    }
    @AfterEach fun cleanup() {
        if(::db.isInitialized)db.close()
        if(::schema.isInitialized)DriverManager.getConnection(url,user,password).use { it.createStatement().use { s->s.execute("DROP SCHEMA $schema CASCADE") } }
    }
    private fun count(table:String)=db.tx{c->c.one("SELECT count(*) FROM $table"){it.getLong(1)}!!}
    @Test fun `bootstrap creates working roles ledger and billing and preserves later edits`() {
        assertEquals("CREATED",seedLocalStaging(db,pepper,config).getValue("status").jsonPrimitive.content)
        val owner=service.staff(config.owner);val cashier=service.staff(config.cashier)
        assertEquals("OWNER",owner.role);assertEquals("CASHIER",cashier.role);assertEquals(config.id("P01"),cashier.branch)
        val login=service.login(config.slug,Login("DEMO10001",config.alicePassword));val member=service.member(login.getValue("token").jsonPrimitive.content)
        val balances=service.card(member).getValue("balances").jsonArray.associate{it.jsonObject.getValue("kind").jsonPrimitive.content to it.jsonObject.getValue("available").jsonPrimitive.long}
        assertEquals(mapOf("POINTS" to 120L,"CASHBACK" to 600L,"STAMPS" to 6L),balances)
        assertEquals(9,count("purchases"));assertEquals(27,count("ledger"));assertEquals(2,count("members"))
        assertEquals(1000L,service.commercial.ownerAccount(owner).getValue("summary").jsonObject.getValue("balanceMinor").jsonPrimitive.long)
        service.purchase(owner,Purchase(member.id,config.id("P02"),"MANUAL-001",1000,"USD"),id())
        service.commercial.changeAccess(owner.tenant,AccessChange("SUSPENDED","Manual pause",1))
        val before=service.card(member)
        assertEquals("REUSED",seedLocalStaging(db,pepper,config).getValue("status").jsonPrimitive.content)
        assertEquals(before,service.card(member));assertEquals(10,count("purchases"))
        assertEquals("SUSPENDED",service.commercial.publicAccess(owner.tenant).getValue("state").jsonPrimitive.content)
    }
    @Test fun `changed credentials or instance cannot replace existing identities`() {
        seedLocalStaging(db,pepper,config)
        assertFailsWith<IllegalStateException>{seedLocalStaging(db,pepper,config.copy(owner="z".repeat(40)))}
        assertFailsWith<IllegalStateException>{seedLocalStaging(db,pepper+"changed",config)}
        assertFailsWith<IllegalStateException>{seedLocalStaging(db,pepper,config.copy(instance=id()))}
        assertEquals("OWNER",service.staff(config.owner).role);assertEquals(1,count("tenants"));assertEquals(9,count("purchases"))
    }
    @Test fun `bootstrap refuses a database containing unrelated businesses`() {
        service.createTenant(NewTenant("Keep existing","keep-existing"))
        assertFailsWith<IllegalStateException>{seedLocalStaging(db,pepper,config)}
        assertEquals(1,count("tenants"));assertEquals(0,count("purchases"))
    }
    @Test fun `concurrent bootstrap commits demo data exactly once`() {
        val pool=Executors.newFixedThreadPool(3);val barrier=CyclicBarrier(3)
        try {
            val results=(1..3).map{pool.submit<String>{barrier.await(5,TimeUnit.SECONDS);seedLocalStaging(db,pepper,config).getValue("status").jsonPrimitive.content}}.map{it.get(20,TimeUnit.SECONDS)}
            assertEquals(1,results.count{it=="CREATED"});assertEquals(2,results.count{it=="REUSED"});assertEquals(9,count("purchases"));assertEquals(27,count("ledger"))
        }finally{pool.shutdownNow()}
    }
}
