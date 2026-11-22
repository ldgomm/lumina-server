package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.infrastructure.persistence.*
import com.premierdarkcoffee.loyalty.shared.*
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Date
import java.sql.Timestamp
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit

private data class BranchTerms(val key:String,val first:LocalDate,val stop:LocalDate?,val months:Int,val unit:Long,val openingSnapshot:Boolean,val fixed:Boolean=false)
internal fun CommercialService.branchOffer(c:Connection,tenant:String,excludeBranch:String?=null):JsonObject? {
    val day=today(c,tenant)
    if(day<WALLET_PROMOTION_END)return null
    val terms=c.one("""SELECT id,starts_on,consent_on,ends_before,months,fee_minor-other_minor AS rate,per_branch FROM wallet_catalog_schedules
        WHERE tenant_id=? AND consent_on IS NOT NULL AND starts_on<=? AND (ends_before IS NULL OR ends_before>?)
        ORDER BY starts_on DESC LIMIT 1""",tenant,Date.valueOf(day),Date.valueOf(day)){
        BranchTerms(it.getString("id"),it.getDate("starts_on").toLocalDate(),it.getDate("ends_before")?.toLocalDate(),it.getInt("months"),it.getLong("rate"),it.getDate("consent_on")==it.getDate("starts_on"),!it.getBoolean("per_branch"))
    } ?: run {
        if(catalogTakesOver(c,tenant)?.let{it<=day}==true)return null
        val current=plan(c,tenant)?.first?:return null
        val selected=current.walletAgreement?:return null
        val selectedStart=billingDate(selected.paidFrom)
        val effective=if(selectedStart<=day)current else c.one("""SELECT config::text FROM billing_plan_versions WHERE tenant_id=?
            AND config->'walletAgreement'->>'paidFrom'<=? ORDER BY version DESC LIMIT 1""",tenant,day.toString()){json.decodeFromString<MembershipPlan>(it.getString(1))}?:return null
        val agreement=effective.walletAgreement?:return null
        val first=billingDate(agreement.paidFrom)
        val end=effective.walletEndsOn?.let(::billingDate)
        if(billingDate(agreement.activationOn)<WALLET_PROMOTION_END||!effective.recurring&&(end==null||end<=day))return null
        val stop=listOfNotNull(end,selectedStart.takeIf{it>day}).minOrNull()
        BranchTerms(agreement.hash,first,stop,effective.intervalMonths,effective.feeMinor,agreement.paidFrom==agreement.activationOn)
    }
    if(terms.fixed||terms.unit<=0)return null
    val anchor=if(terms.first.dayOfMonth==1)terms.first else nextCalendarCut(terms.first)
    val start=if(day<anchor)terms.first else anchor.plusMonths(ChronoUnit.MONTHS.between(anchor,day.withDayOfMonth(1))/terms.months*terms.months)
    val regularEnd=walletPeriodEnd(start,terms.months)
    val end=minOf(terms.stop?:regularEnd,regularEnd)
    if(end<=day)return null
    // At the exact renewal instant the normal branch census already includes this location.
    val zone=c.one("SELECT timezone FROM tenants WHERE id=?",tenant){ZoneId.of(it.getString(1))}!!
    val inBase=(start!=terms.first || !terms.openingSnapshot) && clock.instant()==start.atStartOfDay(zone).toInstant()
    val denominator=if(start.dayOfMonth==1)ChronoUnit.DAYS.between(start,regularEnd) else start.lengthOfMonth().toLong()*terms.months
    val days=ChronoUnit.DAYS.between(day,end)
    val amount=(Math.multiplyExact(terms.unit,days)+denominator/2)/denominator
    val branchesAfter=1L+c.one("SELECT count(*) FROM branches WHERE tenant_id=? AND id IS DISTINCT FROM ?::text",tenant,excludeBranch){it.getLong(1)}!!
    val renewal=if(terms.stop==null||terms.stop>regularEnd)Math.multiplyExact(terms.unit,branchesAfter) else null
    val values=obj("inBase" to inBase,"branchesAfter" to branchesAfter,"renewalMinor" to renewal,"days" to days,"plan" to terms.key,"from" to day,"through" to end.minusDays(1),"cut" to nextCalendarCut(day),
        "amountMinor" to amount,"unitMinor" to terms.unit,"months" to terms.months)
    return JsonObject(values+("hash" to JsonPrimitive(Security.hash(tenant+values.toString()))))
}

internal fun CommercialService.recordBranchAddition(c:Connection,tenant:String,branch:String,name:String,actor:String,hash:String?) {
    val offer=branchOffer(c,tenant,branch)
    need(offer?.get("hash")?.jsonPrimitive?.content==hash,"BRANCH_QUOTE_CHANGED","Revisa el importe actualizado antes de crear la sucursal.",409)
    if(offer==null)return
    need(actor!="platform","OWNER_REQUIRED","El dueño debe aceptar el importe de la sucursal.",403)
    if(offer.getValue("inBase").jsonPrimitive.boolean){captureCut(c,tenant,today(c,tenant));return}
    fun value(key:String)=offer.getValue(key).jsonPrimitive.content
    c.exec("""INSERT INTO wallet_branch_additions(tenant_id,branch_id,branch_name,actor_id,plan_key,from_on,ends_before,cut_on,unit_minor,months,amount_minor)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)""",tenant,branch,name,actor,value("plan"),Date.valueOf(value("from")),Date.valueOf(billingDate(value("through")).plusDays(1)),
        Date.valueOf(value("cut")),value("unitMinor").toLong(),value("months").toInt(),value("amountMinor").toLong())
    captureCut(c,tenant,today(c,tenant))
}
internal fun CommercialService.issueBranchAdditions(c:Connection,tenant:String,day:LocalDate) {
    val rows=c.rows("SELECT * FROM wallet_branch_additions WHERE tenant_id=? AND cut_on<=? AND invoice_id IS NULL AND amount_minor>0 ORDER BY cut_on,branch_id FOR UPDATE",tenant,Date.valueOf(day)){
        obj("branch" to it.getString("branch_id"),"name" to it.getString("branch_name"),"from" to it.getDate("from_on"),"through" to it.getDate("ends_before").toLocalDate().minusDays(1),"cut" to it.getDate("cut_on"),"amount" to it.getLong("amount_minor"))
    }
    for(row in rows){
        fun value(key:String)=row.getValue(key).jsonPrimitive.content
        val invoice=id()
        c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,wallet_due,created_at)
           SELECT ?,?,?,?,currency,?,TRUE,? FROM tenants WHERE id=?""",tenant,invoice,"Sucursal "+value("name")+" · "+value("from")+" a "+value("through"),value("amount").toLong(),
           Date.valueOf(billingDate(value("cut")).withDayOfMonth(15)),Timestamp.from(clock.instant()),tenant)
        c.exec("UPDATE wallet_branch_additions SET invoice_id=? WHERE tenant_id=? AND branch_id=?",invoice,tenant,value("branch"))
    }
}
