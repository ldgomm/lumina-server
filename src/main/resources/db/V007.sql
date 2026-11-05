ALTER TABLE member_restore_links DROP CONSTRAINT member_restore_links_reason_check;
ALTER TABLE member_restore_links ADD CONSTRAINT member_restore_links_reason_check
 CHECK(reason IN ('DEVICE_CHANGE','REMOVED_CARD','CONNECTION_REPAIR'));
