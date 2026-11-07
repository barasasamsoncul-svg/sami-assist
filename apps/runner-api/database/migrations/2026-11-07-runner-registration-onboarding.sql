
-- SaMi Runner registration and category-based onboarding foundation.
-- Target: SaMi Runner Neon project, database sami_runner.
-- This migration does not modify Customer database tables.

BEGIN;

-- Registration and login must have separate OTP purposes.
-- Registration details remain attached to the challenge until email
-- verification succeeds and the pending Runner account is created.
ALTER TABLE public.runner_email_otp_challenges
  ADD COLUMN IF NOT EXISTS registration_data jsonb
    NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.runner_email_otp_challenges
  DROP CONSTRAINT IF EXISTS runner_email_otp_challenges_purpose_check;

ALTER TABLE public.runner_email_otp_challenges
  ADD CONSTRAINT runner_email_otp_challenges_purpose_check
  CHECK (purpose IN ('login', 'register'));

ALTER TABLE public.runner_email_otp_challenges
  DROP CONSTRAINT IF EXISTS runner_email_otp_challenges_registration_data_check;

ALTER TABLE public.runner_email_otp_challenges
  ADD CONSTRAINT runner_email_otp_challenges_registration_data_check
  CHECK (jsonb_typeof(registration_data) = 'object');

