package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.staffRows
import com.premierdarkcoffee.loyalty.application.key
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
import java.time.Instant
import java.time.ZoneId

data class ManagementQuery(val days: Int = 30, val kind: String = "ALL", val branchId: String? = null, val actorId: String? = null, val search: String = "", val offset: Int = 0, val asOf: String? = null, val fromDate: String? = null, val throughDate: String? = null) {
    fun validate() {
        need(days in setOf(7,30,90,365),"INVALID_PERIOD","Elige 7, 30, 90 o 365 días.")
        need(kind in setOf("ALL","PURCHASE","REWARD","ADMIN","OPERATIONS"),"INVALID_KIND","Filtro de actividad inválido.")
        need(offset in 0..1_000_000 && offset % 50 == 0,"INVALID_PAGE","Página inválida.")
        need(search.length<=100,"INVALID_SEARCH","Usa hasta 100 caracteres para buscar.")
        branchId?.let(::uuid); if(actorId != null && actorId != "platform")uuid(actorId)
    }
}

/** Operational and management history; read-only, bounded pages and one consistent snapshot. */
fun LoyaltyService.managementActivity(tenant: String, q: ManagementQuery, reader: Staff? = null): JsonObject = readManagementActivity(tenant,q,50,reader)
internal fun LoyaltyService.readManagementActivity(tenant: String, q: ManagementQuery, limit: Int, reader: Staff?): JsonObject {
    uuid(tenant);q.validate()
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val business=c.one("SELECT name,currency,timezone FROM tenants WHERE id=?",tenant) { Triple(it.getString(1),it.getString(2),ZoneId.of(it.getString(3))) } ?: throw Problem(404,"NOT_FOUND","Negocio no encontrado.")
        q.branchId?.let { branch(c,tenant,it) }
        if(q.actorId != null && q.actorId != "platform")need(c.one("SELECT id FROM staff_tokens WHERE tenant_id=? AND id=?",tenant,q.actorId){it.getString(1)}!=null,"NOT_FOUND","Usuario no encontrado en este negocio.",404)
        if(reader!=null){
            reader.owner();need(reader.tenant==tenant,"FORBIDDEN","Acceso no autorizado.",403)
            if(reader.id!="platform")need(c.one("SELECT version FROM staff_tokens WHERE tenant_id=? AND id=? AND role='OWNER' AND revoked_at IS NULL AND archived_at IS NULL",tenant,reader.id){reader.version==null||it.getInt(1)==reader.version}==true,"STAFF_ACCESS_CHANGED","Tu acceso cambió. Inicia sesión de nuevo.",401)
        }
        val window=reportWindow(clock.instant(),business.third,q.days,q.fromDate,q.throughDate,q.asOf)
        val start=window.from;val until=window.until
        val result=c.one("""
            WITH scope AS (SELECT ?::text AS tenant,?::timestamptz AS since_at,?::timestamptz AS until_at), events AS (
                SELECT p.id,p.created_at AS at,'PURCHASE'::text AS kind,p.actor_id,p.branch_id,m.name AS customer,p.receipt AS concept,
                  coalesce(p.actor_name,nullif(s.display_name,''),'Usuario · '||right(p.actor_id,6)) AS actor,
                  jsonb_build_object('id',p.id,'kind','PURCHASE','at',p.created_at,'actorId',p.actor_id,'actorName',coalesce(p.actor_name,nullif(s.display_name,''),'Usuario · '||right(p.actor_id,6)),
                    'historicalName',p.actor_name IS NOT NULL,'customerId',p.member_id,'customer',m.name,'branch',b.name,'receipt',p.receipt,'paidMinor',p.amount_minor,'discountMinor',p.discount_minor,'items',p.items,'redemptionId',p.redemption_id,
                    'earnings',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',v.config->>'name','kind',pg.kind,'amount',l.delta)),'[]'::jsonb) FROM ledger l JOIN programs pg ON pg.tenant_id=l.tenant_id AND pg.id=l.program_id JOIN program_versions v ON v.tenant_id=l.tenant_id AND v.program_id=l.program_id AND v.version=l.program_version WHERE l.tenant_id=p.tenant_id AND l.reference_id=p.id AND l.kind='EARN')) AS data
                FROM purchases p JOIN scope x ON p.tenant_id=x.tenant AND p.created_at BETWEEN x.since_at AND x.until_at
                JOIN members m ON m.tenant_id=p.tenant_id AND m.id=p.member_id JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id
                LEFT JOIN staff_tokens s ON s.tenant_id=p.tenant_id AND s.id=p.actor_id
                UNION ALL
                SELECT r.id,r.consumed_at,'REWARD',r.confirmed_actor_id,r.confirmed_branch_id,m.name,r.reward_name,
                  coalesce(r.actor_name,nullif(s.display_name,''),'Usuario · '||right(r.confirmed_actor_id,6)),
                  jsonb_build_object('id',r.id,'kind','REWARD','at',r.consumed_at,'actorId',r.confirmed_actor_id,'actorName',coalesce(r.actor_name,nullif(s.display_name,''),'Usuario · '||right(r.confirmed_actor_id,6)),
                    'historicalName',r.actor_name IS NOT NULL,'customerId',r.member_id,'customer',m.name,'branch',b.name,'reward',r.reward_name,'cost',r.cost,'balanceKind',p.kind,'program',v.config->>'name','receipt',coalesce(buy.receipt,r.id),
                    'concept',CASE WHEN buy.id IS NULL THEN 'Entrega de premio en caja' ELSE 'Premio aplicado al comprobante '||buy.receipt END)
                FROM redemptions r JOIN scope x ON r.tenant_id=x.tenant AND r.consumed_at BETWEEN x.since_at AND x.until_at AND r.status='CONSUMED'
                JOIN members m ON m.tenant_id=r.tenant_id AND m.id=r.member_id JOIN programs p ON p.tenant_id=r.tenant_id AND p.id=r.program_id
                JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version
                LEFT JOIN staff_tokens s ON s.tenant_id=r.tenant_id AND s.id=r.confirmed_actor_id
                LEFT JOIN branches b ON b.tenant_id=r.tenant_id AND b.id=r.confirmed_branch_id
                LEFT JOIN LATERAL (SELECT id,receipt FROM purchases WHERE tenant_id=r.tenant_id AND redemption_id=r.id ORDER BY id LIMIT 1) buy ON true
                UNION ALL
                SELECT a.id,a.created_at,'ADMIN',a.actor_id,NULL,NULL,concat_ws(' ',a.action,a.details->>'name',a.details->>'reason'),
                  coalesce(a.actor_name,nullif(s.display_name,''),CASE WHEN a.actor_id='platform' THEN 'Administrador de plataforma' ELSE 'Usuario · '||right(a.actor_id,6) END),
                  jsonb_build_object('id',a.id,'kind','ADMIN','at',a.created_at,'actorId',a.actor_id,'actorName',coalesce(a.actor_name,nullif(s.display_name,''),CASE WHEN a.actor_id='platform' THEN 'Administrador de plataforma' ELSE 'Usuario · '||right(a.actor_id,6) END),
                    'historicalName',a.actor_name IS NOT NULL,'action',a.action,'targetId',a.target_id,'details',a.details)
                FROM audit_events a JOIN scope x ON a.tenant_id=x.tenant AND a.created_at BETWEEN x.since_at AND x.until_at
                LEFT JOIN staff_tokens s ON s.tenant_id=a.tenant_id AND s.id=a.actor_id
                WHERE (s.id IS NOT NULL OR a.actor_id='platform') AND a.action NOT IN ('PURCHASE','CONSUME','COUNTER_CONSUME_VERIFIED','PURCHASE_REWARD_CONFIRMED')
            ), filtered AS (
                SELECT * FROM events WHERE (?='ALL' OR kind=? OR (?='OPERATIONS' AND kind IN ('PURCHASE','REWARD'))) AND (?::text IS NULL OR actor_id=?) AND (?::text IS NULL OR branch_id=?)
                  AND position(? in translate(lower(concat_ws(' ',customer,concept,actor)),'áéíóúüñ','aeiouun'))>0
            )
            SELECT (SELECT count(*) FROM filtered) AS total,
              (SELECT coalesce(jsonb_agg(t.data ORDER BY t.at DESC,t.kind,t.id),'[]'::jsonb)::text FROM (SELECT * FROM filtered ORDER BY at DESC,kind,id LIMIT ? OFFSET ?) t) AS items,
              (SELECT jsonb_build_object('purchases',count(*) FILTER(WHERE kind='PURCHASE'),'redemptions',count(*) FILTER(WHERE kind='REWARD'),'changes',count(*) FILTER(WHERE kind='ADMIN'),'paidMinor',coalesce(sum((data->>'paidMinor')::bigint),0))::text FROM filtered) AS summary
        """.trimIndent(),tenant,Timestamp.from(start),Timestamp.from(until),q.kind,q.kind,q.kind,q.actorId,q.actorId,q.branchId,q.branchId,normalizedSearch(q.search),limit,q.offset) {
            val total=it.getLong("total"); val items=json.parseToJsonElement(it.getString("items")).jsonArray
            obj("total" to total,"items" to items,"summary" to json.parseToJsonElement(it.getString("summary")),"offset" to q.offset,"hasMore" to (q.offset.toLong()+items.size<total))
        }!!
        JsonObject(result+obj("business" to obj("id" to tenant,"name" to business.first,"currency" to business.second,"timezone" to business.third.id),"from" to start,"asOf" to until,"fromDate" to window.fromDate,"throughDate" to window.throughDate,
            "users" to staffRows(c,tenant).map { JsonObject(it.filterKeys { key -> key in setOf("id","name","state","role","branchId") }) },
            "branches" to c.rows("SELECT id,name FROM branches WHERE tenant_id=? ORDER BY name,id",tenant){obj("id" to it.getString(1),"name" to it.getString(2))}))
    }
}

