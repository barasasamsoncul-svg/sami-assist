-- ============================================================
-- SaMi Tenant Core Migration
-- 1.6.0 -> 1.7.0
-- Category 20: Integrations
-- ============================================================

ALTER TABLE automation_workflows
ADD COLUMN IF NOT EXISTS run_as_user_id UUID;


CREATE TABLE IF NOT EXISTS integration_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    provider_key VARCHAR(150) NOT NULL,

    connection_type VARCHAR(30) NOT NULL
        CHECK (
            connection_type IN (
                'oauth2',
                'webhook',
                'external_app'
            )
        ),

    name VARCHAR(200) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'connected',
                'degraded',
                'expired',
                'revoked',
                'error'
            )
        ),

    owner_user_id UUID,

    external_account_id VARCHAR(255),
    external_account_name VARCHAR(255),
    external_account_email VARCHAR(320),

    scopes JSONB NOT NULL DEFAULT '[]'::JSONB,
    capabilities JSONB NOT NULL DEFAULT '[]'::JSONB,

    settings JSONB NOT NULL DEFAULT '{}'::JSONB,

    health_status VARCHAR(30) NOT NULL DEFAULT 'unknown'
        CHECK (
            health_status IN (
                'unknown',
                'healthy',
                'degraded',
                'unreachable',
                'expired',
                'revoked'
            )
        ),

    last_health_check_at TIMESTAMPTZ,
    last_sync_at TIMESTAMPTZ,

    connected_at TIMESTAMPTZ,
    disconnected_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_connections_company
    ON integration_connections(company_id, status, updated_at DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_integration_connections_provider
    ON integration_connections(company_id, provider_key, status)
    WHERE archived_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_connections_company_name
    ON integration_connections(company_id, LOWER(name))
    WHERE archived_at IS NULL;


CREATE TABLE IF NOT EXISTS integration_credentials (
    connection_id UUID PRIMARY KEY
        REFERENCES integration_connections(id)
        ON DELETE CASCADE,

    credential_type VARCHAR(40) NOT NULL
        CHECK (
            credential_type IN (
                'oauth2',
                'api_key',
                'webhook_secret'
            )
        ),

    sealed_payload TEXT NOT NULL,
    key_version VARCHAR(32) NOT NULL,

    expires_at TIMESTAMPTZ,
    rotated_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE TABLE IF NOT EXISTS integration_oauth_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    provider_key VARCHAR(150) NOT NULL,

    user_id UUID NOT NULL,

    state_hash CHAR(64) NOT NULL UNIQUE,

    redirect_uri TEXT NOT NULL,

    code_verifier_sealed TEXT,
    key_version VARCHAR(32),

    requested_scopes JSONB NOT NULL DEFAULT '[]'::JSONB,

    return_path VARCHAR(500),

    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_expiry
    ON integration_oauth_states(expires_at)
    WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_integration_oauth_states_company_user
    ON integration_oauth_states(company_id, user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS integration_sync_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    connection_id UUID NOT NULL
        REFERENCES integration_connections(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    run_as_user_id UUID NOT NULL,

    direction VARCHAR(30) NOT NULL
        CHECK (
            direction IN (
                'inbound',
                'outbound',
                'bidirectional'
            )
        ),

    job_type VARCHAR(30) NOT NULL
        CHECK (
            job_type IN (
                'manual',
                'scheduled',
                'webhook',
                'backfill'
            )
        ),

    status VARCHAR(40) NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'running',
                'succeeded',
                'failed',
                'cancelled'
            )
        ),

    cursor JSONB NOT NULL DEFAULT '{}'::JSONB,
    result JSONB NOT NULL DEFAULT '{}'::JSONB,

    attempt INTEGER NOT NULL DEFAULT 1
        CHECK (attempt > 0),

    max_attempts INTEGER NOT NULL DEFAULT 3
        CHECK (
            max_attempts > 0
            AND max_attempts <= 10
        ),

    error_code VARCHAR(120),
    error_message TEXT,

    correlation_id UUID NOT NULL UNIQUE,

    next_retry_at TIMESTAMPTZ,

    lease_until TIMESTAMPTZ,
    lease_token UUID,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_connection
    ON integration_sync_jobs(connection_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_retry
    ON integration_sync_jobs(next_retry_at)
    WHERE status = 'failed'
      AND next_retry_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_sync_jobs_lease
    ON integration_sync_jobs(lease_until)
    WHERE lease_until IS NOT NULL;


CREATE TABLE IF NOT EXISTS integration_webhook_endpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    connection_id UUID
        REFERENCES integration_connections(id)
        ON DELETE SET NULL,

    provider_key VARCHAR(150) NOT NULL,

    endpoint_key VARCHAR(120) NOT NULL UNIQUE,

    name VARCHAR(200) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (
            status IN (
                'active',
                'paused',
                'revoked'
            )
        ),

    secret_hash CHAR(64) NOT NULL,

    event_keys JSONB NOT NULL DEFAULT '[]'::JSONB,

    created_by UUID NOT NULL,

    last_received_at TIMESTAMPTZ,

    archived_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_webhook_endpoints_company
    ON integration_webhook_endpoints(company_id, status, created_at DESC)
    WHERE archived_at IS NULL;


CREATE TABLE IF NOT EXISTS integration_webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    endpoint_id UUID NOT NULL
        REFERENCES integration_webhook_endpoints(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    direction VARCHAR(20) NOT NULL
        CHECK (
            direction IN (
                'inbound',
                'outbound'
            )
        ),

    external_event_id VARCHAR(255),

    payload_digest CHAR(64) NOT NULL,
    payload_bytes INTEGER NOT NULL
        CHECK (payload_bytes >= 0),

    signature_valid BOOLEAN NOT NULL DEFAULT FALSE,

    status VARCHAR(30) NOT NULL DEFAULT 'received'
        CHECK (
            status IN (
                'received',
                'processed',
                'ignored',
                'failed'
            )
        ),

    http_status INTEGER,

    error_code VARCHAR(120),
    error_message TEXT,

    correlation_id UUID NOT NULL,

    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_webhook_external_event
    ON integration_webhook_deliveries(endpoint_id, external_event_id)
    WHERE external_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_integration_webhook_deliveries_company
    ON integration_webhook_deliveries(company_id, received_at DESC);


CREATE TABLE IF NOT EXISTS integration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    connection_id UUID
        REFERENCES integration_connections(id)
        ON DELETE SET NULL,

    delivery_id UUID
        REFERENCES integration_webhook_deliveries(id)
        ON DELETE SET NULL,

    provider_key VARCHAR(150) NOT NULL,
    event_key VARCHAR(200) NOT NULL,

    external_event_id VARCHAR(255),

    payload JSONB NOT NULL DEFAULT '{}'::JSONB,

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'processed',
                'ignored',
                'failed'
            )
        ),

    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_events_pending
    ON integration_events(company_id, occurred_at, id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_integration_events_provider
    ON integration_events(company_id, provider_key, event_key, occurred_at DESC);


CREATE TABLE IF NOT EXISTS integration_external_apps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,

    launch_url TEXT NOT NULL,

    icon_key VARCHAR(100),

    auth_mode VARCHAR(30) NOT NULL DEFAULT 'bookmark'
        CHECK (
            auth_mode IN (
                'bookmark',
                'saml',
                'oidc'
            )
        ),

    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'active',
                'disabled'
            )
        ),

    assignment_mode VARCHAR(30) NOT NULL DEFAULT 'manual'
        CHECK (
            assignment_mode IN (
                'manual',
                'all_internal',
                'rule'
            )
        ),

    sso_config JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    last_health_check_at TIMESTAMPTZ,

    archived_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integration_external_apps_company_name
    ON integration_external_apps(company_id, LOWER(name))
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_integration_external_apps_company_status
    ON integration_external_apps(company_id, status, updated_at DESC)
    WHERE archived_at IS NULL;


CREATE TABLE IF NOT EXISTS integration_external_app_assignments (
    external_app_id UUID NOT NULL
        REFERENCES integration_external_apps(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL,

    assignment_source VARCHAR(30) NOT NULL DEFAULT 'manual'
        CHECK (
            assignment_source IN (
                'manual',
                'rule',
                'all_internal'
            )
        ),

    assigned_by UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (external_app_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_integration_external_app_assignments_user
    ON integration_external_app_assignments(company_id, user_id, created_at DESC);


CREATE TABLE IF NOT EXISTS integration_assignment_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    external_app_id UUID NOT NULL
        REFERENCES integration_external_apps(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,

    enabled BOOLEAN NOT NULL DEFAULT TRUE,

    priority INTEGER NOT NULL DEFAULT 100,

    conditions JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_assignment_rules_app
    ON integration_assignment_rules(external_app_id, enabled, priority, created_at);


DROP TRIGGER IF EXISTS trg_integration_connections_updated_at
    ON integration_connections;

CREATE TRIGGER trg_integration_connections_updated_at
BEFORE UPDATE ON integration_connections
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_integration_credentials_updated_at
    ON integration_credentials;

CREATE TRIGGER trg_integration_credentials_updated_at
BEFORE UPDATE ON integration_credentials
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_integration_webhook_endpoints_updated_at
    ON integration_webhook_endpoints;

CREATE TRIGGER trg_integration_webhook_endpoints_updated_at
BEFORE UPDATE ON integration_webhook_endpoints
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_integration_external_apps_updated_at
    ON integration_external_apps;

CREATE TRIGGER trg_integration_external_apps_updated_at
BEFORE UPDATE ON integration_external_apps
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_integration_assignment_rules_updated_at
    ON integration_assignment_rules;

CREATE TRIGGER trg_integration_assignment_rules_updated_at
BEFORE UPDATE ON integration_assignment_rules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.7.0', NOW())
ON CONFLICT (version) DO NOTHING;
