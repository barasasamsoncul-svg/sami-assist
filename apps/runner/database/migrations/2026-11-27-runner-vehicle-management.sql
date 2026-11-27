-- ============================================================================
-- SaMi Runner: Vehicle Management and Replacement Workflow
--
-- Creates:
--   1. Saved Runner vehicles with one active vehicle per Runner.
--   2. Vehicle replacement requests.
--   3. Links between replacement requests and verification documents.
--   4. Separate Admin review history for vehicle changes.
--
-- Existing approved vehicles are migrated into runner_vehicles.
-- A replacement submission does not modify Runner availability.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. IDENTIFY THE PURPOSE OF EACH VERIFICATION DOCUMENT
-- ============================================================================

ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS document_purpose text
    NOT NULL DEFAULT 'onboarding';

ALTER TABLE public.runner_verification_documents
  ALTER COLUMN document_purpose SET DEFAULT 'onboarding';

UPDATE public.runner_verification_documents
SET document_purpose = 'onboarding'
WHERE document_purpose IS NULL;

ALTER TABLE public.runner_verification_documents
  ALTER COLUMN document_purpose SET NOT NULL;

ALTER TABLE public.runner_verification_documents
  DROP CONSTRAINT IF EXISTS runner_verification_documents_purpose_check;

ALTER TABLE public.runner_verification_documents
  ADD CONSTRAINT runner_verification_documents_purpose_check
  CHECK (
    document_purpose IN ('onboarding', 'vehicle_update')
  );


-- ============================================================================
-- 2. SAVED VEHICLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.runner_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  runner_id uuid NOT NULL
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,

  vehicle_type text NOT NULL
    CHECK (
      vehicle_type IN (
        'bicycle',
        'motorcycle',
        'car',
        'van',
        'other'
      )
    ),

  vehicle_model text,
  vehicle_registration text,

  status text NOT NULL DEFAULT 'pending_review'
    CHECK (
      status IN (
        'pending_review',
        'changes_required',
        'approved',
        'inactive',
        'rejected'
      )
    ),

  is_active boolean NOT NULL DEFAULT false,

  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT runner_vehicles_active_must_be_approved
    CHECK (
      NOT is_active OR status = 'approved'
    ),

  CONSTRAINT runner_vehicles_motorised_details_check
    CHECK (
      vehicle_type = 'bicycle'
      OR (
        char_length(btrim(COALESCE(vehicle_model, ''))) >= 2
        AND
        char_length(btrim(COALESCE(vehicle_registration, ''))) >= 3
      )
    )
);


-- A Runner can have only one active vehicle.
CREATE UNIQUE INDEX IF NOT EXISTS
  runner_vehicles_one_active_per_runner_uidx
ON public.runner_vehicles(runner_id)
WHERE is_active = true;


-- A registration may belong to only one currently approved or
-- pending vehicle record. Inactive historical records do not block
-- a vehicle that has legitimately changed ownership.
CREATE UNIQUE INDEX IF NOT EXISTS
  runner_vehicles_current_registration_uidx
ON public.runner_vehicles (
  regexp_replace(
    upper(btrim(vehicle_registration)),
    '[^A-Z0-9]',
    '',
    'g'
  )
)
WHERE vehicle_registration IS NOT NULL
  AND status IN ('pending_review', 'approved');


CREATE INDEX IF NOT EXISTS
  runner_vehicles_runner_history_idx
ON public.runner_vehicles(
  runner_id,
  created_at DESC
);


-- ============================================================================
-- 3. VEHICLE REPLACEMENT REQUESTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.runner_vehicle_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  runner_id uuid NOT NULL
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,

  vehicle_id uuid
    REFERENCES public.runner_vehicles(id) ON DELETE RESTRICT,

  vehicle_type text NOT NULL
    CHECK (
      vehicle_type IN (
        'bicycle',
        'motorcycle',
        'car',
        'van',
        'other'
      )
    ),

  vehicle_model text,
  vehicle_registration text,

  status text NOT NULL DEFAULT 'pending_review'
    CHECK (
      status IN (
        'pending_review',
        'changes_required',
        'approved',
        'rejected',
        'cancelled'
      )
    ),

  review_reason text,
  reviewed_by text,
  reviewed_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- Support installations where an earlier draft of the request table
