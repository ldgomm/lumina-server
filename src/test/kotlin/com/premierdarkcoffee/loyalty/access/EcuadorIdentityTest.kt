package com.premierdarkcoffee.loyalty.access

import org.junit.jupiter.api.Test
import kotlin.test.*

class EcuadorIdentityTest {
    private fun check(body: String): String {
        val total=body.mapIndexed { i,d -> val n=d.digitToInt()*if(i%2==0)2 else 1; if(n>9)n-9 else n }.sum()
        return body+((10-total%10)%10)
    }
    @Test fun `cedula supports leading zero consular and documented third digit exceptions`() {
        for(body in listOf("010123456","170123456","300123456","176123456"))assertTrue(consistentCedula(check(body)),body)
    }
    @Test fun `invalid format province checksum and controls are rejected`() {
        for(value in listOf("", "1712345678","0000000000","171234567A","17123456789","170 123456","17012\n3456",check("250123456"),check("990123456")))assertFalse(consistentCedula(value),value)
    }
    @Test fun `RUC structure accepts corporate IDs without a modulo eleven requirement`() {
        for(value in listOf("1791234567001","1760000000001","3090000000001",check("010123456")+"001"))assertTrue(consistentRuc(value),value)
    }
    @Test fun `RUC rejects zero identity wrong length letters and establishment suffix`() {
        for(value in listOf("", "0000000000001","1791234567002","179123456700","17912345670011","179123456A001"))assertFalse(consistentRuc(value),value)
    }
}
