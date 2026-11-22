CREATE TABLE piece_corrections (
  comment_id TEXT PRIMARY KEY REFERENCES piece_comments(id),
  requested INTEGER NOT NULL DEFAULT 1 CHECK(requested IN (0,1)),
  resolved_file TEXT REFERENCES content_files(id),
  resolved_by TEXT REFERENCES accounts(id),
  resolved_name TEXT,
  resolved_at TEXT,
  CHECK ((resolved_file IS NULL) = (resolved_at IS NULL))
) STRICT;

CREATE TABLE follow_up_contacts (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  kind TEXT NOT NULL CHECK(kind IN ('wallet','courtesy')),
  case_id TEXT NOT NULL,
  actor_id TEXT NOT NULL REFERENCES accounts(id),
  actor_name TEXT NOT NULL,
  note TEXT NOT NULL,
  next_on TEXT,
  happened_at TEXT NOT NULL
) STRICT;
CREATE INDEX follow_up_case ON follow_up_contacts(company_id,kind,case_id,happened_at DESC);
