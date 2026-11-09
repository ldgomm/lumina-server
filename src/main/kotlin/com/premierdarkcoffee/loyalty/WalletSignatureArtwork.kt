package com.premierdarkcoffee.loyalty

import java.awt.*
import java.awt.geom.*
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.math.*

/** v027: bounded, font-independent illustrations. Amounts and instructions remain native fields. */
internal fun WalletArtwork.signaturePng(appleScale: Int?, poster: Boolean = false): ByteArray {
    val w = if (poster) 358 else if (appleScale != null) 375 else 516
    val h = if (poster) 448 else if (appleScale != null) 144 else 406
    val scale = appleScale ?: 2
    val image = BufferedImage(w * scale, h * scale, BufferedImage.TYPE_INT_RGB)
    val g = image.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY)
        g.scale(scale.toDouble(), scale.toDouble())
        val base = Color.decode("#$background")
        val light = signatureLuminance(base) > .179
        val ink = if (light) Color(12, 28, 48) else Color(247, 246, 240)
        val accent = when {
            style == "AURORA" -> if (light) Color(24, 96, 136) else Color(134, 222, 235)
            style == "SOLID" -> ink
            else -> if (light) Color(137, 91, 42) else Color(232, 193, 137)
        }
        val compact = !poster && appleScale != null
        val cx = w / 2.0
        val cy = if (poster) 148.0 else if (compact) 64.0 else 176.0
        val radius = if (poster) 72.0 else if (compact) 46.0 else 128.0
        fun alpha(c: Color, a: Int) = Color(c.red, c.green, c.blue, a)
        g.color = base; g.fillRect(0, 0, w, h)

        if (style != "SOLID") {
            // Localized light keeps the top/logo and bottom/native text on the chosen base color.
            val halo = radius * 1.85
            g.paint = RadialGradientPaint(Point2D.Double(cx, cy), halo.toFloat(),
                floatArrayOf(0f, .48f, 1f), arrayOf(alpha(accent, if (light) 24 else 46), alpha(accent, 16), alpha(base, 0)))
            g.fill(Ellipse2D.Double(cx-halo, cy-halo, halo*2, halo*2))
            val ornament = g.create() as Graphics2D
            try {
                // Gentle contour engraving; clipped inside the artwork's safe region, not its content.
                ornament.clip(Rectangle2D.Double(0.0, if (poster) 68.0 else 10.0, w.toDouble(), if (poster) 176.0 else h-20.0))
                ornament.stroke = BasicStroke(.5f)
                for (i in 0..23) {
                    val y = cy + radius * .35 + i * 3.5
                    val curve = Path2D.Double().apply {
                        moveTo(-20.0, y+48); curveTo(w*.27, y-63, w*.56, y+81, w+20.0, y-35)
                    }
                    ornament.color = alpha(accent, if (i%4==0) 39 else 18); ornament.draw(curve)
                }
                if (style == "AURORA") {
                    ornament.paint = LinearGradientPaint(0f,0f,w.toFloat(),h.toFloat(),floatArrayOf(0f,.5f,1f),
                        arrayOf(alpha(Color(118, 140, 245), 35),alpha(accent,6),alpha(Color(196,145,196),32)))
                    ornament.fill(Ellipse2D.Double(-w*.22,cy-radius,w*.78,radius*2.5))
                }
            } finally { ornament.dispose() }
        }
        // Paused/retired targets never keep old stamps or a completed ring.
        if (total == 0) {
            signatureMedallion(g, cx, cy, radius*.64, symbol, base, accent, style, false)
        } else if (total == 100) {
            signatureMedallion(g, cx, cy, radius*.76, symbol, base, accent, style, true)
            val ring = Ellipse2D.Double(cx-radius,cy-radius,radius*2,radius*2)
            g.stroke = BasicStroke(if (compact) 3.2f else 4.5f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
            g.color = alpha(ink, 35); g.draw(ring)
            if (filled > 0) {
                g.paint = if(style=="SOLID") ink else LinearGradientPaint((cx-radius).toFloat(),(cy-radius).toFloat(),
                    (cx+radius).toFloat(),(cy+radius).toFloat(),floatArrayOf(0f,.48f,1f),
                    arrayOf(accent, if(light) accent.darker() else Color(255,242,218),accent))
                g.draw(Arc2D.Double(cx-radius,cy-radius,radius*2,radius*2,90.0,-filled*3.6,Arc2D.OPEN))
                val angle = Math.toRadians(90-filled*3.6)
                val ex=cx+cos(angle)*radius; val ey=cy-sin(angle)*radius
                g.color=accent;g.fill(Ellipse2D.Double(ex-3,ey-3,6.0,6.0))
            }
            // Four subtle milestones aid reading without implying extra visits or rewards.
            for(i in 0..3) {
                val angle=i*Math.PI/2;val rr=radius+8
                g.color=alpha(ink,70);g.fill(Ellipse2D.Double(cx+cos(angle)*rr-1,cy+sin(angle)*rr-1,2.0,2.0))
            }
        } else {
            val columns = if(compact) minOf(total,10) else if(total<=6) total else minOf(total,5)
            val rows=(total+columns-1)/columns
            val areaTop=if(poster) 163.0 else if(compact) 12.0 else 168.0
            val areaHeight=if(poster) 76.0 else if(compact) 118.0 else 204.0
            val cell=minOf((w-52.0)/columns,areaHeight/rows)
            val r=minOf(cell*.39,if(poster) 23.0 else if(compact) 27.0 else 37.0)
            if(!compact) signatureMedallion(g,cx,if(poster)108.0 else 84.0,if(poster)32.0 else 48.0,symbol,base,accent,style,true)
            for(index in 0 until total) {
                val row=index/columns;val count=minOf(columns,total-row*columns)
                val x=cx+(index%columns-(count-1)/2.0)*cell
                val y=areaTop+areaHeight/2+(row-(rows-1)/2.0)*cell
                val earned=index<filled
                signatureMedallion(g,x,y,r,symbol,base,accent,style,earned)
                if(index==filled) {
                    g.color=alpha(ink,170)
                    g.stroke=BasicStroke(1f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND,10f,floatArrayOf(2f,3f),0f)
                    g.draw(Ellipse2D.Double(x-r-3,y-r-3,r*2+6,r*2+6))
                }
            }
        }
        if(poster) {
            // Native QR and field placement belong to Wallet. Keep their background calm and opaque.
            g.paint=GradientPaint(0f,236f,alpha(base,0),0f,276f,base)
            g.fillRect(0,236,w,h-236)
        }
    } finally { g.dispose() }
    return ByteArrayOutputStream().also { ImageIO.write(image,"png",it) }.toByteArray()
}

