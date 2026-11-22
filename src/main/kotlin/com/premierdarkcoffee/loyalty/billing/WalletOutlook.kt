package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Date
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/** The first partial month of an annual subscription is followed by full years. */
private fun periodInMonth(first:LocalDate, months:Int, month:LocalDate):LocalDate? {
    if(first>=month.plusMonths(1))return null
    if(first>=month)return first
    val anchor=if(first.dayOfMonth==1)first else nextCalendarCut(first)
    return month.takeIf { ChronoUnit.MONTHS.between(anchor,it)%months==0L }
}

private fun outlookLine(name:String,start:LocalDate,end:LocalDate,months:Int,unit:Long,branches:Long?,wallet:Long,other:Long,branchNames:List<String>) =
    obj("name" to name,"from" to start,"through" to end.minusDays(1),"months" to months,"unitMinor" to unit,
        "branchCount" to branches,"branchNames" to branchNames,"walletMinor" to wallet,"otherMinor" to other)

internal fun CommercialService.forecast(c:java.sql.Connection,tenant:String,day:LocalDate):JsonObject {
    val month=maxOf(day.withDayOfMonth(1),WALLET_PROMOTION_END)
    val cut=month.plusMonths(1)
    val roster=c.rows("SELECT b.name,(b.created_at AT TIME ZONE t.timezone) AS opened FROM branches b JOIN tenants t ON t.id=b.tenant_id WHERE b.tenant_id=? ORDER BY b.created_at,b.id",tenant) {
        it.getString(1) to it.getTimestamp(2).toLocalDateTime()
    }
    val revision=c.one("SELECT revision FROM wallet_catalog_calendars WHERE tenant_id=?",tenant){it.getLong(1)}?:0L
    val lines=mutableListOf<JsonObject>()
    val schedules=c.rows("""SELECT * FROM wallet_catalog_schedules WHERE tenant_id=? AND starts_on<?
        AND (ends_before IS NULL OR ends_before>?) ORDER BY starts_on,id""",tenant,Date.valueOf(cut),Date.valueOf(month)){
        CatalogSchedule(it.getString("id"),it.getString("name"),it.getDate("starts_on").toString(),it.getDate("ends_before")?.toString(),
            it.getLong("fee_minor"),it.getDate("bill_before").toString(),it.getBoolean("replaces_legacy"),it.getInt("months"),
            it.getLong("other_minor"),it.getDate("consent_on")?.toString(),it.getBoolean("per_branch"),it.getInt("initial_branches"))
    }
    for(row in schedules) {
        val activation=billingDate(row.startsOn)
        val start=periodInMonth(activation,row.months,month)?:continue
        val end=minOf(walletPeriodEnd(start,row.months),row.endsBefore?.let(::billingDate)?:LocalDate.MAX)
        if(start>=end || row.consentOn==null && (row.otherMinor==0L || end>billingDate(requireNotNull(row.billBefore))))continue
        // Only the old invoice coverage the real issuer preserves offsets this period.
        val covered=if(row.replacesLegacy && row.consentOn!=null)c.one("""SELECT max(period_end) FROM billing_invoices
            WHERE tenant_id=? AND wallet_due AND voided_at IS NULL AND period_start<? AND period_end>?
            AND (paid_minor>0 OR period_start<?)""",tenant,Date.valueOf(end),Date.valueOf(start),Date.valueOf(start)){it.getDate(1)?.toLocalDate()} else null
        val from=covered?.coerceIn(start,end)?:start
        val count=catalogBranchCount(c,tenant,row,start,activation)
        val names=when {
            !row.perBranch -> emptyList()
            start!=activation -> roster.filter { it.second<=start.atStartOfDay() }.map { it.first }
            roster.size.toLong()==count -> roster.map { it.first }
            else -> emptyList() // Older acceptances recorded a count, without individual IDs.
        }
        lines+=outlookLine(row.name,start,end,row.months,row.feeMinor-row.otherMinor,count.takeIf{row.perBranch},
            catalogWalletFee(row,start,end,from,count),periodFee(row.otherMinor,start,end,row.months),names)
    }
    val native=linkedMapOf<LocalDate,MembershipPlan>()
    val transfer=catalogTakesOver(c,tenant)
    val legacy=plan(c,tenant)
    legacy?.let { (plan,_,next) ->
        if(plan.recurring && plan.walletAgreement!=null)periodInMonth(next,plan.intervalMonths,month)?.let { start ->
            if(transfer==null || start<transfer)native[start]=plan
        }
    }
    c.rows("""SELECT o.starts_on,v.config::text FROM wallet_opening_periods o JOIN billing_plan_versions v
        ON v.tenant_id=o.tenant_id AND v.version=o.version WHERE o.tenant_id=? AND NOT o.billed AND o.starts_on>=? AND o.starts_on<?""",
        tenant,Date.valueOf(month),Date.valueOf(cut)){it.getDate(1).toLocalDate() to json.decodeFromString<MembershipPlan>(it.getString(2))}.forEach { (s,p)->native[s]=p }
    for((start,old) in native) {
        val agreement=old.walletAgreement?:continue
        if(billingDate(agreement.activationOn)<WALLET_PROMOTION_END)continue
        val branches=walletPeriodBranches(c,tenant,agreement,start)
        val end=walletPeriodEnd(start,old.intervalMonths)
        val amount=periodFee(Math.multiplyExact(old.feeMinor,branches.toLong()),start,end,old.intervalMonths)
        lines+=outlookLine(old.name,start,end,old.intervalMonths,old.feeMinor,branches.toLong(),amount,0,emptyList())
    }
    lines+=c.rows("SELECT * FROM wallet_branch_additions WHERE tenant_id=? AND cut_on=? ORDER BY from_on,branch_id",tenant,Date.valueOf(cut)){
        outlookLine("Alta de "+it.getString("branch_name"),it.getDate("from_on").toLocalDate(),it.getDate("ends_before").toLocalDate(),it.getInt("months"),
            it.getLong("unit_minor"),1L,it.getLong("amount_minor"),0,listOf(it.getString("branch_name")))
    }
    val history=roster.groupingBy { (_,opened) ->
        if(opened.toLocalTime()==java.time.LocalTime.MIDNIGHT)opened.toLocalDate() else opened.toLocalDate().plusDays(1)
    }.eachCount().map { (effective,count)->obj("on" to effective,"count" to count) }
    val legacyActive=legacy!=null && legacy.first.walletAgreement?.activationOn?.let(::billingDate)?.let{it in WALLET_PROMOTION_END..day}==true &&
        (transfer==null || day<transfer) && (legacy.first.recurring || legacy.first.walletEndsOn?.let(::billingDate)?.let{day<it}==true)
    return obj("branchHistory" to history,"legacyActive" to legacyActive,"cut" to cut,"due" to cut.withDayOfMonth(15),"revision" to revision,"branches" to roster.size,"lines" to lines)
}

