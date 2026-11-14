
-- ============================================================================
-- SaMi Runner: Customer recognition and separate Runner registration
-- Database: RUNNER_DATABASE_URL ONLY
--
-- These tables support temporary registration verification.
-- They do not modify or reference Customer records.
-- Customer data is read-only and remains in the Customer database.
-- ============================================================================

-- ============================================================================
-- 1. PHONE VERIFICATION FOR CUSTOMER MATCHES
-- ============================================================================
-- Used when:
--   - The Runner applicant has verified their email.
--   - No Customer account matches that email.
--   - A Customer account matches the submitted phone number.
--
-- The Customer name is kept server-side until SMS verification succeeds.
-- The actual SMS OTP is managed by the configured OTP provider.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.runner_registration_phone_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email_challenge_id UUID NOT NULL UNIQUE,

    email TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    full_name TEXT NOT NULL,

    matched_customer_name TEXT NOT NULL,

    attempts SMALLINT NOT NULL DEFAULT 0
        CHECK (attempts >= 0 AND attempts <= 5),

    expires_at TIMESTAMPTZ NOT NULL,

    consumed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT runner_registration_phone_email_check
        CHECK (
            email = LOWER(BTRIM(email))
            AND LENGTH(email) BETWEEN 3 AND 254
        ),

    CONSTRAINT runner_registration_phone_number_check
        CHECK (phone_e164 ~ '^\+254[17][0-9]{8}$'),

    CONSTRAINT runner_registration_phone_name_check
        CHECK (
            LENGTH(BTRIM(full_name)) >= 2
            AND LENGTH(BTRIM(matched_customer_name)) >= 1
        )
);

CREATE INDEX IF NOT EXISTS
    runner_registration_phone_challenges_expiry_idx
ON public.runner_registration_phone_challenges (expires_at)
WHERE consumed_at IS NULL;


-- ============================================================================
-- 2. EXPLICIT REGISTRATION CONFIRMATION
-- ============================================================================
-- Created only after the matching Customer contact has been verified.
--
-- The confirmation token is stored as a SHA-256 hash, not in plaintext.
-- A token is one-use and expires after 15 minutes.
--
-- The Runner account must not be created until this confirmation is accepted.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.runner_registration_confirmations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    token_hash TEXT NOT NULL UNIQUE,

    email TEXT NOT NULL,
    phone_e164 TEXT NOT NULL,
    full_name TEXT NOT NULL,

    matched_customer_name TEXT NOT NULL,

    matched_by TEXT NOT NULL
        CHECK (matched_by IN ('email', 'phone')),

    expires_at TIMESTAMPTZ NOT NULL
        DEFAULT (NOW() + INTERVAL '15 minutes'),

    consumed_at TIMESTAMPTZ,

    cancelled_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT runner_registration_confirmation_token_check
        CHECK (token_hash ~ '^[0-9a-f]{64}$'),

    CONSTRAINT runner_registration_confirmation_email_check
        CHECK (
            email = LOWER(BTRIM(email))
            AND LENGTH(email) BETWEEN 3 AND 254
        ),

    CONSTRAINT runner_registration_confirmation_phone_check
        CHECK (phone_e164 ~ '^\+254[17][0-9]{8}$'),

    CONSTRAINT runner_registration_confirmation_name_check
        CHECK (
            LENGTH(BTRIM(full_name)) >= 2
            AND LENGTH(BTRIM(matched_customer_name)) >= 1
        ),

    CONSTRAINT runner_registration_confirmation_terminal_state
        CHECK (
            NOT (
                consumed_at IS NOT NULL
                AND cancelled_at IS NOT NULL
            )
        )
);

CREATE INDEX IF NOT EXISTS
    runner_registration_confirmations_expiry_idx
ON public.runner_registration_confirmations (expires_at)
WHERE consumed_at IS NULL
  AND cancelled_at IS NULL;


-- ============================================================================
-- 3. MIGRATION COMPLETE
-- ============================================================================
-- Apply this migration only to the SaMi Runner database.
-- Do not apply it to the Customer database.
-- ============================================================================
