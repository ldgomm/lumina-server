package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.*
import com.premierdarkcoffee.loyalty.access.Security
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import java.sql.Connection
import java.sql.Date
import java.sql.Timestamp
import java.time.LocalDate
import java.time.temporal.ChronoUnit

@Serializable data class CatalogSchedule(val id: String, val name: String, val startsOn: String, val endsBefore: String? = null, val feeMinor: Long, val billBefore: String? = null, val replacesLegacy: Boolean = true, val months: Int = 1, val otherMinor: Long = 0, val consentOn: String? = null, val perBranch: Boolean = false, val initialBranches: Int = 1)
@Serializable data class CatalogCalendar(val companyId: String, val revision: Long, val entries: List<CatalogSchedule>, val trialActive: Boolean? = null)

fun nextCalendarCut(day: LocalDate): LocalDate = day.withDayOfMonth(1).plusMonths(1)
internal fun invoiceDate(start: LocalDate): LocalDate = nextCalendarCut(walletPaidFrom(start))
internal fun walletPeriodEnd(start:LocalDate,months:Int):LocalDate =
    if(start.dayOfMonth==1 && start>=WALLET_PROMOTION_END)start.plusMonths(months.toLong()) else nextCalendarCut(start)
internal fun periodFee(fee:Long, start:LocalDate, end:LocalDate, months:Int):Long {
    if(end==start.plusMonths(months.toLong()) && start.dayOfMonth==1)return fee
    val divisor=start.lengthOfMonth().toLong()*months
    return (Math.multiplyExact(fee,ChronoUnit.DAYS.between(start,end))+divisor/2)/divisor
}
fun calendarFee(fee: Long, start: LocalDate, end: LocalDate): Long {
    require(start <= end && end <= nextCalendarCut(start))
    val days = ChronoUnit.DAYS.between(start,end)
    return (Math.multiplyExact(fee,days) + start.lengthOfMonth()/2) / start.lengthOfMonth()
}

