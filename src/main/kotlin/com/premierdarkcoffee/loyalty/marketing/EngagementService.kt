package com.premierdarkcoffee.loyalty.marketing

import com.premierdarkcoffee.loyalty.access.Member
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.analytics.customerRewardProgress
import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.instant
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.fidelity.explainReceipt
import com.premierdarkcoffee.loyalty.fidelity.purchaseOperations
import com.premierdarkcoffee.loyalty.fidelity.purchaseReview
import com.premierdarkcoffee.loyalty.fidelity.queuePromotionCards
import com.premierdarkcoffee.loyalty.fidelity.requireActivePromotion
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.Reward
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.*

object EngagementMigration {
    fun apply(c: Connection) {
        val sql=requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V005.sql")).readText()
        val checksum=SqlFingerprint.checksum(sql)
        val old=c.one("SELECT checksum FROM comeback_migrations WHERE version=5"){it.getString(1)}
        check(old==null || old==checksum){"Migration V005 changed beyond formatting."}
        if(old==null){c.createStatement().use{it.execute(sql)};c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(5,?)",checksum)}
    }
}

data class ReceiptCalculation(val gross:Long,val discount:Long,val reward:JsonObject?=null) { val net get()=gross-discount }
internal fun Purchase.normalizedReceipt(): Purchase {
    val detail = description?.trim()?.takeIf { it.isNotEmpty() }
    need(detail == null || (detail.length <= 160 && detail.none { it.isISOControl() }),
        "INVALID_PURCHASE_DESCRIPTION", "Escribe el detalle de la venta en una sola línea de hasta 160 caracteres.")
    return copy(receipt = receipt.trim().uppercase(java.util.Locale.ROOT), description = detail)
}

fun Purchase.idempotencyPayload():String {
    val encoded=JsonObject(json.parseToJsonElement(json.encodeToString(this)).jsonObject.filterKeys {
        (it != "expectedEarningReview" || expectedEarningReview != null) && (it != "description" || description != null)
    })
    // Keep the pre-v010 hash for an unchanged legacy request, including in-flight retries.
    val legacy=items.isEmpty() && programIds==null && rewardId==null && expectedRevision==null && expectedRewardVersion==null && !identityVerified && !customerConfirmed && expectedEarningReview==null
    return if(legacy)JsonObject(encoded.filterKeys{it in setOf("memberId","branchId","receipt","amountMinor","currency","description")}).toString()else encoded.toString()
}
fun LoyaltyService.prepareReceipt(c:Connection,s:Staff,p:Purchase):ReceiptCalculation {
    need(p.items.size<=30 && p.items.sumOf{it.quantity}<=500,"TOO_MANY_ITEMS","Máximo 30 líneas y 500 unidades por comprobante.")
    p.items.forEach{it.validate()};p.programIds?.forEach(::uuid)
    val gross=if(p.items.isEmpty())p.amountMinor else p.items.sumOf{it.total}
    need(gross in 1..1_000_000_000,"INVALID_AMOUNT","Revisa el total de los productos.")
    if(p.rewardId==null)return ReceiptCalculation(gross,0)
    need(p.items.isNotEmpty(),"ITEMS_REQUIRED","Detalla los productos para aplicar el descuento.")
    need(p.identityVerified && p.customerConfirmed,"CUSTOMER_CONFIRMATION_REQUIRED","Verifica al titular y confirma el premio solicitado.")
    val revision=c.one("SELECT revision FROM members WHERE tenant_id=? AND id=?",s.tenant,p.memberId){it.getLong(1)}
    need(revision==p.expectedRevision,"CARD_CHANGED","La tarjeta cambió. Busca al cliente otra vez.",409)
    val reward=c.one("SELECT * FROM rewards WHERE tenant_id=? AND id=? AND active FOR SHARE",s.tenant,uuid(p.rewardId)) {
        obj("id" to it.getString("id"),"programId" to it.getString("program_id"),"name" to it.getString("name"),"cost" to it.getLong("cost"),"version" to it.getInt("version"),"benefit" to it.getString("benefit")?.let{v->json.parseToJsonElement(v)})
    }?:throw Problem(404,"NOT_FOUND","Premio no disponible.")
    requireActivePromotion(c,s.tenant,reward.getValue("programId").jsonPrimitive.content,clock.instant())
    need(reward.getValue("version").jsonPrimitive.int==p.expectedRewardVersion,"REWARD_CHANGED","El premio cambió. Revisa sus condiciones.",409)
    need(reward["benefit"]!=JsonNull,"SEPARATE_REDEMPTION","Este premio se entrega desde Canjear un premio.")
    val benefit=json.decodeFromString<Benefit>(reward.getValue("benefit").toString());benefit.validate()
    val balance=c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",s.tenant,p.memberId,reward.getValue("programId").jsonPrimitive.content){it.getLong(1)}?:0
    need(balance>=reward.getValue("cost").jsonPrimitive.long,"INSUFFICIENT_BALANCE","Todavía no tiene saldo para este premio.",409)
    val discount=benefit.discount(p.items)
    need(discount>0,"DISCOUNT_TOO_SMALL","El descuento calculado es menor a un centavo.")
    return ReceiptCalculation(gross,discount,reward)
}

fun LoyaltyService.receiptQuote(s:Staff,input:Purchase):JsonObject {
    val p = input.normalizedReceipt()
    uuid(p.memberId); uuid(p.branchId); text(p.receipt,100); s.at(p.branchId)
    need(p.amountMinor in 0..1_000_000_000, "INVALID_AMOUNT", "Monto de compra inválido.")
    return db.tx { c ->authorizeStaff(c,s,required=purchaseOperations(p)); commercial.requireActive(c,s.tenant);branch(c,s.tenant,p.branchId);lockMember(c,s.tenant,p.memberId)
        val tenant = c.one("SELECT currency,timezone FROM tenants WHERE id=?",s.tenant) { it.getString(1) to ZoneId.of(it.getString(2)) }!!
        need(p.currency == tenant.first, "CURRENCY_MISMATCH", "La moneda debe coincidir con la del negocio.")
        val calculated = prepareReceipt(c,s,p)
        val review = purchaseReview(c,s,p,calculated,clock.instant(),tenant.second)
        obj("grossMinor" to calculated.gross,"discountMinor" to calculated.discount,"amountMinor" to calculated.net,
            "rewardName" to calculated.reward?.get("name"), "currency" to p.currency, "description" to p.description,
            "earnings" to review.entries, "earningReview" to review.fingerprint,
            "note" to "La compra contará en el historial. Solo acumulan las promociones elegidas que cumplen sus condiciones.")
    }
}

fun LoyaltyService.consumeReceiptReward(c:Connection,s:Staff,p:Purchase,r:ReceiptCalculation):String? {
    val reward=r.reward?:return null
    val redemption=id();val at=Timestamp.from(clock.instant());val program=reward.getValue("programId").jsonPrimitive.content
    val cost=reward.getValue("cost").jsonPrimitive.long
    c.exec("INSERT INTO redemptions(tenant_id,id,member_id,program_id,reward_id,reward_version,reward_name,cost,token_hash,status,expires_at,confirmed_branch_id,confirmed_actor_id,consumed_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,'CONSUMED',?,?,?,?,?)",
        s.tenant,redemption,p.memberId,program,p.rewardId,p.expectedRewardVersion,reward.getValue("name").jsonPrimitive.content,cost,Security.hash(Security.token()),at,p.branchId,s.id,at,at)
    ledger(c,s.tenant,p.memberId,program,-cost,"RESERVE",redemption)
    audit(c,s.tenant,s.id,"PURCHASE_REWARD_CONFIRMED",redemption)
    return redemption
}

/** Discounts earn no stamps in the redeemed program; other programs use the paid amount. */
fun Program.earnReceipt(p:Purchase,programId:String,r:ReceiptCalculation,at:Instant,zone:ZoneId):Long {
    // Proportional allocation prevents granting more cashback than the actual paid amount.
    return explainReceipt(p,programId,r,at,zone).amount
}

fun requireCounterReward(c:Connection,tenant:String,reward:String) {
    need(c.one("SELECT benefit IS NULL FROM rewards WHERE tenant_id=? AND id=?",tenant,reward){it.getBoolean(1)}!=false,
        "PURCHASE_REQUIRED","Este descuento se aplica al registrar los productos de la compra.",409)
}

fun LoyaltyService.createPromotion(s:Staff,input:PromotionTemplate,key:String):JsonObject {
    s.owner();input.validate()
    return db.tx{c->authorizeStaff(c,s); once(c,s.tenant,"promotion-template",key,json.encodeToString(input)){
        authorizeStaff(c,s); commercial.requireActive(c,s.tenant);input.branchIds.forEach{branch(c,s.tenant,it)}
        val pid=id();val rid=id();val group=input.group.trim()
        val program=Program(input.name.trim(),Kind.STAMPS,productGroup=group,countUnits=input.countUnits,window=input.window,branchIds=input.branchIds)
        val benefit=Benefit(input.percentBps,group,if(input.countUnits)"ITEM" else "BASKET")
        val reward=Reward(pid,input.rewardName.trim(),input.nth-1L,benefit=benefit)
        program.validate();benefit.validate()
        c.exec("INSERT INTO programs(tenant_id,id,kind,current_version) VALUES(?,?,'STAMPS',1)",s.tenant,pid)
        c.exec("INSERT INTO program_versions(tenant_id,program_id,version,config) VALUES(?,?,1,?::jsonb)",s.tenant,pid,json.encodeToString(program))
        c.exec("INSERT INTO rewards(tenant_id,id,program_id,name,cost,active,version,benefit) VALUES(?,?,?,?,?,true,1,?::jsonb)",s.tenant,rid,pid,reward.name,reward.cost,json.encodeToString(benefit))
        c.exec("INSERT INTO reward_versions(tenant_id,reward_id,version,config) VALUES(?,?,1,?::jsonb)",s.tenant,rid,json.encodeToString(reward))
        audit(c,s.tenant,s.id,"CREATE_PROMOTION_TEMPLATE",pid)
        obj("programId" to pid,"rewardId" to rid,"requiredPaidUnits" to reward.cost)
    }}
}

fun LoyaltyService.design(s:Staff)=db.tx{c->s.owner();c.one("SELECT version,config::text FROM wallet_designs WHERE tenant_id=?",s.tenant){obj("version" to it.getInt(1),"design" to json.parseToJsonElement(it.getString(2)))}?:obj("version" to 0,"design" to json.parseToJsonElement(json.encodeToString(WalletDesign())))}
fun LoyaltyService.saveDesign(s:Staff,input:WalletDesignChange):JsonObject {s.owner();input.design.validate();return db.tx{c->
    authorizeStaff(c,s); commercial.requireActive(c,s.tenant)
    input.design.featuredProgramId?.let{pid->need(c.one("SELECT id FROM programs WHERE tenant_id=? AND id=? AND deleted_at IS NULL",s.tenant,pid){it.getString(1)}!=null,"NOT_FOUND","Promoción no encontrada.",404)}
    input.design.featuredRewardId?.let { rid ->
        need(c.one("SELECT id FROM rewards WHERE tenant_id=? AND program_id=? AND id=?", s.tenant, input.design.featuredProgramId, rid) { it.getString(1) } != null,
            "NOT_FOUND", "El premio no pertenece a la promoción elegida.", 404)
    }
    c.rows("SELECT pg_advisory_xact_lock(hashtextextended(?,0))","design:${s.tenant}"){true}
    val version=c.one("SELECT version FROM wallet_designs WHERE tenant_id=?",s.tenant){it.getInt(1)}?:0
    need(version==input.expectedVersion,"VERSION_CONFLICT","El diseño cambió. Recarga antes de guardar.",409)
    c.exec("INSERT INTO wallet_designs(tenant_id,version,config) VALUES(?,?,?::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET version=excluded.version,config=excluded.config",s.tenant,version+1,json.encodeToString(input.design))
    queuePromotionCards(c,s.tenant)
    audit(c,s.tenant,s.id,"WALLET_DESIGN_UPDATED",s.tenant);obj("version" to version+1)
}}
fun LoyaltyService.savePreferences(s:Staff,memberId:String,input:CustomerPreferencesChange):JsonObject {s.owner();need(input.customerConfirmed,"CONSENT_REQUIRED","Confirma que el cliente autorizó estas preferencias.");input.preferences.validate();return db.tx{c->
    authorizeStaff(c,s); commercial.requireActive(c,s.tenant);lockMember(c,s.tenant,memberId);writePreferences(c,Member(s.tenant,memberId),input.preferences)
    changed(c,s.tenant,memberId);audit(c,s.tenant,s.id,"CUSTOMER_PREFERENCES_CONFIRMED",memberId);obj("saved" to true)
}}
fun LoyaltyService.writePreferences(c:Connection,m:Member,p:CustomerPreferences) {
    p.validate();c.exec("INSERT INTO member_preferences(tenant_id,member_id,birthday,marketing_consent,consent_at) VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,member_id) DO UPDATE SET birthday=excluded.birthday,marketing_consent=excluded.marketing_consent,consent_at=excluded.consent_at",m.tenant,m.id,p.birthday,p.marketingConsent,Timestamp.from(clock.instant()))
}
fun LoyaltyService.createCustomerEvent(s:Staff,e:CustomerEvent,key:String):JsonObject {s.owner();e.validate();return db.tx{c->authorizeStaff(c,s); once(c,s.tenant,"customer-event",key,json.encodeToString(e)){
    authorizeStaff(c,s); commercial.requireActive(c,s.tenant);val event=id();c.exec("INSERT INTO customer_events(tenant_id,id,title,body,starts_at,ends_at) VALUES(?,?,?,?,?,?)",s.tenant,event,e.title,e.body,Timestamp.from(Instant.parse(e.startsAt)),Timestamp.from(Instant.parse(e.endsAt)))
    audit(c,s.tenant,s.id,"CUSTOMER_EVENT_CREATED",event);obj("id" to event)
}}}
fun LoyaltyService.customerEvents(s:Staff)=db.tx{c->s.owner();obj("events" to c.rows("SELECT * FROM customer_events WHERE tenant_id=? ORDER BY starts_at DESC,id LIMIT 100",s.tenant){obj("id" to it.getString("id"),"title" to it.getString("title"),"body" to it.getString("body"),"startsAt" to it.instant("starts_at"),"endsAt" to it.instant("ends_at"),"active" to it.getBoolean("active"))})}
fun LoyaltyService.cancelCustomerEvent(s:Staff,eventId:String)=db.tx{c->s.owner();authorizeStaff(c,s); commercial.requireActive(c,s.tenant);need(c.exec("UPDATE customer_events SET active=false WHERE tenant_id=? AND id=?",s.tenant,uuid(eventId))==1,"NOT_FOUND","Evento no encontrado.",404);audit(c,s.tenant,s.id,"CUSTOMER_EVENT_CANCELLED",eventId);obj("saved" to true)}

fun LoyaltyService.customerInsights(s:Staff,offset:Int=0):JsonObject {s.owner();need(offset in 0..1000000,"INVALID_PAGE","Página inválida.");return db.tx{c->obj("offset" to offset,"customers" to c.rows("""
    SELECT m.id,m.name,m.created_at,p.visits,p.spent,p.last_at,p.first_at,r.claims
    FROM (SELECT * FROM members WHERE removed_at IS NULL) m LEFT JOIN LATERAL (SELECT count(*) AS visits,coalesce(sum(amount_minor),0) AS spent,max(created_at) AS last_at,min(created_at) AS first_at FROM purchases WHERE tenant_id=m.tenant_id AND member_id=m.id) p ON true
    LEFT JOIN LATERAL (SELECT count(*) AS claims FROM redemptions WHERE tenant_id=m.tenant_id AND member_id=m.id AND status='CONSUMED') r ON true
    WHERE m.tenant_id=? ORDER BY p.last_at DESC NULLS LAST,m.id LIMIT 50 OFFSET ?
    """.trimIndent(),s.tenant,offset){val visits=it.getLong("visits");val last=it.getTimestamp("last_at")?.toInstant();val first=it.getTimestamp("first_at")?.toInstant()
    obj("id" to it.getString("id"),"name" to it.getString("name"),"purchases" to visits,"returning" to (visits>1),"spentMinor" to it.getLong("spent"),"lastPurchase" to last,"averageDaysBetweenPurchases" to if(visits>1)Duration.between(first,last).toSeconds()/86400.0/(visits-1) else null,"claimedRewards" to it.getLong("claims"))})}}
fun LoyaltyService.customerDetail(s:Staff,memberId:String):JsonObject {s.owner();return db.tx{c->lockMember(c,s.tenant,memberId);obj(
    "rewardProgress" to customerRewardProgress(c,s.tenant,memberId),
    "preferences" to (c.one("SELECT birthday,marketing_consent FROM member_preferences WHERE tenant_id=? AND member_id=?",s.tenant,memberId){obj("birthday" to it.getString(1),"marketingConsent" to it.getBoolean(2))}?:obj("birthday" to null,"marketingConsent" to false)),
    "purchases" to c.rows("SELECT p.*,b.name AS branch_name FROM purchases p JOIN branches b ON b.tenant_id=p.tenant_id AND b.id=p.branch_id WHERE p.tenant_id=? AND p.member_id=? ORDER BY p.created_at DESC,p.id LIMIT 100",s.tenant,memberId){obj("id" to it.getString("id"),"at" to it.instant("created_at"),"paidMinor" to it.getLong("amount_minor"),"discountMinor" to it.getLong("discount_minor"),"branch" to it.getString("branch_name"),"description" to it.getString("description"),"items" to json.parseToJsonElement(it.getString("items")))},
    "rewards" to c.rows("SELECT reward_name,consumed_at FROM redemptions WHERE tenant_id=? AND member_id=? AND status='CONSUMED' ORDER BY consumed_at DESC,id LIMIT 100",s.tenant,memberId){obj("name" to it.getString(1),"at" to it.instant("consumed_at"))})}}
