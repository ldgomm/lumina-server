package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.uuid
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import java.sql.Connection

object LuminaRegistrationMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V014.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=14") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V014 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(14,?)", checksum)
        }
    }
}

@Serializable data class LuminaRegistration(val companyId: String, val name: String, val contactName: String, val email: String = "", val phone: String, val category: String = "") {
    fun normalized() = copy(companyId=uuid(companyId), name=name.trim(), contactName=contactName.trim(), email=email.trim().lowercase(), phone=phone.trim())
    fun validate() {
        uuid(companyId)
        need(category.isEmpty() || BusinessCategories.known(category), "INVALID_BUSINESS_CATEGORY", "Elige un tipo de negocio válido.")
        for (value in listOf(name,contactName)) need(value.length in 2..100 && value.none { it.isISOControl() }, "INVALID_REGISTRATION", "Revisa el nombre del negocio y su responsable.")
        need(email.isEmpty() || email.length in 5..180 && email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")), "INVALID_EMAIL", "Revisa el correo del registro.")
        need(phone.length in 7..25 && phone.matches(Regex("[+0-9() -]+")) && phone.count { it in '0'..'9' } >= 7, "INVALID_PHONE", "Revisa el teléfono del registro.")
    }
}

object WalletOnboardingMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V016.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val previous = c.one("SELECT checksum FROM comeback_migrations WHERE version=16") { it.getString(1) }
        check(previous == null || previous == checksum) { "Migration V016 changed beyond formatting." }
        if (previous == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(16,?)", checksum)
        }
    }
}

internal fun luminaContact(c: Connection, tenant: String): JsonObject? = c.one(
    "SELECT contact_name,email,phone FROM lumina_business_registrations WHERE tenant_id=?", tenant
) { obj("contactName" to it.getString(1), "email" to it.getString(2), "phone" to it.getString(3)) }

/** A durable external identity makes a lost HTTP response safe to retry, including after restart. */
fun LoyaltyService.registerLuminaBusiness(input: LuminaRegistration): JsonObject {
    val value=input.normalized(); value.validate()
    return db.tx { c ->
        // Only first-time registrations share this short lock; existing business operation is independent.
        c.rows("SELECT pg_advisory_xact_lock(6432001044)") { true }
        val existing=c.one("SELECT tenant_id FROM lumina_business_registrations WHERE company_id=?", value.companyId) { it.getString(1) }
        val tenant=existing ?: id().also { tenant ->
            val slug="lumina-"+value.companyId.replace("-", "")
            c.exec("INSERT INTO tenants(id,name,slug,currency,timezone) VALUES(?,?,?,'USD','America/Guayaquil')", tenant,value.name,slug)
            c.exec("INSERT INTO business_access(tenant_id) VALUES(?)",tenant)
            val branch=id()
            c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,'Principal','PRINCIPAL')",tenant,branch)
            c.exec("INSERT INTO lumina_business_registrations(company_id,tenant_id,contact_name,email,phone,category) VALUES(?,?,?,?,?,?)",value.companyId,tenant,value.contactName,value.email,value.phone,value.category)
            val design = initialWalletDesign(value.category, value.name)
            c.exec("INSERT INTO wallet_designs(tenant_id,version,config) VALUES(?,1,?::jsonb)",tenant,com.premierdarkcoffee.loyalty.shared.json.encodeToString(com.premierdarkcoffee.loyalty.marketing.WalletDesign.serializer(),design))
            audit(c,tenant,"platform","LUMINA_BUSINESS_REGISTERED",value.companyId)
        }
        // Only a new business gets its initial design. Replays never replace an edited card.
        // No credentials, promotions, customer balances or provider identities are created here.
        c.one("SELECT id,name,slug,currency,timezone FROM tenants WHERE id=?",tenant) {
            obj("companyId" to value.companyId,"business" to obj("id" to it.getString(1),"name" to it.getString(2),"slug" to it.getString(3),"currency" to it.getString(4),"timezone" to it.getString(5)),"replayed" to (existing!=null))
        }!!
    }
}
