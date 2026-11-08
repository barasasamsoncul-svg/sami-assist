-- SaMi native mobile persistent sessions.
-- Website sessions remain time-limited.
-- OTP challenge expiry remains unchanged.

ALTER TABLE public.user_sessions
  ADD COLUMN IF NOT EXISTS client_type text NOT NULL DEFAULT 'web';

ALTER TABLE public.user_sessions
  ALTER COLUMN expires_at DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'user_sessions_client_type_check'
      AND conrelid = 'public.user_sessions'::regclass
  ) THEN
    ALTER TABLE public.user_sessions
      ADD CONSTRAINT user_sessions_client_type_check
      CHECK (client_type IN ('web', 'mobile'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS user_sessions_user_client_idx
  ON public.user_sessions(user_id, client_type, expires_at);

GRANT SELECT, INSERT, DELETE
  ON TABLE public.user_sessions
  TO sami_errands_app;

GRANT UPDATE (client_type, expires_at, last_seen_at)
  ON TABLE public.user_sessions
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-04-sami-mobile-persistent-sessions')
ON CONFLICT (version) DO NOTHING;