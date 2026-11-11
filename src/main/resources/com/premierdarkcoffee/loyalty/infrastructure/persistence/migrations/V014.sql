-- Lúmina registration owns a durable identity; existing tenants and Wallet identities are unchanged.
CREATE TABLE lumina_business_registrations (
    company_id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL UNIQUE REFERENCES tenants(id),
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
