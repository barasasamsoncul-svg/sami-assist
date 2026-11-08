-- SaMi customer contact verification.
-- Stores OTP challenge metadata only. Verification codes are not stored.

CREATE TABLE IF NOT EXISTS public.customer_contact_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  user_id uuid NOT NULL
    REFERENCES public.users(id) ON DELETE CASCADE,

  contact_type text NOT NULL
    CHECK (contact_type IN ('email', 'phone')),

  channel text NOT NULL
    CHECK (channel IN ('email', 'sms')),

  destination text NOT NULL
    CHECK (length(trim(destination)) BETWEEN 3 AND 320),

  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',
      'consumed',
      'failed',
      'expired',
      'superseded'
    )),

  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),

  created_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz NOT NULL
    DEFAULT now() + interval '10 minutes',

  verified_at timestamptz,

  CHECK (expires_at > created_at),

  CHECK (
    (contact_type = 'email' AND channel = 'email')
    OR
    (contact_type = 'phone' AND channel = 'sms')
  )
);

-- Only one pending verification per user and contact type.
CREATE UNIQUE INDEX IF NOT EXISTS customer_contact_verification_pending_idx
  ON public.customer_contact_verifications(user_id, contact_type)
  WHERE status = 'pending';

-- Supports request throttling and challenge history.
CREATE INDEX IF NOT EXISTS customer_contact_verification_recent_idx
  ON public.customer_contact_verifications(user_id, contact_type, created_at DESC);

CREATE INDEX IF NOT EXISTS customer_contact_verification_expiry_idx
  ON public.customer_contact_verifications(expires_at)
  WHERE status = 'pending';

-- Least-privilege application access.
GRANT SELECT, INSERT, UPDATE
  ON TABLE public.customer_contact_verifications
  TO sami_errands_app;

-- The verification API may update verification timestamps only.
GRANT UPDATE (email_verified_at, phone_verified_at)
  ON TABLE public.users
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-05-sami-customer-contact-verification')
ON CONFLICT (version) DO NOTHING;