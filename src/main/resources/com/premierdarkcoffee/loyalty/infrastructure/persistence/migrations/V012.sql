-- Operational timestamps only. Existing identities, balances and delivery tags remain unchanged.
ALTER TABLE wallet_delivery ADD COLUMN last_success_at TIMESTAMPTZ;
ALTER TABLE wallet_delivery ADD COLUMN last_manual_retry_at TIMESTAMPTZ;
CREATE INDEX wallet_registration_serial ON wallet_apple_registrations(serial);
