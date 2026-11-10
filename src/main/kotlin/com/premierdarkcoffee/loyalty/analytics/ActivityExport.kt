package com.premierdarkcoffee.loyalty.analytics

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.application.key
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.need
import com.premierdarkcoffee.loyalty.shared.text

import kotlinx.serialization.json.*
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

internal fun csvCell(value: String): String {
    val cleaned=value.replace("\u0000","")
    val first=cleaned.trimStart { it.isWhitespace() || it.isISOControl() }.firstOrNull()
    val safe=if(first in listOf('=','+','-','@') || cleaned.firstOrNull() in listOf('\t','\r','\n')) "'"+cleaned else cleaned
    return "\""+safe.replace("\"","\"\"")+"\""
}

fun LoyaltyService.activityExport(s: Staff, q: ManagementQuery): String {
    s.owner()
    need(q.offset==0,"EXPORT_PAGE","La descarga incluye todas las páginas; elimina el desplazamiento.")
    val data=readManagementActivity(s.tenant,q,10001,s)
    need(data.getValue("total").jsonPrimitive.long<=10000,"EXPORT_TOO_LARGE","Hay más de 10 000 registros. Reduce las fechas o filtra una sucursal, responsable u operación para descargar el historial completo.",422)
    val business=data.getValue("business").jsonObject
    fun JsonObject.text(key:String)=get(key)?.jsonPrimitive?.contentOrNull?:""
    fun JsonObject.amount(key:String)=get(key)?.jsonPrimitive?.contentOrNull?.let { BigDecimal(it).movePointLeft(2).setScale(2).toPlainString() }?:""
    val zone=ZoneId.of(business.text("timezone"))
    val lines=mutableListOf(listOf("Fecha local","Zona horaria","Tipo","ID de operación","Responsable","ID de responsable","Nombre guardado al operar","Cliente","ID de cliente","Sucursal","Comprobante","Moneda","Total pagado","Descuento aplicado","Premio","Promoción","Costo del premio","Unidad del costo","Concepto","Motivo","Acumulación","Productos"))
    for(item in data.getValue("items").jsonArray){
        val e=item.jsonObject;val kind=e.text("kind");val unit=when(e.text("balanceKind")){"CASHBACK"->business.text("currency");"STAMPS"->"sellos";"POINTS"->"puntos";else->""}
        val earnings=(e["earnings"] as? JsonArray)?.joinToString(" | "){val a=it.jsonObject;a.text("name")+": "+(if(a.text("kind")=="CASHBACK")a.amount("amount")+" "+business.text("currency") else a.text("amount")+" "+if(a.text("kind")=="STAMPS")"sellos" else "puntos")}?:""
        val products=(e["items"] as? JsonArray)?.joinToString(" | "){val a=it.jsonObject;a.text("quantity")+" × "+a.text("name")+" @ "+a.amount("unitMinor")}?:""
        lines.add(listOf(DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(Instant.parse(e.text("at")).atZone(zone)),zone.id,when(kind){"PURCHASE"->"Compra";"REWARD"->"Premio entregado";else->"Cambio o consulta"},e.text("id"),e.text("actorName"),e.text("actorId"),if(e.text("historicalName")=="true")"Sí" else "No: nombre actual",e.text("customer"),e.text("customerId"),e.text("branch"),e.text("receipt"),business.text("currency"),e.amount("paidMinor"),e.amount("discountMinor"),e.text("reward"),e.text("program"),if(e.text("balanceKind")=="CASHBACK")e.amount("cost") else e.text("cost"),unit,e.text("concept").ifEmpty{e.text("action")},(e["details"] as? JsonObject)?.text("reason")?:"",earnings,products))
    }
    return "\uFEFF"+lines.joinToString("\r\n",postfix="\r\n"){row->row.joinToString(";",transform=::csvCell)}
}
