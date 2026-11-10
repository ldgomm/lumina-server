package com.premierdarkcoffee.loyalty.businesses

import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.text

import kotlinx.serialization.json.*
import org.junit.jupiter.api.Test
import kotlin.test.*

class BusinessCategoriesTest {
    private fun profile(activity:String="Cafetería",category:String="")=BusinessProfile("Empresa","1790012345001",activity,"Ana","ana@example.test","0991234567","Pichincha","Quito","Dirección",category=category)
    private fun selected(p:BusinessProfile?)=BusinessCategories.context(p).getValue("id").jsonPrimitive.content
    @Test fun `catalog has 42 distinct types and 168 complete editable examples`() {
        val all=BusinessCategories.all;assertEquals(42,all.size);assertEquals(168,all.sumOf{it.examples.size})
        assertEquals(all.size,all.map{it.id}.distinct().size)
        val ids=all.flatMap{it.examples}.map{it.id};assertEquals(ids.size,ids.distinct().size)
        all.forEach { category ->
            assertTrue(category.name.isNotBlank());assertTrue(category.productExamples.size>=3)
            category.examples.forEach { it.validate();assertTrue(it.rewardName.isNotBlank()) }
        }
    }
    @Test fun `explicit category wins over activity and generic is an intentional choice`() {
        assertEquals("CLOTHING",selected(profile(category="CLOTHING")))
        assertEquals("GENERAL",selected(profile(category="GENERAL")))
        assertEquals("SELECTED",BusinessCategories.context(profile(category="GENERAL")).getValue("source").jsonPrimitive.content)
    }
    @Test fun `legacy inference is exact accent insensitive and never based on partial words`() {
        assertEquals("CAFE",selected(profile("  CAFETERÍA  ")))
        assertEquals("BARBER",selected(profile("barbería")))
        assertEquals("CLOTHING",selected(profile("Tienda   de ropa")))
        for(text in listOf("Cafetería y pizzería","Reparación de cafeteras","Venta de todo",""))assertEquals("GENERAL",selected(profile(text)))
        assertEquals("GENERAL",selected(null))
    }
    @Test fun `unknown category is rejected while old profile JSON is accepted`() {
        assertEquals("INVALID_BUSINESS_CATEGORY",assertFailsWith<Problem>{profile(category="UNKNOWN").validate()}.code)
        assertEquals("CAFE",profile(category=" cafe ").normalized().category)
        val old=JsonObject(json.encodeToJsonElement(profile()).jsonObject.filterKeys{it!="category"})
        val decoded=json.decodeFromJsonElement<BusinessProfile>(old);decoded.validate();assertEquals("",decoded.category);assertEquals("CAFE",selected(decoded))
    }
    @Test fun `coffee suggestions contain no pizza hair or clothing examples`() {
        val s=BusinessCategories.suggestions(profile(category="CAFE"));val text=s.toString().lowercase()
        for(word in listOf("pizza","corte","cabello","ropa"))assertFalse(text.contains(word),word)
        assertEquals(listOf("cafe-1","cafe-2","cafe-points","cafe-cashback"),s.getValue("examples").jsonArray.map{it.jsonObject.getValue("id").jsonPrimitive.content})
        assertFalse(BusinessCategories.suggestions(profile(category="BARBER")).toString().contains("café"))
    }
    @Test fun `examples retain actual eligible units and can be changed before creating`() {
        val cafe=BusinessCategories.all.single{it.id=="CAFE"}.examples.first().template()
        assertEquals(6,cafe.nth);assertTrue(cafe.countUnits);assertEquals(10000,cafe.percentBps)
        val clothing=BusinessCategories.all.single{it.id=="CLOTHING"}.examples.first().template()
        assertFalse(clothing.countUnits);assertEquals(2000,clothing.percentBps)
        val changed=clothing.copy(name="Nombre propio",nth=4,percentBps=3500);changed.validate();assertEquals(4,changed.nth)
        val points=BusinessCategories.all.single{it.id=="CAFE"}.examples.single{it.method=="POINTS"}.setup().copy(rewardCost=200)
        points.validate();assertEquals(200,points.rewardCost)
    }
    @Test fun `picker exposes only category metadata and suggestions contain no fiscal data`() {
        val options=BusinessCategories.options().getValue("categories").jsonArray
        assertTrue(options.all{it.jsonObject.keys==setOf("id","name","group")})
        val p=profile();val s=BusinessCategories.suggestions(p).toString()
        for(secret in listOf(p.ruc,p.email,p.phone,p.legalName,p.address))assertFalse(s.contains(secret))
    }
}
