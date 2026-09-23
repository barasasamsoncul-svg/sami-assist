-- ============================================================
-- SaMi Control DB Migration
-- Category 24: Platform Service Subscriptions & Cost Guardrails
-- ============================================================
--
-- Tracks the external services required to keep SaMi operating:
-- hosting, database, storage, domain/registrar, AI providers,
-- email/SMS and other infrastructure vendors.
--
-- This is control-plane data only. Secrets are NEVER stored here.
-- API credentials remain in server environment variables.
-- ============================================================

CREATE TABLE IF NOT EXISTS platform_service_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    service_key VARCHAR(120) NOT NULL,
    provider VARCHAR(80) NOT NULL,
    service_name VARCHAR(160) NOT NULL,

    category VARCHAR(60) NOT NULL
        CHECK (
            category IN (
                'hosting',
                'database',
                'storage',
                'domain',
                'ai',
                'email',
                'sms',
                'billing',
                'monitoring',
                'other'
            )
        ),

    source VARCHAR(24) NOT NULL DEFAULT 'manual'
        CHECK (
            source IN (
                'manual',
                'provider_api',
                'environment',
                'hybrid'
            )
        ),

    status VARCHAR(32) NOT NULL DEFAULT 'unknown'
        CHECK (
            status IN (
                'active',
                'trial',
                'renewal_due',
                'payment_required',
                'quota_warning',
                'upgrade_recommended',
                'suspended',
                'expired',
                'cancelled',
                'not_configured',
                'unknown'
            )
        ),

    plan_name VARCHAR(160),

    billing_cycle VARCHAR(32)
        CHECK (
            billing_cycle IS NULL
            OR billing_cycle IN (
                'monthly',
                'annual',
                'usage',
                'prepaid',
                'free',
                'custom'
            )
        ),

    amount NUMERIC(18, 4),
    currency CHAR(3),

    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ,

    renewal_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,

    auto_renew BOOLEAN NOT NULL DEFAULT FALSE,

    quota_used NUMERIC(30, 8),
    quota_limit NUMERIC(30, 8),
    quota_unit VARCHAR(80),
    warning_threshold_percent NUMERIC(5, 2) NOT NULL DEFAULT 80
        CHECK (
            warning_threshold_percent >= 1
            AND warning_threshold_percent <= 100
        ),

    management_url TEXT,

    sync_adapter VARCHAR(80),

    sync_status VARCHAR(24) NOT NULL DEFAULT 'never'
        CHECK (
            sync_status IN (
                'never',
                'ok',
                'degraded',
                'failed',
                'not_supported'
            )
        ),

    last_synced_at TIMESTAMPTZ,
    last_sync_error TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    deleted_at TIMESTAMPTZ,

    CONSTRAINT platform_service_subscriptions_service_key_unique
        UNIQUE (service_key)
);

CREATE INDEX IF NOT EXISTS idx_platform_service_subscriptions_status
    ON platform_service_subscriptions(status, updated_at DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_platform_service_subscriptions_renewal
    ON platform_service_subscriptions(renewal_at)
    WHERE deleted_at IS NULL
      AND renewal_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_service_subscriptions_expiry
    ON platform_service_subscriptions(expires_at)
    WHERE deleted_at IS NULL
      AND expires_at IS NOT NULL;


CREATE TABLE IF NOT EXISTS platform_service_usage_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    subscription_id UUID NOT NULL
        REFERENCES platform_service_subscriptions(id)
        ON DELETE CASCADE,

    metric_key VARCHAR(120) NOT NULL,
    metric_name VARCHAR(160) NOT NULL,

    used_value NUMERIC(30, 8),
    limit_value NUMERIC(30, 8),
    unit VARCHAR(80),

    cost_amount NUMERIC(18, 4),
    cost_currency CHAR(3),

    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,

    source VARCHAR(40),

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_service_usage_subscription
    ON platform_service_usage_snapshots(subscription_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_service_usage_metric
    ON platform_service_usage_snapshots(metric_key, captured_at DESC);


CREATE TABLE IF NOT EXISTS platform_service_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    subscription_id UUID NOT NULL
        REFERENCES platform_service_subscriptions(id)
        ON DELETE CASCADE,

    event_type VARCHAR(80) NOT NULL,

    severity VARCHAR(16) NOT NULL DEFAULT 'warning'
        CHECK (
            severity IN (
                'info',
                'warning',
                'error',
                'critical'
            )
        ),

    title VARCHAR(255) NOT NULL,
    message TEXT,

    effective_at TIMESTAMPTZ,

    incident_id UUID
        REFERENCES platform_incidents(id)
        ON DELETE SET NULL,

    acknowledged_at TIMESTAMPTZ,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_service_events_subscription
    ON platform_service_events(subscription_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_service_events_effective
    ON platform_service_events(effective_at)
    WHERE effective_at IS NOT NULL;


-- Seed the canonical services SaMi currently depends on.
-- These rows contain no credentials. They are safe to upsert and
-- can be enriched later from provider APIs or Platform Admin.

INSERT INTO platform_service_subscriptions (
    service_key,
    provider,
    service_name,
    category,
    source,
    status,
    billing_cycle,
    management_url,
    sync_adapter,
    metadata,
    created_at,
    updated_at
)
VALUES
    (
        'vercel',
        'vercel',
        'Vercel Hosting & Runtime',
        'hosting',
        'hybrid',
        'unknown',
        'usage',
        'https://vercel.com/dashboard',
        'vercel',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'neon',
        'neon',
        'Neon PostgreSQL',
        'database',
        'hybrid',
        'unknown',
        'usage',
        'https://console.neon.tech',
        'neon',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'cloudflare-r2',
        'cloudflare',
        'Cloudflare R2 Storage',
        'storage',
        'hybrid',
        'unknown',
        'usage',
        'https://dash.cloudflare.com',
        'cloudflare_r2',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'domain-primary',
        'registrar',
        'Primary SaMi Domain',
        'domain',
        'manual',
        'unknown',
        'annual',
        NULL,
        'manual',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'ai-primary',
        'ai',
        'Primary SaMi AI Provider',
        'ai',
        'hybrid',
        'unknown',
        'usage',
        NULL,
        'ai',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'email-primary',
        'smtp',
        'Transactional Email',
        'email',
        'environment',
        'unknown',
        'custom',
        NULL,
        'email',
        '{"required_for_platform": true}'::jsonb,
        NOW(),
        NOW()
    ),
    (
        'sms-primary',
        'sms',
        'Transactional SMS',
        'sms',
        'environment',
        'unknown',
        'usage',
        NULL,
        'sms',
        '{"required_for_platform": false}'::jsonb,
        NOW(),
        NOW()
    )
ON CONFLICT (service_key)
DO NOTHING;
