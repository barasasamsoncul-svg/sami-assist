export const ACCOUNTING_OPERATIONAL_RECOVERY_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_recovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_key UUID NOT NULL,
  action_key VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'started',
  summary TEXT,
  before_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  failure_message TEXT,
  requested_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (action_key IN ('capture_diagnostics','initialize_core_settings','sync_lock_forward')),
  CHECK (status IN ('started','completed','noop','failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_recovery_request
  ON public.accounting_recovery_runs(company_id,request_key);

CREATE INDEX IF NOT EXISTS idx_accounting_recovery_company
  ON public.accounting_recovery_runs(company_id,created_at DESC,status);
`;
