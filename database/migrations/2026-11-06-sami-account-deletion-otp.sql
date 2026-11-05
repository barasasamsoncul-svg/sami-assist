
-- SaMi passwordless account deletion verification.
-- Adds account deletion as a dedicated email OTP purpose.

DO $$
DECLARE
  constraint_item record;
BEGIN
  FOR constraint_item IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.auth_otp_challenges'::regclass
      AND contype = 'c'
      AND (
        pg_get_constraintdef(oid) ILIKE '%purpose%'
        OR pg_get_constraintdef(oid) ILIKE '%full_name%'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.auth_otp_challenges DROP CONSTRAINT %I',
      constraint_item.conname
    );
  END LOOP;
END
$$;

ALTER TABLE public.auth_otp_challenges
  ADD CONSTRAINT auth_otp_challenges_purpose_check
  CHECK (purpose IN ('register', 'login', 'delete_account'));

ALTER TABLE public.auth_otp_challenges
  ADD CONSTRAINT auth_otp_challenges_context_check
  CHECK (
    (purpose = 'register' AND full_name IS NOT NULL)
    OR
    (purpose IN ('login', 'delete_account') AND user_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS auth_otp_deletion_user_created_idx
  ON public.auth_otp_challenges(user_id, created_at DESC)
  WHERE purpose = 'delete_account';

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-06-sami-account-deletion-otp')
ON CONFLICT (version) DO NOTHING;
