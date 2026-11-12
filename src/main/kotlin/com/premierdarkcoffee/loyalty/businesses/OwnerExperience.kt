package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid

import kotlinx.serialization.Serializable
import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import com.premierdarkcoffee.loyalty.marketing.Benefit
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp

object OwnerExperienceMigration {
    fun apply(c: Connection) {
        val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V009.sql")).readText()
        val checksum = SqlFingerprint.checksum(sql)
        val old = c.one("SELECT checksum FROM comeback_migrations WHERE version=9") { it.getString(1) }
        check(old == null || old == checksum) { "Migration V009 changed beyond formatting." }
        if (old == null) {
            c.createStatement().use { it.execute(sql) }
            c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(9,?)", checksum)
        }
    }
}

val protectedBusinessFields = listOf("legalName", "ruc", "activity", "province", "city", "address", "category")
fun BusinessProfile.identity() = listOf(legalName, ruc, activity, province, city, address, category)

@Serializable data class ProfileCorrectionRequest(val details: String)
@Serializable data class ProfileCorrectionResolution(val status: String, val response: String)

internal fun profileRequests(c: Connection, tenant: String) = c.rows(
    "SELECT id,details,status,created_at,resolved_at,response FROM business_profile_requests WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 10", tenant
) { obj("id" to it.getString(1), "details" to it.getString(2), "status" to it.getString(3),
    "createdAt" to it.getTimestamp(4).toInstant(), "resolvedAt" to it.getTimestamp(5)?.toInstant(), "response" to it.getString(6)) }

fun LoyaltyService.requestProfileCorrection(s: Staff, input: ProfileCorrectionRequest, key: String): JsonObject {
    s.owner(); val details = input.details.trim()
    need(details.length in 10..1000 && details.none { it.isISOControl() && it != '\n' }, "INVALID_REQUEST", "Describe el cambio solicitado con entre 10 y 1000 caracteres.")
    return db.tx { c ->
        c.one("SELECT id FROM tenants WHERE id=? FOR UPDATE", s.tenant) { it.getString(1) }
        once(c, s.tenant, "profile-correction", key, json.encodeToString(ProfileCorrectionRequest(details))) {
            need(c.one("SELECT id FROM business_profile_requests WHERE tenant_id=? AND status='PENDING'", s.tenant) { it.getString(1) } == null,
                "REQUEST_PENDING", "Ya tienes una solicitud pendiente. Puedes consultar su estado en esta ficha.", 409)
            val requestId = id()
            c.exec("INSERT INTO business_profile_requests(tenant_id,id,actor_id,details,created_at) VALUES(?,?,?,?,?)", s.tenant, requestId, s.id, details, Timestamp.from(clock.instant()))
            audit(c, s.tenant, s.id, "BUSINESS_PROFILE_CORRECTION_REQUESTED", requestId)
            obj("id" to requestId, "status" to "PENDING")
        }
    }
}

fun LoyaltyService.resolveProfileCorrection(tenant: String, requestId: String, input: ProfileCorrectionResolution): JsonObject {
    uuid(tenant); uuid(requestId); val response = input.response.trim()
    need(input.status in setOf("RESOLVED", "REJECTED") && response.length in 10..1000 && response.none { it.isISOControl() && it != '\n' },
        "INVALID_RESOLUTION", "Elige una resolución y explica la respuesta con entre 10 y 1000 caracteres.")
    return db.tx { c ->
        c.one("SELECT id FROM tenants WHERE id=? FOR UPDATE", tenant) { it.getString(1) }
        val row = c.one("SELECT status,response FROM business_profile_requests WHERE tenant_id=? AND id=? FOR UPDATE", tenant, requestId) { it.getString(1) to it.getString(2) }
            ?: throw Problem(404, "NOT_FOUND", "Solicitud no encontrada.")
        if (row.first != "PENDING") {
            need(row == (input.status to response), "REQUEST_RESOLVED", "La solicitud ya tiene una resolución. Recarga la ficha.", 409)
        } else {
            c.exec("UPDATE business_profile_requests SET status=?,response=?,resolved_at=? WHERE tenant_id=? AND id=?", input.status, response, Timestamp.from(clock.instant()), tenant, requestId)
            audit(c, tenant, "platform", "BUSINESS_PROFILE_CORRECTION_RESOLVED", requestId)
        }
        obj("saved" to true)
    }
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable data class SimplePromotionSetup(val program: Program, val rewardName: String, val rewardCost: Long,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val rewardBenefit: Benefit? = null) {
    fun validate() {
        program.validate(); text(rewardName)
        rewardBenefit?.validate()
        need(rewardBenefit==null || program.blackFridayYear!=null,"INVALID_PROMOTION_SETUP","El beneficio adicional requiere una campaña de noviembre.")
        need((program.kind in setOf(Kind.POINTS,Kind.CASHBACK) || program.blackFridayYear!=null && program.kind==Kind.STAMPS) && rewardCost in 1..1_000_000_000,
            "INVALID_PROMOTION_SETUP", "Revisa el tipo de acumulación y el saldo necesario para el premio.")
    }
}
fun LoyaltyService.createSimplePromotion(s: Staff, input: SimplePromotionSetup, key: String): JsonObject {
    s.owner(); input.validate()
    return db.tx { c -> authorizeStaff(c,s); once(c,s.tenant,"simple-promotion",key,json.encodeToString(input)) {
        authorizeStaff(c,s); commercial.requireActive(c,s.tenant)
        (input.program.branchIds + input.program.bonuses.flatMap { it.branchIds }).forEach { branch(c,s.tenant,it) }
        val pid=id();val rid=id();val reward=Reward(pid,input.rewardName.trim(),input.rewardCost,benefit=input.rewardBenefit)
        c.exec("INSERT INTO programs(tenant_id,id,kind,current_version) VALUES(?,?,?,1)",s.tenant,pid,input.program.kind.name)
        c.exec("INSERT INTO program_versions(tenant_id,program_id,version,config) VALUES(?,?,1,?::jsonb)",s.tenant,pid,json.encodeToString(input.program))
        c.exec("INSERT INTO rewards(tenant_id,id,program_id,name,cost,active,version,benefit) VALUES(?,?,?,?,?,true,1,?::jsonb)",s.tenant,rid,pid,reward.name,reward.cost,input.rewardBenefit?.let{json.encodeToString(it)})
        c.exec("INSERT INTO reward_versions(tenant_id,reward_id,version,config) VALUES(?,?,1,?::jsonb)",s.tenant,rid,json.encodeToString(reward))
        com.premierdarkcoffee.loyalty.fidelity.queuePromotionCards(c,s.tenant)
        audit(c,s.tenant,s.id,"SIMPLE_PROMOTION_CREATED",pid)
        obj("programId" to pid,"rewardId" to rid)
    } }
}
