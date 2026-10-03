export const ACCOUNTING_MANAGEMENT_REPORTING_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_management_report_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  current_ratio_warning NUMERIC(19,4) NOT NULL DEFAULT 1.0000,
  overdue_receivables_warning NUMERIC(19,2) NOT NULL DEFAULT 0,
  overdue_payables_warning NUMERIC(19,2) NOT NULL DEFAULT 0,
  unreconciled_lines_warning INTEGER NOT NULL DEFAULT 5,
  budget_variance_alerts_warning INTEGER NOT NULL DEFAULT 1,
  warn_negative_net_margin BOOLEAN NOT NULL DEFAULT TRUE,
  warn_negative_cash BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (current_ratio_warning >= 0),
  CHECK (overdue_receivables_warning >= 0),
  CHECK (overdue_payables_warning >= 0),
  CHECK (unreconciled_lines_warning >= 0),
  CHECK (budget_variance_alerts_warning >= 0)
);

CREATE TABLE IF NOT EXISTS public.accounting_management_report_runs (
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
  kpis_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_health_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  exception_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  generated_by UUID,
  finalized_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (comparative_end >= comparative_start),
  CHECK (status IN ('generated','finalized')),
  CHECK (exception_count >= 0 AND critical_count >= 0 AND warning_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_management_run_request
  ON public.accounting_management_report_runs(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_management_run_period
  ON public.accounting_management_report_runs(company_id,period_end DESC,generated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_management_report_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.accounting_management_report_runs(id) ON DELETE CASCADE,
  category VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  exception_code VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  source_route VARCHAR(500),
  metric_value VARCHAR(120),
  threshold_value VARCHAR(120),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (severity IN ('info','warning','critical'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_management_exception_run
  ON public.accounting_management_report_exceptions(company_id,run_id,severity,category)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_management_exception_code
  ON public.accounting_management_report_exceptions(company_id,exception_code,created_at DESC)
  WHERE deleted_at IS NULL;
`;
