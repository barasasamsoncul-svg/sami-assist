
-- SaMi Admin: OTP-based password recovery.
-- No password-reset links or bearer reset tokens are used.

BEGIN;

-- Retire the previous reset-link schema, if it was created.
DROP TABLE IF EXISTS public.admin_password_reset_tokens;
DROP TABLE IF EXISTS public.admin_password_reset_requests;


CREATE TABLE IF NOT EXISTS public.admin_password_reset_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_user_id uuid NOT NULL
    REFERENCES public.users(id)
    ON DELETE CASCADE,

  email text NOT NULL,

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'consumed',
        'failed',
        'expired',
        'superseded'
      )
    ),

  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count BETWEEN 0 AND 5),

  created_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz NOT NULL,

  verified_at timestamptz,

  consumed_at timestamptz,

  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS admin_password_reset_otp_user_idx
  ON public.admin_password_reset_otp_challenges (
    admin_user_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS admin_password_reset_otp_pending_idx
  ON public.admin_password_reset_otp_challenges (
    admin_user_id,
    expires_at
  )
  WHERE status = 'pending';


-- Request history supports rate limiting without revealing
-- whether an email address belongs to an Admin account.

CREATE TABLE IF NOT EXISTS public.admin_password_reset_otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  email_hash text NOT NULL
    CHECK (email_hash ~ '^[0-9a-f]{64}$'),

  requested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_password_reset_otp_requests_idx
  ON public.admin_password_reset_otp_requests (
    email_hash,
    requested_at DESC
  );


GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.admin_password_reset_otp_challenges
  TO sami_errands_app;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.admin_password_reset_otp_requests
  TO sami_errands_app;


INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-08-admin-password-recovery-otp')
ON CONFLICT (version) DO NOTHING;

COMMIT;
