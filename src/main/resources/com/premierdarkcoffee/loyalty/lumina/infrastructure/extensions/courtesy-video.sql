CREATE TABLE courtesy_display (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id)
) STRICT;

CREATE TABLE courtesy_deliveries (
  company_id TEXT PRIMARY KEY REFERENCES companies(id),
  request_id TEXT,
  actor_id TEXT NOT NULL REFERENCES accounts(id),
  delivered_at TEXT NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (company_id,request_id) REFERENCES requests(company_id,id)
) STRICT;
