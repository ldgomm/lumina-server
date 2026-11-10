CREATE TABLE business_profile_requests (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), id TEXT NOT NULL, actor_id TEXT NOT NULL,
 details TEXT NOT NULL CHECK (length(details) BETWEEN 10 AND 1000),
 status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','RESOLVED','REJECTED')),
 created_at TIMESTAMPTZ NOT NULL, resolved_at TIMESTAMPTZ, response TEXT,
 PRIMARY KEY (tenant_id,id)
);
CREATE UNIQUE INDEX business_profile_one_pending ON business_profile_requests(tenant_id) WHERE status='PENDING';
CREATE TABLE business_profile_corrections (
 tenant_id TEXT NOT NULL REFERENCES tenants(id), version INT NOT NULL, actor_id TEXT NOT NULL,
 reason TEXT NOT NULL, before_config JSONB, after_config JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY (tenant_id,version)
);
CREATE TABLE birthday_settings (
 tenant_id TEXT PRIMARY KEY REFERENCES tenants(id), version INT NOT NULL CHECK (version>0), config JSONB NOT NULL
);
CREATE TABLE birthday_greetings (
 tenant_id TEXT NOT NULL, member_id TEXT NOT NULL, birthday_year INT NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL,
 PRIMARY KEY (tenant_id,member_id,birthday_year),
 FOREIGN KEY (tenant_id,member_id) REFERENCES members(tenant_id,id)
);
