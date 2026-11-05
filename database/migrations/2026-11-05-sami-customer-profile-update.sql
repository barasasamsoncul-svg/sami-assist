-- Allow the SaMi application role to update only customer profile names.
-- Contact details and account security fields remain protected.

GRANT UPDATE (full_name, updated_at)
ON TABLE public.users
TO sami_errands_app;

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-05-sami-customer-profile-update')
ON CONFLICT (version) DO NOTHING;