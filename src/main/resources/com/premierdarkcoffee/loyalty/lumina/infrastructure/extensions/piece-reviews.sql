CREATE TABLE piece_reviews (
    company_id TEXT NOT NULL,
    piece_id TEXT NOT NULL,
    revision INTEGER NOT NULL CHECK (revision >= 1),
    decision TEXT NOT NULL CHECK (decision IN ('APPROVED','PRODUCTION')),
    note TEXT NOT NULL,
    actor_id TEXT NOT NULL REFERENCES accounts(id),
    actor_name TEXT NOT NULL,
    reviewed_at TEXT NOT NULL,
    PRIMARY KEY (company_id, piece_id, revision),
    FOREIGN KEY (company_id, piece_id) REFERENCES pieces(company_id, id)
) STRICT;
