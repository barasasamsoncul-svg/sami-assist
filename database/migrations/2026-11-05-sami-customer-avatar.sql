-- Persistent customer avatar storage in Cloudflare R2.
-- Only the object key is stored in PostgreSQL, never the image bytes.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_key text;

GRANT UPDATE (avatar_key, updated_at)
  ON TABLE public.users
  TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-05-sami-customer-avatar')
ON CONFLICT (version) DO NOTHING;