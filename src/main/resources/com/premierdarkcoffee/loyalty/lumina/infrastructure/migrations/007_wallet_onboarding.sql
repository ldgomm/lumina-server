-- Additive metadata only. Existing accounts and Wallet links retain their identities.
ALTER TABLE companies ADD COLUMN category TEXT NOT NULL DEFAULT '';
CREATE TABLE agency_legal (
 id INTEGER PRIMARY KEY CHECK(id=1), legal_name TEXT NOT NULL, ruc TEXT NOT NULL,
 address TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
 privacy_url TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 updated_at TEXT NOT NULL
) STRICT;
