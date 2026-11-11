-- Additive history-preserving migration. Loyalty/PostgreSQL and Wallet identities are untouched.
CREATE TABLE request_platforms (
  company_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK(platform IN ('INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE')),
  PRIMARY KEY(request_id,platform),
  FOREIGN KEY(company_id,request_id) REFERENCES requests(company_id,id)
);
INSERT INTO request_platforms SELECT company_id,id,channel FROM requests
 WHERE channel IN ('INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE');
-- Preserve platforms already published from one common piece, even if different from its original request.
INSERT OR IGNORE INTO request_platforms SELECT p.company_id,p.request_id,b.channel FROM pieces p
 JOIN publications b ON b.company_id=p.company_id AND b.piece_id=p.id
 JOIN requests r ON r.company_id=p.company_id AND r.id=p.request_id
 WHERE r.channel IN ('INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE');
UPDATE requests SET channel='SOCIAL' WHERE channel IN ('INSTAGRAM','TIKTOK','FACEBOOK','YOUTUBE');
CREATE TABLE wallet_access (
 account_id TEXT PRIMARY KEY REFERENCES accounts(id), company_id TEXT NOT NULL REFERENCES companies(id),
 tenant_id TEXT NOT NULL, request_id TEXT NOT NULL UNIQUE, staff_name TEXT NOT NULL,
 staff_id TEXT UNIQUE, sealed_token TEXT, status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','BLOCKED')),
 created_at TEXT NOT NULL
);
