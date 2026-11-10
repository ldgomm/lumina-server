ALTER TABLE staff_tokens ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_tokens ADD COLUMN contact TEXT NOT NULL DEFAULT '';
ALTER TABLE staff_tokens ADD COLUMN version INT NOT NULL DEFAULT 1 CHECK(version>0);
ALTER TABLE staff_tokens ADD COLUMN archived_at TIMESTAMPTZ;
ALTER TABLE staff_tokens ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE staff_tokens ADD COLUMN updated_at TIMESTAMPTZ;
ALTER TABLE staff_tokens ADD COLUMN request_id TEXT;
ALTER TABLE staff_tokens ADD COLUMN request_hash TEXT;
CREATE UNIQUE INDEX staff_create_request ON staff_tokens(tenant_id,request_id) WHERE request_id IS NOT NULL;
ALTER TABLE audit_events ADD COLUMN actor_name TEXT;
ALTER TABLE audit_events ADD COLUMN details JSONB NOT NULL DEFAULT '{}';
ALTER TABLE purchases ADD COLUMN actor_name TEXT;
ALTER TABLE redemptions ADD COLUMN actor_name TEXT;

-- Capture attribution when it happens. Do not rewrite historical events on a rename.
CREATE FUNCTION capture_staff_actor() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor TEXT;
BEGIN
 IF TG_TABLE_NAME='redemptions' THEN
   IF NEW.status<>'CONSUMED' OR (TG_OP='UPDATE' AND OLD.status='CONSUMED') THEN RETURN NEW; END IF;
   actor:=NEW.confirmed_actor_id;
 ELSE actor:=NEW.actor_id;
 END IF;
 SELECT coalesce(nullif(display_name,''),CASE WHEN role='OWNER' THEN 'Dueño' ELSE 'Caja' END || ' · ' || right(id,6))
 INTO NEW.actor_name FROM staff_tokens WHERE tenant_id=NEW.tenant_id AND id=actor;
 IF actor='platform' THEN NEW.actor_name:='Administrador de plataforma'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER purchase_actor BEFORE INSERT ON purchases FOR EACH ROW EXECUTE FUNCTION capture_staff_actor();
CREATE TRIGGER redemption_actor BEFORE INSERT OR UPDATE OF status ON redemptions FOR EACH ROW EXECUTE FUNCTION capture_staff_actor();
CREATE TRIGGER audit_actor BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION capture_staff_actor();
CREATE INDEX audit_tenant_time ON audit_events(tenant_id,created_at DESC,id);
CREATE INDEX audit_tenant_actor ON audit_events(tenant_id,actor_id,created_at DESC);
CREATE INDEX purchases_tenant_actor ON purchases(tenant_id,actor_id,created_at DESC);
CREATE INDEX redemptions_tenant_actor ON redemptions(tenant_id,confirmed_actor_id,consumed_at DESC) WHERE status='CONSUMED';
