package com.premierdarkcoffee.loyalty

import com.premierdarkcoffee.loyalty.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.testing.*
import org.postgresql.ds.PGSimpleDataSource
import kotlin.test.*

class HttpContractTest {
    @Test fun `public liveness and missing authentication do not access database`() = testApplication {
        environment { config = MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"test-admin","http://localhost:8080") }
        assertEquals(HttpStatusCode.OK,client.get("/health/live").status)
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/staff/dashboard").status)
        assertEquals(HttpStatusCode.Unauthorized,client.get("/api/me").status)
        val page=client.get("/");assertEquals(HttpStatusCode.OK,page.status)
        assertTrue(page.headers["Content-Security-Policy"]!!.contains("frame-ancestors 'none'"))
    }
    @Test fun `malformed oversized and cross origin requests fail before database`() = testApplication {
        environment { config = MapApplicationConfig() }
        application { loyaltyRoutes(LoyaltyService(Database(PGSimpleDataSource()),"test-pepper"),"test-admin","http://localhost:8080") }
        assertEquals(HttpStatusCode.BadRequest,client.post("/api/public/demo/enroll"){contentType(ContentType.Application.Json);setBody("{}")}.status)
        assertEquals(HttpStatusCode.PayloadTooLarge,client.post("/api/public/demo/enroll"){contentType(ContentType.Application.Json);setBody("x".repeat(40000))}.status)
        assertEquals(HttpStatusCode.UnsupportedMediaType,client.post("/api/public/demo/enroll"){setBody("text")}.status)
        assertEquals(HttpStatusCode.Forbidden,client.post("/api/me/logout"){header("Origin","https://other.invalid")}.status)
    }
}
