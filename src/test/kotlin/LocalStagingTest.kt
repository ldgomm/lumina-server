package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.LocalStagingConfig
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import org.junit.jupiter.api.Test
import kotlin.test.*

class LocalStagingTest {
    private val instance="12345678-1234-1234-1234-123456789abc"
    @Test fun `preview and metadata are absent outside explicit local staging`() = testApplication {
        application { localStagingRoutes(emptyMap()) }
        assertEquals(HttpStatusCode.NotFound,client.get("/preview").status)
        assertEquals(HttpStatusCode.NotFound,client.get("/api/staging/info").status)
    }
    @Test fun `local preview contains role links without credentials`() = testApplication {
        application { localStagingRoutes(mapOf("LOYALTY_PROFILE" to "local-staging","STAGING_INSTANCE_ID" to instance,"STAGING_ADMIN_TOKEN" to "private-platform-token-should-never-appear")) }
        val page=client.get("/preview");assertEquals(HttpStatusCode.OK,page.status)
        val html=page.bodyAsText();assertContains(html,"/platform");assertContains(html,"/join/demo-cafe-12345678");assertFalse(html.contains("private-platform"));assertFalse(html.contains("{{"))
        val info=client.get("/api/staging/info").bodyAsText();assertContains(info,instance);assertFalse(info.contains("TOKEN"))
    }
    @Test fun `bootstrap requires local profile unique strong credentials and UUID`() {
        val valid=mapOf("LOYALTY_PROFILE" to "local-staging","STAGING_INSTANCE_ID" to instance,"STAGING_OWNER_TOKEN" to "a".repeat(40),"STAGING_CASHIER_TOKEN" to "b".repeat(40),"STAGING_ALICE_PASSWORD" to "c".repeat(40),"STAGING_BOB_PASSWORD" to "d".repeat(40))
        val config=LocalStagingConfig.fromEnvironment(valid);assertEquals("demo-cafe-12345678",config.slug)
        assertEquals(config.id("tenant"),LocalStagingConfig.fromEnvironment(valid).id("tenant"))
        assertFailsWith<IllegalArgumentException>{LocalStagingConfig.fromEnvironment(valid+ ("LOYALTY_PROFILE" to "production"))}
        assertFailsWith<IllegalArgumentException>{LocalStagingConfig.fromEnvironment(valid+ ("STAGING_ALICE_PASSWORD" to "short"))}
        assertFailsWith<IllegalArgumentException>{LocalStagingConfig.fromEnvironment(valid+ ("STAGING_INSTANCE_ID" to "invalid"))}
        assertFailsWith<IllegalArgumentException>{LocalStagingConfig.fromEnvironment(valid+ ("STAGING_OWNER_TOKEN" to "b".repeat(40)))}
    }
}
