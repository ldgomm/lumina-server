package com.premierdarkcoffee.loyalty.access

import com.premierdarkcoffee.loyalty.analytics.ManagementQuery
import com.premierdarkcoffee.loyalty.shared.NewStaff
import com.premierdarkcoffee.loyalty.shared.Problem
import com.premierdarkcoffee.loyalty.shared.id
import com.premierdarkcoffee.loyalty.shared.json

import org.junit.jupiter.api.Test
import kotlin.test.*

class TeamManagementTest {
    @Test fun `roles require clear branch scope`() {
        validateTeam("Ana Pérez","","OWNER",null);validateTeam("Ana Pérez","","CASHIER",id())
        assertFailsWith<Problem>{validateTeam("Ana Pérez","","CASHIER",null)}
        assertFailsWith<Problem>{validateTeam("Ana Pérez","","OWNER",id())}
        assertFailsWith<Problem>{validateTeam("Ana Pérez","","ADMIN",null)}
    }
    @Test fun `user names contacts and reasons are bounded`() {
        for(name in listOf(" ","a","a\nb","a".repeat(101)))assertFailsWith<Problem>{validateTeam(name,"","OWNER",null)}
        assertFailsWith<Problem>{validateTeam("Ana","x".repeat(161),"OWNER",null)}
        assertFailsWith<Problem>{teamReason("a")};teamReason("Cambio solicitado")
    }
    @Test fun `activity filters reject invalid numbers ids and kinds`() {
        ManagementQuery().validate();ManagementQuery(365,"REWARD",id(),"platform",offset=50).validate()
        for(q in listOf(ManagementQuery(days=1),ManagementQuery(kind="sql"),ManagementQuery(offset=-1),ManagementQuery(offset=1),ManagementQuery(branchId="bad"),ManagementQuery(search="a".repeat(101))))assertFailsWith<Problem>{q.validate()}
    }
    @Test fun `legacy staff creation payload remains readable`() {
        val parsed=json.decodeFromString<NewStaff>("""{"role":"CASHIER","branchId":null}""")
        assertNull(parsed.name);assertNull(parsed.requestId);assertEquals("",parsed.contact)
    }
}
