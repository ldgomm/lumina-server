CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    registration_key TEXT NOT NULL UNIQUE,
    document_hint TEXT NOT NULL,
    phone TEXT NOT NULL,
    approved INTEGER NOT NULL DEFAULT 0 CHECK (approved IN (0,1)),
    loyalty_tenant TEXT UNIQUE,
    loyalty_name TEXT,
    created_at TEXT NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    company_id TEXT REFERENCES companies(id),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('AGENCY','OWNER','COLLABORATOR')),
    password TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
    revision INTEGER NOT NULL DEFAULT 1,
    CHECK ((kind='AGENCY') = (company_id IS NULL)),
    UNIQUE (company_id, id)
) STRICT;
CREATE TABLE IF NOT EXISTS grants (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    scope TEXT NOT NULL,
    action TEXT NOT NULL,
    PRIMARY KEY (account_id, scope, action)
) STRICT;
CREATE TABLE IF NOT EXISTS sessions (
    digest TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    csrf TEXT NOT NULL,
    expires_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS sessions_account ON sessions(account_id);
CREATE TABLE IF NOT EXISTS codes (
    digest TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('SETUP','ACTIVATE')),
    account_id TEXT REFERENCES accounts(id),
    expires_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS rate_limits (
    subject TEXT PRIMARY KEY,
    window INTEGER NOT NULL,
    count INTEGER NOT NULL
) STRICT;

CREATE TABLE IF NOT EXISTS audit (
    seq INTEGER PRIMARY KEY,
    company_id TEXT REFERENCES companies(id),
    actor_id TEXT REFERENCES accounts(id),
    actor_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    scope TEXT,
    action TEXT NOT NULL,
    details TEXT NOT NULL,
    happened_at TEXT NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS audit_scope ON audit(company_id,scope,seq DESC);

CREATE TABLE IF NOT EXISTS requests (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    owner_id TEXT NOT NULL REFERENCES accounts(id),
    type TEXT NOT NULL CHECK (type IN ('CONTENT','QUOTE','VISIT','COURTESY','PLAN')),
    channel TEXT NOT NULL,
    service TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    title TEXT NOT NULL,
    brief TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('NEW','REVIEW','QUOTED','APPROVED','SCHEDULED','PRODUCTION','DELIVERED','CANCELLED')),
    plan_id TEXT REFERENCES plans(id),
    requested_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    UNIQUE (company_id, id)
) STRICT;
CREATE INDEX IF NOT EXISTS requests_company ON requests(company_id,channel,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS one_courtesy ON requests(company_id) WHERE type='COURTESY';
CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
    terms TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OFFERED','ACCEPTED','SUPERSEDED')),
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id,request_id) REFERENCES requests(company_id,id),
    UNIQUE (request_id,revision)
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS one_current_quote ON quotes(request_id) WHERE status <> 'SUPERSEDED';

CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    term TEXT NOT NULL CHECK (term IN ('MONTHLY','ONE_OFF')),
    price_minor INTEGER CHECK (price_minor >= 0),
    wallet TEXT NOT NULL CHECK (wallet IN ('NONE','INCLUDED','GIFT')),
    description TEXT NOT NULL,
    published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0,1)),
    created_at TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS plan_items (
    plan_id TEXT NOT NULL REFERENCES plans(id),
    service TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 100),
    PRIMARY KEY (plan_id,service)
) STRICT;
CREATE TABLE IF NOT EXISTS contracts (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    plan_id TEXT NOT NULL REFERENCES plans(id),
    origin_request_id TEXT UNIQUE,
    agreed_minor INTEGER NOT NULL CHECK (agreed_minor >= 0),
    starts_on TEXT NOT NULL,
    ends_before TEXT NOT NULL CHECK (ends_before > starts_on),
    cancelled_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id,origin_request_id) REFERENCES requests(company_id,id),
    UNIQUE (company_id,id)
) STRICT;
CREATE INDEX IF NOT EXISTS contracts_company ON contracts(company_id,starts_on,ends_before);

CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    place TEXT NOT NULL,
    notes TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('SCHEDULED','DONE','CANCELLED')),
    recorded_at TEXT,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id,request_id) REFERENCES requests(company_id,id)
) STRICT;
CREATE INDEX IF NOT EXISTS visits_company ON visits(company_id,starts_at);

CREATE TABLE IF NOT EXISTS pieces (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    contract_id TEXT,
    title TEXT NOT NULL,
    service TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PRODUCTION','REVIEW','APPROVED','DELIVERED','CANCELLED')),
    recorded_at TEXT,
    observations TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id,request_id) REFERENCES requests(company_id,id),
    FOREIGN KEY (company_id,contract_id) REFERENCES contracts(company_id,id),
    UNIQUE (company_id,id)
) STRICT;
CREATE INDEX IF NOT EXISTS pieces_request ON pieces(company_id,request_id,created_at);
CREATE INDEX IF NOT EXISTS pieces_contract ON pieces(company_id,contract_id,service,status);
CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    piece_id TEXT NOT NULL,
    label TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (company_id,piece_id) REFERENCES pieces(company_id,id)
) STRICT;
CREATE INDEX IF NOT EXISTS evidence_piece ON evidence(company_id,piece_id);
CREATE TABLE IF NOT EXISTS publications (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    piece_id TEXT NOT NULL,
    channel TEXT NOT NULL,
    url TEXT NOT NULL,
    published_at TEXT NOT NULL,
    FOREIGN KEY (company_id,piece_id) REFERENCES pieces(company_id,id),
    UNIQUE (company_id,channel,url),
    UNIQUE (company_id,id)
) STRICT;
CREATE INDEX IF NOT EXISTS publications_piece ON publications(company_id,piece_id,published_at);

CREATE TABLE IF NOT EXISTS social_metrics (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    publication_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    views INTEGER CHECK (views >= 0),
    likes INTEGER CHECK (likes >= 0),
    comments INTEGER CHECK (comments >= 0),
    shares INTEGER CHECK (shares >= 0),
    reach INTEGER CHECK (reach >= 0),
    notes TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('MANUAL')),
    FOREIGN KEY (company_id,publication_id) REFERENCES publications(company_id,id),
    UNIQUE (company_id,publication_id,source,observed_at),
    CHECK (coalesce(views,likes,comments,shares,reach) IS NOT NULL)
) STRICT;
CREATE TABLE IF NOT EXISTS maps_locations (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    UNIQUE (company_id,url),
    UNIQUE (company_id,id)
) STRICT;
CREATE TABLE IF NOT EXISTS maps_metrics (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    observed_at TEXT NOT NULL,
    rating_hundredths INTEGER CHECK (rating_hundredths BETWEEN 100 AND 500),
    review_count INTEGER NOT NULL CHECK (review_count >= 0),
    notes TEXT NOT NULL,
    FOREIGN KEY (company_id,location_id) REFERENCES maps_locations(company_id,id),
    UNIQUE (company_id,location_id,observed_at),
    CHECK ((review_count=0) = (rating_hundredths IS NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS maps_reviews (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
    reviewed_on TEXT NOT NULL,
    reference TEXT NOT NULL,
    summary TEXT NOT NULL,
    response TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','DRAFT','ANSWERED')),
    FOREIGN KEY (company_id,location_id) REFERENCES maps_locations(company_id,id),
    UNIQUE (company_id,location_id,reference)
) STRICT;

CREATE TABLE IF NOT EXISTS cash_grants (
    account_id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL,
    request_id TEXT NOT NULL UNIQUE,
    branch_id TEXT NOT NULL,
    branch_name TEXT NOT NULL,
    purchases INTEGER NOT NULL CHECK (purchases IN (0,1)),
    rewards INTEGER NOT NULL CHECK (rewards IN (0,1)),
    staff_id TEXT UNIQUE,
    sealed_token TEXT,
    status TEXT NOT NULL CHECK (status IN ('PENDING','ACTIVE','REVOKING','INACTIVE')),
    FOREIGN KEY (company_id,account_id) REFERENCES accounts(company_id,id),
    CHECK (purchases + rewards > 0),
    CHECK (status <> 'ACTIVE' OR (staff_id IS NOT NULL AND sealed_token IS NOT NULL))
) STRICT;
