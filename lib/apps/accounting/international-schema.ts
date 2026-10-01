export const ACCOUNTING_INTERNATIONAL_LOCALIZATION_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_localization_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  country_code VARCHAR(2),
  jurisdiction_code VARCHAR(80),
  locale VARCHAR(32) NOT NULL DEFAULT 'en',
  accounting_framework VARCHAR(30) NOT NULL DEFAULT 'local_gaap',
  tax_authority_name VARCHAR(180),
  tax_identifier_label VARCHAR(80) NOT NULL DEFAULT 'Tax ID',
  filing_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
  filing_day SMALLINT NOT NULL DEFAULT 20,
  e_invoice_policy VARCHAR(20) NOT NULL DEFAULT 'optional',
  preferred_e_invoice_network VARCHAR(40),
  pack_key VARCHAR(80),
  pack_version VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (accounting_framework IN ('ifrs','local_gaap','us_gaap','other')),
  CHECK (filing_frequency IN ('monthly','quarterly','annual','custom')),
  CHECK (filing_day BETWEEN 1 AND 28),
  CHECK (e_invoice_policy IN ('none','optional','required')),
  CHECK (preferred_e_invoice_network IS NULL OR preferred_e_invoice_network IN ('peppol','custom_edi')),
  CHECK (status IN ('active','archived'))
);

CREATE TABLE IF NOT EXISTS public.accounting_localization_report_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(60) NOT NULL,
  label VARCHAR(180) NOT NULL,
  description TEXT,
  sequence INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence >= 0),
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_localization_box_code
  ON public.accounting_localization_report_boxes(company_id,code)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_localization_boxes_order
  ON public.accounting_localization_report_boxes(company_id,status,sequence,code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_localization_report_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  box_id UUID NOT NULL REFERENCES public.accounting_localization_report_boxes(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  direction VARCHAR(20) NOT NULL DEFAULT 'any',
  amount_field VARCHAR(30) NOT NULL DEFAULT 'tax',
  multiplier NUMERIC(9,4) NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('sale','purchase','withholding','any')),
  CHECK (amount_field IN ('taxable','tax','recoverable','nonrecoverable')),
  CHECK (multiplier BETWEEN -1000 AND 1000),
  CHECK (multiplier <> 0),
  CHECK (status IN ('active','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_localization_report_rule
  ON public.accounting_localization_report_rules(company_id,box_id,tax_code_id,direction,amount_field)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_localization_rules_tax
  ON public.accounting_localization_report_rules(company_id,tax_code_id,status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_localization_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  country_code VARCHAR(2),
  jurisdiction_code VARCHAR(80),
  currency VARCHAR(3) NOT NULL,
  pack_key VARCHAR(80),
  pack_version VARCHAR(40),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  totals JSONB NOT NULL DEFAULT '{}'::jsonb,
  diagnostics JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_by UUID,
  finalized_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finalized_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (period_end >= period_start),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (status IN ('draft','finalized','superseded'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_localization_runs_period
  ON public.accounting_localization_report_runs(company_id,period_end DESC,generated_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_localization_pack_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  pack_key VARCHAR(80) NOT NULL,
  pack_version VARCHAR(40) NOT NULL,
  country_code VARCHAR(2),
  action VARCHAR(30) NOT NULL,
  installed_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (action IN ('installed','updated','reinstalled'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_localization_pack_history
  ON public.accounting_localization_pack_history(company_id,created_at DESC);
`;
