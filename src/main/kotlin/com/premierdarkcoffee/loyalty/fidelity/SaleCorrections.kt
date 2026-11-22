package com.premierdarkcoffee.loyalty.fidelity

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.infrastructure.persistence.*
import com.premierdarkcoffee.loyalty.marketing.*
import com.premierdarkcoffee.loyalty.shared.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.Instant
import java.time.ZoneId

@Serializable data class SaleCorrection(val version:Int,val reason:String,val amountMinor:Long,
    val items:List<PurchaseItem> = emptyList(),val review:String?=null,val description:String?=null)
private data class RecordedSale(val member:String,val branch:String,val receipt:String,val currency:String,val at:Instant,
    val gross:Long,val discount:Long,val items:List<PurchaseItem>,val redemption:String?,val review:JsonObject?,val zone:String,val description:String?)
private fun JsonObject.amount(key:String)=getValue(key).jsonPrimitive.long
private fun JsonObject.string(key:String)=getValue(key).jsonPrimitive.content
private fun saleValues(gross:Long,discount:Long,items:List<PurchaseItem>,benefits:List<JsonObject>,description:String?) =
    obj("description" to description,"paidMinor" to gross-discount,"grossMinor" to gross,"discountMinor" to discount,"items" to json.encodeToJsonElement(items),"benefits" to benefits)

