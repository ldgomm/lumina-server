-- Additive contact details. Existing members, pass identities and balances stay intact.
ALTER TABLE members ADD COLUMN contact_phone TEXT
    CHECK(contact_phone IS NULL OR contact_phone ~ '^\+[1-9][0-9]{7,14}$');
ALTER TABLE members ADD COLUMN contact_version INTEGER NOT NULL DEFAULT 0 CHECK(contact_version >= 0);
