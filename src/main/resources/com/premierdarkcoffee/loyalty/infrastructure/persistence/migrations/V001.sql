CREATE TABLE tenants (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
 currency TEXT NOT NULL CHECK (currency ~ '^[A-Z]{3}$'), timezone TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE branches (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL,
 name TEXT NOT NULL, code TEXT NOT NULL, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE staff_tokens (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('OWNER','CASHIER')),
 branch_id TEXT, revoked_at TIMESTAMPTZ,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id)
);
CREATE TABLE members (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL,
 identity_hash TEXT NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL,
 card_code TEXT NOT NULL UNIQUE, terms_version TEXT NOT NULL,
 revision BIGINT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,identity_hash)
);
CREATE TABLE member_sessions (
 token_hash TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id)
);
CREATE TABLE programs (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('POINTS','CASHBACK','STAMPS')),
 current_version INT NOT NULL, PRIMARY KEY(tenant_id,id)
);
CREATE TABLE program_versions (
 tenant_id TEXT NOT NULL, program_id TEXT NOT NULL, version INT NOT NULL,
 config JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,program_id,version), FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id)
);
CREATE TABLE rewards (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, program_id TEXT NOT NULL,
 name TEXT NOT NULL, cost BIGINT NOT NULL CHECK(cost>0), active BOOLEAN NOT NULL,
 version INT NOT NULL DEFAULT 1, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id)
);
CREATE TABLE reward_versions (
 tenant_id TEXT NOT NULL, reward_id TEXT NOT NULL, version INT NOT NULL, config JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,reward_id,version),
 FOREIGN KEY(tenant_id,reward_id) REFERENCES rewards(tenant_id,id)
);
CREATE TABLE balances (
 tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, program_id TEXT NOT NULL,
 available BIGINT NOT NULL DEFAULT 0 CHECK(available >= 0),
 PRIMARY KEY(tenant_id,member_id,program_id),
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id), FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id)
);
CREATE TABLE purchases (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, member_id TEXT NOT NULL, branch_id TEXT NOT NULL,
 receipt TEXT NOT NULL, amount_minor BIGINT NOT NULL CHECK(amount_minor>0), currency TEXT NOT NULL,
 actor_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,branch_id,receipt),
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id),
 FOREIGN KEY(tenant_id,branch_id) REFERENCES branches(tenant_id,id), FOREIGN KEY(tenant_id,actor_id) REFERENCES staff_tokens(tenant_id,id)
);
CREATE TABLE redemptions (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, member_id TEXT NOT NULL, program_id TEXT NOT NULL,
 reward_id TEXT NOT NULL, reward_version INT NOT NULL, reward_name TEXT NOT NULL,
 cost BIGINT NOT NULL CHECK(cost>0), token_hash TEXT NOT NULL UNIQUE,
 status TEXT NOT NULL CHECK(status IN ('RESERVED','CONSUMED','CANCELLED','EXPIRED')),
 expires_at TIMESTAMPTZ NOT NULL, confirmed_branch_id TEXT, confirmed_actor_id TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), consumed_at TIMESTAMPTZ,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id), FOREIGN KEY(tenant_id,reward_id,reward_version) REFERENCES reward_versions(tenant_id,reward_id,version),
 FOREIGN KEY(tenant_id,confirmed_branch_id) REFERENCES branches(tenant_id,id), FOREIGN KEY(tenant_id,confirmed_actor_id) REFERENCES staff_tokens(tenant_id,id)
);
CREATE INDEX redemptions_expiry ON redemptions(expires_at) WHERE status='RESERVED';
CREATE TABLE ledger (
 tenant_id TEXT NOT NULL, id TEXT NOT NULL, member_id TEXT NOT NULL, program_id TEXT NOT NULL,
 delta BIGINT NOT NULL CHECK(delta<>0), kind TEXT NOT NULL CHECK(kind IN ('EARN','RESERVE','RELEASE')),
 reference_id TEXT NOT NULL, program_version INT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,program_id,kind,reference_id),
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id), FOREIGN KEY(tenant_id,program_id) REFERENCES programs(tenant_id,id),
 FOREIGN KEY(tenant_id,program_id,program_version) REFERENCES program_versions(tenant_id,program_id,version)
);
CREATE INDEX ledger_member ON ledger(tenant_id,member_id,created_at DESC,id);
CREATE TABLE idempotency (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), operation TEXT NOT NULL, key TEXT NOT NULL,
 request_hash TEXT NOT NULL, response JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,operation,key)
);
CREATE TABLE audit_events (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), actor_id TEXT NOT NULL,
 action TEXT NOT NULL, target_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE wallet_outbox (
 id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, revision BIGINT NOT NULL,
 state TEXT NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','SENT','FAILED')), attempts INT NOT NULL DEFAULT 0,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(tenant_id,member_id,revision),
 FOREIGN KEY(tenant_id,member_id) REFERENCES members(tenant_id,id)
);
CREATE TABLE rate_limits (key TEXT NOT NULL, bucket BIGINT NOT NULL, count INT NOT NULL, PRIMARY KEY(key,bucket));
-- Application never updates/deletes financial history. Database rejects accidental edits too.
CREATE FUNCTION forbid_history_changes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Immutable history: append a compensating event'; END $$;
CREATE TRIGGER ledger_immutable BEFORE UPDATE OR DELETE ON ledger FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER programs_history_immutable BEFORE UPDATE OR DELETE ON program_versions FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER rewards_history_immutable BEFORE UPDATE OR DELETE ON reward_versions FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON audit_events FOR EACH ROW EXECUTE FUNCTION forbid_history_changes();
