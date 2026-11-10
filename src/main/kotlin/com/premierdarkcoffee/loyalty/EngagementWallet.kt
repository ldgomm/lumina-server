package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.ZoneId
import java.awt.RenderingHints
import java.awt.image.BufferedImage
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO

fun walletDesign(c:Connection,tenant:String):WalletDesign=c.one("SELECT config::text FROM wallet_designs WHERE tenant_id=?",tenant){json.decodeFromString<WalletDesign>(it.getString(1))}?:WalletDesign()
fun WalletPass.design():WalletDesign=snapshot["design"]?.let{json.decodeFromString<WalletDesign>(it.toString())}?:WalletDesign()
fun walletEngagement(c:Connection,member:Member,at:Instant,canOperate:Boolean=true):JsonObject {
    val design=walletDesign(c,member.tenant)
    val zone=c.one("SELECT timezone FROM tenants WHERE id=?",member.tenant){ZoneId.of(it.getString(1))}!!
    val preferences=c.one("SELECT birthday,marketing_consent FROM member_preferences WHERE tenant_id=? AND member_id=?",member.tenant,member.id){CustomerPreferences(it.getString(1),it.getBoolean(2))}?:CustomerPreferences()
    val progress=c.rows("""
        SELECT r.id,r.name,r.cost,r.program_id,r.benefit,p.kind,coalesce(b.available,0) AS available
        FROM rewards r JOIN programs p ON p.tenant_id=r.tenant_id AND p.id=r.program_id
        LEFT JOIN balances b ON b.tenant_id=r.tenant_id AND b.program_id=r.program_id AND b.member_id=?
        WHERE r.tenant_id=? AND r.active AND p.id IN (SELECT id FROM customer_programs WHERE tenant_id=p.tenant_id) ORDER BY r.program_id,r.cost,r.id LIMIT 20
    """.trimIndent(),member.id,member.tenant){val available=it.getLong("available");val cost=it.getLong("cost");val remaining=maxOf(0,cost-available)
        val unit=when(it.getString("kind")){"STAMPS"->if(remaining==1L)"sello" else "sellos";"POINTS"->if(remaining==1L)"punto" else "puntos";else->"centavos de cashback"}
        val message=if(remaining==0L)"Ya puedes canjear: ${it.getString("name")}" else "Te ${if(remaining==1L)"falta" else "faltan"} $remaining $unit para ${it.getString("name")}"
        obj("id" to it.getString("id"),"name" to it.getString("name"),"programId" to it.getString("program_id"),"goal" to cost,"available" to available,"remaining" to remaining,"kind" to it.getString("kind"),"message" to message,"benefitText" to rewardBenefitDescription(it.getString("benefit")))
    }
    val announcements=mutableListOf<JsonObject>()
    if(canOperate && preferences.marketingConsent){
        val day = at.atZone(zone).toLocalDate()
        if(preferences.celebrates(day))birthdayAnnouncement(c,member,design,day,at)?.let { announcements += it }
        announcements+=c.rows("SELECT id,title,body FROM customer_events WHERE tenant_id=? AND active AND starts_at<=? AND ends_at>? ORDER BY starts_at DESC,id LIMIT 4",member.tenant,Timestamp.from(at),Timestamp.from(at)){obj("id" to it.getString(1),"title" to it.getString(2),"body" to it.getString(3))}
    }
    val version=c.one("SELECT version FROM wallet_designs WHERE tenant_id=?",member.tenant){it.getInt(1)}?:0
    val currency=c.one("SELECT currency FROM tenants WHERE id=?",member.tenant){it.getString(1)}!!
    val earningRules=if(!canOperate)emptyList() else c.rows("SELECT p.id,v.config::text FROM customer_programs p JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version WHERE p.tenant_id=? ORDER BY p.id",member.tenant){
        val program=json.decodeFromString<Program>(it.getString(2))
        obj("programId" to it.getString(1),"programName" to program.name,"kind" to program.kind.name,"text" to walletEarningRules(program,currency,zone))
    }
    return obj("design" to json.parseToJsonElement(json.encodeToString(design)),"designVersion" to version,"rewardProgress" to progress,"announcements" to announcements,"earningRules" to earningRules)
}
fun WalletPass.googleBrand(origin:String):JsonObject {
    val design=design();val name=design.displayName.ifBlank{snapshot.getValue("businessName").jsonPrimitive.content}
    val logo=if(design.logoPng==null)"$origin/wallet/logo.png" else "$origin/wallet/brand/${snapshot.getValue("slug").jsonPrimitive.content}/logo.png?v=${Security.hash(design.logoPng).take(16)}"
    // Google requires resubmitting the review state when an approved class changes.
    return obj("classTemplateInfo" to googleWalletTemplate(design.composition,design.frontFocus),"reviewStatus" to "UNDER_REVIEW","programName" to name,"hexBackgroundColor" to design.background,"programLogo" to obj("sourceUri" to obj("uri" to logo),"contentDescription" to obj("defaultValue" to obj("language" to "es","value" to name))))
}
fun WalletPass.progressFields():List<JsonObject> = snapshot["rewardProgress"]?.jsonArray.orEmpty().map { value ->
    val p=value.jsonObject;val goal=p.getValue("goal").jsonPrimitive.long;val amount=p.getValue("available").jsonPrimitive.long
    val stamps=if(p.getValue("kind").jsonPrimitive.content=="STAMPS" && goal<=20) "\n"+design().stampSymbol.repeat(minOf(amount,goal).toInt())+"○".repeat(maxOf(0,goal-amount).toInt()) else ""
    val field=obj("key" to "reward_${p.getValue("id").jsonPrimitive.content}","label" to p.getValue("name"),"value" to (p.getValue("message").jsonPrimitive.content+stamps))
    // Account progress only; birthday and marketing text never use an Apple change message.
    if(snapshot["canOperate"]?.jsonPrimitive?.booleanOrNull!=false && p.getValue("remaining").jsonPrimitive.long<=1 && p.getValue("kind").jsonPrimitive.content=="STAMPS")JsonObject(field+obj("changeMessage" to "%@"))else field
}
fun WalletPass.announcementFields():List<JsonObject> = snapshot["announcements"]?.jsonArray.orEmpty().map{val a=it.jsonObject;obj("key" to "notice_${a.getValue("id").jsonPrimitive.content}","label" to a.getValue("title"),"value" to a.getValue("body"))}
fun WalletPass.brandLogo(scale:Int):ByteArray {
    val data=design().logoPng?:return walletLogo(36*scale)
    val input=ImageIO.read(ByteArrayInputStream(validateWalletLogo(data)))
    val ratio=minOf(160.0*scale/input.width,36.0*scale/input.height)
    val result=BufferedImage(maxOf(1,(input.width*ratio).toInt()),maxOf(1,(input.height*ratio).toInt()),BufferedImage.TYPE_INT_ARGB)
    val g=result.createGraphics();try{g.setRenderingHint(RenderingHints.KEY_INTERPOLATION,RenderingHints.VALUE_INTERPOLATION_BICUBIC);g.drawImage(input,0,0,result.width,result.height,null)}finally{g.dispose()}
    return ByteArrayOutputStream().also{ImageIO.write(result,"png",it)}.toByteArray()
}
