export const ACCOUNTING_ACCRUALS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_accrual_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_prepaid_asset_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_deferred_revenue_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_accrued_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_accrued_revenue_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_allocation_method VARCHAR(30) NOT NULL DEFAULT 'equal_periods',
  default_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  default_auto_reverse_accruals BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (default_allocation_method IN ('equal_periods','actual_days')),
  CHECK (default_frequency IN ('monthly','quarterly','annual'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_settings_active
  ON public.accounting_accrual_settings(company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_accrual_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schedule_number VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  schedule_type VARCHAR(40) NOT NULL,
  frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  allocation_method VARCHAR(30) NOT NULL DEFAULT 'equal_periods',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  total_amount NUMERIC(19,2) NOT NULL,
  balance_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  recognition_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  initial_reclassification BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reverse_accrual BOOLEAN NOT NULL DEFAULT FALSE,
  source_module VARCHAR(80),
  source_type VARCHAR(120),
  source_id VARCHAR(160),
  source_reference VARCHAR(255),
  source_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  initial_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  initial_reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  activated_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (schedule_type IN ('prepaid_expense','deferred_revenue','accrued_expense','accrued_revenue')),
  CHECK (frequency IN ('monthly','quarterly','annual')),
  CHECK (allocation_method IN ('equal_periods','actual_days')),
  CHECK (total_amount > 0),
  CHECK (end_date >= start_date),
  CHECK (status IN ('draft','active','completed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_accrual_schedule_number
  ON public.accounting_accrual_schedules(company_id,schedule_number)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_accrual_schedule_request
  ON public.accounting_accrual_schedules(company_id,request_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_schedule_status
  ON public.accounting_accrual_schedules(company_id,status,start_date,end_date)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_schedule_source
  ON public.accounting_accrual_schedules(company_id,source_module,source_type,source_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_accrual_schedule_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  schedule_id UUID NOT NULL REFERENCES public.accounting_accrual_schedules(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  posting_date DATE NOT NULL,
  amount NUMERIC(19,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  auto_reversal_date DATE,
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  failure_message VARCHAR(1000),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence > 0),
  CHECK (period_end >= period_start),
  CHECK (posting_date BETWEEN period_start AND period_end),
  CHECK (amount > 0),
  CHECK (status IN ('pending','posted','reversed','skipped','failed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_accrual_schedule_line
  ON public.accounting_accrual_schedule_lines(company_id,schedule_id,sequence)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_line_due
  ON public.accounting_accrual_schedule_lines(company_id,status,posting_date,schedule_id,sequence)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_line_reversal_due
  ON public.accounting_accrual_schedule_lines(company_id,status,auto_reversal_date,schedule_id,sequence)
  WHERE deleted_at IS NULL
    AND auto_reversal_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.accounting_accrual_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  due_count INTEGER NOT NULL DEFAULT 0,
  posted_count INTEGER NOT NULL DEFAULT 0,
  reversed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  generated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('running','completed','completed_with_errors','failed')),
  CHECK (due_count >= 0 AND posted_count >= 0 AND reversed_count >= 0 AND failed_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_accounting_accrual_runs
  ON public.accounting_accrual_runs(company_id,started_at DESC)
  WHERE deleted_at IS NULL;
`;
