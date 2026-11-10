CREATE TABLE business_access (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (state IN ('ACTIVE','SUSPENDED','CLOSED')),
    reason TEXT NOT NULL DEFAULT '',
    version INT NOT NULL DEFAULT 1,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO business_access(tenant_id) SELECT id FROM tenants;

CREATE TABLE business_access_history (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    version INT NOT NULL,
    state TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,version)
);
CREATE TRIGGER business_access_history_immutable BEFORE UPDATE OR DELETE ON business_access_history
FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();

CREATE TABLE billing_memberships (
    tenant_id TEXT PRIMARY KEY REFERENCES tenants(id),
    version INT NOT NULL,
    config JSONB NOT NULL,
    next_on DATE NOT NULL
);
CREATE TABLE billing_plan_versions (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    version INT NOT NULL,
    config JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(tenant_id,version)
);
CREATE TRIGGER billing_plan_history BEFORE UPDATE OR DELETE ON billing_plan_versions
FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();

CREATE TABLE billing_invoices (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 0 AND 1000000000),
    paid_minor BIGINT NOT NULL DEFAULT 0 CHECK(paid_minor >= 0 AND paid_minor <= amount_minor),
    currency TEXT NOT NULL,
    due_on DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    plan_version INT,
    void_reason TEXT,
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,id),
    UNIQUE(tenant_id,period_start),
    FOREIGN KEY(tenant_id,plan_version) REFERENCES billing_plan_versions(tenant_id,version),
    CHECK(voided_at IS NULL OR paid_minor=0)
);
CREATE INDEX billing_open_due ON billing_invoices(tenant_id,due_on) WHERE voided_at IS NULL AND paid_minor < amount_minor;
CREATE TRIGGER invoice_history_delete BEFORE DELETE ON billing_invoices FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER invoice_economic_history BEFORE UPDATE OF tenant_id,id,description,amount_minor,currency,due_on,period_start,period_end,plan_version,created_at
ON billing_invoices FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();

CREATE TABLE billing_payments (
    tenant_id TEXT NOT NULL,
    id TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    amount_minor BIGINT NOT NULL CHECK(amount_minor BETWEEN 1 AND 1000000000),
    reference TEXT NOT NULL,
    method TEXT NOT NULL CHECK(method IN ('TRANSFER','CASH','CARD','OTHER')),
    paid_on DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,id),
    UNIQUE(tenant_id,reference),
    FOREIGN KEY(tenant_id,invoice_id) REFERENCES billing_invoices(tenant_id,id)
);
CREATE TABLE billing_reversals (
    tenant_id TEXT NOT NULL,
    payment_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,payment_id),
    FOREIGN KEY(tenant_id,payment_id) REFERENCES billing_payments(tenant_id,id)
);
CREATE TRIGGER payment_history BEFORE UPDATE OR DELETE ON billing_payments FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER reversal_history BEFORE UPDATE OR DELETE ON billing_reversals FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();

CREATE TABLE business_notices (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    severity TEXT NOT NULL CHECK(severity IN ('INFO','WARNING','URGENT')),
    expires_on DATE,
    created_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,id)
);
CREATE TABLE business_notice_reads (
    tenant_id TEXT NOT NULL,
    notice_id TEXT NOT NULL,
    staff_id TEXT NOT NULL,
    read_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY(tenant_id,notice_id,staff_id),
    FOREIGN KEY(tenant_id,notice_id) REFERENCES business_notices(tenant_id,id),
    FOREIGN KEY(tenant_id,staff_id) REFERENCES staff_tokens(tenant_id,id)
);
CREATE TRIGGER notice_history BEFORE UPDATE OR DELETE ON business_notices FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE INDEX purchases_metrics ON purchases(tenant_id,created_at,member_id);
CREATE INDEX members_metrics ON members(tenant_id,created_at);
