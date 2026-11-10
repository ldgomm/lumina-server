package com.premierdarkcoffee.loyalty.wallet.artwork

import com.premierdarkcoffee.loyalty.shared.text

import java.awt.BasicStroke
import java.awt.Graphics2D
import java.awt.geom.*
import kotlin.math.*

/** Provider artwork only. Labels, exact amounts and reward instructions remain native accessible text. */
internal fun CompositionCanvas.panorama() {
    // A wide landscape with three depth planes, its own horizon and a foreground progress shelf.
    val sun = min(w * .14, h * .23)
    fill(circle(w * .74, h * .26, sun), alpha(accent, if (light) 70 else 210))
    for (i in 1..3) stroke(circle(w * .74, h * .26, sun + i * 5), alpha(accent, 25 - i * 5))
    val far = Path2D.Double().apply {
        moveTo(-w * .04, h * .64); curveTo(w * .19, h * .22, w * .35, h * .69, w * .54, h * .42)
        curveTo(w * .72, h * .17, w * .90, h * .48, w * 1.04, h * .31)
        lineTo(w, h); lineTo(0.0, h); closePath()
    }
    sheen(far, 0.0, 0.0, w, h, 85)
    val near = Path2D.Double().apply {
        moveTo(-w * .04, h * .72); curveTo(w * .24, h * .90, w * .39, h * .35, w * .61, h * .64)
        curveTo(w * .81, h * .86, w * .91, h * .54, w * 1.04, h * .69)
        lineTo(w, h); lineTo(0.0, h); closePath()
    }
    fill(near, alpha(accent, if (light) 30 else 36))
    stroke(near, alpha(ink, 28), .8)
    icon(w * .19, h * .28, min(w * .19, h * .34), ink)
    // A quiet foreground prevents the landscape from masking earned/remaining marks.
    val shelf = if (stamps && art.total > 10) .61 else .76
    fill(rect(0.0, h * shelf, w, h * (1-shelf)), alpha(base, 225))
    if (stamps) stampsIn(w * .07, h * (shelf+.01), w * .86, h * (1-shelf-.02), min(art.total, 10))
    else bar(w * .08, h * .85, w * .84, max(6.0, h * .026))
    if (art.total == 0) stroke(Line2D.Double(w * .08, h * .89, w * .25, h * .89), alpha(accent, 100), 1.4)
}

internal fun CompositionCanvas.precision() {
    // Technical drawing: an open instrument, ruled grid and independent measurement compartment.
    val step = max(13.0, h * .075)
    var x = w * .04
    while (x < w) { stroke(Line2D.Double(x, 0.0, x, h), alpha(ink, 12), .6); x += step }
    var y = h * .04
    while (y < h) { stroke(Line2D.Double(0.0, y, w, y), alpha(ink, 12), .6); y += step }
    val divider = w * .56
    stroke(Line2D.Double(divider, h * .12, divider, h * .88), alpha(accent, 110), 1.0)
    val cx = w * .285; val cy = h * .57; val radius = min(w * .205, h * .37)
    if (art.total > 0 && !stamps) {
        stroke(Arc2D.Double(cx-radius, cy-radius, radius*2, radius*2, 0.0, 180.0, Arc2D.OPEN), alpha(ink, 45), max(6.0, radius*.08))
        if (p > 0) stroke(Arc2D.Double(cx-radius, cy-radius, radius*2, radius*2, 180.0, -180*p, Arc2D.OPEN), accent, max(6.0, radius*.08))
        for (i in 0..10) {
            val a = PI - PI*i/10; val r = radius * 1.17
            stroke(Line2D.Double(cx+cos(a)*r,cy-sin(a)*r,cx+cos(a)*(r+4),cy-sin(a)*(r+4)), alpha(ink, 120), 1.1)
        }
        val angle = PI - PI*p
        stroke(Line2D.Double(cx, cy, cx+cos(angle)*radius*.80,cy-sin(angle)*radius*.80), ink, max(2.0,radius*.035))
        fill(circle(cx,cy,4.0),accent)
        icon(w*.78,h*.40,min(w*.20,h*.32),ink)
        stroke(Line2D.Double(w*.65,h*.70,w*.90,h*.70),alpha(accent,100),1.2)
    } else {
        icon(cx, h*.44, min(w*.27,h*.48), ink)
        if (stamps) stampsIn(w*.60,h*.12,w*.35,h*.76,if(art.total<=4)2 else 5,true)
        else for (i in 0..3) stroke(Line2D.Double(w*.64,h*(.27+i*.13),w*(.91-i*.035),h*(.27+i*.13)),alpha(accent,65))
    }
    // Open corners, not a circular badge; these marks never encode progress.
    for ((a,b) in listOf(w*.055 to h*.10, w*.055 to h*.90)) {
        stroke(Line2D.Double(a,b,a+13,b),accent,1.2)
        stroke(Line2D.Double(a,b,a,b+(if(b<h/2)10 else -10)),accent,1.2)
    }
}

internal fun CompositionCanvas.atelier() {
    // Collage: a rotated brand print and a separate contact sheet of accumulated units.
    val sheet = g.create() as Graphics2D
    try {
        sheet.rotate(-.09,w*.26,h*.46)
        sheet.color=alpha(ink,if(light)12 else 16)
        sheet.fill(rect(w*.055,h*.12,w*.40,h*.68,2.0))
        sheet.color=alpha(accent,if(light)55 else 185)
        sheet.fill(rect(w*.085,h*.095,w*.36,h*.68,1.0))
        val brand=sheet.create() as Graphics2D
        try {
            val size=min(w*.23,h*.40)
            brand.translate(w*.265-size/2,h*.41-size/2);brand.scale(size/100,size/100)
            brand.color=if(light)ink else base;drawWalletStamp(brand,art.symbol)
        } finally { brand.dispose() }
        sheet.color=alpha(base,160);sheet.stroke=BasicStroke(1.1f)
        sheet.draw(Line2D.Double(w*.14,h*.66,w*.36,h*.66))
    } finally { sheet.dispose() }
    val tray=rect(w*.52,h*.17,w*.43,h*.63,4.0)
    sheen(tray,w*.52,h*.17,w*.43,h*.63,38)
    if (stamps) stampsIn(w*.54,h*.20,w*.39,h*.57,if(art.total<=6)3 else 5,true)
    else {
        // A rising cut-paper fan is decorative; the separate horizontal rail carries all progress.
        for(i in 0..4) {
            val fan=g.create() as Graphics2D
            try {
                fan.rotate((i-2)*.12,w*.73,h*.61);fan.color=alpha(accent,55+i*30)
                fan.fill(rect(w*.66,h*.29,w*.14,h*.37,2.0))
            } finally {fan.dispose()}
        }
        bar(w*.55,h*.71,w*.36,max(5.0,h*.022),ink)
    }
    // Torn strip at the foot and fine dotted stock keep this distinct even without a goal.
    for(i in 0..12) fill(circle(w*(.12+i*.061),h*.90,1.0),alpha(accent,90))
    val tape=Path2D.Double().apply {
        moveTo(w*.33,h*.08);lineTo(w*.49,h*.12);lineTo(w*.47,h*.19);lineTo(w*.31,h*.15);closePath()
    }
    fill(tape,alpha(ink,65))
}
