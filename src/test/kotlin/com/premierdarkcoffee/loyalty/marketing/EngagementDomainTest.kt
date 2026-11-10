package com.premierdarkcoffee.loyalty.marketing

import com.premierdarkcoffee.loyalty.application.body
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.Bonus
import com.premierdarkcoffee.loyalty.shared.Kind
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.Purchase
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.shared.obj
import com.premierdarkcoffee.loyalty.shared.text
import com.premierdarkcoffee.loyalty.wallet.WalletPass
import com.premierdarkcoffee.loyalty.wallet.providers.walletLogo

import org.junit.jupiter.api.Test
import kotlinx.serialization.json.*
import java.time.*
import java.util.Base64
import kotlin.test.*

class EngagementDomainTest {
    private val at=Instant.parse("2026-11-04T17:00:00Z")
    private val zone=ZoneId.of("America/Guayaquil")
    private val items=listOf(PurchaseItem("Pizza A","pizza",2,1000),PurchaseItem("Pizza B","pizza",1,800),PurchaseItem("Bebida","bebida",1,500))
    private fun purchase()=Purchase("member","branch","receipt",3300,"USD",items)
    @Test fun `free item takes one cheapest eligible unit and never another category`() {assertEquals(800,Benefit(group="PIZZA").discount(items));assertEquals(400,Benefit(5000,"pizza").discount(items))}
    @Test fun `percentage basket covers eligible products with integer rounding`() {assertEquals(560,Benefit(2000,"pizza","BASKET").discount(items));assertEquals(19,Benefit(2000,"ropa","BASKET").discount(listOf(PurchaseItem("Prenda","ropa",1,99))))}
    @Test fun `benefit rejects missing category invalid scope and percent`() {assertFailsWith<Problem>{Benefit(group="corte").discount(items)};assertFailsWith<Problem>{Benefit(10001,"pizza").validate()};assertFailsWith<Problem>{Benefit(5000,"pizza","ANY").validate()}}
    @Test fun `unit stamps count pizzas not beverages or visits`() {val p=Program("Pizzas",Kind.STAMPS,productGroup="pizza",countUnits=true);assertEquals(3,p.earnReceipt(purchase(),"a",ReceiptCalculation(3300,0),at,zone));assertEquals(0,p.earnReceipt(purchase().copy(items=emptyList()),"a",ReceiptCalculation(3300,0),at,zone))}
    @Test fun `visit stamps count one receipt and preserve scheduled multipliers`() {val p=Program("Visita",Kind.STAMPS,productGroup="pizza",bonuses=listOf(Bonus(1,2)));assertEquals(2,p.earnReceipt(purchase(),"a",ReceiptCalculation(3300,0),at,zone))}
    @Test fun `cashback uses paid amount and selected programs only`() {val p=Program("Cashback",Kind.CASHBACK,cashbackBps=500);assertEquals(125,p.earnReceipt(purchase(),"a",ReceiptCalculation(3300,800),at,zone));assertEquals(0,p.earnReceipt(purchase().copy(programIds=emptySet()),"a",ReceiptCalculation(3300,0),at,zone))}
    @Test fun `redeemed promotion cannot earn itself back on same purchase`() {val p=Program("Pizzas",Kind.STAMPS,productGroup="pizza",countUnits=true);assertEquals(0,p.earnReceipt(purchase(),"a",ReceiptCalculation(3300,800,obj("programId" to "a")),at,zone))}
    @Test fun `design validates contrast safe png and stamp symbol`() {
        WalletDesign().validate()
        WalletDesign(logoPng=Base64.getEncoder().encodeToString(walletLogo(36))).validate()
        val both=assertFailsWith<Problem>{WalletDesign(background="#ffffff").validate()}
        assertTrue(both.message!!.contains("Color del texto y Color de las etiquetas"))
        assertTrue(both.message!!.contains("negro (#000000)"))
        assertTrue(both.message!!.contains("Corregir colores"))
        val labels=assertFailsWith<Problem>{WalletDesign(background="#ffffff",foreground="#000000").validate()}
        assertTrue(labels.message!!.contains("Color de las etiquetas"))
        assertFalse(labels.message!!.contains("Color del texto"))
        val text=assertFailsWith<Problem>{WalletDesign(background="#000000",foreground="#000000",label="#ffffff").validate()}
        assertTrue(text.message!!.contains("Color del texto"))
        assertTrue(text.message!!.contains("blanco (#FFFFFF)"))
        assertFalse(text.message!!.contains("Color de las etiquetas"))
        WalletDesign(background="#ffffff",foreground="#000000",label="#000000").validate()
        WalletDesign(background="#000000",foreground="#ffffff",label="#ffffff").validate()
        WalletDesign(background="#ffffff",foreground="#767676",label="#949494").validate()
        assertFailsWith<Problem>{WalletDesign(background="#ffffff",foreground="#777777",label="#000000").validate()}
        assertFailsWith<Problem>{WalletDesign(background="#ffffff",foreground="#000000",label="#959595").validate()}
        assertFailsWith<Problem>{WalletDesign(logoPng=Base64.getEncoder().encodeToString("<svg/>".toByteArray())).validate()}
        assertFailsWith<Problem>{WalletDesign(stampSymbol="<html>").validate()}}
    @Test fun `birthday uses month day with February 29 on February 28 in ordinary years`() {val p=CustomerPreferences("02-29",true);p.validate();assertTrue(p.celebrates(LocalDate.of(2027,2,28)));assertTrue(p.celebrates(LocalDate.of(2028,2,29)));assertFalse(p.celebrates(LocalDate.of(2028,2,28)));assertFailsWith<Problem>{CustomerPreferences("02-30").validate()}}
    @Test fun `progress and marketing have distinct native notification behavior`() {
        val snapshot=obj("rewardProgress" to listOf(obj("id" to "r","programId" to "p","name" to "Corte gratis","kind" to "STAMPS","goal" to 7,"available" to 6,"remaining" to 1,"message" to "Te falta 1 sello para Corte gratis")),"announcements" to listOf(obj("id" to "event","title" to "Evento","body" to "Ven el sábado")))
        val p=WalletPass("t","m","s","token",snapshot,1,at,null,null,null)
        assertEquals("%@",p.progressFields().single().getValue("changeMessage").jsonPrimitive.content)
        assertFalse(p.announcementFields().single().containsKey("changeMessage"))
        assertTrue(p.progressFields().single().getValue("value").jsonPrimitive.content.endsWith("●●●●●●○"))
    }
}
