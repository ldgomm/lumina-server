CREATE TABLE content_files (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  piece_id TEXT NOT NULL REFERENCES pieces(id),
  asset_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  original_name TEXT NOT NULL,
  label TEXT NOT NULL,
  media_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size > 0),
  sha256 TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES accounts(id),
  request_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  UNIQUE(asset_id,version)
);
CREATE INDEX content_files_piece ON content_files(company_id,piece_id,asset_id,version);
CREATE TABLE piece_comments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  piece_id TEXT NOT NULL REFERENCES pieces(id),
  file_id TEXT REFERENCES content_files(id),
  actor_id TEXT NOT NULL REFERENCES accounts(id),
  actor_name TEXT NOT NULL,
  body TEXT NOT NULL,
  request_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX piece_comments_piece ON piece_comments(company_id,piece_id,created_at,id);
CREATE TABLE attention_seen (
  account_id TEXT NOT NULL REFERENCES accounts(id),
  notification_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY(account_id,notification_key)
);
