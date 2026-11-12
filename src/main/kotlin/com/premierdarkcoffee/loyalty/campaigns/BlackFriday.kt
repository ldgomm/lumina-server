package com.premierdarkcoffee.loyalty.campaigns

import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.exec
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.shared.Program
import com.premierdarkcoffee.loyalty.shared.need
import java.sql.Connection
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

private val campaignZone = ZoneId.of("America/Guayaquil")
fun blackFridayStart(year: Int): Instant = LocalDate.of(year,11,1).atStartOfDay(campaignZone).toInstant()
fun blackFridayEnd(year: Int): Instant = LocalDate.of(year,12,1).atStartOfDay(campaignZone).toInstant()
fun Program.validateBlackFriday() {
    need(blackFridayMessage.length <= 300,"INVALID_CAMPAIGN","Las condiciones admiten hasta 300 caracteres.")
    val year = blackFridayYear
    if (year == null) {
        need(blackFridayMessage.isEmpty(),"INVALID_CAMPAIGN","Las condiciones de Viernes Negro requieren una campaña.")
        return
    }
    need(year in 2026..2199,"INVALID_CAMPAIGN","El año de la campaña no es válido.")
    val start=window.startsAt?.let(Instant::parse);val end=window.endsAt?.let(Instant::parse)
    need(start!=null && end!=null && start>=blackFridayStart(year) && end<=blackFridayEnd(year) && end>start,
        "INVALID_CAMPAIGN_WINDOW","Viernes Negro solo puede estar vigente en noviembre. Se desactiva como máximo el 1 de diciembre a las 00:00 de Ecuador continental.")
}
fun Program.blackFridayAvailable(at: Instant): Boolean {
    val year=blackFridayYear ?: return true
    return at>=blackFridayStart(year) && at<blackFridayEnd(year) &&
        window.startsAt?.let { at>=Instant.parse(it) }==true && window.endsAt?.let { at<Instant.parse(it) }==true
}
object BlackFridayMigration {
    fun apply(c: Connection) {
        val sql=requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V015.sql")).readText()
        val hash=SqlFingerprint.checksum(sql)
        val old=c.one("SELECT checksum FROM comeback_migrations WHERE version=15"){it.getString(1)}
        check(old==null || old==hash){"Migration V015 changed beyond formatting."}
        if(old==null){c.createStatement().use { it.execute(sql) };c.exec("INSERT INTO comeback_migrations(version,checksum) VALUES(15,?)",hash)}
    }
}
