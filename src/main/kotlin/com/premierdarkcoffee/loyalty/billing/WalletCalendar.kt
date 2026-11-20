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

@Serializable data class CatalogSchedule(val id: String, val name: String, val startsOn: String, val endsBefore: String? = null, val feeMinor: Long, val billBefore: String? = null, val replacesLegacy: Boolean = true)
@Serializable data class CatalogCalendar(val companyId: String, val revision: Long, val entries: List<CatalogSchedule>)

fun nextCalendarCut(day: LocalDate): LocalDate = day.withDayOfMonth(1).plusMonths(1)
internal fun invoiceDate(start: LocalDate): LocalDate = if(start.dayOfMonth==1) start else nextCalendarCut(start)
fun calendarFee(fee: Long, start: LocalDate, end: LocalDate): Long {
    require(start <= end && end <= nextCalendarCut(start))
    val days = ChronoUnit.DAYS.between(start,end)
    return (Math.multiplyExact(fee,days) + start.lengthOfMonth()/2) / start.lengthOfMonth()
}

fun CommercialService.updateCalendar(tenant: String, calendar: CatalogCalendar) = db.tx { c ->
    lock(c,tenant)
    need(c.one("SELECT tenant_id FROM lumina_business_registrations WHERE company_id=?",uuid(calendar.companyId)){it.getString(1)}==tenant,
        "BUSINESS_MISMATCH","El calendario corresponde a otro negocio.",403)
    need(calendar.revision>0 && calendar.entries.isNotEmpty(),"INVALID_CALENDAR","Revisa las fechas de la suscripción.")
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
    c.exec("INSERT INTO wallet_catalog_calendars VALUES(?,?,?) ON CONFLICT DO NOTHING",tenant,calendar.revision,fingerprint)
    var previousEnd:LocalDate?=null
    var hasCoverage=false
    for(entry in ordered) {
        val start=billingDate(entry.startsOn)
        val end=entry.endsBefore?.let(::billingDate)
        val billBefore=entry.billBefore?.let(::billingDate) ?: end ?: nextCalendarCut(start)
        need(billBefore>=start,"INVALID_CALENDAR","Revisa el período confirmado.")
        uuid(entry.id); text(entry.name,100)
        need(entry.feeMinor in 0..1_000_000_000 && (end==null||end>=start),"INVALID_CALENDAR","Importe o fechas inválidos.")
        if(end!=start) {
            need(!hasCoverage || previousEnd!=null && start>=previousEnd,"OVERLAPPING_PERIOD","Wallet ya está incluida en estas fechas.",409)
            previousEnd=end
            hasCoverage=true
        }
        val saved = c.exec("""INSERT INTO wallet_catalog_schedules(tenant_id,id,name,starts_on,ends_before,next_start,fee_minor,bill_before,replaces_legacy)
            VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,id) DO UPDATE SET ends_before=excluded.ends_before,bill_before=excluded.bill_before
            WHERE wallet_catalog_schedules.replaces_legacy=excluded.replaces_legacy AND wallet_catalog_schedules.bill_before<=excluded.bill_before
            AND wallet_catalog_schedules.starts_on=excluded.starts_on AND wallet_catalog_schedules.fee_minor=excluded.fee_minor
            AND (wallet_catalog_schedules.ends_before IS NULL OR wallet_catalog_schedules.ends_before=excluded.ends_before OR
                 excluded.ends_before<wallet_catalog_schedules.ends_before OR wallet_catalog_schedules.ends_before>?)""",
            tenant,entry.id,entry.name,Date.valueOf(start),end?.let(Date::valueOf),Date.valueOf(start),entry.feeMinor,Date.valueOf(billBefore),entry.replacesLegacy,Date.valueOf(today(c,tenant)))
        need(saved==1,"AGREEMENT_CHANGED","Las fechas del acuerdo ya cambiaron.",409)
    }
    c.exec("UPDATE wallet_catalog_calendars SET revision=?,fingerprint=? WHERE tenant_id=?",calendar.revision,fingerprint,tenant)
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

internal fun CommercialService.syncCatalog(c:Connection,tenant:String,today:LocalDate) {
    val rows=c.rows("""SELECT id,name,next_start,ends_before,fee_minor,bill_before,replaces_legacy FROM wallet_catalog_schedules WHERE tenant_id=?
        AND next_start<bill_before AND next_start<=? AND (ends_before IS NULL OR next_start<ends_before) ORDER BY next_start,id""", tenant,Date.valueOf(today.withDayOfMonth(1))) {
        CatalogSchedule(it.getString(1),it.getString(2),it.getDate(3).toString(),it.getDate(4)?.toString(),it.getLong(5),it.getDate(6).toString(),it.getBoolean(7))
    }
    if(rows.isEmpty())return
    val currency=c.one("SELECT currency FROM tenants WHERE id=?",tenant){it.getString(1)}!!
    for(row in rows) {
        var start=billingDate(row.startsOn)
        val stop=row.endsBefore?.let(::billingDate)
        while(invoiceDate(start)<=today && start<billingDate(requireNotNull(row.billBefore)) && (stop==null || start<stop)) {
            val cut=nextCalendarCut(start)
            val end=minOf(stop?:cut,cut)
            val from=if(row.replacesLegacy)uncoveredStart(c,tenant,start,end) else start
            val amount=if(from<end)calendarFee(row.feeMinor,from,end) else 0L
            if(amount>0) c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,
                calendar_id,calendar_start,period_end,wallet_due,created_at) VALUES(?,?,?,?,?,?,?,?,?,TRUE,?)
                ON CONFLICT(tenant_id,calendar_id,calendar_start) WHERE calendar_id IS NOT NULL DO NOTHING""",
                tenant,id(),"${row.name} · $from a ${end.minusDays(1)}",amount,currency,Date.valueOf(invoiceDate(start).withDayOfMonth(15)),
                row.id,Date.valueOf(start),Date.valueOf(end),Timestamp.from(clock.instant()))
            start=end
        }
        c.exec("UPDATE wallet_catalog_schedules SET next_start=? WHERE tenant_id=? AND id=?",Date.valueOf(start),tenant,row.id)
    }
}

internal fun CommercialService.syncOpeningPeriods(c:Connection,tenant:String,today:LocalDate) {
    val rows=c.rows("""SELECT o.starts_on,o.version,v.config::text FROM wallet_opening_periods o
        JOIN billing_plan_versions v ON v.tenant_id=o.tenant_id AND v.version=o.version
        WHERE o.tenant_id=? AND NOT o.billed AND o.starts_on<? ORDER BY o.starts_on""",tenant,Date.valueOf(today.withDayOfMonth(1))) {
        Triple(it.getDate(1).toLocalDate(),it.getInt(2),json.decodeFromString<MembershipPlan>(it.getString(3)))
    }
    for((start,version,plan) in rows){
        val cut=nextCalendarCut(start)
        val branches=walletPeriodBranches(c,tenant,requireNotNull(plan.walletAgreement),start)
        val divisor=start.lengthOfMonth().toLong()*plan.intervalMonths
        val fee=(branches*plan.feeMinor*ChronoUnit.DAYS.between(start,cut)+divisor/2)/divisor
        if(fee>0)c.exec("""INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,period_start,period_end,plan_version,created_at,wallet_due)
            SELECT ?,?,?,?,currency,?,?,?,?,?,TRUE FROM tenants WHERE id=? ON CONFLICT(tenant_id,period_start) DO NOTHING""",
            tenant,id(),"Wallet · $branches sucursal(es) · $start a ${cut.minusDays(1)}",fee,Date.valueOf(cut.withDayOfMonth(15)),
            Date.valueOf(start),Date.valueOf(cut),version,Timestamp.from(clock.instant()),tenant)
        c.exec("UPDATE wallet_opening_periods SET billed=TRUE WHERE tenant_id=? AND starts_on=?",tenant,Date.valueOf(start))
    }
}
