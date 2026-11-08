
-- SaMi Admin: isolated administrator browser sessions.
-- Uses the existing shared SaMi database, but does not
-- store Admin sessions in the Website/Customer session table.
--
-- Admin session tokens are stored only as SHA-256 hashes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  admin_user_id uuid NOT NULL
    REFERENCES public.users(id)
    ON DELETE CASCADE,

  token_hash text NOT NULL UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),

  last_seen_at timestamptz NOT NULL DEFAULT now(),

  expires_at timestamptz NOT NULL,

  revoked_at timestamptz,

  CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS admin_sessions_user_expiry_idx
  ON public.admin_sessions(admin_user_id, expires_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx
  ON public.admin_sessions(expires_at)
  WHERE revoked_at IS NULL;

-- Application database role permissions.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.admin_sessions
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-08-admin-isolated-auth-sessions')
ON CONFLICT (version) DO NOTHING;

COMMIT;
