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
import java.time.ZoneId

data class ReturnRadarQuery(val segment: String = "FOCUS", val search: String = "", val offset: Int = 0) {
    fun validate() {
        need(segment in setOf("FOCUS", "ALL", "LATE", "READY", "NEAR", "FIRST"), "INVALID_SEGMENT", "Elige un grupo del radar.")
        need(search.length <= 100, "INVALID_SEARCH", "Usa hasta 100 caracteres para buscar.")
        need(offset in 0..1_000_000, "INVALID_PAGE", "Página inválida.")
    }
}

fun LoyaltyService.ownerReturnRadar(staff: Staff, query: ReturnRadarQuery): JsonObject {
    staff.owner()
    return returnRadar(staff.tenant, query)
}

/** Private, read-only decision support. A longer gap is a signal, never a prediction of churn. */
fun LoyaltyService.returnRadar(tenant: String, query: ReturnRadarQuery = ReturnRadarQuery()): JsonObject {
    uuid(tenant); query.validate()
    val at = clock.instant()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val zone = c.one("SELECT timezone FROM tenants WHERE id=?", tenant) { ZoneId.of(it.getString(1)) }
            ?: throw Problem(404, "NOT_FOUND", "Negocio no encontrado.")
        val today = at.atZone(zone).toLocalDate()
        val predicate = when (query.segment) {
            "FOCUS" -> "late OR ready>0 OR near>0"
            "LATE" -> "late"
            "READY" -> "ready>0"
            "NEAR" -> "near>0"
            "FIRST" -> "purchases=0"
            else -> "true"
        }
        val report = c.one("""
            WITH scope AS (SELECT ?::text AS tenant, ?::timestamptz AS at, ?::text AS zone, ?::date AS today),
            sales AS (
                SELECT p.member_id, count(*) AS purchases, sum(p.amount_minor) AS spent,
                    max(p.created_at) AS last_at
                FROM purchases p JOIN scope s ON p.tenant_id=s.tenant AND p.created_at<=s.at GROUP BY p.member_id
            ), days AS (
                SELECT DISTINCT p.member_id, (p.created_at AT TIME ZONE s.zone)::date AS day
                FROM purchases p JOIN scope s ON p.tenant_id=s.tenant AND p.created_at<=s.at
                WHERE (p.created_at AT TIME ZONE s.zone)::date>=s.today-365
            ), ranked AS (
                SELECT member_id,day,row_number() OVER(PARTITION BY member_id ORDER BY day DESC) AS n FROM days
            ), gaps AS (
                SELECT member_id,day,day-lag(day) OVER(PARTITION BY member_id ORDER BY day) AS gap FROM ranked WHERE n<=9
            ), rhythm AS (
                SELECT member_id,count(*) AS sample_days,max(day)-min(day) AS span,
                    percentile_disc(0.5) WITHIN GROUP(ORDER BY gap) FILTER(WHERE gap IS NOT NULL) AS median_days
                FROM gaps GROUP BY member_id
            ), rewards_now AS (
                SELECT b.member_id, count(*) FILTER(WHERE b.available>=r.cost) AS ready,
                    count(*) FILTER(WHERE b.available>0 AND b.available<r.cost AND
                        (b.available::numeric*5>=r.cost::numeric*4 OR (p.kind='STAMPS' AND r.cost-b.available=1))) AS near
                FROM balances b JOIN scope s ON b.tenant_id=s.tenant
                JOIN customer_programs p ON p.tenant_id=b.tenant_id AND p.id=b.program_id
                JOIN rewards r ON r.tenant_id=p.tenant_id AND r.program_id=p.id AND r.active GROUP BY b.member_id
            ), population AS (
                SELECT m.id,m.name,right(m.card_code,6) AS suffix,coalesce(a.purchases,0) AS purchases,
                    coalesce(a.spent,0) AS spent,a.last_at,s.today-(a.last_at AT TIME ZONE s.zone)::date AS elapsed,
                    coalesce(r.sample_days,0) AS sample_days,
                    CASE WHEN r.sample_days>=4 AND r.span>=7 THEN r.median_days END AS cadence,
                    CASE WHEN r.sample_days>=4 AND r.span>=7 THEN greatest(7,ceil(r.median_days*1.5))::int END AS threshold,
                    coalesce(r.sample_days>=4 AND r.span>=7 AND
                        s.today-(a.last_at AT TIME ZONE s.zone)::date>=greatest(7,ceil(r.median_days*1.5)),false) AS late,
                    coalesce(w.ready,0) AS ready,coalesce(w.near,0) AS near
                FROM members m JOIN scope s ON m.tenant_id=s.tenant
                LEFT JOIN sales a ON a.member_id=m.id LEFT JOIN rhythm r ON r.member_id=m.id
                LEFT JOIN rewards_now w ON w.member_id=m.id
            ), filtered AS (SELECT * FROM population WHERE ($predicate)
                AND position(?::text in translate(lower(name),'áéíóúüñ','aeiouun'))>0)
            SELECT
                (SELECT row_to_json(t)::text FROM (SELECT count(*) AS total,
                    count(*) FILTER(WHERE late) AS late, count(*) FILTER(WHERE ready>0) AS ready,
                    count(*) FILTER(WHERE near>0) AS near, count(*) FILTER(WHERE purchases=0) AS first,
                    count(*) FILTER(WHERE cadence IS NOT NULL) AS rhythmic FROM population) t) AS summary,
                (SELECT count(*) FROM filtered) AS total,
                (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
                    SELECT id,name,suffix AS "cardSuffix",purchases,spent AS "spentMinor",last_at AS "lastPurchase",
                        elapsed AS "daysSinceLastPurchase",sample_days AS "sampleDays",cadence AS "cadenceDays",
                        threshold AS "attentionAfterDays",late,ready AS "readyRewards",near AS "nearRewards"
                    FROM filtered ORDER BY CASE WHEN late AND (ready>0 OR near>0) THEN 0 WHEN late THEN 1
                        WHEN ready>0 THEN 2 WHEN near>0 THEN 3 WHEN purchases=0 THEN 4 ELSE 5 END,
                        elapsed DESC NULLS LAST,id LIMIT 20 OFFSET ?
                ) t) AS items
        """.trimIndent(), tenant, Timestamp.from(at), zone.id, today, normalizedSearch(query.search), query.offset) {
            val items = json.parseToJsonElement(it.getString("items")).jsonArray
            val total = it.getLong("total")
            obj("summary" to json.parseToJsonElement(it.getString("summary")), "items" to items,
                "total" to total, "offset" to query.offset, "hasMore" to (query.offset.toLong()+items.size<total))
        }!!
        // A complete 30-day observation window. Same-day receipts are one visit, across branches.
        val cohorts = c.rows("""
            WITH scope AS (SELECT ?::text AS tenant, ?::timestamptz AS at, ?::text AS zone, ?::date AS today),
            days AS (SELECT DISTINCT member_id,(created_at AT TIME ZONE s.zone)::date AS day
                FROM purchases p JOIN scope s ON p.tenant_id=s.tenant AND p.created_at<=s.at),
            ranked AS (SELECT member_id,day,row_number() OVER(PARTITION BY member_id ORDER BY day) AS n FROM days),
            starts AS (SELECT member_id,min(day) AS first_day,max(day) FILTER(WHERE n=2) AS second_day
                FROM ranked WHERE n<=2 GROUP BY member_id),
            months AS (SELECT generate_series(date_trunc('month',today::timestamp)-interval '5 months',
                date_trunc('month',today::timestamp),interval '1 month')::date AS month FROM scope)
            SELECT m.month,count(f.member_id) AS starters,
                count(f.member_id) FILTER(WHERE f.first_day<s.today-30) AS eligible,
                count(f.member_id) FILTER(WHERE f.first_day<s.today-30 AND f.second_day<=f.first_day+30) AS returned
            FROM months m CROSS JOIN scope s LEFT JOIN starts f ON date_trunc('month',f.first_day::timestamp)::date=m.month
            GROUP BY m.month ORDER BY m.month
        """.trimIndent(), tenant, Timestamp.from(at), zone.id, today) {
            val eligible = it.getLong("eligible"); val returned = it.getLong("returned")
            obj("month" to it.getDate("month").toString(), "starters" to it.getLong("starters"),
                "eligible" to eligible, "returned" to returned,
                "rate" to if (eligible>0) java.math.BigDecimal.valueOf(returned).multiply(java.math.BigDecimal(100))
                    .divide(java.math.BigDecimal.valueOf(eligible),1,java.math.RoundingMode.HALF_UP) else null)
        }
        JsonObject(report + obj("cohorts" to cohorts,"asOf" to at,"today" to today,"timezone" to zone.id,
            "segment" to query.segment,"sampleLimit" to 9,"lookbackDays" to 365))
    }
}