-- was created without the vehicle_id relationship.
ALTER TABLE public.runner_vehicle_change_requests
  ADD COLUMN IF NOT EXISTS vehicle_id uuid;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.runner_vehicle_change_requests'::regclass
      AND conname =
        'runner_vehicle_change_requests_vehicle_id_fkey'
  ) THEN
    ALTER TABLE public.runner_vehicle_change_requests
      ADD CONSTRAINT
        runner_vehicle_change_requests_vehicle_id_fkey
      FOREIGN KEY (vehicle_id)
      REFERENCES public.runner_vehicles(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;


-- Only one replacement request may be awaiting action per Runner.
CREATE UNIQUE INDEX IF NOT EXISTS
  runner_vehicle_change_requests_one_open_per_runner_uidx
ON public.runner_vehicle_change_requests(runner_id)
WHERE status IN ('pending_review', 'changes_required');


CREATE INDEX IF NOT EXISTS
  runner_vehicle_change_requests_runner_history_idx
ON public.runner_vehicle_change_requests(
  runner_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  runner_vehicle_change_requests_review_queue_idx
ON public.runner_vehicle_change_requests(
  status,
  created_at ASC
);


-- ============================================================================
-- 4. LINK REPLACEMENT DOCUMENTS TO THEIR REQUEST
-- ============================================================================

ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS vehicle_change_request_id uuid;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.runner_verification_documents'::regclass
      AND conname =
        'runner_verification_documents_vehicle_change_request_fkey'
  ) THEN
    ALTER TABLE public.runner_verification_documents
      ADD CONSTRAINT
        runner_verification_documents_vehicle_change_request_fkey
      FOREIGN KEY (vehicle_change_request_id)
      REFERENCES public.runner_vehicle_change_requests(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;


ALTER TABLE public.runner_verification_documents
  DROP CONSTRAINT IF EXISTS
    runner_verification_documents_vehicle_purpose_link_check;

ALTER TABLE public.runner_verification_documents
  ADD CONSTRAINT
    runner_verification_documents_vehicle_purpose_link_check
  CHECK (
    document_purpose = 'onboarding'
    OR (
      document_purpose = 'vehicle_update'
      AND vehicle_change_request_id IS NOT NULL
    )
  );


CREATE INDEX IF NOT EXISTS
  runner_verification_documents_vehicle_request_idx
ON public.runner_verification_documents(
  vehicle_change_request_id,
  review_status
)
WHERE vehicle_change_request_id IS NOT NULL;


-- ============================================================================
-- 5. SEPARATE ADMIN VEHICLE REVIEW HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.runner_admin_vehicle_change_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  vehicle_change_request_id uuid NOT NULL
    REFERENCES public.runner_vehicle_change_requests(id)
    ON DELETE RESTRICT,

  vehicle_id uuid NOT NULL
    REFERENCES public.runner_vehicles(id)
    ON DELETE RESTRICT,

  runner_id uuid NOT NULL,

  admin_user_id text NOT NULL,

  decision text NOT NULL
    CHECK (
      decision IN (
        'approved',
        'rejected',
        'changes_required'
      )
    ),

  reason text,

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT runner_admin_vehicle_review_reason_length
    CHECK (
      reason IS NULL
      OR char_length(reason) <= 1000
    ),

  CONSTRAINT runner_admin_vehicle_review_rejection_reason
    CHECK (
      decision <> 'rejected'
      OR char_length(btrim(COALESCE(reason, ''))) >= 10
    ),

  CONSTRAINT runner_admin_vehicle_review_changes_reason
    CHECK (
      decision <> 'changes_required'
      OR char_length(btrim(COALESCE(reason, ''))) >= 10
    )
);


CREATE INDEX IF NOT EXISTS
  runner_admin_vehicle_change_reviews_request_idx
ON public.runner_admin_vehicle_change_reviews(
  vehicle_change_request_id,
  created_at DESC
);


CREATE INDEX IF NOT EXISTS
  runner_admin_vehicle_change_reviews_runner_idx
ON public.runner_admin_vehicle_change_reviews(
  runner_id,
  created_at DESC
);


-- ============================================================================
-- 6. MIGRATE EXISTING RUNNER VEHICLES
-- ============================================================================

-- Preserve the vehicle already recorded in runner_profiles.
--
-- Approved Runners receive an approved, active vehicle record.
-- Other accounts receive a pending, inactive record.
--
-- Incomplete motorised profiles are skipped rather than creating
-- invalid vehicle records.

INSERT INTO public.runner_vehicles (
  runner_id,
  vehicle_type,
  vehicle_model,
  vehicle_registration,
  status,
  is_active,
  approved_at,
  created_at,
  updated_at
)
SELECT
  a.id,
  p.vehicle_type,
  p.vehicle_model,
  p.vehicle_registration,

  CASE
    WHEN a.verification_status = 'approved'
      THEN 'approved'
    ELSE 'pending_review'
  END,

  CASE
    WHEN a.verification_status = 'approved'
      THEN true
    ELSE false
  END,

  CASE
    WHEN a.verification_status = 'approved'
      THEN now()
    ELSE NULL
  END,

  now(),
  now()

FROM public.runner_accounts AS a
JOIN public.runner_profiles AS p
  ON p.runner_id = a.id

WHERE p.vehicle_type IN (
  'bicycle',
  'motorcycle',
  'car',
  'van',
  'other'
)

AND (
  p.vehicle_type = 'bicycle'
  OR (
    char_length(btrim(COALESCE(p.vehicle_model, ''))) >= 2
    AND
    char_length(btrim(COALESCE(p.vehicle_registration, ''))) >= 3
  )
)

AND NOT EXISTS (
  SELECT 1
  FROM public.runner_vehicles AS existing
  WHERE existing.runner_id = a.id
    AND (
      (
        p.vehicle_registration IS NOT NULL
        AND existing.vehicle_registration IS NOT NULL
        AND regexp_replace(
          upper(btrim(existing.vehicle_registration)),
          '[^A-Z0-9]',
          '',
          'g'
        ) = regexp_replace(
          upper(btrim(p.vehicle_registration)),
          '[^A-Z0-9]',
          '',
          'g'
        )
      )
      OR (
        p.vehicle_registration IS NULL
        AND existing.vehicle_registration IS NULL
        AND existing.vehicle_type = p.vehicle_type
      )
    )
);


-- ============================================================================
-- 7. RECORD MIGRATION
-- ============================================================================

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-27-runner-vehicle-management')
ON CONFLICT (version) DO NOTHING;

COMMIT;