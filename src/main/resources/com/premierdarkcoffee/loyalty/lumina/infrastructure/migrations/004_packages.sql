-- Additive: existing contracts, Wallet links and encryption material remain unchanged.
CREATE TABLE package_orders (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    submitted_by TEXT NOT NULL REFERENCES accounts(id),
    submission_key TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('REQUESTED','QUOTED','ACCEPTED','ACTIVE','CANCELLED')),
    revision INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL,
    terms TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    accepted_at TEXT,
    activated_at TEXT,
    UNIQUE (company_id,submission_key),
    UNIQUE (company_id,id)
) STRICT;
CREATE INDEX package_orders_company ON package_orders(company_id,created_at DESC);
CREATE TABLE package_order_lines (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    order_id TEXT NOT NULL,
    plan_id TEXT NOT NULL REFERENCES plans(id),
    name TEXT NOT NULL,
    term TEXT NOT NULL CHECK (term IN ('MONTHLY','ONE_OFF')),
    wallet TEXT NOT NULL,
    units INTEGER NOT NULL CHECK (units BETWEEN 1 AND 10),
    items_json TEXT NOT NULL,
    catalog_minor INTEGER,
    unit_minor INTEGER CHECK (unit_minor >= 0),
    starts_on TEXT,
    ends_before TEXT,
    renewal_of TEXT,
    FOREIGN KEY (company_id,order_id) REFERENCES package_orders(company_id,id),
    FOREIGN KEY (company_id,renewal_of) REFERENCES contracts(company_id,id),
    UNIQUE (order_id,plan_id),
    UNIQUE (company_id,id)
) STRICT;
ALTER TABLE contracts ADD COLUMN units INTEGER NOT NULL DEFAULT 1 CHECK (units BETWEEN 1 AND 10);
ALTER TABLE contracts ADD COLUMN order_line_id TEXT REFERENCES package_order_lines(id);
ALTER TABLE contracts ADD COLUMN renewal_of TEXT REFERENCES contracts(id);
ALTER TABLE contracts ADD COLUMN renewal_anchor TEXT;
CREATE UNIQUE INDEX contracts_order_line ON contracts(order_line_id) WHERE order_line_id IS NOT NULL;
CREATE UNIQUE INDEX contracts_renewal ON contracts(renewal_of) WHERE renewal_of IS NOT NULL;
