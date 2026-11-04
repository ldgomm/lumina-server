package com.premierdarkcoffee.loyalty

import org.postgresql.ds.PGSimpleDataSource

import io.ktor.server.config.MapApplicationConfig

import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import kotlin.test.*

class ServerTest {

    @Test
    fun `test root endpoint`() = testApplication {
        // Use explicit test configuration, independent from local credentials.
        environment { config = MapApplicationConfig() }
        application {
            loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()), "test-pepper"), "test-admin", "http://localhost:8080")
        }
        // verify server root returns 200
        assertEquals(HttpStatusCode.OK, client.get("/").status)
    }

}
