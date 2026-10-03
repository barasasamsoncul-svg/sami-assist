export const ACCOUNTING_APPROVAL_CONTROLS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_approval_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enforce_maker_checker BOOLEAN NOT NULL DEFAULT FALSE,
  require_posting_separation BOOLEAN NOT NULL DEFAULT FALSE,
  require_reversal_reason BOOLEAN NOT NULL DEFAULT TRUE,
  default_required_approvals SMALLINT NOT NULL DEFAULT 1,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (default_required_approvals BETWEEN 1 AND 3)
);

CREATE TABLE IF NOT EXISTS public.accounting_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  posting_kind VARCHAR(20) NOT NULL DEFAULT 'any',
  min_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  max_amount NUMERIC(19,2),
  required_approvals SMALLINT NOT NULL DEFAULT 1,
  approver_mode VARCHAR(30) NOT NULL DEFAULT 'any_authorized',
  approver_user_id UUID,
  require_note BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (posting_kind IN ('any','manual','opening')),
  CHECK (min_amount >= 0),
  CHECK (max_amount IS NULL OR max_amount >= min_amount),
  CHECK (required_approvals BETWEEN 1 AND 3),
  CHECK (approver_mode IN ('any_authorized','owner','specific_user')),
  CHECK (
    (approver_mode='specific_user' AND approver_user_id IS NOT NULL)
    OR
    (approver_mode<>'specific_user')
  )
);
CREATE INDEX IF NOT EXISTS idx_accounting_approval_policies_company
  ON public.accounting_approval_policies(company_id,is_active,priority,min_amount DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  policy_id UUID REFERENCES public.accounting_approval_policies(id) ON DELETE SET NULL,
  amount NUMERIC(19,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  required_approvals SMALLINT NOT NULL DEFAULT 1,
  policy_snapshot_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (required_approvals BETWEEN 1 AND 3),
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_pending_approval_request
  ON public.accounting_approval_requests(company_id,journal_id)
  WHERE deleted_at IS NULL AND status='pending';
CREATE INDEX IF NOT EXISTS idx_accounting_approval_requests_company
  ON public.accounting_approval_requests(company_id,status,requested_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES public.accounting_approval_requests(id) ON DELETE RESTRICT,
  decision VARCHAR(20) NOT NULL,
  note TEXT,
  decided_by UUID NOT NULL,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (decision IN ('approved','rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_approval_decision_actor
  ON public.accounting_approval_decisions(request_id,decided_by)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_approval_decisions_company
  ON public.accounting_approval_decisions(company_id,request_id,decided_at)
  WHERE deleted_at IS NULL;
`;
