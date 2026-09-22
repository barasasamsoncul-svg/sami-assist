-- ============================================================
-- SaMi Tenant Core Migration
-- 1.7.0 -> 1.8.0
-- Category 21: API & Developer Access
-- ============================================================

CREATE TABLE IF NOT EXISTS api_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    public_id VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(200) NOT NULL,

    secret_hash CHAR(64) NOT NULL,
    key_hint VARCHAR(8) NOT NULL,

    scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
    allowed_app_keys JSONB NOT NULL DEFAULT '[]'::JSONB,

    rate_limit_per_minute INTEGER NOT NULL DEFAULT 60
        CHECK (
            rate_limit_per_minute >= 1
            AND rate_limit_per_minute <= 600
        ),

    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'revoked',
                'expired'
            )
        ),

    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_credentials_company_status
    ON api_credentials(company_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_credentials_company_name_active
    ON api_credentials(company_id, LOWER(name))
    WHERE status = 'active';


CREATE TABLE IF NOT EXISTS api_rate_limit_windows (
    credential_id UUID NOT NULL
        REFERENCES api_credentials(id)
        ON DELETE CASCADE,

    window_start TIMESTAMPTZ NOT NULL,
    request_count INTEGER NOT NULL DEFAULT 0
        CHECK (request_count >= 0),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (
        credential_id,
        window_start
    )
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_windows_cleanup
    ON api_rate_limit_windows(window_start);


CREATE TABLE IF NOT EXISTS api_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    credential_id UUID
        REFERENCES api_credentials(id)
        ON DELETE SET NULL,

    request_id UUID NOT NULL UNIQUE,

    route_key VARCHAR(200) NOT NULL,
    method VARCHAR(10) NOT NULL,

    status_code INTEGER NOT NULL
        CHECK (
            status_code >= 100
            AND status_code <= 599
        ),

    outcome VARCHAR(30) NOT NULL
        CHECK (
            outcome IN (
                'success',
                'failure',
                'rate_limited'
            )
        ),

    duration_ms INTEGER NOT NULL DEFAULT 0
        CHECK (duration_ms >= 0),

    rate_limited BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_company_created
    ON api_request_logs(company_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_api_request_logs_credential_created
    ON api_request_logs(credential_id, created_at DESC)
    WHERE credential_id IS NOT NULL;


DROP TRIGGER IF EXISTS trg_api_credentials_updated_at
    ON api_credentials;

CREATE TRIGGER trg_api_credentials_updated_at
BEFORE UPDATE ON api_credentials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.8.0', NOW())
ON CONFLICT (version) DO NOTHING;
