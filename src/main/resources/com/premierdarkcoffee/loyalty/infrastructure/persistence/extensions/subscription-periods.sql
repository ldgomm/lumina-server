ALTER TABLE wallet_catalog_schedules ADD COLUMN months INTEGER NOT NULL DEFAULT 1 CHECK(months IN (1,12));
ALTER TABLE wallet_catalog_schedules ADD COLUMN other_minor BIGINT NOT NULL DEFAULT 0 CHECK(other_minor BETWEEN 0 AND fee_minor);
ALTER TABLE wallet_catalog_schedules ADD COLUMN split_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE billing_invoices ADD COLUMN services_calendar_id TEXT;
ALTER TABLE billing_invoices ADD FOREIGN KEY(tenant_id,services_calendar_id) REFERENCES wallet_catalog_schedules(tenant_id,id);
CREATE UNIQUE INDEX billing_services_calendar_period ON billing_invoices(tenant_id,services_calendar_id,calendar_start) WHERE services_calendar_id IS NOT NULL;
