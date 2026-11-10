package com.premierdarkcoffee.loyalty.infrastructure.local

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.billing.MembershipPlan
import com.premierdarkcoffee.loyalty.businesses.identity
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.description
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj

import java.sql.Date
import java.sql.SQLException
import java.sql.Timestamp
import java.time.Clock
import java.time.ZoneId
import java.util.UUID
import kotlin.system.exitProcess

/** Explicit CLI-only bootstrap for the isolated Docker demo, never an HTTP mutation. */
data class LocalStagingConfig(val instance: String, val owner: String, val cashier: String, val alicePassword: String, val bobPassword: String) {
    val slug get() = "demo-cafe-${instance.take(8)}"
    fun id(name: String) = UUID.nameUUIDFromBytes("comeback-local:$instance:$name".toByteArray()).toString()
    fun fingerprint(pepper: String) = Security.hash(listOf(instance, owner, cashier, alicePassword, bobPassword, pepper).joinToString(":") { Security.hash(it) })
    companion object {
        fun fromEnvironment(env: Map<String, String>): LocalStagingConfig {
            require(env["LOYALTY_PROFILE"] == "local-staging") { "LOCAL_STAGING_PROFILE_REQUIRED" }
            val instance = requireNotNull(env["STAGING_INSTANCE_ID"]) { "STAGING_INSTANCE_REQUIRED" }
            require(UUID.fromString(instance).toString() == instance) { "INVALID_STAGING_INSTANCE" }
            fun secret(name: String) = requireNotNull(env[name]) { "MISSING_STAGING_CONFIGURATION" }.also { require(it.length in 32..128 && it.matches(Regex("[A-Za-z0-9_-]+"))) { "INVALID_STAGING_CONFIGURATION" } }
            val values = listOf("STAGING_OWNER_TOKEN", "STAGING_CASHIER_TOKEN", "STAGING_ALICE_PASSWORD", "STAGING_BOB_PASSWORD").map(::secret)
            require(values.distinct().size == values.size) { "USE_DISTINCT_STAGING_CREDENTIALS" }
            return LocalStagingConfig(instance, values[0], values[1], values[2], values[3])
        }
    }
}

