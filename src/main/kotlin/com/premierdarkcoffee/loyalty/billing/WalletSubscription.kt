package com.premierdarkcoffee.loyalty.billing

import com.premierdarkcoffee.loyalty.access.consistentCedula

import com.premierdarkcoffee.loyalty.access.Staff
import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.access.authorizeStaff
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import java.sql.Connection
import java.sql.Timestamp
import java.time.*

const val WALLET_TERMS_VERSION = "wallet-2026-11-21-v6"
const val WALLET_BRANCH_PRICE = 500L
const val WALLET_ANNUAL_PRICE = 5000L
fun walletUnitPrice(cycle:String):Long {
    need(cycle in setOf("MONTHLY","ANNUAL"),"INVALID_CYCLE","Elige mensual o anual.")
    return if(cycle=="ANNUAL")WALLET_ANNUAL_PRICE else WALLET_BRANCH_PRICE
}
val WALLET_PROMOTION_END: LocalDate = LocalDate.of(2027,1,1) // Exclusive; never roll this campaign forward.
fun walletPaidFrom(activation:LocalDate):LocalDate = maxOf(activation,WALLET_PROMOTION_END)

@Serializable data class WalletProviderLegal(val legalName:String,val ruc:String,val address:String,val email:String,val phone:String,val privacyUrl:String) {
    fun validate() {
        listOf(legalName,address).forEach { need(it.length in 3..250 && it.none(Char::isISOControl),"LEGAL_IDENTITY_REQUIRED","Lúmina debe completar su identificación legal antes de contratar.") }
        need(ruc.matches(Regex("[0-9]{13}")) && ruc.any { it != '0' } && email.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) && phone.length in 7..25,"LEGAL_IDENTITY_REQUIRED","Revisa los datos de contacto de Lúmina.")
        val url=try{java.net.URI(privacyUrl)}catch(_:Exception){null}
        need(url?.scheme=="https" && !url.host.isNullOrBlank() && url.userInfo==null && privacyUrl.length<=500,"PRIVACY_REQUIRED","Lúmina debe publicar su política de privacidad.")
    }
}
@Serializable data class WalletOfferInput(val companyId:String,val ownerId:String,val ownerName:String,val ownerEmail:String,val provider:WalletProviderLegal,val cycle:String="MONTHLY",val ownerDocument:String="")
@Serializable data class WalletAcceptInput(val offer:WalletOfferInput,val expectedHash:String,val accepted:Boolean)
@Serializable data class WalletCancelInput(val expectedVersion:Int,val confirmed:Boolean)
@Serializable data class WalletAgreement(val version:String,val terms:String,val hash:String,val acceptedAt:String,val ownerId:String,val ownerName:String,val ownerEmail:String,
    val companyId:String,val activationOn:String,val paidFrom:String,val firstBranchIds:List<String>,val provider:WalletProviderLegal,val ownerDocument:String="")

