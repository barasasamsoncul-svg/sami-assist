
-- SaMi Runner: globally unique vehicle registration.
--
-- A motor vehicle or motorcycle registration may belong
-- to only one Runner account at a time.
--
-- Registration comparison ignores:
--   - Letter case
--   - Spaces
--   - Hyphens
--   - Other non-alphanumeric separators
--
-- Examples treated as the same registration:
--   KDA 123A
--   KDA123A
--   KDA-123A
--
-- Existing duplicates are reported and are NOT automatically
-- deleted or reassigned. Resolve any reported duplicates
-- before applying this migration.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. VERIFY THE RUNNER PROFILE TABLE
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.runner_profiles') IS NULL THEN
    RAISE EXCEPTION
      'Cannot apply vehicle-registration uniqueness migration: public.runner_profiles does not exist.';
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 2. CHECK EXISTING VEHICLE REGISTRATION DUPLICATES
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  duplicate_plates text;
BEGIN
  SELECT string_agg(
    format(
      '%s (Runner accounts: %s)',
      duplicate.normalized_plate,
      duplicate.runner_ids
    ),
    E'\n'
  )
  INTO duplicate_plates
  FROM (
    SELECT
      regexp_replace(
        upper(btrim(vehicle_registration)),
        '[^A-Z0-9]',
        '',
        'g'
      ) AS normalized_plate,

      string_agg(
        runner_id::text,
        ', '
        ORDER BY runner_id::text
      ) AS runner_ids

    FROM public.runner_profiles

    WHERE vehicle_registration IS NOT NULL
      AND regexp_replace(
        upper(btrim(vehicle_registration)),
        '[^A-Z0-9]',
        '',
        'g'
      ) <> ''

    GROUP BY
      regexp_replace(
        upper(btrim(vehicle_registration)),
        '[^A-Z0-9]',
        '',
        'g'
      )

    HAVING COUNT(*) > 1
  ) AS duplicate;

  IF duplicate_plates IS NOT NULL THEN
    RAISE EXCEPTION
      'Cannot create the unique Runner vehicle-registration index. Existing duplicate registrations must be reviewed and resolved first:%',
      E'\n' || duplicate_plates;
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. CREATE GLOBAL NORMALIZED REGISTRATION UNIQUENESS
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS
  runner_profiles_vehicle_registration_normalized_uidx

ON public.runner_profiles (
  (
    regexp_replace(
      upper(btrim(vehicle_registration)),
      '[^A-Z0-9]',
      '',
      'g'
    )
  )
)

WHERE vehicle_registration IS NOT NULL
  AND regexp_replace(
    upper(btrim(vehicle_registration)),
    '[^A-Z0-9]',
    '',
    'g'
  ) <> '';


-- ---------------------------------------------------------------------------
-- 4. RECORD MIGRATION
-- ---------------------------------------------------------------------------

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-15-runner-unique-vehicle-registration')
ON CONFLICT (version) DO NOTHING;

COMMIT;
