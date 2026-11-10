ALTER TABLE purchases DROP CONSTRAINT purchases_amount_minor_check;
ALTER TABLE purchases ADD CONSTRAINT purchases_amount_minor_check CHECK(amount_minor>=0);
ALTER TABLE purchases ADD COLUMN gross_minor BIGINT;
ALTER TABLE purchases ADD COLUMN discount_minor BIGINT NOT NULL DEFAULT 0 CHECK(discount_minor>=0);
ALTER TABLE purchases ADD COLUMN items JSONB NOT NULL DEFAULT '[]';
ALTER TABLE purchases ADD COLUMN redemption_id TEXT;
ALTER TABLE purchases ADD CONSTRAINT purchase_redemption_fk FOREIGN KEY(tenant_id,redemption_id) REFERENCES redemptions(tenant_id,id);
ALTER TABLE rewards ADD COLUMN benefit JSONB;
CREATE TABLE wallet_designs (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), version INT NOT NULL, config JSONB NOT NULL
);
CREATE TABLE member_preferences (
 tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, birthday TEXT,
 marketing_consent BOOLEAN NOT NULL DEFAULT false, consent_at TIMESTAMPTZ,
 PRIMARY KEY(tenant_id,member_id), FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id)
);
CREATE TABLE customer_events (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ NOT NULL, active BOOLEAN NOT NULL DEFAULT true,
 PRIMARY KEY(tenant_id,id), CHECK(ends_at>starts_at)
);
CREATE INDEX customer_events_active ON customer_events(tenant_id,starts_at,ends_at) WHERE active;
CREATE INDEX purchases_customer_time ON purchases(tenant_id,member_id,created_at DESC,id);
