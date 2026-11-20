ALTER TABLE members ADD COLUMN removed_at TIMESTAMPTZ;
CREATE TABLE wallet_catalog_calendars(
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), revision BIGINT NOT NULL CHECK(revision>0), fingerprint TEXT NOT NULL
);
CREATE TABLE wallet_catalog_schedules(
    tenant_id TEXT NOT NULL REFERENCES wallet_catalog_calendars(tenant_id), id TEXT NOT NULL, name TEXT NOT NULL,
    starts_on DATE NOT NULL, ends_before DATE, next_start DATE NOT NULL, bill_before DATE NOT NULL, replaces_legacy BOOLEAN NOT NULL,
    fee_minor BIGINT NOT NULL CHECK(fee_minor BETWEEN 0 AND 1000000000),
    PRIMARY KEY(tenant_id,id), CHECK(ends_before IS NULL OR ends_before>=starts_on)
);
CREATE INDEX wallet_calendar_due ON wallet_catalog_schedules(next_start,tenant_id);
ALTER TABLE billing_invoices ADD COLUMN wallet_due BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE billing_invoices i SET wallet_due=TRUE FROM billing_plan_versions v
 WHERE i.tenant_id=v.tenant_id AND i.plan_version=v.version AND i.period_start IS NOT NULL
 AND (jsonb_typeof(v.config->'walletAgreement')='object' OR EXISTS(SELECT 1 FROM lumina_business_registrations r WHERE r.tenant_id=i.tenant_id));
ALTER TABLE billing_invoices ADD COLUMN calendar_id TEXT;
ALTER TABLE billing_invoices ADD COLUMN calendar_start DATE;
ALTER TABLE billing_invoices ADD FOREIGN KEY(tenant_id,calendar_id) REFERENCES wallet_catalog_schedules(tenant_id,id);
CREATE UNIQUE INDEX billing_calendar_period ON billing_invoices(tenant_id,calendar_id,calendar_start) WHERE calendar_id IS NOT NULL;
CREATE TABLE wallet_opening_periods(
 tenant_id TEXT NOT NULL, starts_on DATE NOT NULL, version INT NOT NULL, billed BOOLEAN NOT NULL DEFAULT FALSE,
 PRIMARY KEY(tenant_id,starts_on), FOREIGN KEY(tenant_id,version) REFERENCES billing_plan_versions(tenant_id,version)
);
CREATE TABLE wallet_payment_allocations(
 tenant_id TEXT NOT NULL,payment_id TEXT NOT NULL,invoice_id TEXT NOT NULL,amount_minor BIGINT NOT NULL CHECK(amount_minor>0),
 PRIMARY KEY(tenant_id,payment_id,invoice_id),FOREIGN KEY(tenant_id,payment_id) REFERENCES billing_payments(tenant_id,id),
 FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id)
);
CREATE TRIGGER wallet_payment_allocation_history BEFORE UPDATE OR DELETE ON wallet_payment_allocations
 FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