fun LoyaltyService.platformOverview(days: Int = 30, search: String = "", offset: Int = 0): JsonObject {
    ManagementQuery(days=days,search=search,offset=offset).validate()
    val at=Timestamp.from(clock.instant())
    return db.tx { c ->
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        c.one("""
          WITH scope AS (
            SELECT t.*,a.state,?::timestamptz AS until_at,
              (((?::timestamptz AT TIME ZONE t.timezone)::date-(?::int-1))::timestamp AT TIME ZONE t.timezone) AS since_at
            FROM tenants t JOIN business_access a ON a.tenant_id=t.id
          ), population AS (
            SELECT t.id,t.name,t.currency,t.timezone,t.state,
              (SELECT count(*) FROM members m WHERE m.tenant_id=t.id AND m.created_at<=t.until_at) AS clients,
              (SELECT count(*) FROM members m WHERE m.tenant_id=t.id AND m.created_at BETWEEN t.since_at AND t.until_at) AS new_clients,
              (SELECT count(*) FROM branches b WHERE b.tenant_id=t.id) AS branches,
              coalesce(p.purchases,0) AS purchases,coalesce(p.paid,0) AS paid,coalesce(p.buyers,0) AS buyers,
              (SELECT count(*) FROM redemptions r WHERE r.tenant_id=t.id AND r.status='CONSUMED' AND r.consumed_at BETWEEN t.since_at AND t.until_at) AS rewards
            FROM scope t LEFT JOIN LATERAL (
              SELECT count(*) AS purchases,coalesce(sum(amount_minor),0) AS paid,count(DISTINCT member_id) AS buyers FROM purchases WHERE tenant_id=t.id AND created_at BETWEEN t.since_at AND t.until_at
            ) p ON true
          ), filtered AS (SELECT * FROM population WHERE position(? in translate(lower(name),'áéíóúüñ','aeiouun'))>0)
          SELECT (SELECT count(*) FROM filtered) AS total,
            (SELECT jsonb_build_object('businesses',count(*),'clients',coalesce(sum(clients),0),'newClients',coalesce(sum(new_clients),0),'purchases',coalesce(sum(purchases),0),'redemptions',coalesce(sum(rewards),0),'branches',coalesce(sum(branches),0))::text FROM population) AS summary,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (SELECT currency,sum(paid) AS "paidMinor",sum(purchases) AS purchases FROM population GROUP BY currency ORDER BY currency) t) AS currencies,
            (SELECT coalesce(jsonb_agg(t),'[]'::jsonb)::text FROM (SELECT id,name,currency,timezone,state,clients,new_clients AS "newClients",branches,purchases,paid AS "paidMinor",buyers,rewards FROM filtered ORDER BY purchases DESC,lower(name),id LIMIT 50 OFFSET ?) t) AS businesses
        """.trimIndent(),at,at,days,normalizedSearch(search),offset) {
            val total=it.getLong("total");val items=json.parseToJsonElement(it.getString("businesses")).jsonArray
            obj("days" to days,"asOf" to at.toInstant(),"summary" to json.parseToJsonElement(it.getString("summary")),"currencies" to json.parseToJsonElement(it.getString("currencies")),"businesses" to items,"total" to total,"offset" to offset,"hasMore" to (offset.toLong()+items.size<total))
        }!!
    }
}
