ALTER TABLE wallet_outbox ADD COLUMN materialized_at TIMESTAMPTZ;
CREATE INDEX wallet_outbox_unmaterialized ON wallet_outbox(tenant_id,member_id,revision) WHERE materialized_at IS NULL;
CREATE TABLE wallet_key_identity (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
    fingerprint TEXT NOT NULL
);
CREATE TABLE wallet_update_clock (
    singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK(singleton),
    value BIGINT NOT NULL DEFAULT 0
);
INSERT INTO wallet_update_clock(singleton) VALUES(true);
CREATE TABLE wallet_passes (
    tenant_id TEXT NOT NULL,
    member_id TEXT NOT NULL,
    serial TEXT NOT NULL UNIQUE,
    auth_cipher TEXT NOT NULL,
    auth_hash TEXT NOT NULL,
    snapshot JSONB NOT NULL,
    content_hash TEXT NOT NULL,
    update_tag BIGINT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    next_scan_at TIMESTAMPTZ NOT NULL,
    apple_type TEXT,
    google_id TEXT UNIQUE,
    google_class TEXT,
    PRIMARY KEY(tenant_id,member_id),
    FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id)
);
CREATE INDEX wallet_pass_scan ON wallet_passes(next_scan_at,serial);
CREATE TABLE wallet_apple_registrations (
    device_hash TEXT NOT NULL,
    serial TEXT NOT NULL REFERENCES wallet_passes(serial),
    push_cipher TEXT NOT NULL,
    push_hash TEXT NOT NULL,
    registered_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(device_hash,serial)
);
CREATE TABLE wallet_download_tickets (
    token_hash TEXT PRIMARY KEY,
    serial TEXT NOT NULL REFERENCES wallet_passes(serial),
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX wallet_ticket_expiry ON wallet_download_tickets(expires_at);
CREATE TABLE wallet_delivery (
    serial TEXT NOT NULL REFERENCES wallet_passes(serial),
    provider TEXT NOT NULL CHECK(provider IN ('APPLE','GOOGLE')),
    sent_tag BIGINT NOT NULL DEFAULT 0,
    wake_revision BIGINT NOT NULL DEFAULT 0,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL,
    last_error TEXT,
    PRIMARY KEY(serial,provider)
);
