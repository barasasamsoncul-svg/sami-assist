
BEGIN;

-- Remove the obsolete password-reset-link implementation.
DROP TABLE IF EXISTS public.admin_password_reset_tokens CASCADE;
DROP TABLE IF EXISTS public.admin_password_reset_requests CASCADE;

-- Each challenge represents one Admin password-recovery OTP.
CREATE TABLE IF NOT EXISTS public.admin_password_reset_otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    admin_user_id UUID NOT NULL
        REFERENCES public.users(id)
        ON DELETE CASCADE,

    email TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'consumed',
                'failed',
                'expired',
                'superseded'
            )
        ),

    attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count BETWEEN 0 AND 5),

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    expires_at TIMESTAMPTZ NOT NULL,

    verified_at TIMESTAMPTZ,

    consumed_at TIMESTAMPTZ,

    CONSTRAINT admin_password_reset_otp_expiry_check
        CHECK (expires_at > created_at)
);

-- Efficiently retrieve an Admin's latest recovery challenges.
CREATE INDEX IF NOT EXISTS
    idx_admin_password_reset_otp_admin_created
ON public.admin_password_reset_otp_challenges (
    admin_user_id,
    created_at DESC
);

-- Efficiently locate outstanding challenges.
CREATE INDEX IF NOT EXISTS
    idx_admin_password_reset_otp_pending_expiry
ON public.admin_password_reset_otp_challenges (
    admin_user_id,
    expires_at
)
WHERE status = 'pending';

-- Rate-limit recovery requests without storing raw email addresses.
CREATE TABLE IF NOT EXISTS public.admin_password_reset_otp_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    email_hash TEXT NOT NULL
        CHECK (email_hash ~ '^[a-f0-9]{64}$'),

    requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS
    idx_admin_password_reset_otp_requests_email_time
ON public.admin_password_reset_otp_requests (
    email_hash,
    requested_at DESC
);

-- Allow the application database role to operate the recovery tables.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.admin_password_reset_otp_challenges
TO sami_errands_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.admin_password_reset_otp_requests
TO sami_errands_app;

-- Record this migration.
INSERT INTO public.schema_migrations (version)
VALUES ('2026-11-08-admin-password-recovery-otp')
ON CONFLICT (version) DO NOTHING;

COMMIT;
