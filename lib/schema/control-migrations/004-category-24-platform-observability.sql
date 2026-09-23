-- ============================================================
-- SaMi Control DB Migration
-- Category 24: Platform Operations & Observability
-- ============================================================
--
-- Additive control-plane observability only.
-- No workspace business records are moved into these tables.
-- Diagnostic payloads are redacted in application code before
-- persistence and must never contain credentials or request bodies.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    fingerprint CHAR(64) NOT NULL,

    status VARCHAR(24) NOT NULL DEFAULT 'open'
        CHECK (
            status IN (
                'open',
                'acknowledged',
                'resolved',
                'ignored'
            )
        ),

    severity VARCHAR(16) NOT NULL DEFAULT 'error'
        CHECK (
            severity IN (
                'info',
                'warning',
                'error',
                'critical'
            )
        ),

    source VARCHAR(64) NOT NULL,
    provider VARCHAR(64),
    category VARCHAR(80) NOT NULL,
    title VARCHAR(255) NOT NULL,

    error_name VARCHAR(160),
    error_code VARCHAR(120),

    route VARCHAR(500),
    operation VARCHAR(180),

    tenant_id UUID
        REFERENCES tenants(id)
        ON DELETE SET NULL,

    user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,

    occurrence_count BIGINT NOT NULL DEFAULT 1
        CHECK (occurrence_count >= 1),

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    latest_correlation_id UUID,
    latest_request_id VARCHAR(255),
    latest_status_code INTEGER,

    latest_message TEXT,
    latest_stack TEXT,
    latest_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    acknowledged_at TIMESTAMPTZ,
    acknowledged_by_admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,

    resolved_at TIMESTAMPTZ,
    resolved_by_admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,

    resolution_note TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_incidents_active_fingerprint
    ON platform_incidents(fingerprint)
    WHERE status IN ('open', 'acknowledged');

CREATE INDEX IF NOT EXISTS idx_platform_incidents_status_last_seen
    ON platform_incidents(status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_severity_last_seen
    ON platform_incidents(severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_incidents_tenant
    ON platform_incidents(tenant_id, last_seen_at DESC)
    WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_incidents_provider
    ON platform_incidents(provider, last_seen_at DESC)
    WHERE provider IS NOT NULL;


CREATE TABLE IF NOT EXISTS platform_incident_occurrences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    incident_id UUID NOT NULL
        REFERENCES platform_incidents(id)
        ON DELETE CASCADE,

    correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),
    request_id VARCHAR(255),

    environment VARCHAR(40),
    source VARCHAR(64) NOT NULL,
    provider VARCHAR(64),
    category VARCHAR(80) NOT NULL,

    route VARCHAR(500),
    method VARCHAR(16),
    operation VARCHAR(180),
    status_code INTEGER,

    tenant_id UUID
        REFERENCES tenants(id)
        ON DELETE SET NULL,

    user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    admin_id UUID
        REFERENCES platform_admins(id)
        ON DELETE SET NULL,

    error_name VARCHAR(160),
    error_code VARCHAR(120),
    message TEXT,
    stack TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_incident_occurrences_incident
    ON platform_incident_occurrences(incident_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_incident_occurrences_correlation
    ON platform_incident_occurrences(correlation_id);

CREATE INDEX IF NOT EXISTS idx_platform_incident_occurrences_request
    ON platform_incident_occurrences(request_id)
    WHERE request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_incident_occurrences_tenant
    ON platform_incident_occurrences(tenant_id, created_at DESC)
    WHERE tenant_id IS NOT NULL;


CREATE TABLE IF NOT EXISTS platform_provider_checks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    provider VARCHAR(64) NOT NULL,
    component VARCHAR(120) NOT NULL,

    status VARCHAR(24) NOT NULL
        CHECK (
            status IN (
                'healthy',
                'degraded',
                'unavailable',
                'not_configured',
                'unknown'
            )
        ),

    latency_ms INTEGER,
    status_code INTEGER,
    code VARCHAR(120),
    message TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_provider_checks_provider
    ON platform_provider_checks(provider, component, checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_provider_checks_status
    ON platform_provider_checks(status, checked_at DESC);


CREATE TABLE IF NOT EXISTS platform_job_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    job_key VARCHAR(160) NOT NULL,

    status VARCHAR(24) NOT NULL
        CHECK (
            status IN (
                'queued',
                'running',
                'succeeded',
                'failed',
                'cancelled'
            )
        ),

    correlation_id UUID NOT NULL DEFAULT gen_random_uuid(),

    trigger_type VARCHAR(40),
    provider VARCHAR(64),

    tenant_id UUID
        REFERENCES tenants(id)
        ON DELETE SET NULL,

    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,

    duration_ms INTEGER,

    error_code VARCHAR(120),
    error_message TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_job_runs_job
    ON platform_job_runs(job_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_job_runs_status
    ON platform_job_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_job_runs_correlation
    ON platform_job_runs(correlation_id);