fun CommercialService.updateCalendar(tenant: String, calendar: CatalogCalendar) = db.tx { c ->
    lock(c,tenant)
    need(c.one("SELECT tenant_id FROM lumina_business_registrations WHERE company_id=?",uuid(calendar.companyId)){it.getString(1)}==tenant,
        "BUSINESS_MISMATCH","El calendario corresponde a otro negocio.",403)
    need(calendar.revision>0 && (calendar.entries.isNotEmpty() || calendar.trialActive!=null),"INVALID_CALENDAR","Revisa las fechas de la suscripción.")
    val ordered=calendar.entries.sortedWith(compareBy<CatalogSchedule>({it.startsOn},{it.endsBefore?: "9999"},{it.id}))
    val fingerprint=Security.hash(json.encodeToString(calendar.copy(entries=ordered)))
    val saved=c.one("SELECT revision,fingerprint FROM wallet_catalog_calendars WHERE tenant_id=?",tenant){it.getLong(1) to it.getString(2)}
    if(saved!=null && saved.first>=calendar.revision){
        need(saved.first!=calendar.revision || saved.second==fingerprint,"CALENDAR_CHANGED","La revisión recibida ya tiene otras condiciones.",409)
        return@tx obj("revision" to saved.first)
    }
    val ids=ordered.map{it.id}.toSet()
    val historical=c.rows("SELECT id FROM wallet_catalog_schedules WHERE tenant_id=?",tenant){it.getString(1)}
    need(ids.size==ordered.size && ids.containsAll(historical),"INCOMPLETE_CALENDAR","Faltan períodos de este negocio.",409)
    c.exec("INSERT INTO wallet_catalog_calendars(tenant_id,revision,fingerprint) VALUES(?,?,?) ON CONFLICT DO NOTHING",tenant,calendar.revision,fingerprint)
    var previousEnd:LocalDate?=null
    var hasCoverage=false
    for(entry in ordered) {
        val start=billingDate(entry.startsOn)
        val end=entry.endsBefore?.let(::billingDate)
        val billBefore=entry.billBefore?.let(::billingDate) ?: end ?: nextCalendarCut(start)
        need(billBefore>=start,"INVALID_CALENDAR","Revisa el período confirmado.")
        uuid(entry.id); text(entry.name,100)
        need(entry.months in setOf(1,12) && entry.otherMinor in 0..entry.feeMinor && entry.feeMinor in 0..1_000_000_000 && (end==null||end>=start),"INVALID_CALENDAR","Importe o fechas inválidos.")
        val consent=entry.consentOn?.let(::billingDate)
        need(consent==null || consent>=WALLET_PROMOTION_END && consent<=start && consent<=today(c,tenant),"CONSENT_REQUIRED","El dueño debe elegir su plan desde enero.",409)
        need(entry.initialBranches>=1,"INVALID_CALENDAR","Revisa las sucursales.")
        if(end!=start && consent!=null) {
            need(!hasCoverage || previousEnd!=null && start>=previousEnd,"OVERLAPPING_PERIOD","Wallet ya está incluida en estas fechas.",409)
            previousEnd=end
            hasCoverage=true
        }
        val saved = c.exec("""INSERT INTO wallet_catalog_schedules(tenant_id,id,name,starts_on,ends_before,next_start,fee_minor,bill_before,replaces_legacy,months,other_minor,split_confirmed,consent_on,per_branch,initial_branches)
            VALUES(?,?,?,?,?,?,?,?,?,?,?,TRUE,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET ends_before=excluded.ends_before,bill_before=excluded.bill_before,months=excluded.months,other_minor=excluded.other_minor,split_confirmed=TRUE,consent_on=excluded.consent_on
            WHERE (NOT wallet_catalog_schedules.split_confirmed OR (wallet_catalog_schedules.months=excluded.months AND wallet_catalog_schedules.other_minor=excluded.other_minor))
            AND (wallet_catalog_schedules.consent_on IS NULL OR wallet_catalog_schedules.consent_on=excluded.consent_on)
            AND wallet_catalog_schedules.per_branch=excluded.per_branch AND wallet_catalog_schedules.initial_branches=excluded.initial_branches
            AND wallet_catalog_schedules.replaces_legacy=excluded.replaces_legacy AND wallet_catalog_schedules.bill_before<=excluded.bill_before
            AND wallet_catalog_schedules.starts_on=excluded.starts_on AND wallet_catalog_schedules.fee_minor=excluded.fee_minor
            AND (wallet_catalog_schedules.ends_before IS NULL OR wallet_catalog_schedules.ends_before=excluded.ends_before OR
                 excluded.ends_before<wallet_catalog_schedules.ends_before OR wallet_catalog_schedules.ends_before>?)""",
            tenant,entry.id,entry.name,Date.valueOf(start),end?.let(Date::valueOf),Date.valueOf(start),entry.feeMinor,Date.valueOf(billBefore),entry.replacesLegacy,entry.months,entry.otherMinor,consent?.let(Date::valueOf),entry.perBranch,entry.initialBranches,Date.valueOf(today(c,tenant)))
        need(saved==1,"AGREEMENT_CHANGED","Las fechas del acuerdo ya cambiaron.",409)
    }
    c.exec("UPDATE wallet_catalog_calendars SET revision=?,fingerprint=?,trial_active=coalesce(?,trial_active) WHERE tenant_id=?",calendar.revision,fingerprint,calendar.trialActive,tenant)
    c.exec("UPDATE wallet_passes SET next_scan_at=least(next_scan_at,?) WHERE tenant_id=?",Timestamp.from(clock.instant()),tenant)
    sync(c,tenant,today(c,tenant))
    obj("revision" to calendar.revision)
}

private data class LegacyInvoice(val id:String,val start:LocalDate,val end:LocalDate,val paid:Long)

// A delayed handover can arrive after the former scheduler ran. Receipt-bearing periods keep their
// agreed coverage. Unpaid advances at or after the switch can be voided before issuing the new rate.
private fun CommercialService.uncoveredStart(c:Connection,tenant:String,start:LocalDate,end:LocalDate):LocalDate {
    val native=c.rows("""SELECT id,period_start,period_end,paid_minor FROM billing_invoices WHERE tenant_id=? AND wallet_due
        AND period_start<? AND period_end>? AND voided_at IS NULL ORDER BY period_start FOR UPDATE""",
        tenant,Date.valueOf(end),Date.valueOf(start)){LegacyInvoice(it.getString(1),it.getDate(2).toLocalDate(),it.getDate(3).toLocalDate(),it.getLong(4))}
    var uncovered=start
    for(invoice in native) {
        if(invoice.paid>0 || invoice.start<start) uncovered=maxOf(uncovered,minOf(end,invoice.end))
        else c.exec("UPDATE billing_invoices SET voided_at=?,void_reason=? WHERE tenant_id=? AND id=?",
            Timestamp.from(clock.instant()),"Reemplazado por el plan de Wallet aceptado para este período.",tenant,invoice.id)
    }
    return uncovered
}

