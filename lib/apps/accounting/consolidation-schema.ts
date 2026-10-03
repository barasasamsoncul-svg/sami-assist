export const ACCOUNTING_CONSOLIDATION_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_consolidation_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  require_complete_mapping BOOLEAN NOT NULL DEFAULT FALSE,
  default_presentation_currency CHAR(3),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(80) NOT NULL,
  presentation_currency CHAR(3) NOT NULL,
  translation_adjustment_code VARCHAR(80) NOT NULL DEFAULT 'CTA',
  translation_adjustment_name VARCHAR(255) NOT NULL DEFAULT 'Cumulative translation adjustment',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE(id,company_id),
  CHECK (status IN ('draft','active','closed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_group_code
  ON public.accounting_consolidation_groups(company_id,LOWER(code))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_group_request
  ON public.accounting_consolidation_groups(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_group_status
  ON public.accounting_consolidation_groups(company_id,status,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  member_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  consolidation_method VARCHAR(20) NOT NULL DEFAULT 'full',
  ownership_percent NUMERIC(9,4) NOT NULL DEFAULT 100,
  effective_from DATE,
  effective_to DATE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (consolidation_method IN ('full','proportional')),
  CHECK (ownership_percent > 0 AND ownership_percent <= 100),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_member
  ON public.accounting_consolidation_members(group_id,member_company_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_member_active
  ON public.accounting_consolidation_members(company_id,group_id,enabled,member_company_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_account_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  member_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  consolidated_code VARCHAR(80) NOT NULL,
  consolidated_name VARCHAR(255) NOT NULL,
  consolidated_type VARCHAR(50) NOT NULL,
  sign_multiplier SMALLINT NOT NULL DEFAULT 1,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (sign_multiplier IN (-1,1))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_account_mapping
  ON public.accounting_consolidation_account_mappings(group_id,member_company_id,source_account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_mapping_code
  ON public.accounting_consolidation_account_mappings(company_id,group_id,consolidated_code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  member_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  rate_date DATE NOT NULL,
  rate_type VARCHAR(20) NOT NULL,
  source_currency CHAR(3) NOT NULL,
  presentation_currency CHAR(3) NOT NULL,
  rate NUMERIC(19,8) NOT NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (rate_type IN ('closing','average','historical')),
  CHECK (rate > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_rate
  ON public.accounting_consolidation_rates(group_id,member_company_id,rate_date,rate_type)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_rate_lookup
  ON public.accounting_consolidation_rates(company_id,group_id,member_company_id,rate_type,rate_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_eliminations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  elimination_date DATE NOT NULL,
  reference VARCHAR(160),
  name VARCHAR(255) NOT NULL,
  debit_code VARCHAR(80) NOT NULL,
  debit_name VARCHAR(255) NOT NULL,
  debit_type VARCHAR(50) NOT NULL,
  credit_code VARCHAR(80) NOT NULL,
  credit_name VARCHAR(255) NOT NULL,
  credit_type VARCHAR(50) NOT NULL,
  amount NUMERIC(19,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  notes TEXT,
  finalized_by UUID,
  finalized_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (amount > 0),
  CHECK (status IN ('draft','finalized'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_elimination_request
  ON public.accounting_consolidation_eliminations(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_elimination_period
  ON public.accounting_consolidation_eliminations(company_id,group_id,elimination_date,status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  presentation_currency CHAR(3) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  source_companies INTEGER NOT NULL DEFAULT 0,
  source_accounts INTEGER NOT NULL DEFAULT 0,
  missing_mappings INTEGER NOT NULL DEFAULT 0,
  missing_rates INTEGER NOT NULL DEFAULT 0,
  total_debit NUMERIC(19,2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(19,2) NOT NULL DEFAULT 0,
  translation_adjustment NUMERIC(19,2) NOT NULL DEFAULT 0,
  generated_by UUID,
  finalized_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (period_end >= period_start),
  CHECK (status IN ('running','completed','finalized','failed')),
  CHECK (source_companies >= 0 AND source_accounts >= 0 AND missing_mappings >= 0 AND missing_rates >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_consolidation_run_request
  ON public.accounting_consolidation_runs(company_id,request_key)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_run_period
  ON public.accounting_consolidation_runs(company_id,group_id,period_end DESC,started_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_consolidation_run_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.accounting_consolidation_runs(id) ON DELETE CASCADE,
  group_id UUID NOT NULL,
  line_kind VARCHAR(20) NOT NULL,
  member_company_id UUID REFERENCES public.companies(id) ON DELETE RESTRICT,
  source_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  consolidated_code VARCHAR(80) NOT NULL,
  consolidated_name VARCHAR(255) NOT NULL,
  consolidated_type VARCHAR(50) NOT NULL,
  source_currency CHAR(3),
  source_opening NUMERIC(19,2) NOT NULL DEFAULT 0,
  source_period NUMERIC(19,2) NOT NULL DEFAULT 0,
  source_closing NUMERIC(19,2) NOT NULL DEFAULT 0,
  applied_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
  ownership_percent NUMERIC(9,4) NOT NULL DEFAULT 100,
  translated_opening NUMERIC(19,2) NOT NULL DEFAULT 0,
  translated_period NUMERIC(19,2) NOT NULL DEFAULT 0,
  translated_closing NUMERIC(19,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  FOREIGN KEY (group_id,company_id)
    REFERENCES public.accounting_consolidation_groups(id,company_id)
    ON DELETE CASCADE,
  CHECK (line_kind IN ('source','elimination','translation_adjustment')),
  CHECK (applied_rate > 0),
  CHECK (ownership_percent > 0 AND ownership_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_run_lines
  ON public.accounting_consolidation_run_lines(company_id,run_id,consolidated_code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_consolidation_run_lines_member
  ON public.accounting_consolidation_run_lines(company_id,run_id,member_company_id,source_account_id)
  WHERE deleted_at IS NULL;
`;
