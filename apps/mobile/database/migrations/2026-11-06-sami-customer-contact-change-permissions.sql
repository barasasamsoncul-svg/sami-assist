
-- SaMi customer contact changes.
-- Only the verified contact fields and their verification timestamps
-- may be updated by the application role.

GRANT UPDATE (
  email,
  phone,
  email_verified_at,
  phone_verified_at,
  updated_at
)
ON TABLE public.users
TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-06-sami-customer-contact-change-permissions')
ON CONFLICT (version) DO NOTHING;
