-- ============================================================
-- SaMi Control DB Migration
-- Category 22: Subscription billing provider profiles
-- ============================================================

-- Scheduled plan changes remain on the SaMi subscription.
-- Provider subscriptions are synchronized separately and never
-- become the authority for plan entitlement.
ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS scheduled_plan_id UUID
        REFERENCES plans(id);

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS scheduled_plan_effective_at TIMESTAMPTZ;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS scheduled_plan_requested_by UUID;

ALTER TABLE subscriptions
    ADD COLUMN IF NOT EXISTS scheduled_plan_requested_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_subscriptions_scheduled_plan
    ON subscriptions(scheduled_plan_effective_at)
    WHERE scheduled_plan_id IS NOT NULL;


--
-- This table pins an existing payment mandate/subscription to
-- the provider that created it. Changing SAMI_BILLING_PROVIDER
-- affects new billing setup only; it never rewrites old mandates.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_billing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    tenant_id UUID NOT NULL
        REFERENCES tenants(id)
        ON DELETE CASCADE,

    subscription_id UUID NOT NULL
        REFERENCES subscriptions(id)
        ON DELETE CASCADE,

    provider VARCHAR(30) NOT NULL
        CHECK (
            provider IN (
                'stripe',
                'paystack',
                'pesapal'
            )
        ),

    provider_customer_id VARCHAR(255),
    provider_subscription_id VARCHAR(255),
    provider_payment_method_id VARCHAR(255),

    recurring_status VARCHAR(40) NOT NULL DEFAULT 'setup_required'
        CHECK (
            recurring_status IN (
                'setup_required',
                'setup_pending',
                'trialing',
                'active',
                'past_due',
                'cancelled',
                'manual'
            )
        ),

    currency VARCHAR(10) NOT NULL DEFAULT 'KES',

    price_per_user_monthly NUMERIC(14,2),
    seat_quantity INTEGER
        CHECK (
            seat_quantity IS NULL
            OR seat_quantity >= 1
        ),

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_billing_profiles_one_active
    ON subscription_billing_profiles(subscription_id)
    WHERE is_active = TRUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_billing_profiles_provider_subscription
    ON subscription_billing_profiles(provider, provider_subscription_id)
    WHERE provider_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_billing_profiles_tenant
    ON subscription_billing_profiles(tenant_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscription_billing_profiles_provider_customer
    ON subscription_billing_profiles(provider, provider_customer_id)
    WHERE provider_customer_id IS NOT NULL;