fun walletTerms(provider:WalletProviderLegal,business:String,activation:LocalDate,paidFrom:LocalDate,branchCount:Int,cycle:String="MONTHLY"):String {
    val unit=walletUnitPrice(cycle);val annual=cycle=="ANNUAL"
    val price=java.math.BigDecimal.valueOf(unit,2).toPlainString().replace('.',',');val period=if(annual)"año" else "mes"
    return """
LÚMINA DIGITAL · CONDICIONES DE WALLET
Versión $WALLET_TERMS_VERSION
Proveedor: ${provider.legalName}, RUC ${provider.ruc}. Domicilio: ${provider.address}.
Contacto y reclamaciones: ${provider.email} · ${provider.phone}.
Negocio contratante: $business. Inicio: $activation. Sucursales registradas: $branchCount.

1. Servicio. Wallet permite gestionar tarjetas de fidelización, clientes, puntos, sellos, promociones y canjes. El negocio define y cumple los beneficios que ofrece a sus clientes. Las tarjetas usan Apple Wallet o Google Wallet según el dispositivo; guardar una tarjeta requiere confirmación del titular en la plataforma correspondiente.

2. Promoción. Las activaciones hasta el 31 de diciembre de 2026 tienen tarifa de plataforma de USD 0,00 desde su activación hasta ese día inclusive. La promoción termina el 1 de enero de 2027 a las 00:00 de Ecuador continental y no se renueva cada año. Si el alta ocurre después, el servicio es de pago desde la activación. Primer cargo previsto: ${invoiceDate(paidFrom)}.

3. Tarifa y cargo automático. La tarifa final es USD $price por $period por sucursal registrada, con los impuestos aplicables incluidos. Con $branchCount sucursal(es), el total por período inicial es USD ${java.math.BigDecimal.valueOf(Math.multiplyExact(branchCount.toLong(),unit),2).toPlainString()}. Al aceptar, el representante autoriza la renovación ${if(annual)"anual" else "mensual"} y el registro automático del cargo en la cuenta del negocio mientras mantenga la suscripción. No hace falta una nueva orden cada $period. ${if(annual)"El año se paga en un solo cargo de USD 50,00 por sucursal, no en doce cuotas; son doce meses de servicio." else "Puedes elegir la modalidad anual antes de aceptar."} Esto no autoriza débitos en cuentas bancarias ni tarjetas de pago. Un registro de cuenta no sustituye la factura tributaria que corresponda emitir.

4. Períodos y sucursales. El uso mensual se cobra el día 1 por el mes que acaba de terminar. Enero de 2027 se cobra el 1 de febrero de 2027. En la modalidad anual se registra un solo cargo al cierre del primer mes completo del año contratado. Si el servicio de pago comienza a mitad de mes, el primer corte cobra únicamente los días usados hasta fin de mes. Para el tramo inicial se divide la tarifa entre los meses de la modalidad y los días reales del mes. Cada renovación incluye las sucursales registradas al inicio del período. Para una nueva sucursal, el dueño revisa y acepta el importe proporcional desde el alta hasta la renovación. Ese cargo se registra el primer día del mes siguiente. Puedes pagar hasta el día 15 inclusive. Desde el 16, si queda saldo de Wallet, se suspenden las operaciones y las tarjetas hasta que Lúmina registre el pago completo. Servicios de contenido, web, diseño y trabajos adicionales solo se contratan por separado con su propio precio.

5. Cancelación. El dueño puede desactivar la renovación desde Paquetes y servicios → Wallet, sin penalidad. La solicitud queda registrada inmediatamente y el servicio continúa hasta el final del período vigente; durante la promoción, hasta el 31 de diciembre de 2026. No se emiten períodos posteriores. Para terminación inmediata, devolución o corrección de un cargo, escribe al contacto del proveedor: se aplicarán los derechos y ajustes que correspondan por servicios efectivamente prestados. Esta opción no limita derechos de devolución, reclamación ni terminación reconocidos por la ley. Los saldos legítimamente pendientes no se borran al cancelar.

6. Datos y continuidad. El negocio es responsable de informar a sus clientes y contar con una base legítima para el programa y las comunicaciones. Lúmina trata la información de cuenta y aceptación para ejecutar el contrato, atender solicitudes y cumplir obligaciones legales; los registros de operación de clientes se tratan para prestar el servicio al negocio bajo sus instrucciones. Las finalidades, destinatarios, transferencias, plazos de conservación y medios para ejercer acceso, rectificación, eliminación, oposición y demás derechos constan en ${provider.privacyUrl}. La aceptación comercial no habilita publicidad opcional ni usos ajenos al servicio. La terminación no elimina automáticamente tarjetas, identidades ni historial; cesan las nuevas operaciones al concluir el período y se atienden conservación legal, exportación y solicitudes de derechos. Las actualizaciones del sistema deben preservar las identidades y conexiones existentes; pueden existir incidencias técnicas que deban ser corregidas.

7. Aceptación y cambios. Se conserva una copia descargable de estas condiciones, su versión, el resumen económico, la cuenta que acepta y la fecha. Abrir Wallet, visitar una página o crear una cuenta no equivale a aceptar cargos. Los negocios existentes solo se incorporan mediante aceptación expresa, sin cargos retroactivos anteriores a ella. Cambios de precio o condiciones comerciales requieren una nueva aceptación; el proveedor no puede modificar unilateralmente lo ya acordado. El servicio y las reclamaciones se rigen por la normativa ecuatoriana aplicable, sin renuncia a derechos ni arbitraje obligatorio.

8. Estado del negocio. Lúmina puede pausar o suspender la operación por revisión de seguridad, incumplimiento acreditado o solicitud del negocio, dejando el motivo en su cuenta y un canal para resolverlo. Estos estados bloquean nuevas compras, canjes y solicitudes; no borran saldos ni tarjetas. Las plataformas de Wallet controlan cuándo reflejan u ocultan la tarjeta inactiva. La pausa o suspensión no cancela por sí sola la renovación acordada; el dueño conserva acceso a cuenta, pagos y cancelación. El cierre administrativo detiene los próximos cargos de Wallet. Se revisarán los ajustes y devoluciones que correspondan por servicios no prestados, sin limitar derechos legales. Reactivar el negocio no restablece una renovación terminada sin nueva aceptación.
""".trimIndent()
}

