package com.premierdarkcoffee.loyalty

import kotlinx.serialization.Serializable
import java.time.*
import java.util.Base64
import java.io.ByteArrayInputStream
import javax.imageio.ImageIO
import kotlin.math.pow

@Serializable data class PurchaseItem(val name: String, val group: String, val quantity: Int, val unitMinor: Long) {
    fun validate() { text(name, 100); text(group, 60); need(quantity in 1..100 && unitMinor in 1..1_000_000_000, "INVALID_ITEM", "Revisa la cantidad y el precio del producto.") }
    val total get() = quantity.toLong() * unitMinor
}
@Serializable data class Benefit(val percentBps: Int = 10000, val group: String, val scope: String = "ITEM") {
    fun validate() { text(group, 60); need(percentBps in 1..10000 && scope in setOf("ITEM", "BASKET"), "INVALID_BENEFIT", "Define un descuento entre 0,01% y 100% y su alcance.") }
    fun discount(items: List<PurchaseItem>): Long {
        val eligible = items.filter { it.group.equals(group, true) }
        need(eligible.isNotEmpty(), "REWARD_PRODUCT_REQUIRED", "Añade un producto de la categoría del premio.")
        val base = if (scope == "ITEM") eligible.minOf { it.unitMinor } else eligible.sumOf { it.total }
        return base * percentBps / 10000
    }
}
@Serializable data class PromotionTemplate(val name: String, val group: String, val nth: Int,
    val percentBps: Int = 10000, val countUnits: Boolean = true, val rewardName: String,
    val window: Window = Window(), val branchIds: Set<String> = emptySet()) {
    fun validate() { text(name); text(group,60); text(rewardName); window.validate(); branchIds.forEach(::uuid)
        need(nth in 2..101 && percentBps in 1..10000, "INVALID_PROMOTION", "Elige de la segunda a la compra 101 y un descuento válido.") }
}
@Serializable data class CustomerPreferences(val birthday: String? = null, val marketingConsent: Boolean = false) {
    fun validate() { if (birthday != null) try { need(birthday.matches(Regex("[0-9]{2}-[0-9]{2}")),"INVALID_BIRTHDAY","Usa mes y día: MM-DD."); MonthDay.parse("--$birthday") } catch (_: DateTimeException) { throw Problem(400,"INVALID_BIRTHDAY","Fecha de cumpleaños inválida.") } }
    fun celebrates(day: LocalDate) = birthday?.let { MonthDay.parse("--$it").atYear(day.year) == day } ?: false
}
@Serializable data class CustomerPreferencesChange(val preferences: CustomerPreferences, val customerConfirmed: Boolean)
@Serializable data class CustomerEvent(val title: String, val body: String, val startsAt: String, val endsAt: String) {
    fun validate() { text(title,80); text(body,500); try { need(Instant.parse(endsAt)>Instant.parse(startsAt),"INVALID_EVENT","El final debe ser posterior al inicio.") } catch (_: DateTimeException) { throw Problem(400,"INVALID_EVENT","Fecha de evento inválida.") } }
}
@Serializable data class WalletDesign(val displayName: String = "", val background: String = "#204e41",
    val foreground: String = "#ffffff", val label: String = "#dbf38b", val logoPng: String? = null,
    val featuredProgramId: String? = null, val stampSymbol: String = "●", val welcome: String = "Bienvenido",
    val usage: String = "Presenta tu tarjeta en caja para acumular y canjear.",
    val birthdayMessage: String = "¡Feliz cumpleaños! Gracias por ser parte de nuestro negocio.",
    val artworkStyle: String = "GRADIENT", val composition: String = "SIGNATURE", val artworkAccent: String? = null,
    val frontFocus: String = "AUTO", val featuredRewardId: String? = null) {
    fun validate() {
        need(displayName.length<=80,"INVALID_DESIGN","Nombre demasiado largo."); text(welcome,80);text(usage,350);text(birthdayMessage,250)
        featuredProgramId?.let(::uuid)
        featuredRewardId?.let(::uuid)
        need(featuredRewardId == null || featuredProgramId != null, "FEATURED_PROGRAM_REQUIRED", "Elige la promoción a la que pertenece el premio destacado.")
        need(stampSymbol in walletStampSymbols,"INVALID_STAMP","Elige un símbolo de sello disponible.")
        need(artworkStyle in setOf("SOLID","GRADIENT","AURORA"),"INVALID_ARTWORK","Elige Cálido, Aurora o Plano.")
        need(composition in walletCompositions,"INVALID_COMPOSITION","Elige una composición disponible.")
        need(frontFocus in setOf("AUTO", "PROGRESS", "REWARD"), "INVALID_FOCUS", "Elige Automático, Avance o Premio como foco de la tarjeta.")
        artworkAccent?.let { need(it.matches(Regex("#[a-fA-F0-9]{6}")),"INVALID_COLOR","Elige un color de ilustración válido o usa Automático.") }
        for (color in listOf(background,foreground,label)) need(color.matches(Regex("#[a-fA-F0-9]{6}")),"INVALID_COLOR","Usa colores hexadecimales.")
        fun luminance(hex: String): Double { val channels=(1..5 step 2).map { hex.substring(it,it+2).toInt(16)/255.0 }.map { if(it<=0.04045)it/12.92 else ((it+0.055)/1.055).pow(2.4) };return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722 }
        fun contrast(a:String,b:String):Double {val x=luminance(a);val y=luminance(b);return (maxOf(x,y)+.05)/(minOf(x,y)+.05)}
        val unreadable = mutableListOf<String>()
        if (contrast(background,foreground)<4.5) unreadable.add("Color del texto")
        if (contrast(background,label)<3) unreadable.add("Color de las etiquetas")
        val suggested = if (contrast(background,"#000000")>=contrast(background,"#ffffff")) "negro (#000000)" else "blanco (#FFFFFF)"
        need(unreadable.isEmpty(),"LOW_CONTRAST","Revisa ${unreadable.joinToString(" y ")}: no se distingue sobre el fondo $background. Usa $suggested en esos campos o pulsa «Corregir colores». El fondo puede conservarse.")
        logoPng?.let(::validateWalletLogo)
    }
}
@Serializable data class WalletDesignChange(val expectedVersion: Int, val design: WalletDesign)
fun validateWalletLogo(encoded:String):ByteArray {
    need(encoded.length<=28000,"LOGO_TOO_LARGE","El logo PNG debe ocupar como máximo 20 KB.")
    val bytes=try{Base64.getDecoder().decode(encoded)}catch(_:Exception){throw Problem(400,"INVALID_LOGO","Logo PNG inválido.")}
    need(bytes.size in 8..20000 && bytes.take(8)==listOf(137,80,78,71,13,10,26,10).map{it.toByte()},"INVALID_LOGO","Usa un archivo PNG.")
    try { ImageIO.createImageInputStream(ByteArrayInputStream(bytes)).use { input ->
        val readers=ImageIO.getImageReaders(input);need(readers.hasNext(),"INVALID_LOGO","No se pudo leer el logo.")
        val reader=readers.next();try { reader.input=input;need(reader.getWidth(0) in 1..512 && reader.getHeight(0) in 1..512,"INVALID_LOGO","El logo debe medir como máximo 512 × 512.");reader.read(0) } finally {reader.dispose()}
    } } catch(e:Problem){throw e} catch(_:Exception){throw Problem(400,"INVALID_LOGO","No se pudo leer el logo PNG.")}
    return bytes
}
fun walletRgb(hex:String) = "rgb(${hex.substring(1,3).toInt(16)},${hex.substring(3,5).toInt(16)},${hex.substring(5,7).toInt(16)})"
