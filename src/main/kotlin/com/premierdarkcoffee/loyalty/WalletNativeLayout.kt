package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.JsonObject

/** Shared class layout: all private values are resolved from the customer's object. */
fun googleWalletTemplate(): JsonObject {
    fun item(path:String)=obj("firstValue" to obj("fields" to listOf(obj("fieldPath" to path))))
    val details=listOf("featured","earning","balances_0","balances_1","activity_0","activity_1","rewards_0","news_0","status","usage")
    return obj(
        "cardTemplateOverride" to obj("cardRowTemplateInfos" to listOf(
            obj("twoItems" to obj("startItem" to item("object.loyaltyPoints.balance"),"endItem" to item("object.secondaryLoyaltyPoints.balance"))),
            obj("oneItem" to obj("item" to item("object.textModulesData['headline']"))),
            obj("oneItem" to obj("item" to item("object.textModulesData['journey']")))
        )),
        "detailsTemplateOverride" to obj("detailsItemInfos" to details.map { obj("item" to item("object.textModulesData['$it']")) })
    )
}
