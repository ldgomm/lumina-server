package com.premierdarkcoffee.loyalty

import org.junit.jupiter.api.Test
import kotlin.test.*

class CustomerWorkspaceTest {
    @Test fun `report rejects arbitrary sort expressions`() {
        for (sort in listOf("name DESC", "RECENT; DROP TABLE members", "", "recent"))
            assertEquals("INVALID_SORT",assertFailsWith<Problem>{CustomerActivityQuery(sort=sort).validate()}.code)
        for (sort in listOf("RECENT","SPENT","VISITS","NAME","NEWEST")) CustomerActivityQuery(sort=sort).validate()
    }
    @Test fun `timeline bounds reject negative overflow and unknown event types`() {
        CustomerTimelineQuery(offset=1_000_000).validate()
        for (offset in listOf(-1,1_000_001)) assertEquals("INVALID_PAGE",assertFailsWith<Problem>{CustomerTimelineQuery(offset=offset).validate()}.code)
        for (kind in listOf("RESERVED","CANCELLED","purchase","ALL OR true")) assertEquals("INVALID_TIMELINE_KIND",assertFailsWith<Problem>{CustomerTimelineQuery(kind=kind).validate()}.code)
    }
    @Test fun `timeline accepts only valid branch identifiers`() {
        CustomerTimelineQuery(branchId=id()).validate();CustomerTimelineQuery().validate()
        for (branch in listOf("", "not-a-branch", "' OR 1=1")) assertFailsWith<Problem>{CustomerTimelineQuery(branchId=branch).validate()}
    }
    @Test fun `legacy report arguments retain recent sorting and defaults`() {
        CustomerActivityQuery(7,10,"RETURNING","Ana",50).validate()
        assertEquals("RECENT",CustomerActivityQuery(7,10,"RETURNING","Ana",50).sort)
        assertEquals("ALL",CustomerTimelineQuery().kind);assertEquals(0,CustomerTimelineQuery().offset)
    }
}
