ALTER TABLE staff_tokens ADD COLUMN allow_purchases boolean NOT NULL DEFAULT true;
ALTER TABLE staff_tokens ADD COLUMN allow_rewards boolean NOT NULL DEFAULT true;
CREATE INDEX purchases_tenant_branch_time ON purchases(tenant_id, branch_id, created_at);
CREATE INDEX redemptions_tenant_branch_time ON redemptions(tenant_id, confirmed_branch_id, consumed_at) WHERE status = 'CONSUMED';
