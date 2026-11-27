-- ============================================================================
-- SaMi Runner: Vehicle Document Validity
--
-- Records the verified expiry date of documents that have an expiry date.
-- Used when deciding whether a saved vehicle can be reactivated.
--
-- NULL means no expiry date has been recorded.
-- The reactivation API will require a recorded, current expiry date
-- for driving licences and motor vehicle insurance.
-- ============================================================================

BEGIN;

ALTER TABLE public.runner_verification_documents
  ADD COLUMN IF NOT EXISTS valid_until date;

COMMENT ON COLUMN public.runner_verification_documents.valid_until IS
  'Expiry date verified by Operations from the submitted document. Required for vehicle driving licences and motor vehicle insurance before vehicle reactivation.';

CREATE INDEX IF NOT EXISTS
  runner_verification_documents_vehicle_validity_idx
ON public.runner_verification_documents (
  runner_id,
  document_purpose,
  requirement_key,
  review_status,
  valid_until
);

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-27-runner-vehicle-document-validity')
ON CONFLICT (version) DO NOTHING;

COMMIT;