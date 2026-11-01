-- SaMi passwordless customer authentication.
-- Twilio Verify stores and checks OTPs; this database stores challenge metadata only.
ALTER TABLE public.users
  ALTER COLUMN password_hash DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

CREATE TABLE IF NOT EXISTS public.auth_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL CHECK (purpose IN ('register', 'login')),
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
  destination text NOT NULL CHECK (length(trim(destination)) BETWEEN 3 AND 320),
  email text NOT NULL CHECK (length(trim(email)) BETWEEN 3 AND 254),
  phone text,
  full_name text,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  provider_sid text UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'failed', 'expired', 'superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  verified_at timestamptz,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK (
    (purpose = 'register' AND full_name IS NOT NULL AND user_id IS NULL)
    OR
    (purpose = 'login' AND user_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS auth_otp_email_purpose_created_idx
  ON public.auth_otp_challenges (lower(email), purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_otp_destination_purpose_created_idx
  ON public.auth_otp_challenges (destination, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS auth_otp_pending_expiry_idx
  ON public.auth_otp_challenges (expires_at)
  WHERE status = 'pending';

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-01-sami-passwordless-otp-auth')
ON CONFLICT (version) DO NOTHING;
