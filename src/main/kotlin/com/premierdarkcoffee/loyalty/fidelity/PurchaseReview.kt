package com.premierdarkcoffee.loyalty.fidelity

import com.premierdarkcoffee.loyalty.campaigns.blackFridayAvailable
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.marketing.ReceiptCalculation
import com.premierdarkcoffee.loyalty.marketing.idempotencyPayload
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text

import kotlinx.serialization.json.*
import java.sql.Connection
import java.time.Instant
import java.time.ZoneId

/** The quote and the write use the same calculation. A review never grants a benefit. */
internal data class ReceiptEarning(val amount: Long, val eligiblePaid: Long, val reason: String)

internal fun Program.explainReceipt(p: Purchase, programId: String, receipt: ReceiptCalculation, at: Instant, zone: ZoneId): ReceiptEarning {
    if (p.programIds != null && programId !in p.programIds) return ReceiptEarning(0, 0, "NOT_SELECTED")
    if (!active) return ReceiptEarning(0, 0, "PAUSED")
    if (!blackFridayAvailable(at)) return ReceiptEarning(0, 0, "OUTSIDE_WINDOW")
    if (receipt.reward?.get("programId")?.jsonPrimitive?.content == programId) return ReceiptEarning(0, 0, "REDEEMED_PROGRAM")
    val matches = p.items.filter { productGroup.isBlank() || it.group.equals(productGroup, true) }
    if ((productGroup.isNotBlank() || countUnits) && matches.isEmpty()) return ReceiptEarning(0, 0, "PRODUCTS_REQUIRED")
    val eligibleGross = if (p.items.isEmpty()) receipt.gross else matches.sumOf { it.total }
    val paid = eligibleGross * receipt.net / receipt.gross
    if (branchIds.isNotEmpty() && p.branchId !in branchIds) return ReceiptEarning(0, paid, "OTHER_BRANCH")
    if (!window.matches(at, zone)) return ReceiptEarning(0, paid, "OUTSIDE_WINDOW")
    if (paid < minimumSpendMinor) return ReceiptEarning(0, paid, "MINIMUM_SPEND")
    val base = earn(paid, p.branchId, at, zone)
    val amount = if (countUnits) base * matches.sumOf { it.quantity } else base
    return ReceiptEarning(amount, paid, if (amount > 0) "EARNED" else "BELOW_UNIT")
}

internal data class PurchaseReview(val entries: List<JsonObject>, val fingerprint: String)

internal fun LoyaltyService.purchaseReview(c: Connection, staff: Staff, p: Purchase, receipt: ReceiptCalculation, at: Instant, zone: ZoneId): PurchaseReview {
    // Same lock order as purchase and promotion edits. Read immutable versions after locking parents.
    val versions = c.rows("SELECT id,current_version FROM programs WHERE tenant_id=? AND deleted_at IS NULL ORDER BY id FOR SHARE", staff.tenant) {
        it.getString(1) to it.getInt(2)
    }
    need(p.programIds == null || p.programIds.all { selected -> versions.any { it.first == selected } }, "NOT_FOUND", "Promoción no encontrada en este negocio.", 404)
    val entries = versions.filter { p.programIds == null || it.first in p.programIds }.map { (program, version) ->
        val config = c.one("SELECT config::text FROM program_versions WHERE tenant_id=? AND program_id=? AND version=?", staff.tenant, program, version) {
            json.decodeFromString<Program>(it.getString(1))
        }!!
        if (p.programIds?.contains(program) == true) need(config.active, "PROMOTION_PAUSED", "La promoción seleccionada está pausada. Actualiza las promociones de la compra.", 409)
        if (p.programIds?.contains(program) == true) need(config.blackFridayAvailable(at),"CAMPAIGN_ENDED","La campaña de Viernes Negro no está vigente. Actualiza las promociones de la compra.",409)
        val earning = config.explainReceipt(p, program, receipt, at, zone)
        obj("programId" to program, "version" to version, "name" to config.name, "kind" to config.kind,
            "amount" to earning.amount, "eligiblePaidMinor" to earning.eligiblePaid, "reason" to earning.reason,
            "minimumSpendMinor" to config.minimumSpendMinor, "productGroup" to config.productGroup)
    }
    val revision = c.one("SELECT revision FROM members WHERE tenant_id=? AND id=?", staff.tenant, p.memberId) { it.getLong(1) }!!
    val payload = p.copy(amountMinor = receipt.net, expectedEarningReview = null)
    val fingerprint = Security.hash(obj("purchase" to payload.idempotencyPayload(), "revision" to revision,
        "gross" to receipt.gross, "discount" to receipt.discount, "reward" to receipt.reward, "earnings" to entries).toString())
    return PurchaseReview(entries, fingerprint)
}
