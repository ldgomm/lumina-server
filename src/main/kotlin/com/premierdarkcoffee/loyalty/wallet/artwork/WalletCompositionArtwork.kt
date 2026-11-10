package com.premierdarkcoffee.loyalty.wallet.artwork

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.text

import java.awt.*
import java.awt.geom.*
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import javax.imageio.ImageIO
import kotlin.math.*

/** Composition is independent of industry, palette and finish. SIGNATURE preserves saved designs. */
val walletCompositionsV29 = setOf("SIGNATURE", "EDITORIAL", "STAMPBOOK", "TICKET", "MOSAIC", "RIBBON", "PATH")
val walletCompositions = walletCompositionsV29 + setOf("PANORAMA", "PRECISION", "ATELIER")

/** Actual provider assets. No text, QR, user data, fonts, network or database calls. */
internal fun WalletArtwork.compositionPng(appleScale: Int?, poster: Boolean = false): ByteArray {
    if (composition == "SIGNATURE") return signaturePng(appleScale, poster)
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
        g.color = base; g.fillRect(0, 0, w, h)
        // Poster header and native QR/text zones stay flat for the validated text contrast.
        val top = if (poster) 66.0 else 0.0
        val artHeight = if (poster) 182.0 else h.toDouble()
        val art = g.create() as Graphics2D
        try {
            art.translate(0.0, top); art.clip(Rectangle2D.Double(0.0, 0.0, w.toDouble(), artHeight))
            CompositionCanvas(art, this, w.toDouble(), artHeight).draw()
        } finally { art.dispose() }
        if (poster) {
            g.paint = GradientPaint(0f, 239f, Color(base.red, base.green, base.blue, 0), 0f, 257f, base)
            g.fillRect(0, 239, w, h - 239)
        }
    } finally { g.dispose() }
    return ByteArrayOutputStream().also { ImageIO.write(image, "png", it) }.toByteArray()
}

