export const ACCOUNTING_FINANCIAL_STATEMENTS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_financial_report_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  comparative_mode VARCHAR(20) NOT NULL DEFAULT 'prior_period',
  cash_flow_method VARCHAR(20) NOT NULL DEFAULT 'indirect',
  include_zero_lines BOOLEAN NOT NULL DEFAULT FALSE,
  show_account_detail BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (comparative_mode IN ('none','prior_period','prior_year')),
  CHECK (cash_flow_method IN ('indirect'))
);

CREATE TABLE IF NOT EXISTS public.accounting_financial_statement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  comparative_start DATE,
  comparative_end DATE,
  currency CHAR(3) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'company',
  consolidation_run_id UUID REFERENCES public.accounting_consolidation_runs(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID,
  finalized_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (comparative_end IS NULL OR comparative_start IS NOT NULL),
  CHECK (comparative_start IS NULL OR comparative_end >= comparative_start),
  CHECK (scope IN ('company','consolidated')),
  CHECK (status IN ('generated','finalized'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financial_statement_snapshot_request
  ON public.accounting_financial_statement_snapshots(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financial_statement_snapshot_period
  ON public.accounting_financial_statement_snapshots(company_id,period_end DESC,generated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financial_statement_snapshot_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.accounting_financial_statement_snapshots(id) ON DELETE CASCADE,
  statement_type VARCHAR(30) NOT NULL,
  section_key VARCHAR(80) NOT NULL,
  line_key VARCHAR(120) NOT NULL,
  label VARCHAR(255) NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  display_order INTEGER NOT NULL DEFAULT 100,
  current_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  comparative_amount NUMERIC(19,2),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (statement_type IN ('profit_loss','balance_sheet','cash_flow','changes_equity'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_financial_statement_snapshot_lines
  ON public.accounting_financial_statement_snapshot_lines(company_id,snapshot_id,statement_type,display_order,line_key)
  WHERE deleted_at IS NULL;
`;