internal fun catalogBranchCount(c:Connection,tenant:String,row:CatalogSchedule,start:LocalDate,activation:LocalDate):Long {
    if(!row.perBranch)return 1
    if(start==activation && row.consentOn==row.startsOn)return row.initialBranches.toLong()
    val count=c.one("SELECT count(*) FROM branches b JOIN tenants t ON t.id=b.tenant_id WHERE b.tenant_id=? AND b.created_at<=(?::date::timestamp AT TIME ZONE t.timezone)",tenant,Date.valueOf(start)){it.getLong(1)}!!
    return if(start==activation)maxOf(count,row.initialBranches.toLong()) else count
}

internal fun catalogWalletFee(row:CatalogSchedule,start:LocalDate,end:LocalDate,from:LocalDate,branches:Long):Long {
    if(from>=end || row.consentOn==null || start<billingDate(row.consentOn))return 0
    val fee=Math.multiplyExact(row.feeMinor-row.otherMinor,branches)
    if(from==start)return periodFee(fee,start,end,row.months)
    val days=ChronoUnit.DAYS.between(start,walletPeriodEnd(start,row.months))
    return (Math.multiplyExact(fee,ChronoUnit.DAYS.between(from,end))+days/2)/days
}

internal fun CommercialService.syncCatalog(c:Connection,tenant:String,today:LocalDate) {
    val rows=c.rows("""SELECT id,name,next_start,ends_before,fee_minor,bill_before,replaces_legacy,months,other_minor,consent_on,per_branch,initial_branches,starts_on FROM wallet_catalog_schedules
        WHERE tenant_id=? AND next_start<bill_before AND next_start<? AND (ends_before IS NULL OR next_start<ends_before) ORDER BY next_start,id""",
        tenant,Date.valueOf(today.withDayOfMonth(1))) {
        CatalogSchedule(it.getString(1),it.getString(2),it.getDate(3).toString(),it.getDate(4)?.toString(),it.getLong(5),it.getDate(6).toString(),it.getBoolean(7),it.getInt(8),it.getLong(9),it.getDate(10)?.toString(),it.getBoolean(11),it.getInt(12)) to it.getDate(13).toLocalDate()
    }
    if(rows.isEmpty())return
    val currency=c.one("SELECT currency FROM tenants WHERE id=?",tenant){it.getString(1)}!!
    for((row,activation) in rows) {
        var start=billingDate(row.startsOn)
        val limit=billingDate(requireNotNull(row.billBefore))
        val stop=row.endsBefore?.let(::billingDate)
        while(nextCalendarCut(start)<=today && start<limit && (stop==null || start<stop)) {
            val boundary=walletPeriodEnd(start,row.months)
            val end=minOf(stop?:boundary,boundary)
            if(end>limit)break // The portal has not committed the full coverage period yet.
            val due=Date.valueOf(nextCalendarCut(start).withDayOfMonth(15))
            val from=if(row.replacesLegacy && row.consentOn!=null && start>=WALLET_PROMOTION_END)uncoveredStart(c,tenant,start,end) else start
            val branches=catalogBranchCount(c,tenant,row,start,activation)
            val fee=catalogWalletFee(row,start,end,from,branches)
            val locations=if(row.perBranch) " · $branches "+(if(branches==1L)"sucursal" else "sucursales") else ""
            if(fee>0) c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,
                calendar_id,calendar_start,period_end,wallet_due,created_at) VALUES(?,?,?,?,?,?,?,?,?,TRUE,?)
                ON CONFLICT(tenant_id,calendar_id,calendar_start) WHERE calendar_id IS NOT NULL DO NOTHING""",
                tenant,id(),"${row.name} · Wallet · $from a ${end.minusDays(1)}$locations",fee,currency,due,
                row.id,Date.valueOf(start),Date.valueOf(end),Timestamp.from(clock.instant()))
            val other=periodFee(row.otherMinor,start,end,row.months)
            if(other>0)c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,
                services_calendar_id,calendar_start,period_end,wallet_due,created_at) VALUES(?,?,?,?,?,?,?,?,?,FALSE,?)
                ON CONFLICT(tenant_id,services_calendar_id,calendar_start) WHERE services_calendar_id IS NOT NULL DO NOTHING""",
                tenant,id(),"${row.name} · Otros servicios · $start a ${end.minusDays(1)}",other,currency,due,
                row.id,Date.valueOf(start),Date.valueOf(end),Timestamp.from(clock.instant()))
            start=end
        }
        c.exec("UPDATE wallet_catalog_schedules SET next_start=? WHERE tenant_id=? AND id=?",Date.valueOf(start),tenant,row.id)
    }
}