private fun signatureLuminance(c: Color): Double {
    fun channel(n:Int):Double {val v=n/255.0;return if(v<=.04045)v/12.92 else ((v+.055)/1.055).pow(2.4)}
    return channel(c.red)*.2126+channel(c.green)*.7152+channel(c.blue)*.0722
}

private fun signatureMedallion(g:Graphics2D,x:Double,y:Double,r:Double,symbol:Int,base:Color,accent:Color,style:String,earned:Boolean) {
    fun alpha(c:Color,a:Int)=Color(c.red,c.green,c.blue,a)
    val light=signatureLuminance(base)>.179
    val coin=Ellipse2D.Double(x-r,y-r,r*2,r*2)
    if(earned && style!="SOLID") {
        // Offset shadows and a multi-stop bevel give the emblem depth, without a photographic asset.
        for(i in 5 downTo 1) {
            g.color=Color(0,0,0,5);g.fill(Ellipse2D.Double(x-r-i,y-r+i,r*2+i*2,r*2+i*2))
        }
        g.paint=LinearGradientPaint((x-r).toFloat(),(y-r).toFloat(),(x+r).toFloat(),(y+r).toFloat(),floatArrayOf(0f,.23f,.5f,.74f,1f),
            arrayOf(accent.darker(),if(light)Color(245,234,212)else Color(255,240,206),accent,accent.darker(),accent))
        g.fill(coin)
        val inset=r*.11
        g.paint=GradientPaint(x.toFloat(),(y-r).toFloat(),base.brighter(),x.toFloat(),(y+r).toFloat(),base.darker())
        g.fill(Ellipse2D.Double(x-r+inset,y-r+inset,(r-inset)*2,(r-inset)*2))
        g.color=alpha(accent,105);g.stroke=BasicStroke(.65f)
        g.draw(Ellipse2D.Double(x-r*.82,y-r*.82,r*1.64,r*1.64))
        g.color=alpha(Color.WHITE,65);g.stroke=BasicStroke(maxOf(.6f,(r*.018).toFloat()))
        g.draw(Arc2D.Double(x-r*.98,y-r*.98,r*1.96,r*1.96,32.0,100.0,Arc2D.OPEN))
    } else {
        g.color=alpha(accent,if(earned)25 else 9);g.fill(coin)
        g.color=alpha(accent,if(earned)220 else 85);g.stroke=BasicStroke(if(earned)1.8f else .9f);g.draw(coin)
    }
    val icon=g.create() as Graphics2D
    try {
        icon.translate(x-r*.52,y-r*.52);icon.scale(r*1.04/100,r*1.04/100)
        icon.color=if(earned)accent else alpha(accent,95)
        if(!earned)icon.composite=AlphaComposite.getInstance(AlphaComposite.SRC_OVER,.6f)
        // Existing industry pictograms remain stable; no emoji font is required in Docker.
        if(earned && r>=30 && style!="SOLID") drawSignatureEmblem(icon,symbol,accent) else drawWalletStamp(icon,symbol)
    } finally {icon.dispose()}
}

