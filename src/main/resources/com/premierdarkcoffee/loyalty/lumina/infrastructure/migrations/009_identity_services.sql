-- Additive migration. Legacy login values and Wallet identities remain untouched.
ALTER TABLE accounts ADD COLUMN document TEXT;
ALTER TABLE accounts ADD COLUMN welcome_done INTEGER NOT NULL DEFAULT 1 CHECK(welcome_done IN (0,1));
CREATE UNIQUE INDEX accounts_document ON accounts(document) WHERE document IS NOT NULL;
ALTER TABLE companies ADD COLUMN ruc TEXT;
CREATE UNIQUE INDEX companies_ruc ON companies(ruc) WHERE ruc IS NOT NULL;
CREATE TABLE company_services (
 company_id TEXT NOT NULL REFERENCES companies(id),
 service TEXT NOT NULL CHECK(service IN ('SOCIAL','WALLET','MAPS','WEB','BRAND')),
 status TEXT NOT NULL CHECK(status IN ('SETUP','ACTIVE')),
 activated_by TEXT REFERENCES accounts(id),
 activated_at TEXT NOT NULL,
 PRIMARY KEY(company_id,service)
) STRICT;
-- Preserve existing workspaces; do not switch on a previously unlinked Wallet.
INSERT INTO company_services(company_id,service,status,activated_at)
 SELECT c.id,s.service,'ACTIVE',c.created_at FROM companies c CROSS JOIN
 (SELECT 'SOCIAL' service UNION ALL SELECT 'MAPS' UNION ALL SELECT 'WEB' UNION ALL SELECT 'BRAND') s;
INSERT INTO company_services(company_id,service,status,activated_at)
 SELECT id,'WALLET','ACTIVE',created_at FROM companies WHERE loyalty_tenant IS NOT NULL;
