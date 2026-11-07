
-- SaMi Runner: email-based OTP authentication.
-- Apply ONLY to the SaMi Runner Neon project:
-- Branch: main
-- Database: sami_runner
--
-- Existing phone-based accounts are preserved.
-- New email-authenticated accounts may have a NULL phone number.
-- No Customer database tables are modified.

BEGIN;

-- Allow email-only Runner accounts while retaining phone-based accounts.
ALTER TABLE public.runner_accounts
  ALTER COLUMN phone_e164 DROP NOT NULL;

-- Track when a Runner email was verified.
ALTER TABLE public.runner_accounts
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;

-- Enforce case-insensitive email uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS runner_accounts_email_lower_unique_idx
  ON public.runner_accounts (lower(email))
  WHERE email IS NOT NULL;

-- Every Runner account must have at least one contact identity.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.runner_accounts'::regclass
      AND conname = 'runner_accounts_contact_required'
  ) THEN
    ALTER TABLE public.runner_accounts
      ADD CONSTRAINT runner_accounts_contact_required
      CHECK (
        phone_e164 IS NOT NULL
        OR NULLIF(btrim(email), '') IS NOT NULL
      )
      NOT VALID;
  END IF;
END
$$;

ALTER TABLE public.runner_accounts
  VALIDATE CONSTRAINT runner_accounts_contact_required;

-- Email OTP challenges are independent of Customer authentication.
-- The actual OTP is derived using AUTH_EMAIL_OTP_PEPPER and is not stored.
CREATE TABLE IF NOT EXISTS public.runner_email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL DEFAULT 'login'
    CHECK (purpose = 'login'),
  attempts integer NOT NULL DEFAULT 0
    CHECK (attempts BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS runner_email_otp_challenges_email_idx
  ON public.runner_email_otp_challenges(email, created_at DESC);

CREATE INDEX IF NOT EXISTS runner_email_otp_challenges_expiry_idx
  ON public.runner_email_otp_challenges(expires_at)
  WHERE consumed_at IS NULL;

-- Runner email OTP rate limits:
-- Maximum five requests per hour and one request per 60 seconds.
CREATE TABLE IF NOT EXISTS public.runner_email_otp_rate_limits (
  email text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0
    CHECK (request_count BETWEEN 0 AND 5),
  last_requested_at timestamptz NOT NULL
);

-- Record the independent Runner database migration.
INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-07-runner-email-auth')
ON CONFLICT (version) DO NOTHING;

COMMIT;
