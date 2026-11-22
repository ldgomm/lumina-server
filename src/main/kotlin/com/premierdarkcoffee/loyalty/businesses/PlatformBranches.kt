package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.billing.branchOffer
import com.premierdarkcoffee.loyalty.shared.need

import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.NewBranch
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.shared.uuid

import kotlinx.serialization.encodeToString

import kotlinx.serialization.json.JsonObject

/** These operations are only exposed behind the platform credential. */
fun LoyaltyService.platformBranches(tenantId: String): JsonObject = db.tx { c ->
    uuid(tenantId)
    val business = c.one("SELECT name,slug FROM tenants WHERE id=?", tenantId) { obj("id" to tenantId, "name" to it.getString(1), "slug" to it.getString(2)) }
        ?: throw Problem(404, "NOT_FOUND", "Negocio no encontrado.")
    obj("business" to business, "branches" to c.rows("SELECT id,name,code FROM branches WHERE tenant_id=? ORDER BY name,id", tenantId) {
        obj("id" to it.getString(1), "name" to it.getString(2), "code" to it.getString(3))
    })
}

fun LoyaltyService.platformNewBranch(tenantId: String, input: NewBranch, key: String): JsonObject {
    uuid(tenantId); text(input.name); text(input.code, 40)
    return db.tx { c -> once(c, tenantId, "platform-branch", key, json.encodeToString(input)) {
        commercial.lock(c,tenantId)
        commercial.requireActive(c, tenantId)
        need(commercial.branchOffer(c,tenantId)==null,"OWNER_REQUIRED","El dueño debe revisar el cargo de esta sucursal desde Administración.",403)
        val branchId = id()
        c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,?,?)", tenantId, branchId, input.name.trim(), input.code.trim())
        audit(c, tenantId, "platform", "CREATE_BRANCH", branchId)
        obj("id" to branchId, "name" to input.name.trim(), "code" to input.code.trim())
    } }
}
