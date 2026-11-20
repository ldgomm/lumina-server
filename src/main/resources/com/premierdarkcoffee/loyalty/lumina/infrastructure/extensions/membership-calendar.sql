-- Accepted periods and their published prices remain immutable.
ALTER TABLE package_orders ADD COLUMN start_when TEXT NOT NULL DEFAULT 'TODAY' CHECK(start_when IN ('TODAY','NEXT_MONTH'));
ALTER TABLE package_orders ADD COLUMN wallet_not_before TEXT;
ALTER TABLE contracts ADD COLUMN schedule_id TEXT;
CREATE UNIQUE INDEX contracts_calendar_period ON contracts(company_id,schedule_id,starts_on) WHERE schedule_id IS NOT NULL;
CREATE TABLE wallet_schedules (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), plan_id TEXT NOT NULL REFERENCES plans(id),
  starts_on TEXT NOT NULL, ends_before TEXT, next_period TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor>=0),
  units INTEGER NOT NULL CHECK(units>0), owner_id TEXT NOT NULL REFERENCES accounts(id), replaces_id TEXT REFERENCES wallet_schedules(id), prior_end TEXT,
  CHECK(ends_before IS NULL OR ends_before>=starts_on)
) STRICT;
CREATE INDEX wallet_schedules_company ON wallet_schedules(company_id,starts_on);
CREATE TABLE wallet_calendar_sync (
  company_id TEXT PRIMARY KEY REFERENCES companies(id), revision INTEGER NOT NULL DEFAULT 1, sent INTEGER NOT NULL DEFAULT 0
) STRICT;
CREATE TABLE scheduled_services (
  contract_id TEXT PRIMARY KEY REFERENCES contracts(id) ON DELETE CASCADE, starts_on TEXT NOT NULL, applied INTEGER NOT NULL DEFAULT 0
) STRICT;
-- These agreements were sold for a fixed period, sometimes already paid by a manual entry.
-- Preserve coverage through its exclusive end without generating a duplicate invoice.
CREATE TABLE wallet_prepaid_coverage(
  contract_id TEXT PRIMARY KEY REFERENCES contracts(id), company_id TEXT NOT NULL REFERENCES companies(id),
  starts_on TEXT NOT NULL, ends_before TEXT NOT NULL, name TEXT NOT NULL
) STRICT;
INSERT INTO wallet_prepaid_coverage
 SELECT c.id,c.company_id,max(c.starts_on,date('now','-5 hours')),c.ends_before,p.name FROM contracts c
 JOIN plans p ON p.id=c.plan_id JOIN companies b ON b.id=c.company_id
 WHERE b.loyalty_tenant IS NOT NULL AND c.cancelled_at IS NULL AND c.ends_before>date('now','-5 hours')
 AND EXISTS(SELECT 1 FROM plan_items i WHERE i.plan_id=c.plan_id AND i.service='WALLET');
INSERT INTO wallet_calendar_sync(company_id) SELECT DISTINCT company_id FROM wallet_prepaid_coverage;
