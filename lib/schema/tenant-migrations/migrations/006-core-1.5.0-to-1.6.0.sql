-- ============================================================
-- SaMi Tenant Core Migration
-- 1.5.0 -> 1.6.0
-- Category 19: Automation & Workflows
-- ============================================================

CREATE TABLE IF NOT EXISTS automation_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,

    status VARCHAR(30) NOT NULL DEFAULT 'draft'
        CHECK (
            status IN (
                'draft',
                'active',
                'paused',
                'archived'
            )
        ),

    latest_version INTEGER NOT NULL DEFAULT 0
        CHECK (latest_version >= 0),

    active_version INTEGER
        CHECK (
            active_version IS NULL OR
            active_version > 0
        ),

    created_by UUID NOT NULL,
    updated_by UUID NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    last_activated_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_workflows_company_status
    ON automation_workflows(company_id, status, updated_at DESC)
    WHERE archived_at IS NULL;


CREATE TABLE IF NOT EXISTS automation_workflow_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL
        REFERENCES automation_workflows(id)
        ON DELETE CASCADE,

    version INTEGER NOT NULL
        CHECK (version > 0),

    trigger_key VARCHAR(200) NOT NULL,
    trigger_module VARCHAR(150),

    definition JSONB NOT NULL,

    created_by UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at TIMESTAMPTZ,

    UNIQUE(workflow_id, version)
);

CREATE INDEX IF NOT EXISTS idx_automation_versions_workflow
    ON automation_workflow_versions(workflow_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_automation_versions_trigger
    ON automation_workflow_versions(trigger_module, trigger_key);


CREATE TABLE IF NOT EXISTS automation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    source_type VARCHAR(30) NOT NULL
        CHECK (
            source_type IN (
                'event',
                'schedule',
                'manual',
                'webhook'
            )
        ),

    trigger_key VARCHAR(200) NOT NULL,
    source_module VARCHAR(150),

    source_record_type VARCHAR(150),
    source_record_id UUID,

    idempotency_key VARCHAR(255) NOT NULL,

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

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_events_pending
    ON automation_events(company_id, occurred_at, id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_automation_events_trigger
    ON automation_events(company_id, source_module, trigger_key, occurred_at DESC);


CREATE TABLE IF NOT EXISTS automation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workflow_id UUID NOT NULL
        REFERENCES automation_workflows(id)
        ON DELETE CASCADE,

    workflow_version_id UUID NOT NULL
        REFERENCES automation_workflow_versions(id)
        ON DELETE RESTRICT,

    event_id UUID
        REFERENCES automation_events(id)
        ON DELETE SET NULL,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    initiated_by UUID,

    status VARCHAR(40) NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'running',
                'waiting_approval',
                'succeeded',
                'failed',
                'cancelled'
            )
        ),

    attempt INTEGER NOT NULL DEFAULT 1
        CHECK (attempt > 0),

    max_attempts INTEGER NOT NULL DEFAULT 1
        CHECK (max_attempts > 0),

    idempotency_key VARCHAR(255) NOT NULL,
    correlation_id UUID NOT NULL,

    input_context JSONB NOT NULL DEFAULT '{}'::JSONB,
    result JSONB NOT NULL DEFAULT '{}'::JSONB,

    error_code VARCHAR(120),
    error_message TEXT,

    next_retry_at TIMESTAMPTZ,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(company_id, idempotency_key),
    UNIQUE(correlation_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_runs_workflow_created
    ON automation_runs(workflow_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_company_status
    ON automation_runs(company_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_automation_runs_retry
    ON automation_runs(next_retry_at)
    WHERE status = 'failed'
      AND next_retry_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS automation_run_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    run_id UUID NOT NULL
        REFERENCES automation_runs(id)
        ON DELETE CASCADE,

    step_key VARCHAR(150) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 0,

    action_key VARCHAR(200) NOT NULL,
    action_module VARCHAR(150),

    operation VARCHAR(20) NOT NULL
        CHECK (operation IN ('read', 'write')),

    status VARCHAR(40) NOT NULL DEFAULT 'queued'
        CHECK (
            status IN (
                'queued',
                'running',
                'waiting_approval',
                'succeeded',
                'failed',
                'skipped',
                'cancelled'
            )
        ),

    attempt INTEGER NOT NULL DEFAULT 1
        CHECK (attempt > 0),

    max_attempts INTEGER NOT NULL DEFAULT 1
        CHECK (max_attempts > 0),

    approval_required BOOLEAN NOT NULL DEFAULT FALSE,

    input JSONB NOT NULL DEFAULT '{}'::JSONB,
    output JSONB NOT NULL DEFAULT '{}'::JSONB,

    error_code VARCHAR(120),
    error_message TEXT,

    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(run_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_automation_steps_run_sequence
    ON automation_run_steps(run_id, sequence, created_at);

CREATE INDEX IF NOT EXISTS idx_automation_steps_status
    ON automation_run_steps(status, created_at);


CREATE TABLE IF NOT EXISTS automation_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    run_id UUID NOT NULL
        REFERENCES automation_runs(id)
        ON DELETE CASCADE,

    step_id UUID NOT NULL
        REFERENCES automation_run_steps(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'approved',
                'rejected',
                'expired',
                'cancelled'
            )
        ),

    required_permissions JSONB NOT NULL DEFAULT '[]'::JSONB,

    requested_by UUID,
    resolved_by UUID,

    decision_note VARCHAR(1000),

    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    UNIQUE(step_id)
);

CREATE INDEX IF NOT EXISTS idx_automation_approvals_pending
    ON automation_approvals(company_id, requested_at, id)
    WHERE status = 'pending';


CREATE TABLE IF NOT EXISTS automation_schedules (
    workflow_id UUID PRIMARY KEY
        REFERENCES automation_workflows(id)
        ON DELETE CASCADE,

    company_id UUID NOT NULL
        REFERENCES companies(id)
        ON DELETE CASCADE,

    run_as_user_id UUID NOT NULL,

    schedule_kind VARCHAR(30) NOT NULL DEFAULT 'interval'
        CHECK (schedule_kind IN ('interval')),

    interval_seconds INTEGER NOT NULL
        CHECK (
            interval_seconds >= 60
            AND interval_seconds <= 2592000
        ),

    timezone VARCHAR(100) NOT NULL,

    status VARCHAR(30) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused')),

    next_run_at TIMESTAMPTZ,
    last_run_at TIMESTAMPTZ,

    lease_until TIMESTAMPTZ,
    lease_token UUID,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_schedules_due
    ON automation_schedules(next_run_at, workflow_id)
    WHERE status = 'active'
      AND next_run_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_automation_schedules_run_as
    ON automation_schedules(run_as_user_id, company_id);


DROP TRIGGER IF EXISTS trg_automation_workflows_updated_at
    ON automation_workflows;

CREATE TRIGGER trg_automation_workflows_updated_at
BEFORE UPDATE ON automation_workflows
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


DROP TRIGGER IF EXISTS trg_automation_schedules_updated_at
    ON automation_schedules;

CREATE TRIGGER trg_automation_schedules_updated_at
BEFORE UPDATE ON automation_schedules
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();


INSERT INTO core_schema_version (version, installed_at)
VALUES ('1.6.0', NOW())
ON CONFLICT (version) DO NOTHING;
