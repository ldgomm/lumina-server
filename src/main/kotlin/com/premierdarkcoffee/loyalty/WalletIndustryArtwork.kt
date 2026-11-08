package com.premierdarkcoffee.loyalty

import java.awt.BasicStroke
import java.awt.Graphics2D
import java.awt.geom.Path2D

/** Stable symbol IDs, drawn locally so Linux and macOS never depend on emoji fonts. */
internal fun drawIndustryStamp(g: Graphics2D, symbol: Int) {
    g.stroke = BasicStroke(6f, BasicStroke.CAP_ROUND, BasicStroke.JOIN_ROUND)
    fun line(a: Int, b: Int, c: Int, d: Int) = g.drawLine(a,b,c,d)
    fun path(vararg points: Int) {
        val p = Path2D.Double(); p.moveTo(points[0].toDouble(), points[1].toDouble())
        for (i in 2 until points.size step 2) p.lineTo(points[i].toDouble(), points[i+1].toDouble())
        g.draw(p)
    }
    when (symbol) {
        10 -> { g.drawArc(10,12,80,64,0,180);line(10,44,90,44);path(10,55,30,64,48,54,70,64,90,55);g.drawRoundRect(10,72,80,16,10,10);line(33,27,36,27);line(56,22,59,22);line(72,31,75,31) }
        11 -> { path(7,72,15,40,33,19,65,19,84,40,93,72,77,81,64,65,35,65,23,81,7,72);line(33,19,35,65);line(65,19,64,65);line(15,40,29,51);line(84,40,70,51) }
        12 -> { path(29,46,50,94,71,46,29,46);g.drawArc(20,8,60,56,0,180);line(20,36,20,46);line(80,36,80,46);line(20,46,80,46);line(37,60,61,72);line(62,61,44,73) }
        13 -> { path(5,14,18,14,30,65,79,65,91,30,24,30);line(35,45,79,45);g.drawOval(28,78,12,12);g.drawOval(70,78,12,12) }
        14 -> { g.drawRoundRect(12,43,76,44,6,6);path(12,56,25,65,38,56,50,65,62,56,75,65,88,56);line(30,43,30,27);line(50,43,50,21);line(70,43,70,27);g.fillOval(26,13,8,10);g.fillOval(46,7,8,10);g.fillOval(66,13,8,10) }
        15 -> { g.fillOval(24,46,52,40);g.fillOval(5,28,20,28);g.fillOval(27,8,20,28);g.fillOval(54,8,20,28);g.fillOval(76,29,20,28) }
        16 -> { for (i in 0..4) { val s=g.create() as Graphics2D;try{s.rotate(i*Math.PI*2/5,50.0,50.0);s.drawOval(37,4,26,40)}finally{s.dispose()} };g.fillOval(39,39,22,22) }
        17 -> { g.drawRoundRect(17,22,17,56,4,4);g.drawRoundRect(66,22,17,56,4,4);line(34,50,66,50);line(7,34,7,66);line(93,34,93,66);line(7,50,17,50);line(83,50,93,50) }
        18 -> { g.drawRoundRect(24,5,52,90,10,10);line(40,16,60,16);line(27,75,73,75);g.fillOval(46,81,8,8) }
        19 -> { g.drawArc(12,11,76,80,0,180);g.drawRoundRect(8,47,19,39,8,8);g.drawRoundRect(73,47,19,39,8,8);line(13,47,13,52);line(87,47,87,52) }
        20 -> { path(13,46,25,18,73,18,87,46);g.drawRoundRect(8,46,84,34,10,10);line(15,80,15,90);line(85,80,85,90);line(22,60,31,60);line(69,60,78,60);line(39,69,61,69) }
        21 -> { g.drawOval(8,8,84,84);g.drawOval(25,25,50,50);g.fillOval(43,43,14,14);for(i in 0..7){val s=g.create() as Graphics2D;try{s.rotate(i*Math.PI/4,50.0,50.0);s.drawLine(50,10,58,21);s.drawLine(50,35,50,43)}finally{s.dispose()}} }
        22 -> { g.drawRoundRect(14,5,72,90,6,6);line(14,27,86,27);g.fillOval(24,14,5,5);g.fillOval(36,14,5,5);g.drawOval(28,40,44,44);g.drawArc(31,50,38,25,180,180) }
        23 -> { g.drawRoundRect(12,12,18,76,3,3);g.drawRoundRect(34,8,18,80,3,3);path(59,17,75,12,96,83,80,88,59,17);line(16,29,26,29);line(38,27,48,27);line(68,31,81,27) }
        24 -> { val p=Path2D.Double();p.moveTo(50.0,23.0);p.curveTo(5.0,-7.0,8.0,48.0,23.0,82.0);p.curveTo(36.0,111.0,35.0,49.0,50.0,52.0);p.curveTo(65.0,49.0,64.0,111.0,77.0,82.0);p.curveTo(92.0,48.0,95.0,-7.0,50.0,23.0);g.draw(p);g.drawArc(36,9,25,20,200,110) }
        25 -> { path(17,90,35,66,51,45,72,22);g.drawOval(44,11,42,25);g.drawOval(15,37,33,22);g.drawOval(45,53,40,24);line(36,64,62,64);line(51,45,29,46) }
        26 -> { g.drawRect(17,43,66,47);g.drawRect(10,29,80,16);line(50,30,50,90);g.drawOval(23,7,27,22);g.drawOval(50,7,27,22) }
        27 -> { path(5,44,50,8,95,44);path(18,37,18,90,82,90,82,37);g.drawRect(40,57,22,33);g.drawRect(25,48,8,10) }
        28 -> { g.drawOval(7,34,34,34);g.drawOval(59,34,34,34);g.drawArc(40,40,20,18,0,180);path(8,46,15,20,24,20);path(92,46,85,20,76,20) }
        29 -> { g.drawOval(8,9,40,40);g.fillOval(22,23,11,11);path(43,43,90,90,97,82,86,71,79,78,70,69,77,62,51,36) }
        30 -> { path(20,29,43,6,75,10,88,26,66,26,55,37,64,46,52,58,20,29);path(43,49,10,82,21,93,54,60) }
        31 -> { g.drawRoundRect(13,9,49,77,7,7);g.drawRect(22,19,31,23);line(7,91,67,91);path(63,51,76,51,76,76,88,76,88,27,76,15);line(81,20,90,31);line(90,31,90,42) }
        32 -> { line(20,9,20,34);line(32,9,32,34);line(44,9,44,34);path(20,34,20,43,32,51,44,43,44,34);line(32,51,32,92);path(78,8,64,35,64,54,80,54);line(80,8,80,92) }
        else -> error("Unknown business symbol")
    }
}