@Serializable data class WalletBusinessList(val tenants:List<String>)

/** Look up lifetime activity in bounded batches. No customer identities leave the engine. */
fun CommercialService.firstPurchaseStates(input:WalletBusinessList):JsonObject = db.tx { c ->
    c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    need(input.tenants.size in 1..100,"INVALID_PAGE","Revisa el grupo de negocios.")
    val ids=input.tenants.map(::uuid).distinct()
    val businesses=c.rows("""SELECT t.id,a.state,EXISTS(SELECT 1 FROM purchases p WHERE p.tenant_id=t.id) AS purchased
        FROM tenants t JOIN business_access a ON a.tenant_id=t.id
        WHERE t.id IN (${ids.joinToString(","){"?"}})""",*ids.toTypedArray()){
        Triple(it.getString("id"),it.getString("state"),it.getBoolean("purchased"))
    }
    obj("rows" to businesses.map { (id,state,purchased) ->
        val active=!purchased && state=="ACTIVE" && effective(c,id,obj("state" to state),today(c,id))["effectiveState"]?.jsonPrimitive?.content=="ACTIVE"
        obj("tenant" to id,"purchased" to purchased,"active" to active)
    })
}

internal fun CommercialService.captureCut(c:java.sql.Connection,tenant:String,day:LocalDate) {
    val outlook=forecast(c,tenant,day)
    c.exec("""INSERT INTO wallet_cut_previews VALUES(?,?,?::jsonb,?)
        ON CONFLICT(tenant_id,cut_on) DO UPDATE SET lines=excluded.lines,observed_on=excluded.observed_on
        WHERE wallet_cut_previews.lines<>excluded.lines""",tenant,Date.valueOf(outlook.getValue("cut").jsonPrimitive.content),
        outlook.getValue("lines").toString(),Date.valueOf(day))
}

fun CommercialService.walletOutlook(tenant:String, requested:String?=null):JsonObject = db.tx { c ->
    c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
    val day=today(c,tenant)
    val upcoming=nextCalendarCut(maxOf(day,WALLET_PROMOTION_END))
    val cut=requested?.let(::billingDate)?:upcoming
    need(cut.dayOfMonth==1 && cut>=WALLET_PROMOTION_END.plusMonths(1) && cut<=upcoming,"INVALID_CUT","Selecciona un corte disponible.")
    val live=cut==upcoming
    val prior=if(!live)c.one("SELECT lines::text,observed_on FROM wallet_cut_previews WHERE tenant_id=? AND cut_on=?",tenant,Date.valueOf(cut)){
        json.parseToJsonElement(it.getString(1)).jsonArray to it.getDate(2).toLocalDate()
    } else null
    val outlook=if(live)forecast(c,tenant,day) else obj("cut" to cut,"due" to cut.withDayOfMonth(15),"revision" to 0,"lines" to (prior?.first?:JsonArray(emptyList())))
    if(requested==null)return@tx outlook
    val bills=c.rows("""SELECT id,description,amount_minor,paid_minor,voided_at FROM billing_invoices
        WHERE tenant_id=? AND wallet_due AND due_on>=? AND due_on<? ORDER BY description,id""",tenant,Date.valueOf(cut),Date.valueOf(cut.plusMonths(1))){
        obj("name" to it.getString("description"),"issued" to it.getLong("amount_minor"),"paid" to it.getLong("paid_minor"),"void" to (it.getTimestamp("voided_at")!=null))
    }
    JsonObject(outlook+obj("referenceAvailable" to (live||prior!=null),"observedOn" to (if(live)day else prior?.second),"bills" to bills))
}
