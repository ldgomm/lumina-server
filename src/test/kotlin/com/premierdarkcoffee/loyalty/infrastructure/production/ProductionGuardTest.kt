package com.premierdarkcoffee.loyalty.infrastructure.production

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.shared.obj
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Test
import java.util.Base64
import kotlin.test.*

class ProductionGuardTest {
    private fun env() = ProductionGuard.bindingNames.associateWith { "value-$it" }.toMutableMap().apply {
        put("PUBLIC_BASE_URL", "https://wallet.example.com")
        put("WALLET_DATA_KEY", Base64.getEncoder().encodeToString(ByteArray(32) { 4 }))
        put("APPLE_WALLET_ENABLED", "true"); put("GOOGLE_WALLET_ENABLED", "true")
    }
    private fun seal(env: Map<String,String>): JsonObject = obj("format" to 1,"native" to JsonObject(ProductionGuard.bindingNames.associateWith { JsonPrimitive(Security.hash(env.getValue(it))) }))
    @Test fun acceptsPinnedConfiguration() { val e=env(); ProductionGuard.validate(e,seal(e)) }
    @Test fun rejectsEveryChangedBinding() {
        val e=env();val s=seal(e)
        for (key in ProductionGuard.bindingNames) assertFails { ProductionGuard.validate(e + (key to "changed"),s) }
    }
    @Test fun rejectsMissingBindings() {
        val e=env(); for (key in ProductionGuard.bindingNames) assertFails { ProductionGuard.validate(e-key,seal(e)) }
    }
    @Test fun rejectsTemporaryOrUnsafeOrigins() {
        for (origin in listOf("https://bad_host.example.com", "https://-bad.example.com", "https://wallet.example.com.", "http://wallet.example.com","https://abc.trycloudflare.com","https://127.0.0.1","https://user@wallet.example.com","https://wallet.example.com/path","https://wallet.example.com?key=x","https://wallet.example.com#x","https://wallet.local","https://wallet.example.com:443")) assertFalse(ProductionGuard.stableOrigin(origin),origin)
        assertTrue(ProductionGuard.stableOrigin("https://wallet.example.com"))
    }
    @Test fun requiresBothProviders() { val e=env(); for (key in listOf("APPLE_WALLET_ENABLED","GOOGLE_WALLET_ENABLED")) assertFails { ProductionGuard.validate(e+(key to "false"),seal(e)) } }
    @Test fun rejectsDemoConfiguration() { val e=env(); assertFails { ProductionGuard.validate(e+("STAGING_INSTANCE_ID" to "test"),seal(e)) } }
    @Test fun developmentDoesNotLoadProductionFiles() { assertNull(ProductionGuard.load(emptyMap())); assertNull(ProductionGuard.load(mapOf("LOYALTY_PROFILE" to "local-staging"))) }
    @Test fun productionCannotStartWithoutSeal() { assertFails { ProductionGuard.load(mapOf("LOYALTY_PROFILE" to "production")) } }
}
