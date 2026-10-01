export const ACCOUNTING_TAX_SQL = \`
CREATE TABLE IF NOT EXISTS public.accounting_tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(180) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'sale',
  behavior VARCHAR(20) NOT NULL DEFAULT 'add',
  computation VARCHAR(20) NOT NULL DEFAULT 'percent',
  rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  fixed_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  price_included BOOLEAN NOT NULL DEFAULT FALSE,
  include_base_amount BOOLEAN NOT NULL DEFAULT FALSE,
  recoverable_percent NUMERIC(7,4) NOT NULL DEFAULT 100,
  tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  recoverable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  jurisdiction_code VARCHAR(80),
  reporting_code VARCHAR(80),
  effective_from DATE,
  effective_to DATE,
  sequence INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (scope IN ('sale','purchase','both','withholding')),
  CHECK (behavior IN ('add','withhold')),
  CHECK (computation IN ('percent','fixed')),
  CHECK (rate >= 0 AND rate <= 100),
  CHECK (fixed_amount >= 0),
  CHECK (recoverable_percent >= 0 AND recoverable_percent <= 100),
  CHECK (sequence >= 0),
  CHECK (status IN ('active','archived')),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (behavior <> 'withhold' OR price_included = FALSE),
  CHECK (price_included = FALSE OR computation = 'percent')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_codes_company_code
  ON public.accounting_tax_codes(company_id,code) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_tax_codes_effective
  ON public.accounting_tax_codes(company_id,status,effective_from,effective_to,sequence) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(180) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'sale',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (scope IN ('sale','purchase','both','withholding')),
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_groups_company_code
  ON public.accounting_tax_groups(company_id,code) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_group_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.accounting_tax_groups(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_group_code
  ON public.accounting_tax_group_lines(company_id,group_id,tax_code_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_tax_group_lines_order
  ON public.accounting_tax_group_lines(company_id,group_id,sequence,id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  source_module VARCHAR(80) NOT NULL,
  source_type VARCHAR(120) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  source_event_key VARCHAR(255) NOT NULL,
  transaction_date DATE NOT NULL,
  taxable_amount NUMERIC(19,2) NOT NULL,
  tax_amount NUMERIC(19,2) NOT NULL,
  recoverable_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  nonrecoverable_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL,
  direction VARCHAR(20) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('sale','purchase','withholding')),
  CHECK (taxable_amount >= 0),
  CHECK (tax_amount >= 0),
  CHECK (recoverable_amount >= 0),
  CHECK (nonrecoverable_amount >= 0),
  CHECK (recoverable_amount + nonrecoverable_amount = tax_amount)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_ledger_source
  ON public.accounting_tax_ledger_entries(company_id,source_module,source_event_key,tax_code_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_tax_ledger_period
  ON public.accounting_tax_ledger_entries(company_id,transaction_date,tax_code_id) WHERE deleted_at IS NULL;

ALTER TABLE public.accounting_vendor_document_lines
  ADD COLUMN IF NOT EXISTS tax_code_id UUID REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS recoverable_tax_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS nonrecoverable_tax_amount NUMERIC(19,2) NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_accounting_vendor_lines_tax
  ON public.accounting_vendor_document_lines(company_id,tax_code_id)
  WHERE deleted_at IS NULL AND tax_code_id IS NOT NULL;
\`;
