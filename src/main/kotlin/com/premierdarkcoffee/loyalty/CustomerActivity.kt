package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.ZoneId

/** Read-only reporting. Rewards are alternatives, not a promise of simultaneous redemption. */
data class CustomerActivityQuery(
    val days: Int = 30,
    val inactiveDays: Int = 30,
    val segment: String = "ALL",
    val search: String = "",
    val offset: Int = 0
) {
    fun validate() {
        need(days in setOf(7, 30, 90), "INVALID_PERIOD", "Elige 7, 30 o 90 días.")
        need(inactiveDays in 1..365, "INVALID_INACTIVITY", "Elige entre 1 y 365 días sin compras.")
        need(segment in setOf("ALL", "RETURNING", "READY", "NEAR", "INACTIVE", "NEW"), "INVALID_SEGMENT", "Filtro de clientes inválido.")
        need(search.length <= 100, "INVALID_SEARCH", "Busca por nombre con un máximo de 100 caracteres.")
        need(offset in 0..1_000_000, "INVALID_PAGE", "Página inválida.")
    }
}

fun LoyaltyService.customerActivity(s: Staff, query: CustomerActivityQuery = CustomerActivityQuery()): JsonObject {
    s.owner()
    query.validate()
    val now = clock.instant()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val zone = c.one("SELECT timezone FROM tenants WHERE id=?", s.tenant) { ZoneId.of(it.getString(1)) }
            ?: throw Problem(404, "NOT_FOUND", "Negocio no encontrado.")
        val today = now.atZone(zone).toLocalDate()
        val from = today.minusDays(query.days - 1L).atStartOfDay(zone).toInstant()
        // A purchase on the cutoff local date is already N calendar days old.
        val inactiveBefore = today.minusDays(query.inactiveDays - 1L).atStartOfDay(zone).toInstant()
        val predicate = when (query.segment) {
            "RETURNING" -> "purchases > 1"
            "READY" -> "ready > 0"
            "NEAR" -> "near > 0"
            "INACTIVE" -> "inactive"
            "NEW" -> "purchases = 0"
            else -> "true"
        }
        val result = c.one("""
            WITH scope AS (
                SELECT ?::text AS tenant, ?::timestamptz AS until_at,
                       ?::timestamptz AS since_at, ?::timestamptz AS inactive_before
            ), sales AS (
                SELECT member_id, count(*) AS purchases, sum(amount_minor) AS spent,
                       min(created_at) AS first_at, max(created_at) AS last_at,
                       count(*) FILTER (WHERE created_at >= since_at) AS period_purchases,
                       coalesce(sum(amount_minor) FILTER (WHERE created_at >= since_at),0) AS period_spent,
                       coalesce(sum(discount_minor) FILTER (WHERE created_at >= since_at),0) AS period_discount
                FROM purchases p JOIN scope ON p.tenant_id=scope.tenant AND p.created_at<=scope.until_at
                GROUP BY member_id
            ), claims AS (
                SELECT member_id, count(*) AS claims,
                       count(*) FILTER (WHERE consumed_at>=since_at) AS period_claims
                FROM redemptions r JOIN scope ON r.tenant_id=scope.tenant
                WHERE r.status='CONSUMED' AND r.consumed_at<=scope.until_at GROUP BY member_id
            ), rewards_now AS (
                SELECT b.member_id,
                       count(*) FILTER (WHERE b.available>=r.cost) AS ready,
                       count(*) FILTER (WHERE p.kind='STAMPS' AND b.available>0 AND r.cost-b.available=1) AS near
                FROM balances b JOIN scope ON b.tenant_id=scope.tenant
                JOIN customer_programs p ON p.tenant_id=b.tenant_id AND p.id=b.program_id
                JOIN rewards r ON r.tenant_id=p.tenant_id AND r.program_id=p.id AND r.active
                GROUP BY b.member_id
            ), population AS (
                SELECT m.id,m.name,coalesce(s.purchases,0) AS purchases,coalesce(s.spent,0) AS spent,
                       s.first_at,s.last_at,coalesce(c.claims,0) AS claims,
                       coalesce(s.period_purchases,0) AS period_purchases,
                       coalesce(s.period_spent,0) AS period_spent,coalesce(s.period_discount,0) AS period_discount,
                       coalesce(c.period_claims,0) AS period_claims,
                       coalesce(r.ready,0) AS ready,coalesce(r.near,0) AS near,
                       coalesce(s.last_at<scope.inactive_before,false) AS inactive
                FROM members m JOIN scope ON m.tenant_id=scope.tenant
                LEFT JOIN sales s ON s.member_id=m.id LEFT JOIN claims c ON c.member_id=m.id
                LEFT JOIN rewards_now r ON r.member_id=m.id
            ), filtered AS (
                SELECT * FROM population WHERE $predicate AND position(lower(?::text) in lower(name))>0
            )
            SELECT
              (SELECT row_to_json(t)::text FROM (
                SELECT count(*) AS "registeredCustomers",
                    count(*) FILTER (WHERE purchases>1) AS "returningCustomers",
                    count(*) FILTER (WHERE ready>0) AS "readyCustomers",
                    count(*) FILTER (WHERE near>0) AS "nearCustomers",
                    count(*) FILTER (WHERE inactive) AS "inactiveCustomers",
                    count(*) FILTER (WHERE purchases=0) AS "newCustomers",
                    count(*) FILTER (WHERE period_purchases>0) AS "periodBuyers",
                    count(*) FILTER (WHERE period_purchases>0 AND purchases>1) AS "periodReturningBuyers",
                    coalesce(sum(period_purchases),0) AS "periodPurchases",
                    coalesce(sum(period_spent),0) AS "periodSpentMinor",
                    coalesce(sum(period_discount),0) AS "periodDiscountMinor",
                    coalesce(sum(period_claims),0) AS "periodClaimedRewards"
                FROM population
              ) t) AS summary,
              (SELECT count(*) FROM filtered) AS total,
              (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
                SELECT id,name,purchases,spent AS "spentMinor",claims AS "claimedRewards",
                    last_at AS "lastPurchase",first_at AS "firstPurchase",
                    ready AS "readyRewards",near AS "nearRewards",inactive
                FROM filtered ORDER BY last_at DESC NULLS LAST,id LIMIT 50 OFFSET ?
              ) t) AS customers
        """.trimIndent(), s.tenant, Timestamp.from(now), Timestamp.from(from), Timestamp.from(inactiveBefore), query.search.trim(), query.offset) { r ->
            val customers = json.parseToJsonElement(r.getString("customers")).jsonArray.map { value ->
                val row = value.jsonObject
                val visits = row.getValue("purchases").jsonPrimitive.long
                val last = row["lastPurchase"]?.jsonPrimitive?.contentOrNull?.let { java.time.OffsetDateTime.parse(it).toInstant() }
                val first = row["firstPurchase"]?.jsonPrimitive?.contentOrNull?.let { java.time.OffsetDateTime.parse(it).toInstant() }
                JsonObject(row + obj(
                    "lastPurchase" to last,
                    "returning" to (visits > 1),
                    "daysSinceLastPurchase" to last?.let { java.time.temporal.ChronoUnit.DAYS.between(it.atZone(zone).toLocalDate(), today) },
                    "averageDaysBetweenPurchases" to if (visits > 1 && first != null && last != null) java.time.Duration.between(first,last).toSeconds()/86400.0/(visits-1) else null
                ))
            }
            val total = r.getLong("total")
            obj("summary" to json.parseToJsonElement(r.getString("summary")), "customers" to customers,
                "total" to total, "offset" to query.offset, "hasMore" to (query.offset.toLong()+customers.size<total))
        }!!
        JsonObject(result + obj("from" to from, "through" to now, "timezone" to zone.id,
            "days" to query.days, "inactiveDays" to query.inactiveDays, "segment" to query.segment))
    }
}

fun customerRewardProgress(c: Connection, tenant: String, member: String): List<JsonObject> = c.rows("""
    SELECT r.id,r.name,r.cost,p.kind,b.available,v.config->>'name' AS program_name
    FROM balances b JOIN customer_programs p ON p.tenant_id=b.tenant_id AND p.id=b.program_id
    JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version
    JOIN rewards r ON r.tenant_id=p.tenant_id AND r.program_id=p.id AND r.active
    WHERE b.tenant_id=? AND b.member_id=? AND b.available>0
    ORDER BY (b.available>=r.cost) DESC,(p.kind='STAMPS' AND r.cost-b.available=1) DESC,r.name,r.id LIMIT 100
""".trimIndent(), tenant, member) { r ->
    obj("id" to r.getString("id"),"name" to r.getString("name"),"program" to r.getString("program_name"),
        "kind" to r.getString("kind"),"available" to r.getLong("available"),"goal" to r.getLong("cost"),
        "remaining" to maxOf(0,r.getLong("cost")-r.getLong("available")))
}
