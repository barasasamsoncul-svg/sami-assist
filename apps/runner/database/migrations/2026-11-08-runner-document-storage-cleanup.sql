BEGIN;

-- A reviewed document may no longer have a file in R2.
-- Keep its database record and review history.
ALTER TABLE public.runner_verification_documents
  ALTER COLUMN storage_key DROP NOT NULL;

-- Distinguish outright rejection from a request for replacement.
ALTER TABLE public.runner_verification_documents
  DROP CONSTRAINT IF EXISTS runner_verification_documents_review_status_check;

ALTER TABLE public.runner_verification_documents
  ADD CONSTRAINT runner_verification_documents_review_status_check
  CHECK (
    review_status IN (
      'pending',
      'approved',
      'rejected',
      'resubmission_required'
    )
  );

-- Extend the Admin document-review audit history.
ALTER TABLE public.runner_admin_document_reviews
  DROP CONSTRAINT IF EXISTS runner_admin_document_reviews_previous_review_status_check;

ALTER TABLE public.runner_admin_document_reviews
  ADD CONSTRAINT runner_admin_document_reviews_previous_review_status_check
  CHECK (
    previous_review_status IN (
      'pending',
      'approved',
      'rejected',
      'resubmission_required'
    )
  );

ALTER TABLE public.runner_admin_document_reviews
  DROP CONSTRAINT IF EXISTS runner_admin_document_reviews_new_review_status_check;

ALTER TABLE public.runner_admin_document_reviews
  ADD CONSTRAINT runner_admin_document_reviews_new_review_status_check
  CHECK (
    new_review_status IN (
      'approved',
      'rejected',
      'resubmission_required'
    )
  );

-- Reliable R2 deletion queue.
-- The object key remains here until Cloudflare confirms deletion.
CREATE TABLE IF NOT EXISTS public.runner_document_storage_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  document_id uuid NOT NULL,
  runner_id uuid NOT NULL,

  storage_key text NOT NULL UNIQUE,

  deletion_reason text NOT NULL
    CHECK (
      deletion_reason IN (
        'document_rejected',
        'resubmission_required',
        'application_approved_cleanup'
      )
    ),

  requested_by_admin_id text NOT NULL,

  attempt_count integer NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),

  last_attempt_at timestamptz,
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS runner_document_storage_deletions_pending_idx
  ON public.runner_document_storage_deletions(
    created_at ASC
  )
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS runner_document_storage_deletions_document_idx
  ON public.runner_document_storage_deletions(
    document_id,
    created_at DESC
  );

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-08-runner-document-storage-cleanup')
ON CONFLICT (version) DO NOTHING;

COMMIT;