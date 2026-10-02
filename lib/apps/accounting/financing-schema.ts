export const ACCOUNTING_FINANCING_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_financing_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  default_borrowing_principal_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_current_borrowing_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_lending_principal_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_current_lending_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_interest_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_interest_income_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_accrued_interest_liability_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_accrued_interest_asset_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_financing_fee_expense_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_financing_fee_income_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_day_count VARCHAR(30) NOT NULL DEFAULT 'actual_365',
  default_repayment_structure VARCHAR(30) NOT NULL DEFAULT 'annuity',
  current_classification_days INTEGER NOT NULL DEFAULT 365,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (default_day_count IN ('actual_365','actual_360','thirty_360')),
  CHECK (default_repayment_structure IN ('annuity','equal_principal','interest_only','bullet','custom')),
  CHECK (current_classification_days BETWEEN 1 AND 730)
);

CREATE INDEX IF NOT EXISTS idx_accounting_financing_settings_active
  ON public.accounting_financing_settings(company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_number VARCHAR(80) NOT NULL,
  name VARCHAR(255) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  facility_type VARCHAR(40) NOT NULL,
  counterparty_name VARCHAR(255) NOT NULL,
  counterparty_reference VARCHAR(160),
  currency CHAR(3) NOT NULL,
  principal_limit NUMERIC(19,4) NOT NULL,
  start_date DATE NOT NULL,
  maturity_date DATE NOT NULL,
  rate_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
  annual_rate NUMERIC(12,8),
  reference_rate_name VARCHAR(120),
  margin_rate NUMERIC(12,8) NOT NULL DEFAULT 0,
  day_count VARCHAR(30) NOT NULL DEFAULT 'actual_365',
  repayment_structure VARCHAR(30) NOT NULL DEFAULT 'annuity',
  payment_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  principal_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  current_principal_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  interest_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  accrued_interest_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fee_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  schedule_revision INTEGER NOT NULL DEFAULT 1,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  activated_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('borrowing','lending')),
  CHECK (facility_type IN ('term_loan','revolving_credit','overdraft','note','shareholder_loan','other')),
  CHECK (principal_limit > 0),
  CHECK (maturity_date >= start_date),
  CHECK (rate_type IN ('fixed','variable')),
  CHECK (annual_rate IS NULL OR annual_rate >= 0),
  CHECK (margin_rate >= -100 AND margin_rate <= 100),
  CHECK (
    (rate_type='fixed' AND annual_rate IS NOT NULL)
    OR
    (rate_type='variable' AND reference_rate_name IS NOT NULL)
  ),
  CHECK (day_count IN ('actual_365','actual_360','thirty_360')),
  CHECK (repayment_structure IN ('annuity','equal_principal','interest_only','bullet','custom')),
  CHECK (payment_frequency IN ('monthly','quarterly','semiannual','annual','bullet','custom')),
  CHECK (schedule_revision > 0),
  CHECK (status IN ('draft','active','closed','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_facility_number
  ON public.accounting_financing_facilities(company_id,facility_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_facility_request
  ON public.accounting_financing_facilities(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_facility_status
  ON public.accounting_financing_facilities(company_id,status,maturity_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_facility_counterparty
  ON public.accounting_financing_facilities(company_id,counterparty_name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_rate_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.accounting_financing_facilities(id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  reference_rate NUMERIC(12,8),
  margin_rate NUMERIC(12,8) NOT NULL DEFAULT 0,
  effective_annual_rate NUMERIC(12,8) NOT NULL,
  source VARCHAR(120),
  external_reference VARCHAR(255),
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (effective_annual_rate >= 0),
  CHECK (status IN ('active','superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_rate_request
  ON public.accounting_financing_rate_periods(company_id,facility_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_rate_effective
  ON public.accounting_financing_rate_periods(company_id,facility_id,effective_date DESC,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_schedule_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.accounting_financing_facilities(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  sequence INTEGER NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  opening_principal NUMERIC(19,4) NOT NULL,
  scheduled_principal NUMERIC(19,4) NOT NULL DEFAULT 0,
  scheduled_interest NUMERIC(19,4) NOT NULL DEFAULT 0,
  scheduled_fee NUMERIC(19,4) NOT NULL DEFAULT 0,
  closing_principal NUMERIC(19,4) NOT NULL,
  annual_rate NUMERIC(12,8) NOT NULL,
  day_count_days INTEGER NOT NULL,
  schedule_source VARCHAR(20) NOT NULL DEFAULT 'generated',
  request_key UUID,
  request_hash VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'projected',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (revision > 0),
  CHECK (sequence > 0),
  CHECK (period_end >= period_start),
  CHECK (due_date >= period_end),
  CHECK (opening_principal >= 0),
  CHECK (scheduled_principal >= 0),
  CHECK (scheduled_interest >= 0),
  CHECK (scheduled_fee >= 0),
  CHECK (closing_principal >= 0),
  CHECK (annual_rate >= 0),
  CHECK (day_count_days > 0),
  CHECK (schedule_source IN ('generated','custom')),
  CHECK (
    (request_key IS NULL AND request_hash IS NULL)
    OR
    (request_key IS NOT NULL AND request_hash IS NOT NULL)
  ),
  CHECK (status IN ('projected','due','settled','superseded'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_schedule_line
  ON public.accounting_financing_schedule_lines(company_id,facility_id,revision,sequence)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_schedule_due
  ON public.accounting_financing_schedule_lines(company_id,facility_id,revision,due_date)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_custom_schedule_request
  ON public.accounting_financing_schedule_lines(company_id,facility_id,request_key,sequence)
  WHERE deleted_at IS NULL
    AND request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.accounting_financing_facilities(id) ON DELETE CASCADE,
  transaction_type VARCHAR(40) NOT NULL,
  transaction_date DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  foreign_amount NUMERIC(19,4) NOT NULL,
  base_amount NUMERIC(19,2) NOT NULL,
  exchange_rate NUMERIC(20,10) NOT NULL DEFAULT 1,
  principal_foreign NUMERIC(19,4) NOT NULL DEFAULT 0,
  principal_base NUMERIC(19,2) NOT NULL DEFAULT 0,
  interest_foreign NUMERIC(19,4) NOT NULL DEFAULT 0,
  interest_base NUMERIC(19,2) NOT NULL DEFAULT 0,
  fee_foreign NUMERIC(19,4) NOT NULL DEFAULT 0,
  fee_base NUMERIC(19,2) NOT NULL DEFAULT 0,
  financial_account_id UUID REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  reference VARCHAR(255),
  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (transaction_type IN ('drawdown','principal_repayment','interest_payment','fee_charge','fee_payment','adjustment')),
  CHECK (foreign_amount >= 0),
  CHECK (base_amount >= 0),
  CHECK (exchange_rate > 0),
  CHECK (principal_foreign >= 0 AND principal_base >= 0),
  CHECK (interest_foreign >= 0 AND interest_base >= 0),
  CHECK (fee_foreign >= 0 AND fee_base >= 0),
  CHECK (status IN ('posted','reversed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_transaction_request
  ON public.accounting_financing_transactions(company_id,facility_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_transactions
  ON public.accounting_financing_transactions(company_id,facility_id,transaction_date,created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_interest_accruals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.accounting_financing_facilities(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  currency CHAR(3) NOT NULL,
  principal_foreign NUMERIC(19,4) NOT NULL,
  annual_rate NUMERIC(12,8) NOT NULL,
  day_count VARCHAR(30) NOT NULL,
  day_count_days INTEGER NOT NULL,
  foreign_interest_amount NUMERIC(19,4) NOT NULL,
  base_interest_amount NUMERIC(19,2) NOT NULL,
  exchange_rate NUMERIC(20,10) NOT NULL DEFAULT 1,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (principal_foreign >= 0),
  CHECK (annual_rate >= 0),
  CHECK (day_count IN ('actual_365','actual_360','thirty_360')),
  CHECK (day_count_days > 0),
  CHECK (foreign_interest_amount >= 0),
  CHECK (base_interest_amount >= 0),
  CHECK (exchange_rate > 0),
  CHECK (status IN ('posted','reversed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_accrual_request
  ON public.accounting_financing_interest_accruals(company_id,facility_id,request_key)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_accrual_period
  ON public.accounting_financing_interest_accruals(company_id,facility_id,period_start,period_end)
  WHERE deleted_at IS NULL
    AND status='posted';

CREATE INDEX IF NOT EXISTS idx_accounting_financing_accrual_period
  ON public.accounting_financing_interest_accruals(company_id,facility_id,period_end)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_reclassifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  facility_id UUID NOT NULL REFERENCES public.accounting_financing_facilities(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  classification_days INTEGER NOT NULL,
  target_current_principal NUMERIC(19,2) NOT NULL,
  prior_current_principal NUMERIC(19,2) NOT NULL,
  adjustment_amount NUMERIC(19,2) NOT NULL,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reversed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (classification_days BETWEEN 1 AND 730),
  CHECK (target_current_principal >= 0),
  CHECK (prior_current_principal >= 0),
  CHECK (status IN ('posted','reversed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_financing_reclassification_request
  ON public.accounting_financing_reclassifications(company_id,facility_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_financing_reclassification_as_of
  ON public.accounting_financing_reclassifications(company_id,facility_id,as_of_date DESC,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_financing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  facility_count INTEGER NOT NULL DEFAULT 0,
  accrued_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
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
  CHECK (facility_count >= 0 AND accrued_count >= 0 AND skipped_count >= 0 AND failed_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_financing_runs
  ON public.accounting_financing_runs(company_id,started_at DESC)
  WHERE deleted_at IS NULL;
`;
