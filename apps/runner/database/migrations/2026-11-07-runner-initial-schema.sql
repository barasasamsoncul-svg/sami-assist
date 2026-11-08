-- SaMi Runner database foundation.
-- Target Neon project: SaMi Runner
-- Target branch: main
-- Target database: sami_runner
--
-- No Customer database tables are referenced by foreign keys.
-- customer_errand_ref is an opaque integration identifier only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.runner_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_e164 text NOT NULL UNIQUE,
  email text,
  full_name text,
  account_status text NOT NULL DEFAULT 'profile_incomplete'
    CHECK (account_status IN (
      'profile_incomplete', 'pending_verification', 'active', 'suspended', 'closed'
    )),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'submitted', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT runner_phone_e164_format
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{7,14}$')
);

CREATE TABLE IF NOT EXISTS public.runner_profiles (
  runner_id uuid PRIMARY KEY REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  service_area text,
  vehicle_type text
    CHECK (vehicle_type IS NULL OR vehicle_type IN ('motorcycle', 'bicycle', 'car', 'van', 'other')),
  vehicle_registration text,
  avatar_storage_key text,
  bio text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.runner_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  token_hash char(64) NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS runner_sessions_runner_expiry_idx
  ON public.runner_sessions(runner_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.runner_otp_rate_limits (
  phone_e164 text PRIMARY KEY,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  last_requested_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.runner_availability (
  runner_id uuid PRIMARY KEY REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  is_online boolean NOT NULL DEFAULT false,
  last_heartbeat_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_availability_online_idx
  ON public.runner_availability(is_online, last_heartbeat_at DESC)
  WHERE is_online = true;

CREATE TABLE IF NOT EXISTS public.runner_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Opaque Customer-system reference. It is not a Customer FK.
  customer_errand_ref text NOT NULL UNIQUE,
  public_code text NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  description text NOT NULL,
  pickup_label text NOT NULL,
  pickup_latitude double precision,
  pickup_longitude double precision,
  destination_label text NOT NULL,
  destination_latitude double precision,
  destination_longitude double precision,
  distance_km numeric(10, 3),
  runner_payout_amount numeric(12, 2),
  currency char(3) NOT NULL DEFAULT 'KES',
  status text NOT NULL DEFAULT 'offered'
    CHECK (status IN (
      'offered', 'accepted', 'in_progress',
      'completion_submitted', 'completed', 'cancelled'
    )),
  accepted_runner_id uuid REFERENCES public.runner_accounts(id) ON DELETE SET NULL,
  offered_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  started_at timestamptz,
  completion_submitted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  source_projection jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (pickup_latitude IS NULL OR pickup_latitude BETWEEN -90 AND 90),
  CHECK (pickup_longitude IS NULL OR pickup_longitude BETWEEN -180 AND 180),
  CHECK (destination_latitude IS NULL OR destination_latitude BETWEEN -90 AND 90),
  CHECK (destination_longitude IS NULL OR destination_longitude BETWEEN -180 AND 180)
);

CREATE INDEX IF NOT EXISTS runner_jobs_assigned_status_idx
  ON public.runner_jobs(accepted_runner_id, status, accepted_at DESC);

CREATE INDEX IF NOT EXISTS runner_jobs_status_offered_idx
  ON public.runner_jobs(status, offered_at DESC)
  WHERE status = 'offered';

CREATE TABLE IF NOT EXISTS public.runner_job_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.runner_jobs(id) ON DELETE CASCADE,
  runner_id uuid NOT NULL REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  offer_status text NOT NULL DEFAULT 'offered'
    CHECK (offer_status IN ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  responded_at timestamptz,
  UNIQUE (job_id, runner_id)
);

CREATE INDEX IF NOT EXISTS runner_job_offers_runner_status_idx
  ON public.runner_job_offers(runner_id, offer_status, expires_at);

CREATE TABLE IF NOT EXISTS public.runner_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.runner_jobs(id) ON DELETE CASCADE,
  runner_id uuid REFERENCES public.runner_accounts(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  from_status text,
  to_status text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_job_events_timeline_idx
  ON public.runner_job_events(job_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.runner_live_locations (
  runner_id uuid PRIMARY KEY REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES public.runner_jobs(id) ON DELETE CASCADE,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision,
  heading_degrees double precision,
  speed_meters_per_second double precision,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_live_locations_job_idx
  ON public.runner_live_locations(job_id, captured_at DESC);

CREATE TABLE IF NOT EXISTS public.runner_verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  document_type text NOT NULL
    CHECK (document_type IN (
      'national_id_front', 'national_id_back', 'driving_licence',
      'vehicle_registration', 'profile_photo', 'other'
    )),
  storage_key text NOT NULL,
  review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by text
);

CREATE INDEX IF NOT EXISTS runner_verification_documents_runner_idx
  ON public.runner_verification_documents(runner_id, review_status);

CREATE TABLE IF NOT EXISTS public.runner_integration_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  processing_error text
);

CREATE TABLE IF NOT EXISTS public.runner_integration_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  customer_errand_ref text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text
);

CREATE INDEX IF NOT EXISTS runner_integration_outbox_pending_idx
  ON public.runner_integration_outbox(available_at, created_at)
  WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS public.runner_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  push_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-07-runner-initial-schema')
ON CONFLICT (version) DO NOTHING;

COMMIT;