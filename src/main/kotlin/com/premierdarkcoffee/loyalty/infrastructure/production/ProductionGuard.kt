package com.premierdarkcoffee.loyalty.infrastructure.production

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.infrastructure.persistence.Database
import com.premierdarkcoffee.loyalty.infrastructure.persistence.SqlFingerprint
import com.premierdarkcoffee.loyalty.infrastructure.persistence.one
import com.premierdarkcoffee.loyalty.infrastructure.persistence.rows
import com.premierdarkcoffee.loyalty.shared.json
import com.premierdarkcoffee.loyalty.wallet.WalletCipher
import kotlinx.serialization.json.*
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.attribute.PosixFilePermission

/** A release may read the existing production schema, never create or migrate it on startup. */
object ProductionGuard {
    val bindingNames = listOf("DATABASE_URL", "DATABASE_USER", "IDENTITY_PEPPER", "PLATFORM_ADMIN_TOKEN",
        "WALLET_DATA_KEY", "PUBLIC_BASE_URL", "APPLE_PASS_TYPE_ID", "APPLE_TEAM_ID", "GOOGLE_WALLET_ISSUER_ID")

    fun stableOrigin(value: String): Boolean = runCatching {
        val uri = URI(value)
        val host = uri.host?.lowercase() ?: return@runCatching false
        uri.scheme == "https" && uri.rawAuthority == host && uri.rawPath.isNullOrEmpty() &&
            uri.rawQuery == null && uri.rawFragment == null && uri.userInfo == null &&
            host.contains('.') && !host.matches(Regex("[0-9.]+")) && host.length <= 253 &&
            host.split('.').all { it.matches(Regex("[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")) } &&
            listOf("localhost", "local", "test", "invalid", "trycloudflare.com", "ngrok.io", "ngrok-free.app", "localtunnel.me").none { host == it || host.endsWith(".$it") }
    }.getOrDefault(false)

    fun validate(env: Map<String, String>, seal: JsonObject) {
        check(seal["format"]?.jsonPrimitive?.intOrNull == 1) { "PRODUCTION_SEAL_INVALID" }
        check(stableOrigin(env["PUBLIC_BASE_URL"] ?: "")) { "PRODUCTION_STABLE_HTTPS_REQUIRED" }
        check(env["APPLE_WALLET_ENABLED"] == "true" && env["GOOGLE_WALLET_ENABLED"] == "true") { "PRODUCTION_BOTH_WALLETS_REQUIRED" }
        check(env.keys.none { it.startsWith("STAGING_") || it.startsWith("DEMO_") }) { "PRODUCTION_DEMO_CONFIG_FORBIDDEN" }
        val pinned = seal.getValue("native").jsonObject
        for (name in bindingNames) {
            val value = env[name]
            check(!value.isNullOrBlank() && pinned[name]?.jsonPrimitive?.content == Security.hash(value)) { "PRODUCTION_IDENTITY_MISMATCH:$name" }
        }
        WalletCipher(env.getValue("WALLET_DATA_KEY"))
    }

    fun load(env: Map<String, String>): JsonObject? {
        if (env["LOYALTY_PROFILE"] != "production") return null
        val file = Path.of(requireNotNull(env["PRODUCTION_IDENTITY_PATH"]) { "PRODUCTION_SEAL_REQUIRED" })
        check(file.isAbsolute && Files.isRegularFile(file) && Files.size(file) < 100_000) { "PRODUCTION_SEAL_INVALID" }
        var part: Path? = file
        while (part != null) { check(!Files.isSymbolicLink(part)) { "PRODUCTION_SYMLINK_FORBIDDEN" }; part = part.parent }
        check(Files.getPosixFilePermissions(file).none { it in setOf(PosixFilePermission.GROUP_READ, PosixFilePermission.GROUP_WRITE, PosixFilePermission.GROUP_EXECUTE, PosixFilePermission.OTHERS_READ, PosixFilePermission.OTHERS_WRITE, PosixFilePermission.OTHERS_EXECUTE) }) { "PRODUCTION_SEAL_NOT_PRIVATE" }
        return json.parseToJsonElement(Files.readString(file)).jsonObject.also { validate(env, it) }
    }

    fun verifyDatabase(db: Database, seal: JsonObject, env: Map<String, String>) = db.tx { c ->
        val migrations = c.rows("SELECT version,checksum FROM comeback_migrations ORDER BY version") { it.getInt(1) to it.getString(2) }.toMap()
        check(migrations.keys == (1..17).toSet()) { "PRODUCTION_SCHEMA_CHANGE_REQUIRES_PLANNED_MIGRATION" }
        for (version in 1..17) {
            val sql = requireNotNull(javaClass.getResource("/com/premierdarkcoffee/loyalty/infrastructure/persistence/migrations/V${version.toString().padStart(3, '0')}.sql")).readText()
            val expected = SqlFingerprint.checksum(sql)
            check(if (version == 1) SqlFingerprint.acceptsV001(migrations[version], expected) else migrations[version] == expected) { "PRODUCTION_MIGRATION_MISMATCH" }
        }
        val identity = seal.getValue("database").jsonObject
        check(c.one("SELECT current_database()") { it.getString(1) } == identity.getValue("name").jsonPrimitive.content) { "PRODUCTION_DATABASE_CHANGED" }
        check(c.one("SELECT floor(extract(epoch FROM applied_at)*1000)::bigint FROM comeback_migrations WHERE version=1") { it.getLong(1).toString() } == identity.getValue("created").jsonPrimitive.content) { "PRODUCTION_DATABASE_CHANGED" }
        val stored = c.one("SELECT fingerprint FROM wallet_key_identity WHERE singleton=true") { it.getString(1) }
        check(stored == null || stored == WalletCipher(env.getValue("WALLET_DATA_KEY")).fingerprint) { "PRODUCTION_WALLET_KEY_CHANGED" }
    }
}
