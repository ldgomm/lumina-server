-- The free trial and a paid agreement have independent lifetimes.
CREATE TABLE wallet_choices (
    company_id TEXT PRIMARY KEY REFERENCES companies(id),
    trial_active INTEGER NOT NULL DEFAULT 0 CHECK(trial_active IN (0,1)),
    declined INTEGER NOT NULL DEFAULT 0 CHECK(declined IN (0,1)),
    legacy_until TEXT
) STRICT;
INSERT INTO wallet_choices(company_id,trial_active)
 SELECT company_id,1 FROM company_services WHERE service='WALLET' AND status='ACTIVE';
ALTER TABLE wallet_schedules ADD COLUMN consent_on TEXT;
ALTER TABLE wallet_schedules ADD COLUMN initial_branches INTEGER NOT NULL DEFAULT 1 CHECK(initial_branches>0);
ALTER TABLE package_orders ADD COLUMN initial_branches INTEGER NOT NULL DEFAULT 1 CHECK(initial_branches>0);
ALTER TABLE package_orders ADD COLUMN trial_archive INTEGER NOT NULL DEFAULT 0 CHECK(trial_archive IN (0,1));
CREATE TABLE wallet_trial_variants (
    source_id TEXT PRIMARY KEY REFERENCES plans(id), plan_id TEXT UNIQUE NOT NULL REFERENCES plans(id)
) STRICT;
-- Preserve original requests and amounts for consultation, outside the actionable queue.
UPDATE package_orders SET trial_archive=1 WHERE date(coalesce(accepted_at,created_at),'-5 hours')<'2027-01-01'
 AND EXISTS(SELECT 1 FROM package_order_lines l WHERE l.order_id=package_orders.id AND
 (l.wallet<>'NONE' OR EXISTS(SELECT 1 FROM json_each(l.items_json) i WHERE json_extract(i.value,'$.service')='WALLET')))
 AND (status IN ('REQUESTED','QUOTED','ACCEPTED') OR NOT EXISTS(SELECT 1 FROM package_order_lines l,json_each(l.items_json) i
 WHERE l.order_id=package_orders.id AND json_extract(i.value,'$.service')<>'WALLET'));
UPDATE wallet_schedules SET consent_on=(SELECT date(o.accepted_at,'-5 hours') FROM contracts c
 JOIN package_order_lines l ON l.id=c.order_line_id JOIN package_orders o ON o.id=l.order_id
 WHERE c.id=wallet_schedules.id AND date(o.accepted_at,'-5 hours')>='2027-01-01');
-- Trials never renew. Other contracted services keep their calendar and separate price.
UPDATE wallet_schedules SET ends_before=max(starts_on,'2027-01-01') WHERE consent_on IS NULL
 AND (ends_before IS NULL OR ends_before>max(starts_on,'2027-01-01'))
 AND NOT EXISTS(SELECT 1 FROM plan_items WHERE plan_id=wallet_schedules.plan_id AND service<>'WALLET');
INSERT INTO wallet_calendar_sync(company_id) SELECT id FROM companies WHERE loyalty_tenant IS NOT NULL OR id IN (SELECT company_id FROM wallet_choices WHERE trial_active=1)
 ON CONFLICT(company_id) DO UPDATE SET revision=revision+1;