// A stopped or replaced agreement still owes its last earned period at its original rate.
internal fun CommercialService.retainEarnedPeriod(c:Connection,tenant:String,p:Triple<MembershipPlan,Int,LocalDate>,date:LocalDate) {
    if(p.first.walletAgreement?.activationOn?.let(::billingDate)?.let{it>=WALLET_PROMOTION_END}==true && p.first.recurring && p.third>=WALLET_PROMOTION_END && p.third<=date)
        c.exec("INSERT INTO wallet_opening_periods(tenant_id,starts_on,version) VALUES(?,?,?) ON CONFLICT DO NOTHING",tenant,Date.valueOf(p.third),p.second)
}
internal fun coveredUntil(p:Triple<MembershipPlan,Int,LocalDate>,today:LocalDate):LocalDate {
    if(!p.first.recurring)return p.first.walletEndsOn?.let(::billingDate)?:today
    val start=walletPaidFrom(p.third)
    return if(start>today)start else walletPeriodEnd(start,p.first.intervalMonths)
}
internal fun CommercialService.issueWalletPeriod(c:Connection,tenant:String,start:LocalDate,plan:MembershipPlan,version:Int) {
    if(start<WALLET_PROMOTION_END || plan.walletAgreement?.activationOn?.let(::billingDate)?.let{it>=WALLET_PROMOTION_END}!=true)return
    val end=walletPeriodEnd(start,plan.intervalMonths)
    val branches=plan.walletAgreement?.let{walletPeriodBranches(c,tenant,it,start)}?:1
    val fee=periodFee(Math.multiplyExact(branches.toLong(),plan.feeMinor),start,end,plan.intervalMonths)
    if(fee>0)c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,period_start,period_end,plan_version,created_at,wallet_due)
        SELECT ?,?,?,?,currency,?,?,?,?,?,TRUE FROM tenants WHERE id=? ON CONFLICT(tenant_id,period_start) DO NOTHING""",
        tenant,id(),"${plan.name} · $branches sucursal(es) · $start a ${end.minusDays(1)}",fee,Date.valueOf(invoiceDate(start).withDayOfMonth(15)),
        Date.valueOf(start),Date.valueOf(end),version,Timestamp.from(clock.instant()),tenant)
}
internal fun CommercialService.syncOpeningPeriods(c:Connection,tenant:String,today:LocalDate) {
    val rows=c.rows("""SELECT o.starts_on,o.version,v.config::text FROM wallet_opening_periods o
        JOIN billing_plan_versions v ON v.tenant_id=o.tenant_id AND v.version=o.version
        WHERE o.tenant_id=? AND NOT o.billed AND o.starts_on<? ORDER BY o.starts_on""",tenant,Date.valueOf(today.withDayOfMonth(1))) {
        Triple(it.getDate(1).toLocalDate(),it.getInt(2),json.decodeFromString<MembershipPlan>(it.getString(3)))
    }
    for((start,version,plan) in rows) {
        issueWalletPeriod(c,tenant,start,plan,version)
        c.exec("UPDATE wallet_opening_periods SET billed=TRUE WHERE tenant_id=? AND starts_on=?",tenant,Date.valueOf(start))
    }
}
