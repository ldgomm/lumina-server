-- Administrative removal is reversible. No identifiers, balances or history are deleted.
ALTER TABLE business_controls ADD COLUMN archived_at TEXT;
ALTER TABLE business_commands ADD COLUMN operation TEXT NOT NULL DEFAULT 'STATE'
  CHECK(operation IN ('STATE','DELETE','RESTORE'));
ALTER TABLE accounts ADD COLUMN archived_at TEXT;
ALTER TABLE accounts ADD COLUMN suspended_at TEXT;
ALTER TABLE accounts ADD COLUMN control_reason TEXT NOT NULL DEFAULT '';
