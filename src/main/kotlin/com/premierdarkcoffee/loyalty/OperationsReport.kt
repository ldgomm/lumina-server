package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.sql.Timestamp
import java.time.*
import java.time.temporal.ChronoUnit

internal data class ReportWindow(val from: Instant, val until: Instant, val previousFrom: Instant, val days: Int, val fromDate: LocalDate, val throughDate: LocalDate)
internal fun reportWindow(now: Instant, zone: ZoneId, days: Int, fromDate: String?, throughDate: String?, asOf: String?): ReportWindow {
    need(days in setOf(7,30,90,365),"INVALID_PERIOD","Elige 7, 30, 90 o 365 días.")
    val at=try { asOf?.let(Instant::parse) ?: now } catch (_: Exception) { throw Problem(400,"INVALID_DATE","Fecha de consulta inválida.") }
    need(!at.isAfter(now),"INVALID_DATE","La consulta no puede estar en el futuro.")
    need((fromDate==null)==(throughDate==null),"INVALID_RANGE","Indica la fecha inicial y final.")
    val today=at.atZone(zone).toLocalDate()
    val from: LocalDate; val through: LocalDate
    try { through=throughDate?.let(LocalDate::parse)?:today; from=fromDate?.let(LocalDate::parse)?:through.minusDays(days-1L) }
    catch (_: Exception) { throw Problem(400,"INVALID_RANGE","Usa fechas válidas en formato año-mes-día.") }
    val length=ChronoUnit.DAYS.between(from,through)+1
    need(length in 1..366 && !through.isAfter(today),"INVALID_RANGE","Elige hasta 366 días, en orden y sin fechas futuras.")
    val start=from.atStartOfDay(zone).toInstant()
    val until=if(through==today)at else through.plusDays(1).atStartOfDay(zone).toInstant().minusNanos(1000)
    return ReportWindow(start,until,from.minusDays(length).atStartOfDay(zone).toInstant(),length.toInt(),from,through)
}

data class OperationsQuery(val days: Int = 30, val branchId: String? = null, val actorId: String? = null, val fromDate: String? = null, val throughDate: String? = null, val asOf: String? = null)

