export const ACCOUNTING_COLLABORATION_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_collaboration_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  model VARCHAR(150) NOT NULL,
  record_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.accounting_collaboration_comments(id) ON DELETE SET NULL,
  kind VARCHAR(30) NOT NULL DEFAULT 'comment',
  body TEXT NOT NULL,
  mentioned_user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  created_by UUID NOT NULL,
  edited_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CHECK (kind IN ('comment','internal_note')),
  CHECK (char_length(trim(body)) BETWEEN 1 AND 5000),
  CHECK (cardinality(mentioned_user_ids) <= 20)
);
CREATE INDEX IF NOT EXISTS idx_accounting_collaboration_comments_record
  ON public.accounting_collaboration_comments(company_id,model,record_id,created_at,id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_collaboration_comments_recent
  ON public.accounting_collaboration_comments(company_id,created_at DESC,id DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_collaboration_comment_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  comment_id UUID NOT NULL REFERENCES public.accounting_collaboration_comments(id) ON DELETE RESTRICT,
  prior_body TEXT NOT NULL,
  prior_mentioned_user_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  revised_by UUID NOT NULL,
  revised_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_accounting_collaboration_comment_revisions
  ON public.accounting_collaboration_comment_revisions(company_id,comment_id,revised_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS public.accounting_record_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  model VARCHAR(150) NOT NULL,
  record_id UUID NOT NULL,
  user_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_record_follower_active
  ON public.accounting_record_followers(company_id,model,record_id,user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_record_followers_record
  ON public.accounting_record_followers(company_id,model,record_id,created_at)
  WHERE deleted_at IS NULL;
`;
