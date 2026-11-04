package com.premierdarkcoffee.loyalty

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
        commercial.requireActive(c, tenantId)
        val branchId = id()
        c.exec("INSERT INTO branches(tenant_id,id,name,code) VALUES(?,?,?,?)", tenantId, branchId, input.name.trim(), input.code.trim())
        audit(c, tenantId, "platform", "CREATE_BRANCH", branchId)
        obj("id" to branchId, "name" to input.name.trim(), "code" to input.code.trim())
    } }
}