/** Money, purchases and deliveries are independent facts: never join raw purchases to raw rewards. */
fun LoyaltyService.operationsReport(s: Staff, q: OperationsQuery = OperationsQuery()): JsonObject {
    s.owner();q.branchId?.let(::uuid);q.actorId?.let(::uuid)
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        // No write/row lock in this report; route authentication is followed by a snapshot check.
        if(s.id!="platform")need(c.one("SELECT version FROM staff_tokens WHERE tenant_id=? AND id=? AND role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL",s.tenant,s.id){s.version==null||it.getInt(1)==s.version}==true,"STAFF_ACCESS_CHANGED","Tu acceso cambió. Inicia sesión de nuevo.",401)
        val business=c.one("SELECT name,currency,timezone FROM tenants WHERE id=?",s.tenant){Triple(it.getString(1),it.getString(2),ZoneId.of(it.getString(3)))}?:throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
        q.branchId?.let{branch(c,s.tenant,it)}
        q.actorId?.let{need(c.one("SELECT id FROM staff_tokens WHERE tenant_id=? AND id=?",s.tenant,it){it.getString(1)}!=null,"NOT_FOUND","Usuario no encontrado en este negocio.",404)}
        val w=reportWindow(clock.instant(),business.third,q.days,q.fromDate,q.throughDate,q.asOf)
        val result=c.one("""
          WITH scope AS (SELECT ?::text AS tenant,?::timestamptz AS previous_from,?::timestamptz AS since_at,?::timestamptz AS until_at,?::text AS zone), events AS (
            SELECT p.id,p.actor_id,p.branch_id,p.member_id,p.created_at AS at,'PURCHASE' AS kind,p.amount_minor AS paid,p.discount_minor AS discount,jsonb_array_length(p.items)>0 AS detailed,NULL::text AS reward_id,NULL::text AS reward_name
            FROM purchases p JOIN scope x ON p.tenant_id=x.tenant AND p.created_at>=x.previous_from AND p.created_at<=x.until_at
            UNION ALL
            SELECT r.id,r.confirmed_actor_id,r.confirmed_branch_id,r.member_id,r.consumed_at,'REWARD',0,0,false,r.reward_id,r.reward_name
            FROM redemptions r JOIN scope x ON r.tenant_id=x.tenant AND r.status='CONSUMED' AND r.consumed_at>=x.previous_from AND r.consumed_at<=x.until_at
          ), filtered AS (
            SELECT e.*,(e.at AT TIME ZONE x.zone)::date AS day,e.at>=x.since_at AS current_period FROM events e CROSS JOIN scope x
            WHERE (?::text IS NULL OR e.branch_id=?) AND (?::text IS NULL OR e.actor_id=?)
          ), current_events AS (SELECT * FROM filtered WHERE current_period), summary AS (
            SELECT current_period,count(*) FILTER(WHERE kind='PURCHASE') AS purchases,count(DISTINCT member_id) FILTER(WHERE kind='PURCHASE') AS buyers,
              coalesce(sum(paid),0) AS "paidMinor",coalesce(sum(discount),0) AS "discountMinor",count(*) FILTER(WHERE kind='REWARD') AS redemptions,
              count(*) FILTER(WHERE detailed) AS "detailedPurchases",count(DISTINCT day) FILTER(WHERE kind='PURCHASE') AS "activeDays"
            FROM filtered GROUP BY current_period
          ), by_actor AS (
            SELECT actor_id,count(*) FILTER(WHERE kind='PURCHASE') AS purchases,count(DISTINCT member_id) FILTER(WHERE kind='PURCHASE') AS buyers,
              sum(paid) AS "paidMinor",sum(discount) AS "discountMinor",count(*) FILTER(WHERE kind='REWARD') AS redemptions,max(at) AS "lastActivity"
            FROM current_events GROUP BY actor_id
          ), by_branch AS (
            SELECT branch_id,count(*) FILTER(WHERE kind='PURCHASE') AS purchases,count(DISTINCT member_id) FILTER(WHERE kind='PURCHASE') AS buyers,
              sum(paid) AS "paidMinor",sum(discount) AS "discountMinor",count(*) FILTER(WHERE kind='REWARD') AS redemptions
            FROM current_events GROUP BY branch_id
          ), repeat_days AS (SELECT member_id,count(DISTINCT day) AS days FROM current_events WHERE kind='PURCHASE' GROUP BY member_id)
          SELECT
            (SELECT row_to_json(t)::text FROM summary t WHERE current_period) AS current,
            (SELECT row_to_json(t)::text FROM summary t WHERE NOT current_period) AS previous,
            (SELECT count(*) FROM repeat_days WHERE days>1) AS repeat_buyers,
            (SELECT count(*) FROM by_actor) AS user_count,
            (SELECT count(*) FROM by_branch) AS branch_count,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
              SELECT a.actor_id AS id,coalesce(nullif(s.display_name,''),'Usuario · '||right(a.actor_id,6),'Responsable no registrado') AS name,
                CASE WHEN s.archived_at IS NOT NULL THEN 'ARCHIVED' WHEN s.revoked_at IS NOT NULL THEN 'INACTIVE' ELSE 'ACTIVE' END AS state,
                a.purchases,a.buyers,a."paidMinor",a."discountMinor",a.redemptions,a."lastActivity"
              FROM by_actor a CROSS JOIN scope x LEFT JOIN staff_tokens s ON s.tenant_id=x.tenant AND s.id=a.actor_id
              ORDER BY a.purchases DESC,a.redemptions DESC,a.actor_id LIMIT 200
            ) t) AS users,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
              SELECT a.branch_id AS id,coalesce(b.name,'Sucursal no registrada') AS name,a.purchases,a.buyers,a."paidMinor",a."discountMinor",a.redemptions
              FROM by_branch a CROSS JOIN scope x LEFT JOIN branches b ON b.tenant_id=x.tenant AND b.id=a.branch_id ORDER BY a.purchases DESC,a.branch_id LIMIT 200
            ) t) AS branches,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
              SELECT dates.day::date AS day,count(e.id) FILTER(WHERE e.kind='PURCHASE') AS purchases,coalesce(sum(e.paid),0) AS "paidMinor",count(e.id) FILTER(WHERE e.kind='REWARD') AS redemptions
              FROM generate_series(?::date,?::date,interval '1 day') AS dates(day) LEFT JOIN current_events e ON e.day=dates.day::date GROUP BY dates.day ORDER BY dates.day
            ) t) AS daily,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
              SELECT extract(isodow FROM at AT TIME ZONE x.zone)::int AS weekday,extract(hour FROM at AT TIME ZONE x.zone)::int AS hour,count(*) AS purchases,sum(paid) AS "paidMinor"
              FROM current_events CROSS JOIN scope x WHERE kind='PURCHASE' GROUP BY weekday,hour ORDER BY weekday,hour
            ) t) AS hours,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (
              SELECT reward_id AS id,(array_agg(reward_name ORDER BY at DESC,id))[1] AS name,count(*) AS claims
              FROM current_events WHERE kind='REWARD' GROUP BY reward_id ORDER BY claims DESC,reward_id LIMIT 20
            ) t) AS rewards
        """.trimIndent(),s.tenant,Timestamp.from(w.previousFrom),Timestamp.from(w.from),Timestamp.from(w.until),business.third.id,q.branchId,q.branchId,q.actorId,q.actorId,w.fromDate.toString(),w.throughDate.toString()) { row ->
            val zero=obj("purchases" to 0,"buyers" to 0,"paidMinor" to 0,"discountMinor" to 0,"redemptions" to 0,"detailedPurchases" to 0,"activeDays" to 0)
            fun parsed(key:String)=row.getString(key)?.let(json::parseToJsonElement)
            obj("summary" to (parsed("current")?:zero),"previous" to (parsed("previous")?:zero),"returningOnAnotherDay" to row.getLong("repeat_buyers"),"userCount" to row.getLong("user_count"),"branchCount" to row.getLong("branch_count"),"users" to parsed("users"),"branches" to parsed("branches"),"daily" to parsed("daily"),"hours" to parsed("hours"),"rewards" to parsed("rewards"))
        }!!
        JsonObject(result+obj("business" to obj("id" to s.tenant,"name" to business.first,"currency" to business.second,"timezone" to business.third.id),"days" to w.days,"fromDate" to w.fromDate,"throughDate" to w.throughDate,"from" to w.from,"asOf" to w.until,"previousFromDate" to w.fromDate.minusDays(w.days.toLong()),"previousThroughDate" to w.fromDate.minusDays(1),
            "filters" to obj("branchId" to q.branchId,"actorId" to q.actorId),"allBranches" to c.rows("SELECT id,name FROM branches WHERE tenant_id=? ORDER BY name,id",s.tenant){obj("id" to it.getString(1),"name" to it.getString(2))},"allUsers" to staffRows(c,s.tenant).map{JsonObject(it.filterKeys{key->key in setOf("id","name","state")})}))
    }
}
