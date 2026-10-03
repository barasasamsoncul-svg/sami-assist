export const ACCOUNTING_PERIOD_CLOSING_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_close_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_period_id UUID NOT NULL REFERENCES public.accounting_fiscal_periods(id) ON DELETE RESTRICT,
  close_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'prepared',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  fiscal_year_start DATE,
  fiscal_year_end DATE,
  closing_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  checklist_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  prepared_by UUID,
  completed_by UUID,
  reopened_by UUID,
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  reopened_at TIMESTAMPTZ,
  reopen_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (close_type IN ('month_end','year_end')),
  CHECK (status IN ('prepared','completed','reopened'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_close_run_request
  ON public.accounting_close_runs(company_id,request_key)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_completed_period_close
  ON public.accounting_close_runs(company_id,fiscal_period_id)
  WHERE deleted_at IS NULL AND status='completed';
CREATE INDEX IF NOT EXISTS idx_accounting_close_runs_period
  ON public.accounting_close_runs(company_id,fiscal_period_id,created_at DESC)
  WHERE deleted_at IS NULL;
`;
