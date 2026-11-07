package com.premierdarkcoffee.loyalty

import kotlinx.serialization.json.*
import java.awt.*
import java.awt.geom.*
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.math.BigInteger
import javax.imageio.ImageIO
import kotlin.math.pow

// These public assets encode only a bounded illustration, never a member, QR, token or purchase.
val walletStampSymbols = listOf("●", "★", "♥", "✂", "◆", "☕", "🍕", "🛍", "👟", "🔧")

data class WalletArtwork(val style: String, val symbol: Int, val background: String, val filled: Int, val total: Int) {
    fun validate() {
        need(style in setOf("SOLID", "GRADIENT") && symbol in walletStampSymbols.indices &&
            background.matches(Regex("[a-fA-F0-9]{6}")) && (total in 0..20 || total == 100) && filled in 0..total,
            "INVALID_ARTWORK", "Diseño de sellos inválido.")
    }
    fun path() = "/wallet/art/v20/$style/$symbol/${background.lowercase()}/$filled/$total.png"

    fun png(appleScale: Int? = null): ByteArray {
        validate(); require(appleScale == null || appleScale in 1..3)
        val width = appleScale?.let { 375 * it } ?: 1032
        val height = appleScale?.let { 123 * it } ?: 812
        val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
        val g = image.createGraphics()
        try {
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
            g.scale(width / 375.0, height / 123.0)
            val base = Color.decode("#$background")
            val channels=listOf(base.red,base.green,base.blue).map { val v=it/255.0; if(v<=.04045) v/12.92 else ((v+.055)/1.055).pow(2.4) }
            val light = channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722 > .179
            val ink = if(light) Color(11,31,58) else Color.WHITE
            fun tone(alpha: Int) = Color(ink.red,ink.green,ink.blue,alpha)
            // Blank/paused artwork is flat so native primary text keeps its validated contrast.
            g.paint = if (style == "GRADIENT" && total > 0) GradientPaint(0f, 0f, base, 375f, 123f, if(light) base.brighter() else base.darker().darker()) else base
            g.fillRect(0, 0, 375, 123)
            if (total == 0) return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
            g.color = Color(255, 255, 255, 15); g.fillOval(270, -70, 190, 190); g.fillOval(-70, 50, 180, 180)
            // Draw at native aspect ratio: Google uses a taller grid, never stretches the symbols.
            g.transform = AffineTransform()
            if (total == 100) {
                val margin = width * .09; val barY = height * .46; val barHeight = height * .08
                g.color = tone(55); g.fill(RoundRectangle2D.Double(margin,barY,width-2*margin,barHeight,barHeight,barHeight))
                g.color = ink
                if (filled > 0) g.fill(RoundRectangle2D.Double(margin,barY,(width-2*margin)*filled/100,barHeight,barHeight,barHeight))
            } else {
                val columns = if (appleScale != null) minOf(total,10) else when { total<=4 -> minOf(total,2); total<=9 -> 3; total<=12 -> 4; else -> 5 }
                val rows = (total + columns - 1) / columns
                val cell = minOf(width * .86 / columns, height * .78 / rows)
                val diameter = cell * .76
                for (index in 0 until total) {
                    val row = index / columns; val rowCount = minOf(columns, total - row * columns)
                    val x = width / 2.0 + (index % columns - (rowCount-1)/2.0) * cell
                    val y = height / 2.0 + (row - (rows-1)/2.0) * cell
                    val earned = index < filled
                    g.color = if (earned) ink else tone(25)
                    g.fill(Ellipse2D.Double(x-diameter/2,y-diameter/2,diameter,diameter))
                    g.stroke = BasicStroke(maxOf(1f,(diameter*.025).toFloat()))
                    g.color = tone(if (earned) 255 else 145)
                    g.draw(Ellipse2D.Double(x-diameter/2,y-diameter/2,diameter,diameter))
                    val icon = g.create() as Graphics2D
                    try {
                        icon.translate(x-diameter*.29,y-diameter*.29); icon.scale(diameter*.58/100,diameter*.58/100)
                        icon.color = if (earned) (if(light) Color.WHITE else base.darker()) else tone(170)
                        if (!earned) icon.composite = AlphaComposite.getInstance(AlphaComposite.SRC_OVER,.4f)
                        drawWalletStamp(icon,symbol)
                    } finally { icon.dispose() }
                }
            }
        } finally { g.dispose() }
        return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
    }
}

