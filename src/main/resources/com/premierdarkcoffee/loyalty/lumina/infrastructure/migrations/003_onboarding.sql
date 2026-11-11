-- Allow distinct, auditable agency access to each business. Preserve every existing encrypted access.
CREATE TABLE wallet_access_next (
 account_id TEXT NOT NULL REFERENCES accounts(id), company_id TEXT NOT NULL REFERENCES companies(id),
 tenant_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, staff_name TEXT NOT NULL,
 staff_id TEXT UNIQUE, sealed_token TEXT, status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','BLOCKED')),
 created_at TEXT NOT NULL, PRIMARY KEY(account_id,company_id)
);
INSERT INTO wallet_access_next SELECT * FROM wallet_access;
DROP TABLE wallet_access;
ALTER TABLE wallet_access_next RENAME TO wallet_access;
