package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.JsonObject

/** Shared class layout: all private values are resolved from the customer's object. */
fun googleWalletTemplate(composition: String = "SIGNATURE", frontFocus: String = "AUTO"): JsonObject {
    require(composition in walletCompositions)
    require(frontFocus in setOf("AUTO", "PROGRESS", "REWARD"))
    fun item(path:String)=obj("firstValue" to obj("fields" to listOf(obj("fieldPath" to path))))
    fun one(path:String)=obj("oneItem" to obj("item" to item(path)))
    fun two(a:String,b:String)=obj("twoItems" to obj("startItem" to item(a),"endItem" to item(b)))
    val balance="object.loyaltyPoints.balance"
    val remaining="object.secondaryLoyaltyPoints.balance"
    val prize="object.textModulesData['headline']"
    val journey="object.textModulesData['journey']"
    val rows=when {
        frontFocus == "REWARD" -> listOf(one(prize),two(journey,remaining))
        frontFocus == "PROGRESS" -> listOf(one(journey),two(prize,remaining))
        else -> when(composition) {
        "STAMPBOOK" -> listOf(two(journey,prize))
        "ATELIER" -> listOf(two(prize,journey))
        "EDITORIAL", "TICKET", "RIBBON", "PANORAMA" -> listOf(one(prize),two(journey,remaining))
        "PATH" -> listOf(one(journey),two(prize,remaining))
        else -> listOf(two(balance,remaining),two(prize,journey))
        }
    }
    val details=listOf("featured","earning","balances_0","balances_1","activity_0","activity_1","rewards_0","news_0","status","usage")
    return obj(
        "cardTemplateOverride" to obj("cardRowTemplateInfos" to if(composition != "SIGNATURE" || frontFocus != "AUTO") rows else listOf(
            obj("twoItems" to obj("startItem" to item("object.loyaltyPoints.balance"),"endItem" to item("object.secondaryLoyaltyPoints.balance"))),
            obj("oneItem" to obj("item" to item("object.textModulesData['headline']"))),
            obj("oneItem" to obj("item" to item("object.textModulesData['journey']")))
        )),
        "detailsTemplateOverride" to obj("detailsItemInfos" to (details + if(composition == "SIGNATURE" && frontFocus == "AUTO") emptyList() else listOf("headline","journey")).map { obj("item" to item("object.textModulesData['$it']")) })
    )
}