private fun drawWalletStamp(g: Graphics2D, symbol: Int) {
    g.stroke = BasicStroke(7f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
    fun line(x1: Int,y1: Int,x2: Int,y2: Int) = g.drawLine(x1,y1,x2,y2)
    fun polygon(vararg points: Int) { g.fillPolygon(points.toList().chunked(2).map { it[0] }.toIntArray(),points.toList().chunked(2).map { it[1] }.toIntArray(),points.size/2) }
    when(symbol) {
        1 -> polygon(50,5,61,36,95,36,68,57,78,90,50,70,22,90,32,57,5,36,39,36)
        2 -> { val p=Path2D.Double();p.moveTo(50.0,88.0);p.curveTo(-20.0,42.0,12.0,-12.0,50.0,25.0);p.curveTo(88.0,-12.0,120.0,42.0,50.0,88.0);g.fill(p) }
        3 -> { g.drawOval(6,62,26,26);g.drawOval(68,62,26,26);line(27,66,75,8);line(73,66,25,8) }
        4 -> polygon(50,5,95,50,50,95,5,50)
        5 -> { g.drawRoundRect(12,34,57,43,12,12);g.drawArc(58,36,31,31,-90,180);line(7,88,78,88);line(24,8,24,22);line(43,5,43,19);line(61,8,61,22) }
        6 -> { polygon(10,15,90,15,50,94);g.color=Color(235,157,60);g.fillRoundRect(7,6,86,16,9,9);g.color=Color(185,62,45);g.fillOval(31,32,12,12);g.fillOval(60,31,12,12);g.fillOval(46,57,12,12) }
        7 -> { g.drawRoundRect(15,29,70,63,7,7);g.drawArc(31,7,38,46,0,180);line(32,29,32,39);line(69,29,69,39) }
        8 -> { val p=Path2D.Double();p.moveTo(8.0,70.0);p.lineTo(20.0,20.0);p.lineTo(42.0,43.0);p.lineTo(64.0,52.0);p.curveTo(90.0,52.0,94.0,65.0,94.0,78.0);p.lineTo(8.0,78.0);p.closePath();g.draw(p);line(8,88,94,88);line(41,43,33,56);line(54,48,46,61) }
        9 -> { g.drawArc(50,5,40,40,15,285);line(56,38,14,80);line(66,48,24,90);line(14,80,24,90);line(86,16,72,27) }
        else -> g.fillOval(20,20,60,60)
    }
}

fun WalletPass.artwork(): WalletArtwork {
    val d=design()
    val balances=snapshot.getValue("balances").jsonArray.map { it.jsonObject }.sortedBy { if(it["programId"]?.jsonPrimitive?.contentOrNull==d.featuredProgramId) 0 else 1 }
    val first=balances.firstOrNull()
    val target=snapshot["rewardProgress"]?.jsonArray.orEmpty().map { it.jsonObject }.filter {
        first?.get("programId")!=null && it["programId"]==first["programId"] && it["kind"]==first["kind"] && (it["goal"]?.jsonPrimitive?.longOrNull?:0)>0
    }.sortedWith(compareBy<JsonObject> { it.getValue("goal").jsonPrimitive.long }.thenBy { it.getValue("id").jsonPrimitive.content }).firstOrNull()
    val goal=if(snapshot["canOperate"]?.jsonPrimitive?.booleanOrNull==true && first?.get("kind")==JsonPrimitive("STAMPS")) target?.get("goal")?.jsonPrimitive?.longOrNull?:0 else 0
    val available=maxOf(0,first?.get("available")?.jsonPrimitive?.longOrNull?:0)
    val total=if(goal>20) 100 else goal.toInt()
    val filled=when { goal==0L -> 0; goal<=20 -> minOf(available,goal).toInt(); else -> (BigInteger.valueOf(minOf(available,goal))*BigInteger.valueOf(100)/BigInteger.valueOf(goal)).toInt() }
    return WalletArtwork(d.artworkStyle,walletStampSymbols.indexOf(d.stampSymbol).coerceAtLeast(0),d.background.drop(1),filled,total)
}

fun WalletPass.googleArtwork(origin: String): JsonObject {
    val art=artwork()
    val description=when { art.total==0 -> "Diseño del negocio"; art.total==100 -> "Progreso de sellos: ${art.filled}%. Consulta el saldo y el premio en los campos de la tarjeta."; else -> "${art.filled} de ${art.total} sellos completados. Los sellos llenos indican progreso; caja confirma el canje." }
    return obj("sourceUri" to obj("uri" to origin+art.path()),"contentDescription" to obj("defaultValue" to obj("language" to "es","value" to description)))
}
