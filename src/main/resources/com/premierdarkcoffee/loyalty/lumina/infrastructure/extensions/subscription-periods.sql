CREATE TABLE plan_billing (
  plan_id TEXT PRIMARY KEY REFERENCES plans(id),
  months INTEGER NOT NULL CHECK(months IN (1,12)),
  other_minor INTEGER CHECK(other_minor>=0)
) STRICT;
ALTER TABLE wallet_schedules ADD COLUMN other_minor INTEGER NOT NULL DEFAULT 0 CHECK(other_minor>=0 AND other_minor<=amount_minor);
-- A gift has an explicit zero Wallet price even on pre-existing agreements.
UPDATE wallet_schedules SET other_minor=amount_minor WHERE plan_id IN (SELECT id FROM plans WHERE wallet='GIFT');
UPDATE wallet_calendar_sync SET revision=revision+1;
