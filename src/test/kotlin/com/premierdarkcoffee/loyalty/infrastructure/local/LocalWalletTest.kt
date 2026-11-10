package com.premierdarkcoffee.loyalty.infrastructure.local

import com.premierdarkcoffee.loyalty.application.io
import com.premierdarkcoffee.loyalty.application.loyaltyRoutes
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.fidelity.LoyaltyService

import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import org.postgresql.ds.PGSimpleDataSource
import kotlin.test.*

class LocalWalletTest {
    @Test fun `loopback is opt in and cannot be enabled in production`() {
        assertNull(localWalletOrigin(emptyMap()))
        assertFailsWith<IllegalArgumentException> { localWalletOrigin(mapOf("LOYALTY_LOCAL_BROWSER_ORIGIN" to "http://localhost:8097")) }
    }
    @Test fun `only explicit loopback origins are accepted`() {
        fun origin(value: String) = localWalletOrigin(mapOf("LOYALTY_PROFILE" to "local-staging", "LOYALTY_LOCAL_BROWSER_ORIGIN" to value))
        assertEquals("http://localhost:8097", origin("http://localhost:8097"))
        assertEquals("http://127.0.0.1:8097", origin("http://127.0.0.1:8097"))
        for (value in listOf("*", "null", "http://evil.test:8097", "http://localhost:80", "http://localhost:65536", "http://localhost:8097/", "http://localhost:8097@evil.test", "https://localhost:8097", "http://localhost:8097,http://evil.test")) {
            assertFailsWith<IllegalArgumentException>(value) { origin(value) }
        }
    }
    @Test fun `HTTPS and local panel work while unrelated browser origins remain blocked`() = testApplication {
        environment { config = MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()), "test-pepper"), "test-admin", "https://wallet.example.test", "http://localhost:8097") }
        for (origin in listOf("https://wallet.example.test", "http://localhost:8097")) {
            assertEquals(HttpStatusCode.Unauthorized, client.post("/api/staff/counter-redemptions") { header("Origin", origin); contentType(ContentType.Application.Json); setBody("{}") }.status)
        }
        for (origin in listOf("https://evil.test", "http://localhost:9999", "null")) {
            assertEquals(HttpStatusCode.Forbidden, client.post("/api/staff/counter-redemptions") { header("Origin", origin); setBody("{}") }.status)
        }
    }
    @Test fun `local enrollment redirects to the actual HTTPS origin`() = testApplication {
        environment { config = MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()), "test-pepper"), "test-admin", "https://wallet.example.test", "http://localhost:8097") }
        val direct = createClient { followRedirects = false }
        val response = direct.get("/join/demo") { header(HttpHeaders.Host, "localhost:8097") }
        assertEquals(HttpStatusCode.Found, response.status)
        assertEquals("https://wallet.example.test/join/demo", response.headers[HttpHeaders.Location])
        assertEquals(HttpStatusCode.OK, direct.get("/join/demo") { header(HttpHeaders.Host, "wallet.example.test") }.status)
    }
}