-- Runner work categories use the same keys as Customer errand categories.
CREATE TABLE IF NOT EXISTS public.runner_service_categories (
  category_key text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.runner_service_categories (
  category_key,
  label,
  description,
  display_order
)
VALUES
  ('groceries', 'Groceries', 'Grocery shopping and grocery errands.', 10),
  ('food_delivery', 'Food delivery', 'Food collection and delivery errands.', 20),
  ('pickup_delivery', 'Pickup and delivery', 'Collecting and delivering parcels and other items.', 30),
  ('bill_payments', 'Bill payments', 'Assisting customers with supported bill payment errands.', 40),
  ('laundry_cleaning', 'Laundry and cleaning', 'Laundry collection, delivery and cleaning-related errands.', 50),
  ('documents_admin', 'Documents and administration', 'Document collection, submission and administrative errands.', 60),
  ('clothing_retail', 'Clothing and retail', 'Clothing purchases, collections and retail errands.', 70),
  ('shopping_gifts', 'Shopping and gifts', 'Shopping, gift purchases and special collections.', 80),
  ('home_services', 'Home services', 'Supported household and home-service tasks.', 90),
  ('pharmacy_health', 'Pharmacy and health errands', 'Supported pharmacy collections and health-related errands.', 100),
  ('pet_care', 'Pet care', 'Supported pet-care and pet-related errands.', 110),
  ('queue_appointments', 'Queues and appointments', 'Queueing and appointment-related assistance.', 120),
  ('personal_errand', 'Personal errands', 'General personal errands for customers.', 130),
  ('business_support', 'Business support', 'Supported errands and assistance for businesses.', 140),
  ('shopping', 'General shopping', 'General shopping and purchase errands.', 150),
  ('other', 'Other errands', 'Other tasks reviewed and approved by SaMi Operations.', 160)
ON CONFLICT (category_key)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order,
  is_active = true,
  updated_at = now();

-- A Runner can apply for more than one category.
CREATE TABLE IF NOT EXISTS public.runner_account_service_categories (
  runner_id uuid NOT NULL
    REFERENCES public.runner_accounts(id) ON DELETE CASCADE,
  category_key text NOT NULL
    REFERENCES public.runner_service_categories(category_key) ON DELETE RESTRICT,
  selected_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (runner_id, category_key)
);

CREATE INDEX IF NOT EXISTS runner_account_service_categories_category_idx
  ON public.runner_account_service_categories(category_key, runner_id);

-- Configurable document requirements.
-- category_key IS NULL means the requirement applies to every applicant.
-- vehicle_type = 'any' means it applies regardless of transport choice.
CREATE TABLE IF NOT EXISTS public.runner_onboarding_document_requirements (
  requirement_key text PRIMARY KEY,
  category_key text
    REFERENCES public.runner_service_categories(category_key) ON DELETE CASCADE,
  vehicle_type text NOT NULL DEFAULT 'any'
    CHECK (vehicle_type IN (
      'any', 'motorcycle', 'bicycle', 'car', 'van', 'other'
    )),
  document_type text NOT NULL
    CHECK (document_type IN (
      'national_id_front',
      'national_id_back',
      'driving_licence',
      'vehicle_registration',
      'motor_vehicle_insurance',
      'vehicle_authorisation',
      'vehicle_inspection',
      'profile_photo',
      'food_handling_certificate',
      'professional_qualification',
      'pet_care_qualification',
      'business_permit',
      'certificate_of_good_conduct',
      'other'
    )),
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  is_required boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runner_onboarding_requirements_lookup_idx
  ON public.runner_onboarding_document_requirements(
    category_key,
    vehicle_type,
    is_active,
    display_order
  );

-- Every Runner applicant must provide identity evidence.
INSERT INTO public.runner_onboarding_document_requirements (
  requirement_key,
  category_key,
  vehicle_type,
  document_type,
  title,
  instructions,
  is_required,
  display_order
)
VALUES
  (
    'identity_national_id_front',
    NULL,
    'any',
    'national_id_front',
    'National ID — front',
    'Upload a clear image of the front of your national identity document.',
    true,
    10
  ),
  (
    'identity_national_id_back',
    NULL,
    'any',
    'national_id_back',
    'National ID — back',
    'Upload a clear image of the back of your national identity document.',
    true,
    20
  ),
  (
    'identity_profile_photo',
    NULL,
    'any',
    'profile_photo',
    'Profile photo',
    'Upload a recent, clear photograph of yourself.',
    true,
    30
  )
ON CONFLICT (requirement_key)
DO UPDATE SET
  title = EXCLUDED.title,
  instructions = EXCLUDED.instructions,
  is_required = EXCLUDED.is_required,
  is_active = true,
  updated_at = now();

-- Motorised transport requires the corresponding vehicle evidence.
-- Bicycle applicants are deliberately not asked for a driving licence.
INSERT INTO public.runner_onboarding_document_requirements (
  requirement_key,
  category_key,
  vehicle_type,
  document_type,
  title,
  instructions,
  is_required,
  display_order
)
VALUES
  (
    'motorcycle_driving_licence',
    NULL,
    'motorcycle',
    'driving_licence',
    'Valid motorcycle driving licence',
    'Upload a valid driving licence appropriate for the motorcycle you will use.',
    true,
    40
  ),
  (
    'motorcycle_registration',
    NULL,
    'motorcycle',
    'vehicle_registration',
    'Motorcycle registration document',
    'Upload the motorcycle registration or logbook evidence.',
    true,
    50
  ),
  (
    'motorcycle_insurance',
    NULL,
    'motorcycle',
    'motor_vehicle_insurance',
    'Motorcycle insurance',
    'Upload current insurance evidence for the motorcycle.',
    true,
    60
  ),
  (
    'motorcycle_authorisation',
    NULL,
    'motorcycle',
    'vehicle_authorisation',
    'Vehicle owner authorisation',
    'Required where the motorcycle is registered to another person.',
    false,
    70
  ),
  (
    'car_driving_licence',
    NULL,
    'car',
    'driving_licence',
    'Valid driving licence',
    'Upload a valid driving licence appropriate for the vehicle you will use.',
    true,
    40
  ),
  (
    'car_registration',
    NULL,
    'car',
    'vehicle_registration',
    'Vehicle registration document',
    'Upload the vehicle registration or logbook evidence.',
    true,
    50
  ),
  (
    'car_insurance',
    NULL,
    'car',
    'motor_vehicle_insurance',
    'Vehicle insurance',
    'Upload current insurance evidence for the vehicle.',
    true,
    60
  ),
  (
    'car_authorisation',
    NULL,
    'car',
    'vehicle_authorisation',
    'Vehicle owner authorisation',
    'Required where the vehicle is registered to another person.',
    false,
    70
  ),
  (
    'van_driving_licence',
    NULL,
    'van',
    'driving_licence',
    'Valid driving licence',
    'Upload a valid driving licence appropriate for the van you will use.',
    true,
    40
  ),
  (
    'van_registration',
    NULL,
    'van',
    'vehicle_registration',
    'Van registration document',
    'Upload the van registration or logbook evidence.',
    true,
    50
  ),
  (
    'van_insurance',
    NULL,
    'van',
    'motor_vehicle_insurance',
    'Van insurance',
    'Upload current insurance evidence for the van.',
    true,
    60
  ),
  (
    'van_authorisation',
    NULL,
    'van',
    'vehicle_authorisation',
    'Vehicle owner authorisation',
    'Required where the van is registered to another person.',
    false,
    70
  )
ON CONFLICT (requirement_key)
DO UPDATE SET
  title = EXCLUDED.title,
  instructions = EXCLUDED.instructions,
  is_required = EXCLUDED.is_required,
  is_active = true,
  updated_at = now();

-- Additional category-specific evidence.
-- These are optional at application stage; Operations can request
-- further evidence depending on the exact task being approved.
INSERT INTO public.runner_onboarding_document_requirements (
  requirement_key,
  category_key,
  vehicle_type,
  document_type,
  title,
  instructions,
  is_required,
  display_order
)
VALUES
  (
    'food_delivery_handling_evidence',
    'food_delivery',
    'any',
    'food_handling_certificate',
    'Food handling evidence (where applicable)',
    'Upload relevant food-handling evidence if your tasks involve preparing or handling unpackaged food. This is not a blanket requirement for sealed-item delivery.',
    false,
    100
  ),
  (
    'home_services_qualification',
    'home_services',
    'any',
    'professional_qualification',
    'Trade or professional qualification',
    'Upload relevant trade certificates or qualifications for the home services you intend to provide.',
    false,
    100
  ),
  (
    'pharmacy_health_qualification',
    'pharmacy_health',
    'any',
    'professional_qualification',
    'Relevant professional authorisation (where applicable)',
    'Upload relevant authorisation if your selected tasks involve regulated health or medicine handling.',
    false,
    100
  ),
  (
    'pet_care_qualification',
    'pet_care',
    'any',
    'pet_care_qualification',
    'Pet-care qualification or experience',
    'Upload relevant animal-care training or experience evidence where available.',
    false,
    100
  ),
  (
    'business_support_qualification',
    'business_support',
    'any',
    'professional_qualification',
    'Professional or business qualification',
    'Upload relevant evidence of qualifications or experience for the business services you intend to provide.',
    false,
    100
  )
ON CONFLICT (requirement_key)
DO UPDATE SET
  title = EXCLUDED.title,
  instructions = EXCLUDED.instructions,
  is_required = EXCLUDED.is_required,
  is_active = true,
  updated_at = now();

-- Connect submitted documents to the category and requirement they satisfy.
ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS category_key text
    REFERENCES public.runner_service_categories(category_key) ON DELETE SET NULL;

ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS requirement_key text
    REFERENCES public.runner_onboarding_document_requirements(requirement_key) ON DELETE SET NULL;

-- Extend accepted document types while preserving existing document records.
ALTER TABLE public.runner_verification_documents
  DROP CONSTRAINT IF EXISTS runner_verification_documents_document_type_check;

ALTER TABLE public.runner_verification_documents
  ADD CONSTRAINT runner_verification_documents_document_type_check
  CHECK (document_type IN (
    'national_id_front',
    'national_id_back',
    'driving_licence',
    'vehicle_registration',
    'motor_vehicle_insurance',
    'vehicle_authorisation',
    'vehicle_inspection',
    'profile_photo',
    'food_handling_certificate',
    'professional_qualification',
    'pet_care_qualification',
    'business_permit',
    'certificate_of_good_conduct',
    'other'
  ));

CREATE INDEX IF NOT EXISTS runner_verification_documents_requirement_idx
  ON public.runner_verification_documents(
    runner_id,
    requirement_key,
    review_status
  );

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-07-runner-registration-onboarding')
ON CONFLICT (version) DO NOTHING;

COMMIT;
