export const ACCOUNTING_MANAGEMENT_REPORTING_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_management_report_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  stale_draft_days SMALLINT NOT NULL DEFAULT 7,
  show_zero_exceptions BOOLEAN NOT NULL DEFAULT FALSE,
  reconciliation_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  budget_variance_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (stale_draft_days BETWEEN 1 AND 365)
);

CREATE TABLE IF NOT EXISTS public.accounting_management_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  comparative_start DATE NOT NULL,
  comparative_end DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'generated',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  kpi_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  trend_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  exception_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID,
  finalized_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (comparative_end >= comparative_start),
  CHECK (status IN ('generated','finalized'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_management_report_snapshot_request
  ON public.accounting_management_report_snapshots(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_management_report_snapshot_period
  ON public.accounting_management_report_snapshots(company_id,period_end DESC,generated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_management_report_snapshot_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_id UUID NOT NULL REFERENCES public.accounting_management_report_snapshots(id) ON DELETE CASCADE,
  exception_key VARCHAR(100) NOT NULL,
  category VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 0,
  amount NUMERIC(19,2),
  currency CHAR(3),
  href TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (severity IN ('high','medium','low')),
  CHECK (category IN ('ledger','receivables','payables','banking','planning','reporting')),
  CHECK (item_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_management_report_snapshot_exceptions
  ON public.accounting_management_report_snapshot_exceptions(company_id,snapshot_id,severity,category)
  WHERE deleted_at IS NULL;
`;
