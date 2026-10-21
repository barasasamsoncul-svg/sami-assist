-- ============================================================
-- SaMi Control DB Migration
-- Category 22: IntaSend recurring platform subscriptions
-- ============================================================

-- Keep existing billing provider profiles intact while allowing new
-- IntaSend subscription profiles. The provider is still pinned per profile.
ALTER TABLE subscription_billing_profiles
    DROP CONSTRAINT IF EXISTS subscription_billing_profiles_provider_check;

ALTER TABLE subscription_billing_profiles
    ADD CONSTRAINT subscription_billing_profiles_provider_check
    CHECK (
        provider IN (
            'intasend',
            'stripe',
            'paystack',
            'pesapal'
        )
    );
