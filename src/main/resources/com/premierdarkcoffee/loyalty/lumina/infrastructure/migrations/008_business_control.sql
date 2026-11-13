CREATE TABLE business_controls (
 company_id TEXT PRIMARY KEY REFERENCES companies(id),
 state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','PAUSED','SUSPENDED','CLOSED')),
 reason TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0,
 pending_id TEXT,
 updated_at TEXT NOT NULL
);
CREATE TABLE business_commands (
 id TEXT PRIMARY KEY,
 company_id TEXT NOT NULL REFERENCES companies(id),
 actor_id TEXT NOT NULL REFERENCES accounts(id),
 state TEXT NOT NULL CHECK(state IN ('ACTIVE','PAUSED','SUSPENDED','CLOSED')),
 reason TEXT NOT NULL,
 expected_revision INTEGER NOT NULL,
 native_version INTEGER,
 native_done INTEGER NOT NULL DEFAULT 0 CHECK(native_done IN (0,1)),
 created_at TEXT NOT NULL,
 completed_at TEXT,
 UNIQUE(company_id,expected_revision)
);
CREATE INDEX business_commands_pending ON business_commands(completed_at,created_at);
