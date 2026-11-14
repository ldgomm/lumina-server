-- Contact is independent of identity, permissions and Wallet integration.
-- Historical accounts remain valid without inventing or copying a phone.
ALTER TABLE accounts ADD COLUMN contact_phone TEXT
  CHECK(contact_phone IS NULL OR (length(contact_phone) BETWEEN 9 AND 16
    AND substr(contact_phone,1,1)='+' AND substr(contact_phone,2) NOT GLOB '*[^0-9]*'));