fun seedLocalStaging(db: Database, pepper: String, cfg: LocalStagingConfig, clock: Clock = Clock.systemUTC()) = db.tx { c ->
    require(pepper.length >= 32) { "INVALID_IDENTITY_PEPPER" }
    c.rows("SELECT pg_advisory_xact_lock(6432005001)") { true }
    c.exec("CREATE TABLE IF NOT EXISTS comeback_local_seed(singleton BOOLEAN PRIMARY KEY CHECK(singleton),instance_id TEXT NOT NULL,fingerprint TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL)")
    val marker = c.one("SELECT instance_id,fingerprint FROM comeback_local_seed WHERE singleton=true") { it.getString(1) to it.getString(2) }
    val tenant = cfg.id("tenant")
    if (marker != null) {
        check(marker.first == cfg.instance && Security.equal(marker.second, cfg.fingerprint(pepper))) { "STAGING_CONFIG_CHANGED_RESTORE_ORIGINAL_PRIVATE_FILE" }
        check(c.one("SELECT id FROM tenants WHERE id=? AND slug=?", tenant, cfg.slug) { it.getString(1) } != null) { "STAGING_DATA_REQUIRES_REVIEW" }
        return@tx obj("status" to "REUSED", "tenantId" to tenant, "slug" to cfg.slug)
    }
    check(c.one("SELECT count(*) FROM tenants") { it.getLong(1) } == 0L) { "REFUSING_TO_SEED_EXISTING_BUSINESSES" }
    val now = clock.instant(); val zone = ZoneId.of("America/Guayaquil"); val today = now.atZone(zone).toLocalDate()
    val created = Timestamp.from(now.minusSeconds(60L * 86400)); val stamp = Timestamp.from(now)
    c.exec("INSERT INTO tenants(id,name,slug,currency,timezone,created_at) VALUES(?,?,?,'USD','America/Guayaquil',?)", tenant, "Café Loyalty · Demo", cfg.slug, created)
    c.exec("INSERT INTO business_access(tenant_id) VALUES(?)", tenant)
    for ((code, name) in listOf("P01" to "Centro", "P02" to "Norte")) c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,?,?)", tenant, cfg.id(code), name, code)
    c.exec("INSERT INTO staff_tokens(tenant_id,id,token_hash,role) VALUES(?,?,?,'OWNER')", tenant, cfg.id("owner"), Security.hash(cfg.owner))
    c.exec("INSERT INTO staff_tokens(tenant_id,id,token_hash,role,branch_id) VALUES(?,?,?,'CASHIER',?)", tenant, cfg.id("cashier"), Security.hash(cfg.cashier), cfg.id("P01"))
    val programs = listOf(Program("Puntos por compra", Kind.POINTS), Program("Cashback del 5%", Kind.CASHBACK, cashbackBps = 500), Program("Cada visita cuenta", Kind.STAMPS, minimumSpendMinor = 100))
    for (program in programs) {
        program.validate(); val pid = cfg.id(program.kind.name)
        c.exec("INSERT INTO programs(tenant_id,id,kind,current_version) VALUES(?,?,?,1)", tenant, pid, program.kind.name)
        c.exec("INSERT INTO program_versions(tenant_id,program_id,version,config,created_at) VALUES(?,?,1,?::jsonb,?)", tenant, pid, json.encodeToString(program), created)
        val reward = when(program.kind) { Kind.POINTS -> Reward(pid, "Café de cortesía", 100); Kind.CASHBACK -> Reward(pid, "Beneficio de 5 USD", 500); Kind.STAMPS -> Reward(pid, "La próxima visita invita la casa", 9) }
        val rid = cfg.id("reward-${program.kind}")
        c.exec("INSERT INTO rewards(tenant_id,id,program_id,name,cost,active) VALUES(?,?,?,?,?,true)", tenant, rid, pid, reward.name, reward.cost)
        c.exec("INSERT INTO reward_versions(tenant_id,reward_id,version,config,created_at) VALUES(?,?,1,?::jsonb,?)", tenant, rid, json.encodeToString(reward), created)
    }
    data class Person(val key: String, val name: String, val document: String, val password: String, val visits: Int, val amount: Long)
    for (person in listOf(Person("alice", "Ana Demo", "DEMO10001", cfg.alicePassword, 6, 2000), Person("bob", "Luis Demo", "DEMO10002", cfg.bobPassword, 3, 1000))) {
        val member = cfg.id(person.key)
        c.exec("INSERT INTO members(tenant_id,id,identity_hash,password_hash,name,card_code,terms_version,revision,created_at) VALUES(?,?,?,?,?,?,?,0,?)", tenant, member, Security.identity(pepper, tenant, person.document), Security.password(person.password), person.name, Security.token(), "pilot-1", created)
        for (i in 1..person.visits) {
            val at = now.minusSeconds((person.visits - i + 1L) * 86400); val purchased = Timestamp.from(at)
            val purchase = cfg.id("purchase-${person.key}-$i"); val branch = cfg.id(if (i % 2 == 0) "P02" else "P01")
            c.exec("INSERT INTO purchases(tenant_id,id,member_id,branch_id,receipt,amount_minor,currency,actor_id,created_at) VALUES(?,?,?,?,?,?,'USD',?,?)", tenant, purchase, member, branch, "DEMO-${person.key}-$i", person.amount, cfg.id("owner"), purchased)
            for (program in programs) {
                val pid = cfg.id(program.kind.name); val amount = program.earn(person.amount, branch, at, zone)
                c.exec("INSERT INTO balances(tenant_id,member_id,program_id,available) VALUES(?,?,?,?) ON CONFLICT(tenant_id,member_id,program_id) DO UPDATE SET available=balances.available+excluded.available", tenant, member, pid, amount)
                c.exec("INSERT INTO ledger(tenant_id,id,member_id,program_id,delta,kind,reference_id,program_version,created_at) VALUES(?,?,?,?,?,'EARN',?,1,?)", tenant, cfg.id("ledger-${person.key}-$i-${program.kind}"), member, pid, amount, purchase, purchased)
            }
            c.exec("INSERT INTO wallet_outbox(id,tenant_id,member_id,revision,created_at) VALUES(?,?,?,?,?)", cfg.id("outbox-${person.key}-$i"), tenant, member, i.toLong(), purchased)
        }
        c.exec("UPDATE members SET revision=? WHERE tenant_id=? AND id=?", person.visits.toLong(), tenant, member)
    }
    val next = today.plusDays(7)
    val plan = MembershipPlan("Plan Demo", 1900, today.minusDays(60).toString(), next.toString())
    plan.validate(today)
    val config = json.encodeToString(plan)
    c.exec("INSERT INTO billing_memberships(tenant_id,version,config,next_on) VALUES(?,1,?::jsonb,?)", tenant, config, Date.valueOf(next))
    c.exec("INSERT INTO billing_plan_versions(tenant_id,version,config,created_at) VALUES(?,1,?::jsonb,?)", tenant, config, created)
    c.exec("INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,paid_minor,currency,due_on,created_at) VALUES(?,?,?,1900,900,'USD',?,?)", tenant, cfg.id("invoice"), "Membresía de demostración · pago parcial", Date.valueOf(next), stamp)
    c.exec("INSERT INTO billing_payments(tenant_id,id,invoice_id,amount_minor,reference,method,paid_on,created_at) VALUES(?,?,?,900,'DEMO-PAYMENT-001','TRANSFER',?,?)", tenant, cfg.id("payment"), cfg.id("invoice"), Date.valueOf(today), stamp)
    c.exec("INSERT INTO business_notices(tenant_id,id,title,body,severity,created_at) VALUES(?,?,?,?,'INFO',?)", tenant, cfg.id("notice"), "Tu entorno de demostración está listo", "Prueba promociones, caja, canjes, informes y estado de cuenta con datos ficticios. Los pagos mostrados son de demostración.", stamp)
    c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at) VALUES(?,?,?,'LOCAL_STAGING_SEEDED',?,?)", cfg.id("audit"), tenant, cfg.id("owner"), tenant, stamp)
    c.exec("INSERT INTO comeback_local_seed(singleton,instance_id,fingerprint,created_at) VALUES(true,?,?,?)", cfg.instance, cfg.fingerprint(pepper), stamp)
    obj("status" to "CREATED", "tenantId" to tenant, "slug" to cfg.slug)
}

fun main() {
    try {
        val env = System.getenv(); val cfg = LocalStagingConfig.fromEnvironment(env)
        Database.connect(requireNotNull(env["DATABASE_URL"]), requireNotNull(env["DATABASE_USER"]), requireNotNull(env["DATABASE_PASSWORD"])).use { db ->
            db.migrate(); println(seedLocalStaging(db, requireNotNull(env["IDENTITY_PEPPER"]), cfg))
        }
    } catch (error: Exception) {
        val causes = generateSequence<Throwable>(error) { it.cause }.take(5).toList()
        val sqlState = causes.filterIsInstance<SQLException>().firstOrNull()?.sqlState ?: "NONE"
        val code = error.message?.takeIf { it.matches(Regex("[A-Z_]{3,100}")) } ?: "SEE_CONFIGURATION_AND_DATABASE"
        System.err.println("STAGING_SEED_DETAIL: code=$code sqlState=$sqlState types=${causes.joinToString(",") { it.javaClass.simpleName }}")
        System.err.println("STAGING_SEED_FAILED: verifica el perfil local, la base aislada y conserva el .env original. No se reiniciaron los datos.")
        exitProcess(1)
    }
}
