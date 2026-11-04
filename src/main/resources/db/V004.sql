-- Wallet-first enrollment has no customer password. Existing pilot hashes are retained.
ALTER TABLE members ALTER COLUMN password_hash DROP NOT NULL;
CREATE TABLE member_restore_links (
 token_hash TEXT PRIMARY KEY,
 tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 reason TEXT NOT NULL CHECK(reason IN ('DEVICE_CHANGE','REMOVED_CARD')),
 expires_at TIMESTAMPTZ NOT NULL, consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_tokens(tenant_id,id)
);
CREATE INDEX member_restore_links_member ON member_restore_links(tenant_id,member_id);
