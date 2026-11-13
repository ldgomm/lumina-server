-- The chosen category is metadata. Existing business and pass identities remain unchanged.
ALTER TABLE lumina_business_registrations ADD COLUMN category TEXT NOT NULL DEFAULT '';

-- Billing needs a durable start time for each branch. Previously registered branches
-- are present before any v057 agreement can be accepted; never infer old charges.
ALTER TABLE branches ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
