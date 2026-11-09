
BEGIN;

-- SaMi Runner: IP-based email OTP request throttling.
-- Apply ONLY to the SaMi Runner database.
--
-- IP addresses are stored as keyed SHA-256 HMAC hashes,
-- never as plaintext addresses.
--
-- Limits:
--   Maximum 60 requests per 10 minutes per IP.
--   Maximum 300 requests per hour per IP.
--
-- These limits operate alongside the existing
-- per-email limit of five requests per hour.

CREATE TABLE IF NOT EXISTS public.runner_email_otp_ip_rate_limits (
  ip_hash text PRIMARY KEY
    CHECK (ip_hash ~ '^[0-9a-f]{64}$'),

  window_started_at timestamptz NOT NULL,

  request_count integer NOT NULL DEFAULT 0
    CHECK (request_count BETWEEN 0 AND 300),

  burst_window_started_at timestamptz NOT NULL,

  burst_request_count integer NOT NULL DEFAULT 0
    CHECK (burst_request_count BETWEEN 0 AND 60),

  last_requested_at timestamptz NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_email_otp_ip_rate_limits_last_requested_idx
  ON public.runner_email_otp_ip_rate_limits(last_requested_at);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-09-runner-email-otp-ip-rate-limits')
ON CONFLICT (version) DO NOTHING;

COMMIT;
