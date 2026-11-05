ALTER TABLE programs ADD COLUMN deleted_at TIMESTAMPTZ;
ALTER TABLE programs ADD COLUMN deleted_by TEXT;
ALTER TABLE programs ADD CONSTRAINT program_deleted_by_fk FOREIGN KEY(tenant_id,deleted_by) REFERENCES staff_tokens(tenant_id,id);
ALTER TABLE ledger DROP CONSTRAINT ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK(kind IN ('EARN','RESERVE','RELEASE','FORFEIT'));
CREATE VIEW customer_programs AS
 SELECT p.tenant_id,p.id,p.kind,p.current_version,v.config
 FROM programs p JOIN program_versions v ON v.tenant_id=p.tenant_id AND v.program_id=p.id AND v.version=p.current_version
 WHERE p.deleted_at IS NULL AND coalesce((v.config->>'active')::boolean,true);
CREATE TABLE program_deletions (
 tenant_id TEXT NOT NULL, program_id TEXT NOT NULL, actor_id TEXT NOT NULL,
 impact JSONB NOT NULL, deleted_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY(tenant_id,program_id), FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_tokens(tenant_id,id)
);
CREATE TRIGGER program_deletions_immutable BEFORE UPDATE OR DELETE ON program_deletions FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE FUNCTION forbid_program_restore() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.deleted_at IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN
  RAISE EXCEPTION 'Deleted promotion is final';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER program_deletion_final BEFORE UPDATE ON programs FOR EACH ROW EXECUTE FUNCTION forbid_program_restore();
