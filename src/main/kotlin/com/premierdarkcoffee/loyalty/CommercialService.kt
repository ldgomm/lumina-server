package com.premierdarkcoffee.loyalty

import kotlinx.serialization.encodeToString

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Date
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.*
import java.time.temporal.ChronoUnit
import java.util.Locale

/** Access locks always precede membership, invoice, member and program locks. */
class CommercialService(val db: Database, val clock: Clock = Clock.systemUTC()) {
    private fun stamp() = Timestamp.from(clock.instant())
    private fun today(c: Connection, tenant: String) = LocalDate.now(clock.withZone(ZoneId.of(
        c.one("SELECT timezone FROM tenants WHERE id=?", uuid(tenant)) { it.getString(1) }
            ?: throw Problem(404, "NOT_FOUND", "Negocio no encontrado.")
    )))
    private fun lock(c: Connection, tenant: String, exclusive: Boolean = true): JsonObject = c.one(
        "SELECT * FROM business_access WHERE tenant_id=? FOR " + if (exclusive) "UPDATE" else "SHARE", uuid(tenant)
    ) { obj("state" to it.getString("state"), "reason" to it.getString("reason"), "version" to it.getInt("version"), "changedAt" to it.instant("changed_at")) }
        ?: throw Problem(404, "NOT_FOUND", "Negocio no encontrado.")
    private fun plan(c: Connection, tenant: String) = c.one("SELECT config::text,version,next_on FROM billing_memberships WHERE tenant_id=?", tenant) {
        Triple(json.decodeFromString<MembershipPlan>(it.getString(1)), it.getInt(2), it.getDate(3).toLocalDate())
    }
    private fun audit(c: Connection, tenant: String, action: String, target: String) {
        c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at) VALUES(?,?,'platform',?,?,?)", id(), tenant, action, target, stamp())
    }
    private fun effective(c: Connection, tenant: String, access: JsonObject, date: LocalDate): JsonObject {
        val p = plan(c, tenant)
        val late = p != null && p.first.autoSuspend && (
            c.one("SELECT count(*) FROM billing_invoices WHERE tenant_id=? AND voided_at IS NULL AND paid_minor<amount_minor AND due_on<?", tenant, Date.valueOf(date.minusDays(p.first.graceDays.toLong()))) { it.getInt(1) }!! > 0 ||
            (p.first.recurring && p.first.feeMinor > 0 && p.third.plusDays((p.first.dueDays + p.first.graceDays).toLong()) < date)
        )
        val manual = access.getValue("state").jsonPrimitive.content
        return JsonObject(access + mapOf("effectiveState" to JsonPrimitive(if (manual == "ACTIVE" && late) "SUSPENDED" else manual),
            "overdueSuspension" to JsonPrimitive(manual == "ACTIVE" && late)))
    }
    fun requireActive(c: Connection, tenant: String) {
        val state = effective(c, tenant, lock(c, tenant, false), today(c, tenant))
        need(state.getValue("effectiveState").jsonPrimitive.content == "ACTIVE", "BUSINESS_SUSPENDED",
            "El negocio tiene pausadas las nuevas operaciones. Tu tarjeta e historial se conservan.", 423)
    }
    fun walletAccess(c: Connection, tenant: String): JsonObject = effective(c, tenant, lock(c, tenant, false), today(c, tenant))
    fun publicAccess(tenant: String): JsonObject = db.tx { c ->
        val state = effective(c, tenant, lock(c, tenant, false), today(c, tenant))
        obj("state" to state.getValue("effectiveState"), "canOperate" to (state.getValue("effectiveState").jsonPrimitive.content == "ACTIVE"))
    }
    private fun sync(c: Connection, tenant: String, date: LocalDate) {
        val p = plan(c, tenant) ?: return
        if (!p.first.recurring) return
        var next = p.third
        val currency = c.one("SELECT currency FROM tenants WHERE id=?", tenant) { it.getString(1) }!!
        var cycles = 0
        while (next <= date) {
            need(++cycles <= 1200, "BILLING_BACKLOG", "Revisa las fechas de membresía antes de continuar.", 409)
            val end = nextBillingDate(next, p.first.intervalMonths, p.first.anchorDay)
            c.exec("INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,period_start,period_end,plan_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,period_start) DO NOTHING",
                tenant, id(), p.first.name, p.first.feeMinor, currency, Date.valueOf(next.plusDays(p.first.dueDays.toLong())), Date.valueOf(next), Date.valueOf(end), p.second, stamp())
            next = end
        }
        if (next != p.third) c.exec("UPDATE billing_memberships SET next_on=? WHERE tenant_id=?", Date.valueOf(next), tenant)
    }
    fun sweep(): Int {
        // Tenant-local dates are evaluated inside sync; one failure cannot starve another business.
        val tenants = db.tx { c -> c.rows("SELECT tenant_id FROM billing_memberships WHERE (config->>'recurring')::boolean AND next_on <= ? ORDER BY next_on,tenant_id LIMIT 200", Date.valueOf(LocalDate.now(clock).plusDays(1))) { it.getString(1) } }
        var failures = 0
        tenants.forEach { tenant -> try { db.tx { c -> lock(c, tenant); sync(c, tenant, today(c, tenant)) } } catch (_: Exception) { failures++ } }
        return failures
    }
    private fun savePlan(c: Connection, tenant: String, input: MembershipPlan, version: Int) {
        val config = json.encodeToString(input)
        c.exec("INSERT INTO billing_plan_versions(tenant_id,version,config,created_at) VALUES(?,?,?::jsonb,?)", tenant, version, config, stamp())
        c.exec("INSERT INTO billing_memberships(tenant_id,version,config,next_on) VALUES(?,?,?::jsonb,?) ON CONFLICT(tenant_id) DO UPDATE SET version=excluded.version,config=excluded.config,next_on=excluded.next_on",
            tenant, version, config, Date.valueOf(billingDate(input.nextChargeOn)))
    }
    fun configure(tenant: String, input: MembershipChange): JsonObject = db.tx { c ->
        val access = lock(c, tenant); val date = today(c, tenant)
        input.plan.validate(date); sync(c, tenant, date)
        val current = plan(c, tenant)
        need(input.expectedVersion == (current?.second ?: 0), "VERSION_CONFLICT", "La membresía cambió. Recarga antes de editar.", 409)
        need(access.getValue("state").jsonPrimitive.content != "CLOSED" || !input.plan.recurring, "BUSINESS_CLOSED", "Reactiva el negocio antes de reiniciar la membresía.", 409)
        val last = c.one("SELECT max(period_start) FROM billing_invoices WHERE tenant_id=?", tenant) { it.getDate(1)?.toLocalDate() }
        need(last == null || billingDate(input.plan.nextChargeOn) > last, "DUPLICATE_PERIOD", "El próximo cargo debe ser posterior al último período emitido.", 409)
        val version = (current?.second ?: 0) + 1
        savePlan(c, tenant, input.plan, version); sync(c, tenant, date); audit(c, tenant, "BILLING_PLAN", version.toString())
        obj("version" to version)
    }
    fun changeAccess(tenant: String, input: AccessChange): JsonObject = db.tx { c ->
        need(input.state in setOf("ACTIVE", "SUSPENDED", "CLOSED"), "INVALID_STATE", "Estado inválido."); text(input.reason, 500)
        val access = lock(c, tenant)
        need(input.expectedVersion == access.getValue("version").jsonPrimitive.int, "VERSION_CONFLICT", "El estado cambió. Recarga antes de editar.", 409)
        sync(c, tenant, today(c, tenant))
        if (input.state == "CLOSED") plan(c, tenant)?.let { p ->
            if (p.first.recurring) savePlan(c, tenant, p.first.copy(recurring = false, nextChargeOn = p.third.toString()), p.second + 1)
        }
        c.exec("UPDATE business_access SET state=?,reason=?,version=version+1,changed_at=? WHERE tenant_id=?", input.state, input.reason.trim(), stamp(), tenant)
        c.exec("INSERT INTO business_access_history(tenant_id,version,state,reason,created_at) VALUES(?,?,?,?,?)", tenant, input.expectedVersion + 1, input.state, input.reason.trim(), stamp())
        audit(c, tenant, "BUSINESS_${input.state}", tenant)
        obj("state" to input.state, "version" to input.expectedVersion + 1)
    }
    private fun once(c: Connection, tenant: String, operation: String, key: String, payload: String, action: () -> JsonObject): JsonObject {
        need(key.matches(Regex("[A-Za-z0-9._:-]{8,100}")), "IDEMPOTENCY_REQUIRED", "Falta una clave única de operación.")
        // The tenant access row already serializes billing writes, including distinct keys.
        val previous = c.one("SELECT request_hash,response::text FROM idempotency WHERE tenant_id=? AND operation=? AND key=?", tenant, "billing:$operation", key) { it.getString(1) to it.getString(2) }
        val hash = Security.hash(payload)
        if (previous != null) {
            need(previous.first == hash, "IDEMPOTENCY_CONFLICT", "Esta clave ya se usó con otros datos.", 409)
            return JsonObject(json.parseToJsonElement(previous.second).jsonObject + ("replayed" to JsonPrimitive(true)))
        }
        val result = JsonObject(action() + ("replayed" to JsonPrimitive(false)))
        c.exec("INSERT INTO idempotency(tenant_id,operation,key,request_hash,response) VALUES(?,?,?,?,?::jsonb)", tenant, "billing:$operation", key, hash, result.toString())
        return result
    }
    fun charge(tenant: String, input: NewCharge, key: String): JsonObject = db.tx { c ->
        lock(c, tenant); text(input.description, 200)
        need(input.amountMinor in 1..1_000_000_000, "INVALID_AMOUNT", "Monto inválido.")
        val due = billingDate(input.dueOn); val date = today(c, tenant)
        need(due >= date.minusYears(1) && due <= date.plusYears(5), "INVALID_DATE", "Revisa la fecha de vencimiento.")
        once(c, tenant, "charge", key, json.encodeToString(input)) {
            val invoice = id(); val currency = c.one("SELECT currency FROM tenants WHERE id=?", tenant) { it.getString(1) }!!
            c.exec("INSERT INTO billing_invoices(tenant_id,id,description,amount_minor,currency,due_on,created_at) VALUES(?,?,?,?,?,?,?)", tenant, invoice, input.description.trim(), input.amountMinor, currency, Date.valueOf(due), stamp())
            audit(c, tenant, "BILLING_CHARGE", invoice); obj("id" to invoice)
        }
    }
    fun pay(tenant: String, input: RecordPayment, key: String): JsonObject = db.tx { c ->
        lock(c, tenant); uuid(input.invoiceId); text(input.reference, 100)
        need(input.amountMinor in 1..1_000_000_000 && input.method in setOf("TRANSFER", "CASH", "CARD", "OTHER"), "INVALID_PAYMENT", "Revisa el monto y el medio de pago.")
        val date = billingDate(input.paidOn); val today = today(c, tenant)
        need(date <= today && date >= today.minusYears(10), "INVALID_DATE", "El pago no puede tener una fecha futura.")
        val normalized = input.copy(reference = input.reference.trim().uppercase(Locale.ROOT))
        once(c, tenant, "payment", key, json.encodeToString(normalized)) {
            val invoice = c.one("SELECT amount_minor-paid_minor AS remaining,voided_at FROM billing_invoices WHERE tenant_id=? AND id=? FOR UPDATE", tenant, input.invoiceId) { it.getLong(1) to (it.getTimestamp(2) != null) }
                ?: throw Problem(404, "NOT_FOUND", "Cargo no encontrado.")
            need(!invoice.second && input.amountMinor <= invoice.first, "PAYMENT_EXCEEDS_BALANCE", "El cargo está anulado o el pago supera su saldo pendiente.", 409)
            need(c.one("SELECT id FROM billing_payments WHERE tenant_id=? AND reference=?", tenant, normalized.reference) { it.getString(1) } == null, "DUPLICATE_PAYMENT", "La referencia de pago ya está registrada; revisa el historial.", 409)
            val payment = id()
            c.exec("INSERT INTO billing_payments(tenant_id,id,invoice_id,amount_minor,reference,method,paid_on,created_at) VALUES(?,?,?,?,?,?,?,?)", tenant, payment, input.invoiceId, input.amountMinor, normalized.reference, input.method, Date.valueOf(date), stamp())
            c.exec("UPDATE billing_invoices SET paid_minor=paid_minor+? WHERE tenant_id=? AND id=?", input.amountMinor, tenant, input.invoiceId)
            audit(c, tenant, "BILLING_PAYMENT", payment); obj("id" to payment)
        }
    }
    fun reverse(tenant: String, payment: String, input: Correction, key: String): JsonObject = db.tx { c ->
        lock(c, tenant); uuid(payment); text(input.reason, 500)
        once(c, tenant, "reverse:$payment", key, json.encodeToString(input)) {
            val p = c.one("SELECT invoice_id,amount_minor FROM billing_payments WHERE tenant_id=? AND id=?", tenant, payment) { it.getString(1) to it.getLong(2) }
                ?: throw Problem(404, "NOT_FOUND", "Pago no encontrado.")
            need(c.one("SELECT payment_id FROM billing_reversals WHERE tenant_id=? AND payment_id=?", tenant, payment) { it.getString(1) } == null, "ALREADY_REVERSED", "Este pago ya fue revertido.", 409)
            c.exec("INSERT INTO billing_reversals(tenant_id,payment_id,reason,created_at) VALUES(?,?,?,?)", tenant, payment, input.reason.trim(), stamp())
            c.exec("UPDATE billing_invoices SET paid_minor=paid_minor-? WHERE tenant_id=? AND id=?", p.second, tenant, p.first)
            audit(c, tenant, "BILLING_REVERSAL", payment); obj("id" to payment)
        }
    }
    fun void(tenant: String, invoice: String, input: Correction, key: String): JsonObject = db.tx { c ->
        lock(c, tenant); uuid(invoice); text(input.reason, 500)
        once(c, tenant, "void:$invoice", key, json.encodeToString(input)) {
            val changed = c.exec("UPDATE billing_invoices SET voided_at=?,void_reason=? WHERE tenant_id=? AND id=? AND voided_at IS NULL AND paid_minor=0", stamp(), input.reason.trim(), tenant, invoice)
            need(changed == 1, "CANNOT_VOID", "El cargo no existe, ya fue anulado o tiene pagos activos.", 409)
            audit(c, tenant, "BILLING_VOID", invoice); obj("id" to invoice)
        }
    }
    fun notify(tenant: String, input: BusinessNotice, key: String): JsonObject = db.tx { c ->
        lock(c, tenant); text(input.title, 120); text(input.body, 2000)
        need(input.severity in setOf("INFO", "WARNING", "URGENT"), "INVALID_SEVERITY", "Prioridad inválida.")
        val expires = input.expiresOn?.let { billingDate(it) }
        need(expires == null || expires >= today(c, tenant), "INVALID_DATE", "El aviso no puede expirar antes de hoy.")
        once(c, tenant, "notice", key, json.encodeToString(input)) {
            val notice = id()
            c.exec("INSERT INTO business_notices(tenant_id,id,title,body,severity,expires_on,created_at) VALUES(?,?,?,?,?,?,?)", tenant, notice, input.title.trim(), input.body.trim(), input.severity, expires?.let { Date.valueOf(it) }, stamp())
            audit(c, tenant, "BUSINESS_NOTICE", notice); obj("id" to notice)
        }
    }
    fun acknowledge(s: Staff, notice: String): JsonObject { s.owner(); return db.tx { c ->
        need(c.one("SELECT id FROM business_notices WHERE tenant_id=? AND id=?", s.tenant, uuid(notice)) { it.getString(1) } != null, "NOT_FOUND", "Aviso no encontrado.", 404)
        c.exec("INSERT INTO business_notice_reads(tenant_id,notice_id,staff_id,read_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING", s.tenant, notice, s.id, stamp()); obj("ok" to true)
    } }
    private fun invoice(r: ResultSet, date: LocalDate): JsonObject {
        val amount = r.getLong("amount_minor"); val paid = r.getLong("paid_minor"); val due = r.getDate("due_on").toLocalDate(); val voided = r.getTimestamp("voided_at") != null
        val status = when { voided -> "VOID"; amount == paid -> "PAID"; due < date -> "OVERDUE"; paid > 0 -> "PARTIAL"; else -> "OPEN" }
        return obj("id" to r.getString("id"), "description" to r.getString("description"), "amountMinor" to amount, "paidMinor" to paid,
            "remainingMinor" to if (voided) 0 else amount - paid, "currency" to r.getString("currency"), "dueOn" to due.toString(), "status" to status,
            "periodStart" to r.getDate("period_start")?.toString(), "periodEnd" to r.getDate("period_end")?.toString(), "planVersion" to r.getObject("plan_version"),
            "voidReason" to r.getString("void_reason"), "createdAt" to r.instant("created_at"))
    }
    fun ownerAccount(s: Staff, offset: Int = 0): JsonObject { s.owner(); return account(s.tenant, s.id, offset) }
    fun account(tenant: String, staffId: String? = null, offset: Int = 0): JsonObject = db.tx { c ->
        need(offset in 0..1_000_000, "INVALID_PAGE", "Página inválida.")
        val access = lock(c, tenant); val date = today(c, tenant); sync(c, tenant, date)
        val p = plan(c, tenant)
        val business = c.one("SELECT * FROM tenants WHERE id=?", tenant) { obj("id" to tenant, "name" to it.getString("name"), "slug" to it.getString("slug"), "currency" to it.getString("currency"), "timezone" to it.getString("timezone"), "joinedAt" to it.instant("created_at"), "tenureDays" to maxOf(0, ChronoUnit.DAYS.between(it.instant("created_at").atZone(ZoneId.of(it.getString("timezone"))).toLocalDate(), date))) }!!
        val summary = c.one("SELECT coalesce(sum(amount_minor-paid_minor) FILTER(WHERE voided_at IS NULL),0) AS balance, coalesce(sum(amount_minor-paid_minor) FILTER(WHERE voided_at IS NULL AND due_on<?),0) AS overdue, min(due_on) FILTER(WHERE voided_at IS NULL AND amount_minor>paid_minor) AS next_due,count(*) AS total FROM billing_invoices WHERE tenant_id=?", Date.valueOf(date), tenant) {
            obj("balanceMinor" to it.getLong("balance"), "overdueMinor" to it.getLong("overdue"), "nextDueOn" to it.getDate("next_due")?.toString(), "invoiceCount" to it.getLong("total"))
        }!!
        val notices = c.rows("SELECT n.*,r.read_at FROM business_notices n LEFT JOIN business_notice_reads r ON r.tenant_id=n.tenant_id AND r.notice_id=n.id AND r.staff_id=? WHERE n.tenant_id=? AND (expires_on IS NULL OR expires_on>=?) ORDER BY created_at DESC,id DESC LIMIT 100", staffId, tenant, Date.valueOf(date)) {
            obj("id" to it.getString("id"), "title" to it.getString("title"), "body" to it.getString("body"), "severity" to it.getString("severity"), "read" to (it.getTimestamp("read_at") != null), "createdAt" to it.instant("created_at"))
        }
        obj("business" to business, "today" to date.toString(), "access" to effective(c, tenant, access, date), "summary" to summary,
            "membership" to p?.let { obj("version" to it.second, "plan" to json.encodeToJsonElement(it.first), "nextChargeOn" to it.third.toString(), "nextDueOn" to it.third.plusDays(it.first.dueDays.toLong()).toString()) },
            "invoices" to c.rows("SELECT * FROM billing_invoices WHERE tenant_id=? ORDER BY created_at DESC,id DESC LIMIT 100 OFFSET ?", tenant, offset) { invoice(it, date) },
            "payments" to c.rows("SELECT p.*,r.reason AS reversal_reason,r.created_at AS reversed_at FROM billing_payments p LEFT JOIN billing_reversals r ON r.tenant_id=p.tenant_id AND r.payment_id=p.id WHERE p.tenant_id=? ORDER BY p.created_at DESC,p.id DESC LIMIT 100 OFFSET ?", tenant, offset) {
                obj("id" to it.getString("id"), "invoiceId" to it.getString("invoice_id"), "amountMinor" to it.getLong("amount_minor"), "reference" to it.getString("reference"), "method" to it.getString("method"), "paidOn" to it.getDate("paid_on").toString(), "reversed" to (it.getTimestamp("reversed_at") != null), "reversalReason" to it.getString("reversal_reason")) },
            "paymentCount" to c.one("SELECT count(*) FROM billing_payments WHERE tenant_id=?", tenant) { it.getLong(1) }, "offset" to offset, "notices" to notices,
            "accessHistory" to c.rows("SELECT state,reason,created_at FROM business_access_history WHERE tenant_id=? ORDER BY version DESC LIMIT 50", tenant) { obj("state" to it.getString(1), "reason" to it.getString(2), "at" to it.getTimestamp(3).toInstant()) },
            "history" to c.rows("SELECT action,target_id,created_at FROM audit_events WHERE tenant_id=? AND (action LIKE 'BILLING_%' OR action LIKE 'BUSINESS_%') ORDER BY created_at DESC,id DESC LIMIT 50", tenant) { obj("action" to it.getString(1), "target" to it.getString(2), "at" to it.getTimestamp(3).toInstant()) })
    }
    fun businesses(query: String = "", offset: Int = 0): JsonObject = db.tx { c ->
        need(query.length <= 100 && offset in 0..1_000_000, "INVALID_PAGE", "Búsqueda inválida.")
        val q=normalizedSearch(query)
        val ids = c.rows("SELECT t.id FROM tenants t LEFT JOIN business_profiles p ON p.tenant_id=t.id WHERE position(? in translate(lower(concat_ws(' ',t.name,t.slug,p.config->>'ruc',p.config->>'legalName')),'áéíóúüñ','aeiouun'))>0 ORDER BY t.created_at DESC,t.id LIMIT 51 OFFSET ?",q,offset) { it.getString(1) }
        obj("items" to ids.take(50).map { tenant ->
            val date = today(c, tenant)
            // Dashboard reads do not generate charges. Detail/worker performs the synchronization.
            val a = effective(c, tenant, lock(c, tenant, false), date)
            c.one("SELECT t.*,p.config->>'ruc' AS ruc,p.config->>'legalName' AS legal_name,p.config->>'city' AS city, (SELECT count(*) FROM members WHERE tenant_id=t.id) AS clients FROM tenants t LEFT JOIN business_profiles p ON p.tenant_id=t.id WHERE t.id=?", tenant) { r ->
                val p = plan(c, tenant)
                obj("id" to tenant, "name" to r.getString("name"), "slug" to r.getString("slug"), "currency" to r.getString("currency"), "joinedAt" to r.instant("created_at"), "clients" to r.getLong("clients"), "state" to a.getValue("effectiveState"), "ruc" to r.getString("ruc"), "legalName" to r.getString("legal_name"), "city" to r.getString("city"),
                    "pendingProfileRequests" to c.one("SELECT count(*) FROM business_profile_requests WHERE tenant_id=? AND status='PENDING'",tenant) { it.getInt(1) },
                    "nextChargeOn" to if (p?.first?.recurring == true) p.third.toString() else null,
                    "balanceMinor" to c.one("SELECT coalesce(sum(amount_minor-paid_minor),0) FROM billing_invoices WHERE tenant_id=? AND voided_at IS NULL", tenant) { it.getLong(1) })
            }!!
        }, "nextOffset" to if (ids.size > 50) offset + 50 else null)
    }
    fun ownerMetrics(s: Staff, days: Int): JsonObject { s.owner(); return metrics(s.tenant, days) }
    fun metrics(tenant: String, days: Int): JsonObject = db.tx { c ->
        need(days in setOf(7, 30, 90, 365), "INVALID_WINDOW", "Elige 7, 30, 90 o 365 días.")
        c.exec("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        val date = today(c, tenant)
        val zone = c.one("SELECT timezone FROM tenants WHERE id=?", tenant) { it.getString(1) }!!
        val start = Timestamp.from(date.minusDays(days.toLong() - 1).atStartOfDay(ZoneId.of(zone)).toInstant()); val end = stamp()
        val previous = Timestamp.from(date.minusDays(days.toLong() * 2 - 1).atStartOfDay(ZoneId.of(zone)).toInstant())
        val counts = c.one("SELECT count(*) AS total, count(*) FILTER(WHERE created_at>=? AND created_at<=?) AS fresh, count(*) FILTER(WHERE created_at>=? AND created_at<?) AS previous FROM members WHERE tenant_id=?", start, end, previous, start, tenant) { Triple(it.getLong(1), it.getLong(2), it.getLong(3)) }!!
        val purchases = c.one("SELECT count(*),coalesce(sum(amount_minor),0),count(DISTINCT member_id) FROM purchases WHERE tenant_id=? AND created_at>=? AND created_at<=?", tenant, start, end) { Triple(it.getLong(1), it.getLong(2), it.getLong(3)) }!!
        val repeat = c.one("SELECT count(*) FROM (SELECT member_id FROM purchases WHERE tenant_id=? AND created_at>=? AND created_at<=? GROUP BY member_id HAVING count(*)>=2) p", tenant, start, end) { it.getLong(1) }!!
        val prior = c.one("SELECT count(*),coalesce(sum(amount_minor),0) FROM purchases WHERE tenant_id=? AND created_at>=? AND created_at<?",tenant,previous,start) { it.getLong(1) to it.getLong(2) }!!
        obj("days" to days, "from" to start.toInstant(), "through" to end.toInstant(), "fromDate" to date.minusDays(days.toLong() - 1).toString(), "throughDate" to date.toString(), "totalClients" to counts.first, "newClients" to counts.second, "previousNewClients" to counts.third,
            "growthPercent" to if (counts.third == 0L) null else (counts.second - counts.third) * 100.0 / counts.third,
            "purchases" to purchases.first, "salesMinor" to purchases.second, "activeClients" to purchases.third, "repeatClients" to repeat,
            "previousPurchases" to prior.first, "previousSalesMinor" to prior.second,
            "previousFromDate" to date.minusDays(days.toLong()*2-1).toString(), "previousThroughDate" to date.minusDays(days.toLong()).toString(),
            "branches" to c.rows("""
                SELECT b.id,b.name,coalesce(p.purchases,0),coalesce(p.sales,0),coalesce(p.clients,0),coalesce(r.claims,0)
                FROM branches b LEFT JOIN (
                    SELECT branch_id,count(*) AS purchases,sum(amount_minor) AS sales,count(DISTINCT member_id) AS clients
                    FROM purchases WHERE tenant_id=? AND created_at>=? AND created_at<=? GROUP BY branch_id
                ) p ON p.branch_id=b.id LEFT JOIN (
                    SELECT confirmed_branch_id,count(*) AS claims FROM redemptions
                    WHERE tenant_id=? AND status='CONSUMED' AND consumed_at>=? AND consumed_at<=? GROUP BY confirmed_branch_id
                ) r ON r.confirmed_branch_id=b.id WHERE b.tenant_id=? ORDER BY coalesce(p.sales,0) DESC,b.name,b.id LIMIT 50
            """.trimIndent(),tenant,start,end,tenant,start,end,tenant) { obj("id" to it.getString(1),"name" to it.getString(2),"purchases" to it.getLong(3),"salesMinor" to it.getLong(4),"clients" to it.getLong(5),"redemptions" to it.getLong(6)) },
            "categories" to c.rows("""
                SELECT min(item->>'group') AS category,sum((item->>'quantity')::bigint) AS units
                FROM purchases p CROSS JOIN LATERAL jsonb_array_elements(p.items) item
                WHERE p.tenant_id=? AND p.created_at>=? AND p.created_at<=? AND coalesce(item->>'group','')<>''
                GROUP BY lower(item->>'group') ORDER BY units DESC,category LIMIT 8
            """.trimIndent(),tenant,start,end) { obj("name" to it.getString(1),"units" to it.getLong(2)) },
            "topRewards" to c.rows("""
                SELECT reward_id,(array_agg(reward_name ORDER BY consumed_at DESC,id DESC))[1],count(*) AS claims
                FROM redemptions WHERE tenant_id=? AND status='CONSUMED' AND consumed_at>=? AND consumed_at<=?
                GROUP BY reward_id ORDER BY claims DESC,reward_id LIMIT 8
            """.trimIndent(),tenant,start,end) { obj("id" to it.getString(1),"name" to it.getString(2),"claims" to it.getLong(3)) },
            "repeatRate" to if (purchases.third == 0L) 0.0 else repeat * 100.0 / purchases.third,
            "redemptions" to c.one("SELECT count(*) FROM redemptions WHERE tenant_id=? AND status='CONSUMED' AND consumed_at>=? AND consumed_at<=?", tenant, start, end) { it.getLong(1) },
            "daily" to c.rows("SELECT (created_at AT TIME ZONE ?)::date AS day,count(*) AS purchases,count(DISTINCT member_id) AS clients,sum(amount_minor) AS sales FROM purchases WHERE tenant_id=? AND created_at>=? AND created_at<=? GROUP BY day ORDER BY day", zone, tenant, start, end) { obj("day" to it.getDate(1).toString(), "purchases" to it.getLong(2), "clients" to it.getLong(3), "salesMinor" to it.getLong(4)) })
    }
}
