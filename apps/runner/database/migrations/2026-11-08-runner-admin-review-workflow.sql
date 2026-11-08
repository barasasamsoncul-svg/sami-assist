BEGIN;

-- Store the latest Admin review outcome on the Runner account.
ALTER TABLE public.runner_accounts
  ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_reviewed_by text,
  ADD COLUMN IF NOT EXISTS verification_rejection_reason text;

-- Preserve the history of application-level review decisions.
-- admin_user_id is stored as text because Admin and Runner
-- use separate databases and do not share database foreign keys.
CREATE TABLE IF NOT EXISTS public.runner_admin_application_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id uuid NOT NULL,
  admin_user_id text NOT NULL,
  decision text NOT NULL
    CHECK (decision IN ('approved', 'rejected')),
  previous_verification_status text NOT NULL
    CHECK (
      previous_verification_status IN (
        'pending', 'submitted', 'approved', 'rejected'
      )
    ),
  new_verification_status text NOT NULL
    CHECK (
      new_verification_status IN (
        'pending', 'submitted', 'approved', 'rejected'
      )
    ),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reason IS NULL OR char_length(reason) <= 1000),
  CHECK (
    decision <> 'rejected'
    OR length(trim(COALESCE(reason, ''))) >= 10
  )
);

CREATE INDEX IF NOT EXISTS runner_admin_application_reviews_runner_idx
  ON public.runner_admin_application_reviews(
    runner_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS runner_admin_application_reviews_admin_idx
  ON public.runner_admin_application_reviews(
    admin_user_id,
    created_at DESC
  );

-- Preserve every document review decision, including subsequent
-- reviews after a Runner submits a replacement document.
CREATE TABLE IF NOT EXISTS public.runner_admin_document_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  runner_id uuid NOT NULL,
  admin_user_id text NOT NULL,
  previous_review_status text NOT NULL
    CHECK (
      previous_review_status IN ('pending', 'approved', 'rejected')
    ),
  new_review_status text NOT NULL
    CHECK (new_review_status IN ('approved', 'rejected')),
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    rejection_reason IS NULL
    OR char_length(rejection_reason) <= 1000
  ),
  CHECK (
    new_review_status <> 'rejected'
    OR length(trim(COALESCE(rejection_reason, ''))) >= 10
  )
);

CREATE INDEX IF NOT EXISTS runner_admin_document_reviews_runner_idx
  ON public.runner_admin_document_reviews(
    runner_id,
    created_at DESC
  );

CREATE INDEX IF NOT EXISTS runner_admin_document_reviews_document_idx
  ON public.runner_admin_document_reviews(
    document_id,
    created_at DESC
  );

INSERT INTO public.schema_migrations(version)
VALUES ('2026-11-08-runner-admin-review-workflow')
ON CONFLICT (version) DO NOTHING;

COMMIT;