fun LoyaltyService.correctSale(s:Staff,purchase:String,input:SaleCorrection,key:String?=null):JsonObject {
    s.owner();uuid(purchase)
    need(s.id!="platform","OWNER_REQUIRED","Solo el dueño puede corregir una venta.",403)
    val reason=input.reason.trim()
    need(reason.length in 3..250 && reason.none{it.isISOControl()},"INVALID_REASON","Indica el motivo de la corrección en 3 a 250 caracteres.")
    return db.tx{c->
        authorizeStaff(c,s,true)
        val work={
            commercial.requireActive(c,s.tenant)
            val sale=c.one("""SELECT p.*,t.timezone FROM purchases p JOIN tenants t ON t.id=p.tenant_id
                WHERE p.tenant_id=? AND p.id=? FOR UPDATE OF p""",s.tenant,purchase){
                RecordedSale(it.getString("member_id"),it.getString("branch_id"),it.getString("receipt"),it.getString("currency"),it.getTimestamp("created_at").toInstant(),
                    (it.getObject("gross_minor") as? Number)?.toLong() ?: it.getLong("amount_minor")+it.getLong("discount_minor"),it.getLong("discount_minor"),json.decodeFromString(it.getString("items")),it.getString("redemption_id"),
                    it.getString("review_programs")?.let{v->json.parseToJsonElement(v).jsonObject},it.getString("timezone"),it.getString("description"))
            }?:throw Problem(404,"NOT_FOUND","Comprobante no encontrado.")
            lockMember(c,s.tenant,sale.member)
            val last=c.one("SELECT version,updated::text FROM purchase_corrections WHERE tenant_id=? AND purchase_id=? ORDER BY version DESC LIMIT 1",s.tenant,purchase){
                it.getInt(1) to json.parseToJsonElement(it.getString(2)).jsonObject
            }
            val version=last?.first?:0
            need(input.version==version,"SALE_CHANGED","Esta venta ya se corrigió. Actualiza su historial.",409)
            need(input.items.size<=30 && input.items.sumOf{it.quantity.toLong()}<=500,"INVALID_ITEMS","Revisa la cantidad de productos.")
            input.items.forEach{it.validate()}
            need(input.items.isEmpty()==sale.items.isEmpty(),"SALE_ITEMS","Corrige las cantidades y precios del comprobante detallado.")
            val gross=if(input.items.isEmpty())input.amountMinor else input.items.sumOf{it.total}
            need(gross in 1..1_000_000_000 && (input.items.isEmpty()||input.amountMinor==gross),"INVALID_AMOUNT","Revisa el importe de la venta.")
            val reward=sale.redemption?.let{rid->c.one("""SELECT r.program_id,v.config::text FROM redemptions r JOIN reward_versions v
                ON v.tenant_id=r.tenant_id AND v.reward_id=r.reward_id AND v.version=r.reward_version WHERE r.tenant_id=? AND r.id=?""",s.tenant,rid){
                it.getString(1) to json.parseToJsonElement(it.getString(2)).jsonObject
            }?:throw Problem(409,"REWARD_UNAVAILABLE","Falta el registro del canje original.")}
            val discount=if(reward!=null){
                val benefit=reward.second["benefit"]?.takeUnless{it==JsonNull}?:throw Problem(409,"REWARD_UNAVAILABLE","Faltan las condiciones originales del descuento.")
                json.decodeFromJsonElement<Benefit>(benefit).discount(input.items).also{need(it>0,"INVALID_DISCOUNT","El premio debe seguir aplicándose a un producto de esta venta.")}
            }else 0
            val calc=ReceiptCalculation(gross,discount,reward?.let{obj("programId" to it.first)})
            val p=Purchase(sale.member,sale.branch,sale.receipt,calc.net,sale.currency,input.items,description=input.description?:sale.description).normalizedReceipt()
            need(gross!=sale.gross||input.items!=sale.items||p.description!=sale.description,"SALE_UNCHANGED","La venta ya tiene esos datos.")
            val original=sale.review?.get("programs")?.jsonArray?.map{it.jsonObject}?:c.rows("""SELECT l.program_id,coalesce(l.program_version,(SELECT min(v.version) FROM program_versions v WHERE v.tenant_id=l.tenant_id AND v.program_id=l.program_id HAVING count(*)=1)),l.delta FROM ledger l
                WHERE l.tenant_id=? AND l.reference_id=? AND l.kind='EARN' ORDER BY l.program_id""",s.tenant,purchase){obj("programId" to it.getString(1),"version" to it.getInt(2),"amount" to it.getLong(3))}
            val previous=last?.second?.get("benefits")?.jsonArray?.associate{it.jsonObject.string("programId") to it.jsonObject.amount("amount")}.orEmpty()
            val priorAmounts=mutableListOf<JsonObject>()
            val effects=original.map{row->
                val program=row.string("programId");val v=row.amount("version").toInt()
                val config=c.one("SELECT config::text FROM program_versions WHERE tenant_id=? AND program_id=? AND version=?",s.tenant,program,v){json.decodeFromString<Program>(it.getString(1))}
                    ?:throw Problem(409,"MISSING_PROMOTION_VERSION","Este comprobante antiguo carece de la versión original de la promoción. No se puede recalcular su saldo.")
                val before=previous[program]?:row.amount("amount")
                val after=config.explainReceipt(p,program,calc,sale.at,ZoneId.of(sale.review?.string("zone")?:sale.zone)).amount
                val balance=c.one("SELECT available FROM balances WHERE tenant_id=? AND member_id=? AND program_id=?",s.tenant,sale.member,program){it.getLong(1)}?:0L
                val fields=obj("programId" to program,"version" to v,"kind" to config.kind,"name" to config.name)
                priorAmounts+=JsonObject(fields+obj("amount" to before))
                JsonObject(fields+obj("amount" to after,"before" to before,"change" to after-before,"available" to balance))
            }
            val before=saleValues(sale.gross,sale.discount,sale.items,priorAmounts,sale.description)
            val after=saleValues(gross,discount,input.items,effects,p.description)
            val signature=Security.hash(obj("tenant" to s.tenant,"sale" to purchase,"version" to version,"reason" to reason,"after" to after).toString())
            val allowed=effects.all{it.amount("available")+it.amount("change")>=0}
            if(key!=null){
                need(input.review==signature,"SALE_CHANGED","Revisa otra vez el importe y los beneficios.",409)
                need(allowed,"BENEFITS_USED","Parte del beneficio ya se utilizó. La corrección dejaría un saldo negativo.",409)
                val correction=id()
                c.exec("INSERT INTO purchase_corrections(tenant_id,id,purchase_id,version,actor_id,reason,previous,updated,created_at) VALUES(?,?,?,?,?,?,?::jsonb,?::jsonb,?)",s.tenant,correction,purchase,version+1,s.id,reason,before.toString(),after.toString(),Timestamp.from(clock.instant()))
                effects.filter{it.amount("change")!=0L}.forEach{ledger(c,s.tenant,sale.member,it.string("programId"),it.amount("change"),"CORRECTION",correction,it.amount("version").toInt())}
                c.exec("UPDATE purchases SET amount_minor=?,gross_minor=?,discount_minor=?,items=?::jsonb,description=? WHERE tenant_id=? AND id=?",calc.net,gross,discount,json.encodeToString(input.items),p.description,s.tenant,purchase)
                changed(c,s.tenant,sale.member);audit(c,s.tenant,s.id,"CORRECT_PURCHASE",purchase)
            }
            obj("before" to before,"after" to after,"review" to signature,"canSave" to allowed,"historical" to (sale.review==null),"version" to (if(key==null)version else version+1))
        }
        if(key==null)work() else once(c,s.tenant,"correct-sale:"+s.id+":"+purchase,key,json.encodeToString(input),work)
    }
}
