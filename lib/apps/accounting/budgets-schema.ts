export const ACCOUNTING_BUDGETS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_budget_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_horizon_months INTEGER NOT NULL DEFAULT 12,
  rolling_forecast_months INTEGER NOT NULL DEFAULT 12,
  variance_alert_percent NUMERIC(9,4) NOT NULL DEFAULT 10,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (default_horizon_months BETWEEN 1 AND 60),
  CHECK (rolling_forecast_months BETWEEN 1 AND 60),
  CHECK (variance_alert_percent >= 0 AND variance_alert_percent <= 1000)
);

CREATE INDEX IF NOT EXISTS idx_accounting_budget_settings_active
  ON public.accounting_budget_settings(company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  fiscal_year_start DATE NOT NULL,
  fiscal_year_end DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CHECK (fiscal_year_end >= fiscal_year_start),
  CHECK (status IN ('open','closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_plan_name_period
  ON public.accounting_budget_plans(company_id,LOWER(name),fiscal_year_start,fiscal_year_end)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_budget_plan_period
  ON public.accounting_budget_plans(company_id,fiscal_year_start,fiscal_year_end,status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.accounting_budget_plans(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  version_type VARCHAR(20) NOT NULL DEFAULT 'budget',
  scenario VARCHAR(40) NOT NULL DEFAULT 'base',
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  as_of_date DATE,
  source_version_id UUID REFERENCES public.accounting_budget_versions(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  notes TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  published_by UUID,
  published_at TIMESTAMPTZ,
  superseded_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (version_number > 0),
  CHECK (version_type IN ('budget','forecast')),
  CHECK (scenario IN ('base','upside','downside','custom')),
  CHECK (status IN ('draft','approved','published','superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_version_number
  ON public.accounting_budget_versions(company_id,plan_id,version_type,scenario,version_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_version_request
  ON public.accounting_budget_versions(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_published
  ON public.accounting_budget_versions(company_id,plan_id,version_type,scenario)
  WHERE deleted_at IS NULL AND status='published';

CREATE INDEX IF NOT EXISTS idx_accounting_budget_version_status
  ON public.accounting_budget_versions(company_id,plan_id,status,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.accounting_budget_versions(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  assumption_type VARCHAR(30) NOT NULL,
  value NUMERIC(19,6) NOT NULL DEFAULT 0,
  effective_from DATE,
  effective_to DATE,
  name VARCHAR(255) NOT NULL,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (assumption_type IN ('fixed','growth_percent','prior_year_growth','run_rate','manual')),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS idx_accounting_budget_assumption_version
  ON public.accounting_budget_assumptions(company_id,version_id,account_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.accounting_budget_versions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  line_kind VARCHAR(20) NOT NULL DEFAULT 'planned',
  assumption_id UUID REFERENCES public.accounting_budget_assumptions(id) ON DELETE SET NULL,
  source VARCHAR(30) NOT NULL DEFAULT 'manual',
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (line_kind IN ('planned','actual_locked','forecast')),
  CHECK (source IN ('manual','copied','actuals','assumption','import'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_line
  ON public.accounting_budget_lines(company_id,version_id,account_id,period_start,line_kind)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_budget_line_period
  ON public.accounting_budget_lines(company_id,version_id,period_start,account_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.accounting_budget_plans(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.accounting_budget_versions(id) ON DELETE SET NULL,
  run_type VARCHAR(30) NOT NULL,
  as_of_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  processed_accounts INTEGER NOT NULL DEFAULT 0,
  processed_lines INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  generated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (run_type IN ('forecast_generation','variance_snapshot')),
  CHECK (status IN ('running','completed','completed_with_errors','failed')),
  CHECK (processed_accounts >= 0 AND processed_lines >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_budget_runs
  ON public.accounting_budget_runs(company_id,plan_id,started_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_budget_variance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.accounting_budget_runs(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.accounting_budget_plans(id) ON DELETE CASCADE,
  version_id UUID NOT NULL REFERENCES public.accounting_budget_versions(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  planned_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  variance_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  variance_percent NUMERIC(19,6),
  favorable BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_budget_variance_snapshot
  ON public.accounting_budget_variance_snapshots(run_id,account_id,period_start)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_budget_variance_plan
  ON public.accounting_budget_variance_snapshots(company_id,plan_id,period_start,account_id)
  WHERE deleted_at IS NULL;
`;
