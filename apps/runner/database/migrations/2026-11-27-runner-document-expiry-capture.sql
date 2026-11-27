-- ============================================================================
-- SaMi Runner: Document Expiry Capture and Vehicle Document Ownership
--
-- Captures expiry dates in the Runner document collection flow.
-- Links uploaded documents to the vehicle they prove compliance for.
-- ============================================================================

BEGIN;

-- Configure which onboarding requirements must provide an expiry date.
ALTER TABLE public.runner_onboarding_document_requirements
  ADD COLUMN IF NOT EXISTS requires_expiry boolean NOT NULL DEFAULT false;

-- A driving licence and motor vehicle insurance are time-limited.
-- Other requirements remain non-expiring unless Operations explicitly
-- configures them in the requirements table.
UPDATE public.runner_onboarding_document_requirements
SET
  requires_expiry = (
    document_type IN ('driving_licence', 'motor_vehicle_insurance')
  ),
  updated_at = now()
WHERE document_type IN (
  'driving_licence',
  'motor_vehicle_insurance'
);

-- Store the expiry date supplied during document collection.
ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS valid_until date;

-- Attach each document to the vehicle it belongs to. This is needed
-- to check the correct documents when a Runner reactivates a saved vehicle.
ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS vehicle_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid =
      'public.runner_verification_documents'::regclass
      AND conname =
        'runner_verification_documents_vehicle_id_fkey'
  ) THEN
    ALTER TABLE public.runner_verification_documents
      ADD CONSTRAINT runner_verification_documents_vehicle_id_fkey
      FOREIGN KEY (vehicle_id)
      REFERENCES public.runner_vehicles(id)
      ON DELETE RESTRICT;
  END IF;
END
$$;

-- Replacement documents already identify their change request.
-- Resolve the corresponding vehicle ID.
UPDATE public.runner_verification_documents AS d
SET vehicle_id = r.vehicle_id
FROM public.runner_vehicle_change_requests AS r
WHERE d.vehicle_change_request_id = r.id
  AND r.vehicle_id IS NOT NULL
  AND d.vehicle_id IS NULL;

-- Existing approved Runner documents belong to the currently active
-- vehicle migrated from runner_profiles.
UPDATE public.runner_verification_documents AS d
SET vehicle_id = v.id
FROM public.runner_vehicles AS v
WHERE d.runner_id = v.runner_id
  AND d.document_purpose = 'onboarding'
  AND d.vehicle_id IS NULL
  AND v.is_active = true
  AND v.status = 'approved';

CREATE INDEX IF NOT EXISTS
  runner_verification_documents_vehicle_requirement_idx
ON public.runner_verification_documents (
  vehicle_id,
  requirement_key,
  submitted_at DESC,
  id DESC
)
WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS
  runner_onboarding_requirements_expiry_idx
ON public.runner_onboarding_document_requirements (
  vehicle_type,
  requires_expiry,
  is_active
)
WHERE is_active = true;

COMMENT ON COLUMN public.runner_onboarding_document_requirements.requires_expiry IS
  'When true, the Runner must enter the expiry date printed on the document during upload.';

COMMENT ON COLUMN public.runner_verification_documents.valid_until IS
  'Expiry date entered by the Runner during document submission.';

COMMENT ON COLUMN public.runner_verification_documents.vehicle_id IS
  'Vehicle this verification document belongs to; used for vehicle activation and reactivation checks.';

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-27-runner-document-expiry-capture')
ON CONFLICT (version) DO NOTHING;

COMMIT;
