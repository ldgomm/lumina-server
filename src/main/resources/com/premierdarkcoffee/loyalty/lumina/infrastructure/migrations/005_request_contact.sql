-- Contact at the time of the request; keep past records and all Wallet links intact.
ALTER TABLE requests ADD COLUMN contact_phone TEXT;
ALTER TABLE package_orders ADD COLUMN contact_phone TEXT;