/** Original vector objects for the most common brands; small stamps keep their simple silhouette. */
private fun drawSignatureEmblem(g:Graphics2D,symbol:Int,accent:Color) {
    fun gradient(a:Color,b:Color)=GradientPaint(10f,10f,a,86f,94f,b)
    fun path(vararg xy:Double)=Path2D.Double().apply {moveTo(xy[0],xy[1]);for(i in 2 until xy.size step 2)lineTo(xy[i],xy[i+1]);closePath()}
    val cream=Color(255,243,220);val shade=Color(159,128,92)
    when(symbol) {
        5 -> {
            g.color=Color(0,0,0,65);g.fillOval(4,22,96,77)
            g.paint=gradient(cream,shade);g.fillOval(1,10,94,84)
            g.color=Color(102,75,51,95);g.stroke=BasicStroke(1.2f);g.drawOval(7,16,82,72)
            g.stroke=BasicStroke(10f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND)
            g.paint=gradient(cream,shade);g.drawArc(68,30,26,39,-90,180)
            g.paint=gradient(Color.WHITE,Color(200,177,147));g.fillOval(13,14,69,68)
            g.color=Color(99,53,27);g.fillOval(19,20,57,55)
            g.paint=RadialGradientPaint(48f,47f,28f,floatArrayOf(0f,.8f,1f),arrayOf(Color(171,102,52),Color(155,83,37),Color(221,159,87)))
            g.fillOval(21,22,53,51)
            g.color=cream
            val leaf=Path2D.Double().apply {moveTo(48.0,64.0);curveTo(23.0,49.0,28.0,26.0,47.0,39.0);curveTo(67.0,24.0,76.0,46.0,48.0,64.0);closePath()};g.fill(leaf)
            g.color=Color(171,102,52);g.stroke=BasicStroke(1.4f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND)
            for(i in 0..4){val y=42+i*3;g.draw(QuadCurve2D.Double(31.0,y.toDouble(),48.0,y+12.0,65.0,y.toDouble()))}
            g.color=cream;g.stroke=BasicStroke(1.8f);g.drawLine(48,35,48,67)
            g.color=Color.WHITE;g.stroke=BasicStroke(1.5f);g.drawArc(15,16,65,64,42,92)
        }
        6 -> {
            val slice=path(7.0,15.0,93.0,15.0,50.0,96.0)
            g.color=Color(0,0,0,60);g.translate(0.0,4.0);g.fill(slice);g.translate(0.0,-4.0)
            g.paint=gradient(Color(255,224,136),Color(221,139,54));g.fill(slice)
            g.stroke=BasicStroke(12f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND);g.paint=gradient(Color(255,208,128),Color(151,75,30))
            g.draw(QuadCurve2D.Double(10.0,14.0,50.0,2.0,90.0,14.0))
            for((x,y) in listOf(30 to 33,63 to 35,46 to 61)) {
                g.color=Color(127,44,27);g.fillOval(x-9,y-8,19,18)
                g.paint=gradient(Color(231,101,61),Color(162,51,31));g.fillOval(x-8,y-8,17,15)
                g.color=Color(255,192,111,130);g.fillOval(x-4,y-4,3,3);g.fillOval(x+3,y+2,2,2)
            }
            g.color=Color(64,103,61);g.fill(path(45.0,24.0,54.0,27.0,49.0,35.0));g.fill(path(58.0,52.0,64.0,56.0,58.0,62.0))
            g.color=Color(255,244,181,190);g.stroke=BasicStroke(1.3f);g.drawLine(16,25,49,87)
        }
        8 -> {
            val shoe=Path2D.Double().apply {moveTo(5.0,68.0);lineTo(14.0,23.0);curveTo(31.0,44.0,37.0,39.0,40.0,39.0);lineTo(59.0,52.0);curveTo(85.0,53.0,98.0,61.0,96.0,77.0);lineTo(5.0,77.0);closePath()}
            g.color=Color(0,0,0,65);g.fillOval(1,78,98,13)
            g.paint=gradient(cream,Color(180,186,190));g.fill(shoe)
            g.color=accent;g.fill(path(9.0,51.0,16.0,28.0,28.0,41.0,22.0,61.0));g.fill(path(34.0,50.0,42.0,44.0,65.0,59.0,61.0,69.0))
            g.color=Color(11,31,58);g.stroke=BasicStroke(1.5f);g.draw(QuadCurve2D.Double(67.0,55.0,62.0,62.0,63.0,71.0))
            g.paint=gradient(Color.WHITE,Color(205,205,195));g.fillRoundRect(4,74,94,11,4,4)
            g.color=Color(115,122,124);g.stroke=BasicStroke(.8f);g.drawLine(6,79,94,79)
            for(i in 0..3){g.color=cream;g.stroke=BasicStroke(2.6f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND);g.drawLine(33+i*6,44+i*3,29+i*6,52+i*3)}
            g.color=Color.WHITE;g.stroke=BasicStroke(1.2f);g.drawLine(12,63,28,66)
        }
        7 -> {
            g.color=Color(0,0,0,55);g.fillOval(9,84,83,12)
            g.paint=gradient(accent.brighter(),accent.darker());g.fill(path(14.0,30.0,76.0,30.0,86.0,89.0,8.0,89.0))
            g.color=accent.darker();g.fill(path(76.0,30.0,88.0,38.0,96.0,83.0,86.0,89.0))
            g.color=cream;g.stroke=BasicStroke(3f,BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND);g.drawArc(30,7,32,52,0,180)
            g.stroke=BasicStroke(1f);g.drawLine(16,34,11,84);g.drawLine(18,84,79,84)
            g.color=newColor(accent,Color.WHITE,.65);g.fillOval(38,52,19,19)
            g.color=accent.darker();g.stroke=BasicStroke(1.5f);g.drawLine(43,61,47,65);g.drawLine(47,65,53,56)
        }
        else -> {
            g.color=Color(0,0,0,55);g.translate(1.5,2.5);drawWalletStamp(g,symbol);g.translate(-1.5,-2.5)
            g.paint=gradient(cream,accent);drawWalletStamp(g,symbol)
        }
    }
}

private fun newColor(a:Color,b:Color,t:Double)=Color((a.red+(b.red-a.red)*t).toInt(),(a.green+(b.green-a.green)*t).toInt(),(a.blue+(b.blue-a.blue)*t).toInt())
