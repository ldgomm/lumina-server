ALTER TABLE wallet_catalog_calendars ADD COLUMN trial_active BOOLEAN;
ALTER TABLE wallet_catalog_schedules ADD COLUMN consent_on DATE;
ALTER TABLE wallet_catalog_schedules ADD COLUMN per_branch BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE wallet_catalog_schedules ADD COLUMN initial_branches INTEGER NOT NULL DEFAULT 1 CHECK(initial_branches>0);
