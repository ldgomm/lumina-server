package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Connection
import java.text.Normalizer
import java.util.Locale

@Serializable data class PromotionExample(
    val id: String, val name: String, val method: String, val rewardName: String,
    val group: String = "", val nth: Int = 6, val percentBps: Int = 10000, val countUnits: Boolean = true,
    val unitMinor: Long = 100, val pointsPerUnit: Long = 1, val cost: Long = 100,
    val cashbackBps: Int = 500, val minimumSpendMinor: Long = 100
) {
    fun template() = PromotionTemplate(name,group,nth,percentBps,countUnits,rewardName)
    fun setup() = SimplePromotionSetup(Program(name,Kind.valueOf(method),unitMinor=unitMinor,pointsPerUnit=pointsPerUnit,
        cashbackBps=if(method=="CASHBACK")cashbackBps else 0,minimumSpendMinor=minimumSpendMinor),rewardName,cost)
    fun validate() {
        require(method in setOf("STAMPS","DISCOUNT","POINTS","CASHBACK"))
        if (method in setOf("STAMPS","DISCOUNT")) { template().validate();require((method=="STAMPS")== (percentBps==10000)) }
        else setup().validate()
    }
}
@Serializable data class BusinessCategory(val id:String,val name:String,val group:String,val aliases:List<String>,
    val productExamples:List<String>,val examples:List<PromotionExample>)

/** Suggestions only. Reading a catalog never creates, edits or activates a promotion. */
object BusinessCategories {
    val all: List<BusinessCategory> = json.decodeFromString<List<BusinessCategory>>(
        requireNotNull(javaClass.getResource("/business-categories.json")).readText()).also { categories ->
        require(categories.map{it.id}.distinct().size==categories.size && categories.any{it.id=="GENERAL"})
        require(categories.flatMap{it.examples}.map{it.id}.distinct().size==categories.sumOf{it.examples.size})
        categories.forEach { category ->
            require(category.id.matches(Regex("[A-Z_]+")) && category.productExamples.isNotEmpty())
            require(category.examples.isNotEmpty());category.examples.forEach{it.validate()}
        }
    }
    private val byId=all.associateBy{it.id}
    private fun normalized(value:String)=Normalizer.normalize(value.trim().lowercase(Locale.ROOT),Normalizer.Form.NFD)
        .replace(Regex("\\p{M}+"),"").replace(Regex("\\s+")," ")
    fun known(id:String)=id in byId
    private fun resolve(profile:BusinessProfile?):Pair<BusinessCategory,String> {
        byId[profile?.category]?.let { return it to "SELECTED" }
        val activity=normalized(profile?.activity.orEmpty())
        val matches=all.filter { category -> (category.aliases+category.name).any{normalized(it)==activity} }
        return if(matches.size==1)matches.single() to "ACTIVITY" else byId.getValue("GENERAL") to "GENERAL"
    }
    fun options()=obj("version" to 1,"categories" to all.map{obj("id" to it.id,"name" to it.name,"group" to it.group)})
    fun context(profile:BusinessProfile?):JsonObject {
        val (category,source)=resolve(profile)
        return obj("id" to category.id,"name" to category.name,"source" to source)
    }
    fun suggestions(profile:BusinessProfile?):JsonObject {
        val (category,_)=resolve(profile)
        return obj("version" to 1,"category" to context(profile),"productExamples" to category.productExamples,
            "examples" to category.examples.map{json.encodeToJsonElement(it)})
    }
}
internal fun promotionSuggestions(c:Connection,tenant:String):JsonObject {
    val profile=c.one("SELECT config::text FROM business_profiles WHERE tenant_id=?",tenant) {
        json.decodeFromString<BusinessProfile>(it.getString(1))
    }
    return BusinessCategories.suggestions(profile)
}
