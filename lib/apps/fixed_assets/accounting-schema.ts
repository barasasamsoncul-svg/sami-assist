import 'server-only';

export const FIXED_ASSETS_ACCOUNTING_SQL = `
ALTER TABLE public.fixed_assets_settings
  ADD COLUMN IF NOT EXISTS capitalization_threshold NUMERIC(19,2)
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS default_asset_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_accumulated_depreciation_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_depreciation_expense_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_capitalization_offset_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_disposal_gain_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_disposal_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_impairment_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_accumulated_impairment_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_revaluation_reserve_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_revaluation_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS default_prorata_convention VARCHAR(30)
    NOT NULL DEFAULT 'daily';

ALTER TABLE public.fixed_assets_settings
  DROP CONSTRAINT IF EXISTS fixed_assets_settings_capitalization_threshold_check,
  DROP CONSTRAINT IF EXISTS fixed_assets_settings_prorata_check;

ALTER TABLE public.fixed_assets_settings
  ADD CONSTRAINT fixed_assets_settings_capitalization_threshold_check
    CHECK (capitalization_threshold >= 0) NOT VALID,
  ADD CONSTRAINT fixed_assets_settings_prorata_check
    CHECK (default_prorata_convention IN ('daily','full_month','none')) NOT VALID;

ALTER TABLE public.asset_categories
  ADD COLUMN IF NOT EXISTS capitalization_offset_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS disposal_gain_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS disposal_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS impairment_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accumulated_impairment_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revaluation_reserve_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS revaluation_loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS prorata_convention VARCHAR(30)
    NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS declining_balance_rate NUMERIC(7,4);

ALTER TABLE public.asset_categories
  DROP CONSTRAINT IF EXISTS asset_categories_prorata_check,
  DROP CONSTRAINT IF EXISTS asset_categories_declining_rate_check;

ALTER TABLE public.asset_categories
  ADD CONSTRAINT asset_categories_prorata_check
    CHECK (prorata_convention IN ('daily','full_month','none')) NOT VALID,
  ADD CONSTRAINT asset_categories_declining_rate_check
    CHECK (
      declining_balance_rate IS NULL
      OR (
        declining_balance_rate > 0
        AND declining_balance_rate <= 100
      )
    ) NOT VALID;

ALTER TABLE public.fixed_assets
  ADD COLUMN IF NOT EXISTS category_id UUID
    REFERENCES public.asset_categories(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS in_service_date DATE,
  ADD COLUMN IF NOT EXISTS capitalization_date DATE,
  ADD COLUMN IF NOT EXISTS depreciation_start_date DATE,
  ADD COLUMN IF NOT EXISTS capitalization_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS capitalization_reversal_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accumulated_depreciation NUMERIC(19,2)
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS accumulated_impairment NUMERIC(19,2)
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revaluation_adjustment NUMERIC(19,2)
    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_depreciation_date DATE,
  ADD COLUMN IF NOT EXISTS source_module VARCHAR(80),
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS source_reference VARCHAR(255);

ALTER TABLE public.fixed_assets
  DROP CONSTRAINT IF EXISTS fixed_assets_accumulated_depreciation_check,
  DROP CONSTRAINT IF EXISTS fixed_assets_accumulated_impairment_check;

ALTER TABLE public.fixed_assets
  ADD CONSTRAINT fixed_assets_accumulated_depreciation_check
    CHECK (accumulated_depreciation >= 0) NOT VALID,
  ADD CONSTRAINT fixed_assets_accumulated_impairment_check
    CHECK (accumulated_impairment >= 0) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fixed_assets_company_code
  ON public.fixed_assets(company_id, asset_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fixed_assets_category
  ON public.fixed_assets(company_id, category_id, status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.asset_depreciation_entries
  ADD COLUMN IF NOT EXISTS period_start DATE,
  ADD COLUMN IF NOT EXISTS period_end DATE,
  ADD COLUMN IF NOT EXISTS method VARCHAR(40),
  ADD COLUMN IF NOT EXISTS journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS run_id UUID,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS request_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_depreciation_request
  ON public.asset_depreciation_entries(company_id, request_key)
  WHERE deleted_at IS NULL
    AND request_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_depreciation_period
  ON public.asset_depreciation_entries(company_id, asset_id, period_date)
  WHERE deleted_at IS NULL
    AND status <> 'reversed';

ALTER TABLE public.asset_impairments
  ADD COLUMN IF NOT EXISTS request_key UUID,
  ADD COLUMN IF NOT EXISTS loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS accumulated_impairment_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_impairment_request
  ON public.asset_impairments(company_id, request_key)
  WHERE deleted_at IS NULL
    AND request_key IS NOT NULL;

ALTER TABLE public.asset_disposals
  ADD COLUMN IF NOT EXISTS request_key UUID,
  ADD COLUMN IF NOT EXISTS carrying_value NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS accumulated_depreciation NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS accumulated_impairment NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS revaluation_adjustment NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS gain_loss NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS proceeds_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversal_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_disposal_request
  ON public.asset_disposals(company_id, request_key)
  WHERE deleted_at IS NULL
    AND request_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.asset_depreciation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_key UUID NOT NULL,
  run_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  posted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  generated_by UUID,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (candidate_count >= 0),
  CHECK (posted_count >= 0),
  CHECK (skipped_count >= 0),
  CHECK (failed_count >= 0),
  CHECK (status IN ('running','completed','completed_with_errors','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_depreciation_run_request
  ON public.asset_depreciation_runs(company_id, request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_depreciation_runs_period
  ON public.asset_depreciation_runs(company_id, period_end DESC, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.asset_depreciation_entries
  DROP CONSTRAINT IF EXISTS asset_depreciation_entries_run_id_fkey;

ALTER TABLE public.asset_depreciation_entries
  ADD CONSTRAINT asset_depreciation_entries_run_id_fkey
    FOREIGN KEY (run_id)
    REFERENCES public.asset_depreciation_runs(id)
    ON DELETE SET NULL
    NOT VALID;

CREATE TABLE IF NOT EXISTS public.asset_revaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  revaluation_date DATE NOT NULL,
  previous_carrying_value NUMERIC(19,2) NOT NULL,
  fair_value NUMERIC(19,2) NOT NULL,
  change_amount NUMERIC(19,2) NOT NULL,
  reserve_effect NUMERIC(19,2) NOT NULL DEFAULT 0,
  profit_loss_effect NUMERIC(19,2) NOT NULL DEFAULT 0,
  reserve_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  loss_account_id UUID
    REFERENCES public.accounts(id) ON DELETE RESTRICT,
  journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID
    REFERENCES public.journals(id) ON DELETE RESTRICT,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (previous_carrying_value >= 0),
  CHECK (fair_value >= 0),
  CHECK (status IN ('draft','posted','reversed','cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_revaluation_request
  ON public.asset_revaluations(company_id, request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_revaluations_asset
  ON public.asset_revaluations(company_id, asset_id, revaluation_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_source_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  source_module VARCHAR(80) NOT NULL,
  source_type VARCHAR(120) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  source_reference VARCHAR(255),
  source_amount NUMERIC(19,2),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_amount IS NULL OR source_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_asset_source_link
  ON public.asset_source_links(company_id, source_module, source_type, source_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_asset_source_links_asset
  ON public.asset_source_links(company_id, asset_id, created_at DESC)
  WHERE deleted_at IS NULL;
`;
