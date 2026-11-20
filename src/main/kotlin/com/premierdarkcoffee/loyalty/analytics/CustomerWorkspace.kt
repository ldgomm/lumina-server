package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.businesses.normalizedSearch
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid
import com.premierdarkcoffee.loyalty.wallet.summary

import kotlinx.serialization.json.*
import java.sql.Timestamp

/** Only fixed expressions may enter ORDER BY; user text is always a bound parameter. */
internal fun customerSortOrder(sort: String): String = when (sort) {
    "RECENT" -> "last_at DESC NULLS LAST,id"
    "SPENT" -> "spent DESC,last_at DESC NULLS LAST,id"
    "VISITS" -> "purchases DESC,last_at DESC NULLS LAST,id"
    "NAME" -> "translate(lower(name),'áéíóúüñ','aeiouun'),id"
    "NEWEST" -> "joined_at DESC,id"
    else -> throw Problem(400,"INVALID_SORT","Elige un orden de clientes válido.")
}

data class CustomerTimelineQuery(val kind: String = "ALL", val branchId: String? = null, val offset: Int = 0) {
    fun validate() {
        need(kind in setOf("ALL","PURCHASE","REWARD"),"INVALID_TIMELINE_KIND","Elige todos los movimientos, compras o canjes.")
        need(offset in 0..1_000_000,"INVALID_PAGE","Página inválida.")
        branchId?.let { uuid(it) }
    }
}

fun LoyaltyService.customerSuggestions(s: Staff, query: String): JsonObject {
    s.owner();val q=normalizedSearch(query)
    if(q.length<2)return obj("items" to emptyList<JsonObject>())
    return db.tx { c -> obj("items" to c.rows("SELECT id,name,right(card_code,6) AS suffix FROM members WHERE removed_at IS NULL AND tenant_id=? AND position(? in translate(lower(name),'áéíóúüñ','aeiouun'))>0 ORDER BY lower(name),id LIMIT 8",s.tenant,q) {
        obj("id" to it.getString("id"),"name" to it.getString("name"),"cardSuffix" to it.getString("suffix"))
    }) }
}

/** Consistent read-only view. Opening a profile cannot release holds, alter balances or send messages. */
fun LoyaltyService.customerWorkspace(s: Staff, memberId: String, query: CustomerTimelineQuery = CustomerTimelineQuery()): JsonObject {
    s.owner();uuid(memberId);query.validate();val at=Timestamp.from(clock.instant())
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val member=c.one("SELECT id,name,card_code,created_at,contact_phone,contact_version FROM members WHERE removed_at IS NULL AND tenant_id=? AND id=?",s.tenant,memberId) {
            obj("id" to it.getString("id"),"name" to it.getString("name"),"cardCode" to it.getString("card_code"),"joinedAt" to it.instant("created_at"),"contactPhone" to it.getString("contact_phone"),"contactVersion" to it.getInt("contact_version"))
        }?:throw Problem(404,"NOT_FOUND","Cliente no encontrado en este negocio.")
        query.branchId?.let { branch ->
            need(c.one("SELECT id FROM branches WHERE tenant_id=? AND id=?",s.tenant,branch){it.getString(1)}!=null,"NOT_FOUND","Sucursal no encontrada en este negocio.",404)
        }
        val summary=c.one("SELECT count(*) AS purchases,coalesce(sum(amount_minor),0) AS spent,coalesce(sum(discount_minor),0) AS discount,min(created_at) AS first_at,max(created_at) AS last_at FROM purchases WHERE tenant_id=? AND member_id=? AND created_at<=?",s.tenant,memberId,at) {
            val purchases=it.getLong("purchases");val first=it.getTimestamp("first_at")?.toInstant();val last=it.getTimestamp("last_at")?.toInstant()
            obj("purchases" to purchases,"spentMinor" to it.getLong("spent"),"discountMinor" to it.getLong("discount"),"lastPurchase" to last,
                "averageDaysBetweenPurchases" to if(purchases>1&&first!=null&&last!=null)java.time.Duration.between(first,last).toSeconds()/86400.0/(purchases-1) else null,
                "claimedRewards" to c.one("SELECT count(*) FROM redemptions WHERE tenant_id=? AND member_id=? AND status='CONSUMED' AND consumed_at<=?",s.tenant,memberId,at){r->r.getLong(1)})
        }!!
        val timeline=c.one("""
            WITH events AS (
                SELECT p.id,p.created_at AS at,'PURCHASE'::text AS kind,p.branch_id,
                    jsonb_build_object('id',p.id,'kind','PURCHASE','at',p.created_at,'branchId',p.branch_id,
                      'branch',b.name,'receipt',p.receipt,'paidMinor',p.amount_minor,
                      'grossMinor',coalesce(p.gross_minor,p.amount_minor+p.discount_minor),'discountMinor',p.discount_minor,
                      'items',p.items,'redemptionId',p.redemption_id) AS data
                FROM purchases p JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
                WHERE p.tenant_id=? AND p.member_id=? AND p.created_at<=?
                UNION ALL
                SELECT r.id,r.consumed_at AS at,'REWARD'::text AS kind,r.confirmed_branch_id AS branch_id,
                    jsonb_build_object('id',r.id,'kind','REWARD','at',r.consumed_at,'branchId',r.confirmed_branch_id,
                      'branch',b.name,'name',r.reward_name,'cost',r.cost,'balanceKind',p.kind) AS data
                FROM redemptions r JOIN programs p ON p.tenant_id=r.tenant_id AND p.id=r.program_id
                LEFT JOIN branches b ON b.tenant_id=r.tenant_id AND b.id=r.confirmed_branch_id
                WHERE r.tenant_id=? AND r.member_id=? AND r.status='CONSUMED' AND r.consumed_at<=?
            ), filtered AS (
                SELECT * FROM events WHERE (?::text='ALL' OR kind=?) AND (?::text IS NULL OR branch_id=?)
            )
            SELECT (SELECT count(*) FROM filtered) AS total,
              (SELECT coalesce(jsonb_agg(page.data ORDER BY page.at DESC,page.kind,page.id),'[]'::jsonb)::text
               FROM (SELECT * FROM filtered ORDER BY at DESC,kind,id LIMIT 20 OFFSET ?) page) AS items
        """.trimIndent(),s.tenant,memberId,at,s.tenant,memberId,at,query.kind,query.kind,query.branchId,query.branchId,query.offset) {
            val items=json.parseToJsonElement(it.getString("items")).jsonArray;val total=it.getLong("total")
            obj("items" to items,"total" to total,"offset" to query.offset,"hasMore" to (query.offset.toLong()+items.size<total),"kind" to query.kind,"branchId" to query.branchId)
        }!!
        val preferences=c.one("SELECT birthday,marketing_consent FROM member_preferences WHERE tenant_id=? AND member_id=?",s.tenant,memberId) {
            obj("birthday" to it.getString(1),"marketingConsent" to it.getBoolean(2))
        }?:obj("birthday" to null,"marketingConsent" to false)
        obj("member" to member,"summary" to summary,"rewardProgress" to customerRewardProgress(c,s.tenant,memberId),
            "preferences" to preferences,"timeline" to timeline,"asOf" to at.toInstant())
    }
}