private fun walletBranches(c:Connection,tenant:String) = c.rows("SELECT id,name FROM branches WHERE tenant_id=? ORDER BY id",tenant) { obj("id" to it.getString(1),"name" to it.getString(2)) }
private fun LoyaltyService.offer(c:Connection,s:Staff,input:WalletOfferInput):JsonObject {
    val catalogDay=commercial.today(c,s.tenant)
    need(catalogDay>=WALLET_PROMOTION_END,"TRIAL_ACTIVE","Wallet es gratis hasta el 31 de diciembre. El dueño elige un plan desde enero.",409)
    need(!c.one("""SELECT EXISTS(SELECT 1 FROM wallet_catalog_schedules WHERE tenant_id=? AND consent_on IS NOT NULL AND replaces_legacy
        AND (ends_before IS NULL OR ends_before>? AND starts_on<ends_before))""",s.tenant,java.sql.Date.valueOf(catalogDay)){it.getBoolean(1)}!!,
        "CATALOG_ACTIVE","Cambia tu plan desde Mi suscripción de Wallet.",409)
    input.provider.validate();uuid(input.companyId);uuid(input.ownerId);text(input.ownerName,100)
    need(if(input.ownerDocument.isNotEmpty()) consistentCedula(input.ownerDocument) else input.ownerEmail.matches(Regex("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")),"INVALID_OWNER_IDENTITY","Revisa la identificación del responsable.")
    need(c.one("SELECT tenant_id FROM lumina_business_registrations WHERE company_id=?",input.companyId){it.getString(1)}==s.tenant,"BUSINESS_MISMATCH","La suscripción corresponde a otro negocio.",403)
    val current=commercial.plan(c,s.tenant)?.takeIf { it.first.walletAgreement?.activationOn?.let(::billingDate)?.let{d->d>=WALLET_PROMOTION_END}==true }
    need(current==null || !current.first.recurring || current.first.walletAgreement==null ||
        current.first.intervalMonths!=(if(input.cycle=="ANNUAL")12 else 1),"ALREADY_ACTIVE","Tu negocio ya tiene esta modalidad de Wallet. Puedes elegir otra para el siguiente período.",409)
    need(current==null || current.first.walletAgreement!=null,"EXISTING_AGREEMENT","Este negocio tiene una programación anterior. Lúmina debe revisarla antes de aceptar otra tarifa para evitar cargos duplicados.",409)
    val date=commercial.today(c,s.tenant)
    val branches=walletBranches(c,s.tenant)
    need(branches.isNotEmpty(),"BRANCH_REQUIRED","El negocio necesita una sucursal.",409)
    val name=c.one("SELECT name FROM tenants WHERE id=?",s.tenant){it.getString(1)}!!
    val paid=maxOf(walletPaidFrom(date),current?.let{coveredUntil(it,date)}?:date)
    val unit=walletUnitPrice(input.cycle)
    val terms=walletTerms(input.provider,name,date,paid,branches.size,input.cycle)
    val summary=obj("version" to (current?.second?:0),"activationOn" to date,"paidFrom" to paid,"trialUntil" to if(date<WALLET_PROMOTION_END)"2026-12-31" else null,
        "cycle" to input.cycle,"intervalMonths" to if(input.cycle=="ANNUAL")12 else 1,"unitMinor" to unit,"totalMinor" to Math.multiplyExact(branches.size.toLong(),unit),"branches" to branches,"terms" to terms,"termsVersion" to WALLET_TERMS_VERSION)
    val hash=Security.hash(summary.toString()+json.encodeToString(input))
    return JsonObject(summary+("hash" to JsonPrimitive(hash)))
}
fun LoyaltyService.walletSubscriptionOffer(s:Staff,input:WalletOfferInput):JsonObject {s.owner();return db.tx {c->authorizeStaff(c,s,true);commercial.sync(c,s.tenant,commercial.today(c,s.tenant));offer(c,s,input)}}
fun LoyaltyService.acceptWalletSubscription(s:Staff,input:WalletAcceptInput,key:String):JsonObject {
    s.owner();need(input.accepted,"CONSENT_REQUIRED","Acepta las condiciones y el cargo del período elegido antes de continuar.")
    return db.tx {c->
        authorizeStaff(c,s,true)
        commercial.once(c,s.tenant,"wallet-subscribe:${s.id}",key,json.encodeToString(input)) {
            commercial.sync(c,s.tenant,commercial.today(c,s.tenant))
            val quote=offer(c,s,input.offer)
            need(Security.equal(quote.getValue("hash").jsonPrimitive.content,input.expectedHash),"OFFER_CHANGED","Cambió la fecha, el número de sucursales o las condiciones. Revisa el resumen actualizado antes de aceptar.",409)
            val saved=commercial.plan(c,s.tenant)
            val previous=saved?.takeIf { it.first.walletAgreement?.activationOn?.let(::billingDate)?.let{d->d>=WALLET_PROMOTION_END}==true }
            need(previous==null || !previous.first.recurring || previous.first.intervalMonths!=(if(input.offer.cycle=="ANNUAL")12 else 1),"ALREADY_ACTIVE","La suscripción ya está activa.",409)
            val date=commercial.today(c,s.tenant)
            // A cancelled period remains paid/available; resuming cannot charge it a second time.
            val paid=maxOf(walletPaidFrom(date),previous?.let{coveredUntil(it,date)}?:date)
            need(paid.toString()==quote.getValue("paidFrom").jsonPrimitive.content,"PERIOD_STILL_ACTIVE","El período actual sigue disponible. Puedes volver a activar la renovación al finalizarlo.",409)
            val agreement=WalletAgreement(WALLET_TERMS_VERSION,quote.getValue("terms").jsonPrimitive.content,input.expectedHash,commercial.clock.instant().toString(),input.offer.ownerId,input.offer.ownerName,input.offer.ownerEmail,
                input.offer.companyId,date.toString(),paid.toString(),quote.getValue("branches").jsonArray.map{it.jsonObject.getValue("id").jsonPrimitive.content},input.offer.provider,input.offer.ownerDocument)
            val annual=input.offer.cycle=="ANNUAL"
            val plan=MembershipPlan(if(annual)"Wallet · USD 50,00 al año por sucursal" else "Wallet · USD 5,00 al mes por sucursal",walletUnitPrice(input.offer.cycle),date.toString(),(if(paid.dayOfMonth==1)paid else nextCalendarCut(paid)).toString(),intervalMonths=if(annual)12 else 1,anchorDay=1,walletAgreement=agreement)
            val access=commercial.lock(c,s.tenant)
            need(access.getValue("state").jsonPrimitive.content=="ACTIVE","BUSINESS_SUSPENDED","El negocio debe estar activo antes de contratar.",409)
            val version=(saved?.second?:0)+1
            previous?.let{commercial.retainEarnedPeriod(c,s.tenant,it,date)}
            commercial.savePlan(c,s.tenant,plan,version)
            if(paid.dayOfMonth!=1)c.exec("INSERT INTO wallet_opening_periods(tenant_id,starts_on,version) VALUES(?,?,?) ON CONFLICT DO NOTHING",
                s.tenant,java.sql.Date.valueOf(paid),version)
            commercial.sync(c,s.tenant,date)
            c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at) VALUES(?,?,?,'WALLET_SUBSCRIPTION_ACCEPTED',?,?)",id(),s.tenant,s.id,version.toString(),Timestamp.from(commercial.clock.instant()))
            obj("version" to version,"accepted" to true)
        }
    }
}
fun LoyaltyService.cancelWalletSubscription(s:Staff,input:WalletCancelInput,key:String):JsonObject {
    s.owner();need(input.confirmed,"CONFIRM_REQUIRED","Confirma que quieres detener la renovación.")
    return db.tx {c->authorizeStaff(c,s,true)
        commercial.once(c,s.tenant,"wallet-cancel:${s.id}",key,json.encodeToString(input)) {
            val old=commercial.plan(c,s.tenant)
            need(old?.first?.walletAgreement!=null && old.second==input.expectedVersion,"VERSION_CONFLICT","La suscripción cambió. Recarga antes de continuar.",409)
            commercial.sync(c,s.tenant,commercial.today(c,s.tenant))
            val current=commercial.plan(c,s.tenant)!!
            val date=commercial.today(c,s.tenant)
            val end=current.first.walletEndsOn?:coveredUntil(current,date).toString()
            commercial.retainEarnedPeriod(c,s.tenant,current,date)
            val version=current.second+1
            commercial.savePlan(c,s.tenant,current.first.copy(recurring=false,nextChargeOn=current.third.toString(),walletEndsOn=end),version)
            c.exec("INSERT INTO audit_events(id,tenant_id,actor_id,action,target_id,created_at) VALUES(?,?,?,'WALLET_SUBSCRIPTION_CANCELLED',?,?)",id(),s.tenant,s.id,version.toString(),Timestamp.from(commercial.clock.instant()))
            commercial.captureCut(c,s.tenant,date)
            obj("version" to version,"endsOn" to end)
        }
    }
}
fun LoyaltyService.walletSubscriptionStatus(s:Staff):JsonObject {s.owner();return db.tx {c->authorizeStaff(c,s)
    val current=commercial.plan(c,s.tenant);val agreement=current?.first?.walletAgreement
    val branches=walletBranches(c,s.tenant)
    val date=commercial.today(c,s.tenant)
    val authorized=agreement?.activationOn?.let(::billingDate)?.let{it>=WALLET_PROMOTION_END}==true
    val addition=nextBranchCharge(c,s.tenant)
    obj("today" to date,"version" to (current?.second?:0),"accepted" to (agreement!=null),"legacy" to (current!=null&&agreement==null),
        "recurring" to (authorized && current?.first?.recurring==true),"trialUntil" to if(agreement!=null && date<WALLET_PROMOTION_END)"2026-12-31" else null,
        "endsOn" to current?.first?.walletEndsOn,"coveredUntil" to current?.takeIf{authorized}?.let{coveredUntil(it,date)},"nextChargeOn" to commercial.nextWalletCharge(c,s.tenant,current,addition),
        "nextBranchCharge" to addition?.summary(),
        "cycle" to if(current?.first?.intervalMonths==12)"ANNUAL" else "MONTHLY","intervalMonths" to (current?.first?.intervalMonths?:1),"periodMinor" to Math.multiplyExact(branches.size.toLong(),current?.first?.feeMinor?:WALLET_BRANCH_PRICE),"unitMinor" to (current?.first?.feeMinor?:WALLET_BRANCH_PRICE),"monthlyMinor" to Math.multiplyExact(branches.size.toLong(),current?.first?.feeMinor?:WALLET_BRANCH_PRICE),"branches" to branches,
        "agreement" to agreement?.let { json.encodeToJsonElement(it) })
}}
/** Historical branch timestamps make catch-up billing deterministic after downtime. */
internal fun walletPeriodBranches(c:Connection,tenant:String,agreement:WalletAgreement,period:LocalDate):Int {
    if(period.toString()==agreement.paidFrom && agreement.paidFrom==agreement.activationOn)return agreement.firstBranchIds.size
    val zone=c.one("SELECT timezone FROM tenants WHERE id=?",tenant){ZoneId.of(it.getString(1))}!!
    return c.one("SELECT count(*) FROM branches WHERE tenant_id=? AND created_at<=?",tenant,Timestamp.from(period.atStartOfDay(zone).toInstant())){it.getInt(1)}!!
}
