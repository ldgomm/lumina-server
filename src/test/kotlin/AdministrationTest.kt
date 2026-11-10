package com.premierdarkcoffee.loyalty

import org.junit.jupiter.api.Test
import kotlin.test.*

class AdministrationTest {
    @Test fun `branch values normalize surrounding whitespace without changing internal identity`() {
        val b=ManagedBranch("  Local Norte  ","  NORTE-01  ").normalized();b.validate()
        assertEquals("Local Norte",b.name);assertEquals("NORTE-01",b.code)
    }
    @Test fun `branch names reject empty oversized and multiline labels`() {
        for(name in listOf("", "a", "a".repeat(121), "Local\nNorte", "Local\u0000"))assertFailsWith<Problem>{ManagedBranch(name,"N").validate()}
        ManagedBranch("Óptica", "N").validate()
    }
    @Test fun `branch codes are bounded and cannot contain controls`() {
        for(code in listOf("", "a".repeat(41), "C\t1", "C\r1"))assertFailsWith<Problem>{ManagedBranch("Centro",code).validate()}
        ManagedBranch("Centro", "Ñorte-20%").validate()
    }
    @Test fun `directory validates bounded page aligned search`() {
        BranchDirectoryQuery("Norte",25).validate()
        for(q in listOf(BranchDirectoryQuery(offset=-1),BranchDirectoryQuery(offset=1),BranchDirectoryQuery(offset=1_000_025),BranchDirectoryQuery("x".repeat(101)),BranchDirectoryQuery("x\ny")))assertFailsWith<Problem>{q.validate()}
    }
}
