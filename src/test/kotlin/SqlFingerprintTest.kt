package com.premierdarkcoffee.loyalty

import kotlin.test.*

class SqlFingerprintTest {
    @Test fun `spaces tabs line endings and keyword case are formatting`() {
        assertEquals(SqlFingerprint.checksum("CREATE TABLE x(id TEXT PRIMARY KEY);"), SqlFingerprint.checksum("create\r\n table x (\n\tid text primary key\n);\n"))
    }
    @Test fun `comments including nested comments do not change fingerprint`() {
        assertEquals(SqlFingerprint.checksum("SELECT a FROM t;"), SqlFingerprint.checksum("SELECT /* first /* nested */ end */ a -- note\n FROM t;"))
    }
    @Test fun `literal changes quoted identifiers and dollar data remain significant`() {
        assertNotEquals(SqlFingerprint.checksum("SELECT 'a b';"), SqlFingerprint.checksum("SELECT 'ab';"))
        assertNotEquals(SqlFingerprint.checksum("SELECT \"Case\";"), SqlFingerprint.checksum("SELECT \"case\";"))
        assertNotEquals(SqlFingerprint.checksum("SELECT \$\$ a b \$\$;"), SqlFingerprint.checksum("SELECT \$\$ab\$\$;"))
    }
    @Test fun `token boundaries operators and string continuation remain significant`() {
        assertNotEquals(SqlFingerprint.checksum("SELECT key;"), SqlFingerprint.checksum("SELECT KEY;"))
        assertNotEquals(SqlFingerprint.checksum("SELECT ab;"), SqlFingerprint.checksum("SELECT a b;"))
        assertNotEquals(SqlFingerprint.checksum("SELECT 1 <= 2;"), SqlFingerprint.checksum("SELECT 1 < = 2;"))
        assertNotEquals(SqlFingerprint.checksum("SELECT 'a'\n'b';"), SqlFingerprint.checksum("SELECT 'a' 'b';"))
        assertNotEquals(SqlFingerprint.checksum("SELECT E'a\\nb';"), SqlFingerprint.checksum("SELECT E 'a\\nb';"))
    }
    @Test fun `PLpgsql trigger indentation changes preserve body literals`() {
        val a="CREATE FUNCTION forbid_history_changes() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'Keep  spaces'; END \$\$;"
        val b=a.replace(" BEGIN RAISE", "\n  begin\n    raise").replace("; END", ";\n  end")
        assertEquals(SqlFingerprint.checksum(a),SqlFingerprint.checksum(b))
        assertNotEquals(SqlFingerprint.checksum(a),SqlFingerprint.checksum(b.replace("Keep  spaces","Keep spaces")))
    }
    @Test fun `invalid quotes and comments fail closed`() {
        assertFailsWith<IllegalStateException>{SqlFingerprint.checksum("SELECT 'open")}
        assertFailsWith<IllegalStateException>{SqlFingerprint.checksum("SELECT /* open")}
        assertFailsWith<IllegalStateException>{SqlFingerprint.checksum("SELECT \$\$open")}
    }
    @Test fun `real V001 fingerprint and legacy checksum are supported`() {
        val sql=requireNotNull(javaClass.getResource("/db/V001.sql")).readText()
        val hash=SqlFingerprint.checksum(sql)
        assertEquals(SqlFingerprint.V001_CANONICAL_SHA256,hash)
        assertTrue(SqlFingerprint.acceptsV001(SqlFingerprint.LEGACY_V001_SHA256,hash))
        assertTrue(SqlFingerprint.acceptsV001(hash,hash))
        assertFalse(SqlFingerprint.acceptsV001("unknown-checksum",hash))
        assertEquals(hash,SqlFingerprint.checksum(sql.replace("\n", "\r\n").replace("CREATE TABLE", "create  table")))
    }
    @Test fun `editing an applied migration requires a new version`() {
        val sql=requireNotNull(javaClass.getResource("/db/V001.sql")).readText().replace("cost>0","cost>=0")
        assertFailsWith<IllegalStateException>{SqlFingerprint.acceptsV001(null,SqlFingerprint.checksum(sql))}
    }
}