internal class CompositionCanvas(val g: Graphics2D, val art: WalletArtwork, val w: Double, val h: Double) {
    val base = Color.decode("#${art.background}")
    val light = luminance(base) > .179
    val ink = if (light) Color(13, 30, 51) else Color(249, 246, 237)
    val accent = walletArtworkAccent(art.accent, base, when (art.style) {
        "SOLID" -> ink
        "AURORA" -> if (light) Color(24, 86, 129) else Color(139, 224, 239)
        else -> if (light) Color(127, 78, 25) else Color(238, 195, 137)
    })
    val edge = if (art.accent == null && art.style == "AURORA") Color(156, 161, 240) else accent
    val margin = min(w * .055, h * .10)
    val p = if (art.total == 0) 0.0 else art.filled.toDouble() / art.total
    val stamps = art.total in 1..20
    fun draw() {
        when (art.composition) {
            "EDITORIAL" -> editorial()
            "STAMPBOOK" -> stampbook()
            "TICKET" -> ticket()
            "MOSAIC" -> mosaic()
            "RIBBON" -> ribbon()
            "PATH" -> path()
            "PANORAMA" -> panorama()
            "PRECISION" -> precision()
            "ATELIER" -> atelier()
        }
    }
    fun alpha(c: Color, a: Int) = Color(c.red, c.green, c.blue, a)
    fun fill(shape: Shape, color: Color) { g.color = color; g.fill(shape) }
    fun stroke(shape: Shape, color: Color, width: Double = 1.0) {
        g.color = color; g.stroke = BasicStroke(width.toFloat(), BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND); g.draw(shape)
    }
    fun rect(x: Double, y: Double, width: Double, height: Double, radius: Double = 0.0) = RoundRectangle2D.Double(x,y,width,height,radius,radius)
    fun circle(x: Double, y: Double, r: Double) = Ellipse2D.Double(x-r,y-r,r*2,r*2)
    fun icon(x: Double, y: Double, size: Double, color: Color = accent, angle: Double = 0.0) {
        val i = g.create() as Graphics2D
        try { i.translate(x,y);i.rotate(angle);i.translate(-size/2,-size/2);i.scale(size/100,size/100);i.color=color;drawWalletStamp(i,art.symbol) } finally { i.dispose() }
    }
    fun sheen(shape: Shape, x: Double, y: Double, width: Double, height: Double, strength: Int = 40) {
        if(art.style == "SOLID") { fill(shape,alpha(accent,strength/2)); return }
        g.paint = LinearGradientPaint(x.toFloat(),y.toFloat(),(x+width).toFloat(),(y+height).toFloat(),floatArrayOf(0f,.48f,1f),
            arrayOf(alpha(accent,strength),alpha(ink,strength/3),alpha(edge,strength/2)))
        g.fill(shape)
    }
    fun bar(x: Double, y: Double, width: Double, height: Double, color: Color = accent) {
        if (art.total == 0) return
        val rail = rect(x,y,width,height,height)
        fill(rail,alpha(ink,35))
        if(p>0) { val b=g.create() as Graphics2D;try { b.clip(rail);b.color=color;b.fill(Rectangle2D.Double(x,y,width*p,height)) } finally { b.dispose() } }
        if(p in 0.0..0.999999) stroke(Line2D.Double(x+width*p,y-height*.25,x+width*p,y+height*1.25),ink,1.3)
    }
    fun stampsIn(x: Double, y: Double, width: Double, height: Double, columns: Int, tile: Boolean = false) {
        if (!stamps) return
        val cols = min(columns,art.total);val rows=(art.total+cols-1)/cols
        val cw=width/cols;val ch=height/rows;val size=min(cw*.75,ch*.73)
        for(n in 0 until art.total) {
            val row=n/cols;val count=min(cols,art.total-row*cols)
            val cx=x+width/2+(n%cols-(count-1)/2.0)*cw;val cy=y+ch*(row+.5)
            val shape=if(tile)rect(cx-size/2,cy-size/2,size,size,size*.16) else circle(cx,cy,size/2)
            val earned=n<art.filled
            fill(shape,alpha(accent,if(earned)235 else 8));stroke(shape,alpha(ink,if(earned)0 else 100),.8)
            icon(cx,cy,size*.56,if(earned)base else alpha(ink,105))
        }
    }
    // Large off-centre crop with an inset counter: no medallion or centered stack.
    fun editorial() {
        val diagonal=Path2D.Double().apply {moveTo(w*.53,0.0);lineTo(w,0.0);lineTo(w,h);lineTo(w*.35,h);closePath()}
        sheen(diagonal,0.0,0.0,w,h,76)
        val radius=min(w*.45,h*.71)
        stroke(circle(w*.89,h*.42,radius),alpha(accent,65),max(1.0,h*.004))
        stroke(circle(w*.89,h*.42,radius+9),alpha(accent,25))
        icon(w*.78,h*.39,min(h*.67,w*.46),ink,-.13)
        stroke(Line2D.Double(margin,h*.18,w*.35,h*.18),accent,2.5)
        stroke(Line2D.Double(margin,h*.25,w*.16,h*.25),alpha(accent,100),1.0)
        if(stamps) stampsIn(margin,h*.40,w*.46,h*.43,if(art.total>10 && h<200)10 else if(art.total>10)5 else if(art.total>4)4 else art.total,true)
        else bar(margin,h*.72,w*.44,max(6.0,h*.035))
        if(art.total>0) stroke(Line2D.Double(margin,h*.91,w*.44,h*.91),alpha(accent,60))
    }
    // Stationery composition: two skewed paper sheets and an actual stamp field.
    fun stampbook() {
        val cx=w*.50;val cy=h*.48;val rw=w*.87;val rh=h*.76
        val sheet=g.create() as Graphics2D
        try {
            sheet.rotate(-.04,cx,cy);sheet.color=alpha(accent,35);sheet.fill(rect(cx-rw/2,cy-rh/2,rw,rh,9.0))
        } finally {sheet.dispose()}
        val page=rect(cx-rw/2,cy-rh/2,rw,rh,7.0)
        fill(page,alpha(ink,if(light)9 else 13));stroke(page,alpha(accent,110))
        val left=cx-rw/2
        for(i in 0..5) { val y=cy-rh*.36+i*rh*.144;fill(circle(left+rw*.065,y,min(2.6,rh*.014)),base);stroke(circle(left+rw*.065,y,min(2.6,rh*.014)),alpha(accent,80)) }
        stroke(Line2D.Double(left+rw*.13,cy-rh*.42,left+rw*.13,cy+rh*.42),alpha(accent,65))
        if(stamps) stampsIn(left+rw*.18,cy-rh*.41,rw*.74,rh*.82,if(art.total<=5)art.total else 5)
        else {
            icon(w*.60,cy-rh*.06,min(rh*.53,rw*.30),accent)
            bar(left+rw*.21,cy+rh*.31,rw*.68,max(5.0,rh*.045))
        }
        // Folded upper right corner, distinct from both frame and progress marks.
        val fold=Path2D.Double().apply {moveTo(cx+rw/2-21,cy-rh/2);lineTo(cx+rw/2,cy-rh/2+21);lineTo(cx+rw/2-21,cy-rh/2+21);closePath()}
        fill(fold,alpha(accent,80))
    }
    // Coupon: contrasting left stub, perforated seam, right progress tray.
    fun ticket() {
        val x=margin;val y=h*.14;val width=w-2*margin;val height=h*.70;val seam=x+width*.31
        val shape=rect(x,y,width,height,min(14.0,height*.10))
        sheen(shape,x,y,width,height,48);stroke(shape,alpha(accent,180))
        val stub=g.create() as Graphics2D
        try {stub.clip(shape);stub.color=alpha(accent,if(light)35 else 190);stub.fill(Rectangle2D.Double(x,y,width*.31,height))}finally{stub.dispose()}
        icon(x+width*.155,y+height*.5,min(width*.19,height*.53),if(light)ink else base)
        for(i in 0..12) { val py=y+height*i/12;stroke(Line2D.Double(seam,py,seam,min(y+height,py+height*.025)),alpha(ink,130)) }
        fill(circle(seam,y,min(height*.075,12.0)),base);fill(circle(seam,y+height,min(height*.075,12.0)),base)
        val rx=seam+width*.055;val rw=width*.58
        if(stamps) stampsIn(rx,y+height*.12,rw,height*.76,if(art.total<=5)art.total else 5,true)
        else {
            val bars=5
            for(i in 0 until bars) stroke(Line2D.Double(rx,y+height*.22+i*height*.08,rx+rw*(.72-i*.08),y+height*.22+i*height*.08),alpha(accent,35),1.2)
            bar(rx,y+height*.72,rw,max(6.0,height*.055))
        }
    }
    // Bauhaus-like modular shapes: the negative spaces make a different silhouette even in monochrome.
    fun mosaic() {
        val x=margin;val y=h*.09;val width=w-2*margin;val height=h*(if(stamps).61 else .77);val gap=min(9.0,h*.04)
        val first=width*.33;val second=width*.30;val last=width-first-second-2*gap
        val a=rect(x,y,first,height,first*.48);sheen(a,x,y,first,height,90)
        val iconSize=min(first*.72,height*.47);icon(x+first/2,y+height*.5,iconSize,ink)
        val bx=x+first+gap
        fill(rect(bx,y,second,height*.43,2.0),alpha(accent,215))
        stroke(Arc2D.Double(bx+second*.08,y+height*.03,second*.84,height*.36,0.0,180.0,Arc2D.OPEN),base,max(2.0,h*.018))
        val by=y+height*.43+gap;val bh=height*.57-gap
        for(i in 0..4) stroke(Line2D.Double(bx,by+bh*i/4,bx+second,by+bh*i/4),alpha(accent,65),max(1.0,h*.005))
        val cx=bx+second+gap
        sheen(rect(cx,y,last,height,0.0),cx,y,last,height,55)
        val disk=min(last,height*.45)*.42
        fill(circle(cx+last/2,y+height*.28,disk),alpha(ink,180))
        fill(circle(cx+last/2+disk*.45,y+height*.28-disk*.32,disk*.79),base)
        if(stamps) stampsIn(x,h*.73,width,h*.24,min(art.total,10),true)
        else bar(x,h*.91,width,max(5.0,h*.022))
    }
    // A diagonally woven ribbon replaces both the card frame and icon ring.
    fun ribbon() {
        val path=Path2D.Double().apply {moveTo(-w*.08,h*.79);curveTo(w*.17,-h*.25,w*.47,h*1.27,w*1.06,h*.12)}
        val band=BasicStroke((h*.23).toFloat(),BasicStroke.CAP_BUTT,BasicStroke.JOIN_ROUND).createStrokedShape(path)
        sheen(band,0.0,0.0,w,h,155)
        stroke(path,alpha(ink,30),max(1.0,h*.004))
        val thread=Path2D.Double().apply {moveTo(-w*.04,h*.94);curveTo(w*.16,-h*.12,w*.52,h*1.41,w*1.08,h*.26)}
        stroke(thread,alpha(accent,100),1.0)
        icon(w*.76,h*.31,min(w*.23,h*.35),ink,.17)
        if(stamps) stampsIn(w*.06,h*.56,w*.63,h*.37,if(art.total<=5)art.total else if(h<200 && art.total>10)10 else 5)
        else bar(w*.08,h*.76,w*.53,max(5.0,h*.025),ink)
        if(art.total==0) icon(w*.23,h*.58,min(w*.15,h*.23),alpha(accent,110),-.17)
    }
    // A continuous route with a destination; discrete stops are used only for real stamps.
    fun path() {
        val left=w*.08;val right=w*.75;val y=h*.54
        val route=Path2D.Double().apply {moveTo(left,y);curveTo(w*.28,h*.13,w*.45,h*.98,right,y)}
        if(art.total>0) {
            stroke(route,alpha(ink,30),max(3.0,h*.025))
            val samples=160
            fun point(t:Double):Point2D.Double {val s=1-t;return Point2D.Double(s*s*s*left+3*s*s*t*w*.28+3*s*t*t*w*.45+t*t*t*right,s*s*s*y+3*s*s*t*h*.13+3*s*t*t*h*.98+t*t*t*y)}
            // Sample by arc length, so 50% means half the visible route, not half its Bezier parameter.
            val points=(0..samples).map{point(it.toDouble()/samples)};val lengths=DoubleArray(samples+1)
            for(i in 1..samples)lengths[i]=lengths[i-1]+points[i].distance(points[i-1])
            fun at(fraction:Double):Point2D.Double {
                val target=lengths.last()*fraction;val i=(1..samples).firstOrNull{lengths[it]>=target}?:samples
                val weight=if(lengths[i]==lengths[i-1])0.0 else (target-lengths[i-1])/(lengths[i]-lengths[i-1])
                return Point2D.Double(points[i-1].x+(points[i].x-points[i-1].x)*weight,points[i-1].y+(points[i].y-points[i-1].y)*weight)
            }
            if(p>0) {val earned=Path2D.Double().apply {moveTo(left,y);for(i in 1..samples) {if(lengths[i]<lengths.last()*p)lineTo(points[i].x,points[i].y)};val end=at(p);lineTo(end.x,end.y)};stroke(earned,accent,max(3.0,h*.025))}
            if(stamps) for(i in 1..art.total) {val stop=at(i.toDouble()/art.total);val r=min(7.0,w/(art.total*3.0));fill(circle(stop.x,stop.y,r+2),base);fill(circle(stop.x,stop.y,r),if(i<=art.filled)accent else alpha(ink,45))}
            val current=at(p);fill(circle(current.x,current.y,min(5.0,h*.025)),ink)
        }
        val endX=w*.87;val size=min(w*.15,h*.30)
        // Destination glyph is branding, never a claim that a reward was already redeemed.
        icon(endX,y,size,accent)
        stroke(Line2D.Double(endX-size*.65,y+size*.64,endX+size*.65,y+size*.64),alpha(accent,100))
        for(i in 0..5) stroke(Arc2D.Double(w*.05-i*9,h*.11-i*7,w*.53+i*18,h*.85+i*14,30.0,114.0,Arc2D.OPEN),alpha(accent,15))
    }
    companion object {
        fun luminance(c: Color): Double {
            fun channel(n:Int):Double {val v=n/255.0;return if(v<=.04045)v/12.92 else ((v+.055)/1.055).pow(2.4)}
            return channel(c.red)*.2126+channel(c.green)*.7152+channel(c.blue)*.0722
        }
    }
}
