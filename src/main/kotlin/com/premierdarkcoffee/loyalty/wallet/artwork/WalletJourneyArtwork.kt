package com.premierdarkcoffee.loyalty.wallet.artwork

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows

import java.awt.*
import java.awt.geom.*
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.math.pow

/** Decorative, bounded and anonymous. Exact progress and reward are native pass fields. */
internal fun WalletArtwork.journeyPng(appleScale: Int?): ByteArray {
    val width = appleScale?.let { 375 * it } ?: 1032
    val height = appleScale?.let { 123 * it } ?: 812
    val image = BufferedImage(width, height, BufferedImage.TYPE_INT_RGB)
    val g = image.createGraphics()
    try {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON)
        val base = Color.decode("#$background")
        fun channel(value: Int): Double { val v=value/255.0;return if(v<=.04045)v/12.92 else ((v+.055)/1.055).pow(2.4) }
        val light = channel(base.red)*.2126 + channel(base.green)*.7152 + channel(base.blue)*.0722 > .179
        val ink = if(light) Color(11,31,58) else Color.WHITE
        fun tone(alpha: Int) = Color(ink.red,ink.green,ink.blue,alpha)
        fun icon(symbol: Int, x: Double, y: Double, size: Double, color: Color, alpha: Float = 1f) {
            val copy=g.create() as Graphics2D
            try { copy.translate(x-size/2,y-size/2);copy.scale(size/100,size/100);copy.color=color
                copy.composite=AlphaComposite.getInstance(AlphaComposite.SRC_OVER,alpha);drawWalletStamp(copy,symbol)
            } finally { copy.dispose() }
        }
        fun check(x: Double, y: Double, size: Double) {
            g.stroke=BasicStroke((size*.16).toFloat(),BasicStroke.CAP_ROUND,BasicStroke.JOIN_ROUND)
            val p=Path2D.Double();p.moveTo(x-size*.35,y);p.lineTo(x-size*.08,y+size*.25);p.lineTo(x+size*.4,y-size*.27);g.draw(p)
        }
        g.paint=if(style=="GRADIENT" && total>0) GradientPaint(0f,0f,if(light)base.brighter() else base,width.toFloat(),height.toFloat(),base.darker()) else base
        g.fillRect(0,0,width,height)
        if(total>0) {
            if(style=="GRADIENT") {
                g.color=tone(9);g.fill(Ellipse2D.Double(width*.65,-height*.52,width*.8,height*1.15))
                g.color=tone(18);g.stroke=BasicStroke(maxOf(1f,(width*.001).toFloat()))
                for(i in 0..2)g.draw(Arc2D.Double(-width*.3,height*.45+i*height*.10,width*1.4,height*1.4,5.0,160.0,Arc2D.OPEN))
            }
            if(total==100) {
                val badge=height*(if(appleScale==null).37 else .52)
                val cy=height*.34
                g.color=tone(12);g.fill(Ellipse2D.Double(width/2.0-badge*.63,cy-badge*.63,badge*1.26,badge*1.26))
                icon(symbol,width/2.0,cy,badge*.79,ink)
                val left=width*.075;val right=width*.79;val track=right-left;val gap=track*.012
                val segment=(track-9*gap)/10;val by=height*.76;val bh=height*(if(appleScale==null).055 else .07)
                for(i in 0..9) {
                    val tile=RoundRectangle2D.Double(left+i*(segment+gap),by,segment,bh,bh*.4,bh*.4)
                    g.color=tone(27);g.fill(tile);g.stroke=BasicStroke(maxOf(1f,(width*.001).toFloat()));g.color=tone(110);g.draw(tile)
                    val part=((filled-i*10)/10.0).coerceIn(0.0,1.0)
                    if(part>0){val copy=g.create() as Graphics2D;try{copy.clip(tile);copy.color=ink;copy.fill(Rectangle2D.Double(left+i*(segment+gap),by,segment*part,bh))}finally{copy.dispose()}}
                }
                if(filled in 1..99) {
                    val pos=left+track*filled/100.0;val marker=bh*.65
                    g.color=ink;val arrow=Path2D.Double();arrow.moveTo(pos-marker*.6,by-marker*1.7);arrow.lineTo(pos+marker*.6,by-marker*1.7);arrow.lineTo(pos,by-marker*.7);arrow.closePath();g.fill(arrow)
                }
                val prize=height*(if(appleScale==null).13 else .25);val px=width*.90;val py=by+bh/2
                g.color=if(filled==100)ink else tone(12);g.fill(Ellipse2D.Double(px-prize/2,py-prize/2,prize,prize))
                g.color=tone(180);g.draw(Ellipse2D.Double(px-prize/2,py-prize/2,prize,prize))
                if(filled==100){g.color=if(light)Color.WHITE else base;check(px,py,prize*.48)}else icon(26,px,py,prize*.56,ink)
            } else {
                val columns=if(appleScale!=null)minOf(total,10)else when { total<=4->minOf(total,2);total<=9->3;total<=12->4;else->5 }
                val rows=(total+columns-1)/columns
                val cell=minOf(width*.88/columns,height*.78/rows);val size=cell*.76
                for(index in 0 until total) {
                    val row=index/columns;val count=minOf(columns,total-row*columns)
                    val x=width/2.0+(index%columns-(count-1)/2.0)*cell
                    val y=height/2.0+(row-(rows-1)/2.0)*cell
                    val earned=index<filled;val next=index==filled
                    val tile=RoundRectangle2D.Double(x-size/2,y-size/2,size,size,size*.3,size*.3)
                    g.color=if(earned)ink else tone(if(next)18 else 5);g.fill(tile)
                    g.stroke=BasicStroke(maxOf(1f,(size*if(next).035 else .018).toFloat()));g.color=tone(if(earned||next)255 else 90);g.draw(tile)
                    icon(symbol,x,y,size*.52,if(earned)(if(light)Color.WHITE else base.darker())else ink,if(earned)1f else if(next).8f else .25f)
                    if(earned && size>=16){g.color=if(light)Color.WHITE else base;check(x+size*.30,y+size*.31,size*.17)}
                }
            }
        }
    } finally { g.dispose() }
    return ByteArrayOutputStream().also { ImageIO.write(image,"png",it) }.toByteArray()
}
