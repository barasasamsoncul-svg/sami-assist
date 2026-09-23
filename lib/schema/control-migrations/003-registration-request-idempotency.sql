-- ============================================================
-- SaMi Control DB Migration
-- Registration draft single-consumption / idempotency
-- ============================================================
--
-- One encrypted registration draft may provision at most one
-- workspace. This table is control-plane infrastructure only;
-- it never appears in ordinary workspace UI.
--
-- The browser never supplies this nonce hash directly. SaMi
-- derives it server-side from the encrypted HttpOnly draft.
-- ============================================================

CREATE TABLE IF NOT EXISTS registration_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    nonce_hash CHAR(64) NOT NULL,

    draft_mode VARCHAR(20) NOT NULL
        CHECK (
            draft_mode IN (
                'email',
                'google',
                'existing'
            )
        ),

    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (
            status IN (
                'processing',
                'completed',
                'failed'
            )
        ),

    user_id UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    tenant_id UUID
        REFERENCES tenants(id)
        ON DELETE SET NULL,

    subscription_id UUID
        REFERENCES subscriptions(id)
        ON DELETE SET NULL,

    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    error_code VARCHAR(120),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT registration_requests_nonce_hash_unique
        UNIQUE (nonce_hash),

    CONSTRAINT registration_requests_completion_state
        CHECK (
            (
                status = 'completed'
                AND completed_at IS NOT NULL
                AND tenant_id IS NOT NULL
                AND subscription_id IS NOT NULL
                AND user_id IS NOT NULL
            )
            OR
            status <> 'completed'
        )
);

CREATE INDEX IF NOT EXISTS idx_registration_requests_status_started
    ON registration_requests(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_registration_requests_user
    ON registration_requests(user_id, created_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registration_requests_tenant
    ON registration_requests(tenant_id)
    WHERE tenant_id IS NOT NULL;
