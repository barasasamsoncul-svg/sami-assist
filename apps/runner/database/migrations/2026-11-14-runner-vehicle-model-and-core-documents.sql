-- SaMi Runner: vehicle model and mandatory identity documents.
--
-- Adds the vehicle model to Runner profiles and ensures every
-- Runner applicant must provide:
--   1. Profile photo
--   2. National ID front
--   3. National ID back
--   4. KRA PIN
--   5. Police Clearance Certificate (Good Conduct)
--
-- These five requirements apply to every service and vehicle type.
-- Motorbike and vehicle applicants retain their additional
-- transport-specific document requirements.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. VEHICLE MODEL
-- ---------------------------------------------------------------------------

ALTER TABLE public.runner_profiles
  ADD COLUMN IF NOT EXISTS vehicle_model text;

ALTER TABLE public.runner_profiles
  DROP CONSTRAINT IF EXISTS runner_profiles_vehicle_model_check;

ALTER TABLE public.runner_profiles
  ADD CONSTRAINT runner_profiles_vehicle_model_check
  CHECK (
    vehicle_model IS NULL
    OR char_length(btrim(vehicle_model)) BETWEEN 2 AND 120
  );


-- ---------------------------------------------------------------------------
-- 2. SUPPORT KRA PIN AS A VERIFICATION DOCUMENT TYPE
-- ---------------------------------------------------------------------------

ALTER TABLE public.runner_onboarding_document_requirements
  DROP CONSTRAINT IF EXISTS
    runner_onboarding_document_requirements_document_type_check;

ALTER TABLE public.runner_onboarding_document_requirements
  ADD CONSTRAINT
    runner_onboarding_document_requirements_document_type_check
  CHECK (document_type IN (
    'national_id_front',
    'national_id_back',
    'driving_licence',
    'vehicle_registration',
    'motor_vehicle_insurance',
    'vehicle_authorisation',
    'vehicle_inspection',
    'profile_photo',
    'kra_pin',
    'food_handling_certificate',
    'professional_qualification',
    'pet_care_qualification',
    'business_permit',
    'certificate_of_good_conduct',
    'other'
  ));

ALTER TABLE public.runner_verification_documents
  DROP CONSTRAINT IF EXISTS
    runner_verification_documents_document_type_check;

ALTER TABLE public.runner_verification_documents
  ADD CONSTRAINT
    runner_verification_documents_document_type_check
  CHECK (document_type IN (
    'national_id_front',
    'national_id_back',
    'driving_licence',
    'vehicle_registration',
    'motor_vehicle_insurance',
    'vehicle_authorisation',
    'vehicle_inspection',
    'profile_photo',
    'kra_pin',
    'food_handling_certificate',
    'professional_qualification',
    'pet_care_qualification',
    'business_permit',
    'certificate_of_good_conduct',
    'other'
  ));


-- ---------------------------------------------------------------------------
-- 3. UNIVERSAL MANDATORY RUNNER DOCUMENTS
-- ---------------------------------------------------------------------------

INSERT INTO public.runner_onboarding_document_requirements (
  requirement_key,
  category_key,
  vehicle_type,
  document_type,
  title,
  instructions,
  is_required,
  display_order,
  is_active
)
VALUES
  (
    'identity_national_id_front',
    NULL,
    'any',
    'national_id_front',
    'National ID — front',
    'Upload a clear image of the front of your National ID.',
    true,
    10,
    true
  ),
  (
    'identity_national_id_back',
    NULL,
    'any',
    'national_id_back',
    'National ID — back',
    'Upload a clear image of the back of your National ID.',
    true,
    20,
    true
  ),
  (
    'identity_profile_photo',
    NULL,
    'any',
    'profile_photo',
    'Profile photo',
    'Upload a recent, clear photograph of yourself.',
    true,
    30,
    true
  ),
  (
    'identity_kra_pin',
    NULL,
    'any',
    'kra_pin',
    'KRA PIN certificate',
    'Upload your KRA PIN certificate.',
    true,
    40,
    true
  ),
  (
    'identity_good_conduct',
    NULL,
    'any',
    'certificate_of_good_conduct',
    'Police Clearance Certificate (Good Conduct)',
    'Upload your Police Clearance Certificate, commonly known as a Certificate of Good Conduct.',
    true,
    50,
    true
  )
ON CONFLICT (requirement_key)
DO UPDATE SET
  category_key = EXCLUDED.category_key,
  vehicle_type = EXCLUDED.vehicle_type,
  document_type = EXCLUDED.document_type,
  title = EXCLUDED.title,
  instructions = EXCLUDED.instructions,
  is_required = EXCLUDED.is_required,
  display_order = EXCLUDED.display_order,
  is_active = true,
  updated_at = now();


-- ---------------------------------------------------------------------------
-- 4. RECORD MIGRATION
-- ---------------------------------------------------------------------------

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-14-runner-vehicle-model-and-core-documents')
ON CONFLICT (version) DO NOTHING;

COMMIT;