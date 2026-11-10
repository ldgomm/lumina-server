package com.premierdarkcoffee.loyalty.infrastructure.persistence

import com.premierdarkcoffee.loyalty.access.Security
import com.premierdarkcoffee.loyalty.application.body

/** Formatting-independent fingerprint for the immutable V001 SQL script.
 * String/quoted identifier contents remain significant. This is a lexer, not a SQL rewriter.
 */
object SqlFingerprint {
    const val LEGACY_V001_SHA256 = "33834b31507fc12af7b4373015d7996616f50b5e5cc88d92d508f001154834c5"
    const val V001_CANONICAL_SHA256 = "sql-tokens-v1:3271628c9571013b5cb9ac97200b0822faaae1ef47c9bc5067d3b7056d3d18e4"

    fun checksum(sql: String): String = "sql-tokens-v1:" + Security.hash(tokens(sql).joinToString("") {
        "${it.toByteArray(Charsets.UTF_8).size}:$it"
    })

    fun acceptsV001(existing: String?, current: String): Boolean {
        check(current == V001_CANONICAL_SHA256) { "V001 changed beyond formatting. Add a new migration instead." }
        return existing == null || existing == current || existing == LEGACY_V001_SHA256
    }

    private fun tokens(sql: String): List<String> {
        val result = mutableListOf<String>()
        val statementWords = mutableListOf<String>()
        var i = 0
        var gapHasNewline = false
        var previousString = false
        fun emit(value: String, string: Boolean = false) {
            if (previousString && string && gapHasNewline) result.add("STRING_NEWLINE")
            result.add(value)
            previousString = string
            gapHasNewline = false
        }
        fun quoted(start: Int, quoteAt: Int, backslashEscapes: Boolean): Int {
            val quote = sql[quoteAt]
            var pos = quoteAt + 1
            while (pos < sql.length) {
                if (backslashEscapes && sql[pos] == '\\') { pos += 2; continue }
                if (sql[pos] == quote) {
                    if (pos + 1 < sql.length && sql[pos + 1] == quote) { pos += 2; continue }
                    return pos + 1
                }
                pos++
            }
            error("Unterminated SQL quote at $start")
        }
        while (i < sql.length) {
            val ch = sql[i]
            if (ch.isWhitespace()) { gapHasNewline = gapHasNewline || ch == '\n' || ch == '\r'; i++; continue }
            if (sql.startsWith("--", i)) {
                while (i < sql.length && sql[i] != '\n' && sql[i] != '\r') i++
                continue
            }
            if (sql.startsWith("/*", i)) {
                i += 2
                var depth = 1
                while (i < sql.length && depth > 0) {
                    when {
                        sql.startsWith("/*", i) -> { depth++; i += 2 }
                        sql.startsWith("*/", i) -> { depth--; i += 2 }
                        else -> { gapHasNewline = gapHasNewline || sql[i] == '\n' || sql[i] == '\r'; i++ }
                    }
                }
                check(depth == 0) { "Unterminated SQL comment" }
                continue
            }
            if (ch == '\'' || ch == '"') {
                val end = quoted(i, i, false)
                emit("Q:" + sql.substring(i, end), ch == '\''); i = end; continue
            }
            if (ch in "eEbBxXnN" && i + 1 < sql.length && sql[i + 1] == '\'') {
                val end = quoted(i, i + 1, ch == 'e' || ch == 'E')
                emit("Q:" + ch.lowercaseChar() + sql.substring(i + 1, end), true); i = end; continue
            }
            if (ch in "uU" && i + 2 < sql.length && sql[i + 1] == '&' && sql[i + 2] in "\"'") {
                val end = quoted(i, i + 2, false)
                emit("Q:u&" + sql.substring(i + 2, end), sql[i + 2] == '\''); i = end; continue
            }
            if (ch == '$') {
                val marker = Regex("\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$").find(sql, i)?.takeIf { it.range.first == i }?.value
                if (marker != null) {
                    val end = sql.indexOf(marker, i + marker.length)
                    check(end >= 0) { "Unterminated SQL dollar quote" }
                    val body = sql.substring(i + marker.length, end)
                    // V001 has one PL/pgSQL trigger body. Dollar-quoted data elsewhere is opaque.
                    val plpgsql = statementWords.containsAll(listOf("create", "function", "forbid_history_changes", "language", "plpgsql", "as"))
                    emit(if (plpgsql) "PLPGSQL:" + tokens(body).joinToString("") { "${it.toByteArray(Charsets.UTF_8).size}:$it" } else "DOLLAR:$body", true)
                    i = end + marker.length; continue
                }
            }
            if (ch.isLetter() || ch == '_') {
                val start = i++
                while (i < sql.length && (sql[i].isLetterOrDigit() || sql[i] == '_' || sql[i] == '$')) i++
                val word = sql.substring(start, i).map { if (it in 'A'..'Z') it.lowercaseChar() else it }.joinToString("")
                statementWords.add(word); emit("W:$word"); continue
            }
            if (ch.isDigit()) {
                val token = Regex("[0-9]+(?:\\.[0-9]+)?(?:[eE][+-]?[0-9]+)?").find(sql, i)!!
                emit("N:" + token.value); i = token.range.last + 1; continue
            }
            val operator = listOf("::", ">=", "<=", "<>", "!=", "||", ":=", "->>", "->", "#>>", "#>").firstOrNull { sql.startsWith(it, i) }
            if (operator != null) { emit("O:$operator"); i += operator.length; continue }
            emit("P:$ch")
            if (ch == ';') statementWords.clear()
            i++
        }
        return result
    }
}
