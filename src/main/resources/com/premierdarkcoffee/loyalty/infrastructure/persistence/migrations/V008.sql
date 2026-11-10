CREATE TABLE business_profiles (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
 version INT NOT NULL CHECK (version > 0),
 config JSONB NOT NULL CHECK (jsonb_typeof(config) = 'object' AND config->>'ruc' IS NOT NULL AND config->>'ruc' ~ '^[0-9]{13}$'),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX business_profiles_ruc_idx ON business_profiles ((config->>'ruc'));
