CREATE TABLE wallet_branch_additions (
  tenant_id TEXT NOT NULL, branch_id TEXT NOT NULL, branch_name TEXT NOT NULL, actor_id TEXT NOT NULL,
  plan_key TEXT NOT NULL, from_on DATE NOT NULL, ends_before DATE NOT NULL, cut_on DATE NOT NULL,
  unit_minor BIGINT NOT NULL, months INT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor>=0),
  invoice_id TEXT, PRIMARY KEY(tenant_id,branch_id),
  FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id),
  FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id)
);
CREATE INDEX wallet_branch_cut ON wallet_branch_additions(tenant_id,cut_on);
CREATE TABLE wallet_cut_previews (
  tenant_id TEXT NOT NULL REFERENCES tenants(id), cut_on DATE NOT NULL,
  lines JSONB NOT NULL, observed_on DATE NOT NULL, PRIMARY KEY(tenant_id,cut_on)
);
ALTER TABLE purchases ADD COLUMN review_programs JSONB;
CREATE TABLE purchase_corrections (
  tenant_id TEXT NOT NULL, id TEXT NOT NULL, purchase_id TEXT NOT NULL, version INT NOT NULL,
  actor_id TEXT NOT NULL, actor_name TEXT, reason TEXT NOT NULL, previous JSONB NOT NULL, updated JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,purchase_id,version),
  FOREIGN KEY(tenant_id,purchase_id) REFERENCES purchases(tenant_id,id)
);
CREATE TRIGGER correction_actor BEFORE INSERT ON purchase_corrections FOR EACH ROW EXECUTE FUNCTION capture_staff_actor();
CREATE TRIGGER correction_history BEFORE UPDATE OR DELETE ON purchase_corrections FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
ALTER TABLE ledger DROP CONSTRAINT ledger_kind_check;
ALTER TABLE ledger ADD CONSTRAINT ledger_kind_check CHECK(kind IN ('EARN','RESERVE','RELEASE','FORFEIT','CORRECTION'));
