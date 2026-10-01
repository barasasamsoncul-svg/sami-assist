import 'server-only';

export const ACCOUNTING_TAX_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
  direction VARCHAR(20) NOT NULL DEFAULT 'both',
  rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  calculation VARCHAR(20) NOT NULL DEFAULT 'exclusive',
  recoverable_rate NUMERIC(9,4) NOT NULL DEFAULT 100,
  input_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  output_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  nonrecoverable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  country_code VARCHAR(2),
  jurisdiction_code VARCHAR(80),
  valid_from DATE,
  valid_to DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (tax_type IN ('vat','sales_tax','withholding','excise','levy','other')),
  CHECK (direction IN ('input','output','both')),
  CHECK (rate >= 0 AND rate <= 100),
  CHECK (calculation IN ('exclusive','inclusive')),
  CHECK (recoverable_rate >= 0 AND recoverable_rate <= 100),
  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (status IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_codes_company_code
  ON public.accounting_tax_codes(company_id, LOWER(code))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_tax_codes_company_status
  ON public.accounting_tax_codes(company_id, status, tax_type, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  calculation VARCHAR(20) NOT NULL DEFAULT 'exclusive',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (calculation IN ('exclusive','inclusive')),
  CHECK (status IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_groups_company_code
  ON public.accounting_tax_groups(company_id, LOWER(code))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_group_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.accounting_tax_groups(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  sequence_no INTEGER NOT NULL DEFAULT 10,
  compound BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence_no > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_tax_group_component
  ON public.accounting_tax_group_components(company_id, group_id, tax_code_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_tax_group_components_order
  ON public.accounting_tax_group_components(company_id, group_id, sequence_no, id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_vendor_line_tax_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE CASCADE,
  document_line_id UUID NOT NULL REFERENCES public.accounting_vendor_document_lines(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  tax_group_id UUID REFERENCES public.accounting_tax_groups(id) ON DELETE SET NULL,
  sequence_no INTEGER NOT NULL DEFAULT 10,
  compound BOOLEAN NOT NULL DEFAULT FALSE,
  tax_code_snapshot VARCHAR(80) NOT NULL,
  tax_name_snapshot VARCHAR(160) NOT NULL,
  rate_snapshot NUMERIC(9,4) NOT NULL,
  recoverable_rate_snapshot NUMERIC(9,4) NOT NULL,
  taxable_amount NUMERIC(19,4) NOT NULL,
  tax_amount NUMERIC(19,4) NOT NULL,
  recoverable_tax_amount NUMERIC(19,4) NOT NULL,
  nonrecoverable_tax_amount NUMERIC(19,4) NOT NULL,
  calculation VARCHAR(20) NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence_no > 0),
  CHECK (rate_snapshot >= 0 AND rate_snapshot <= 100),
  CHECK (recoverable_rate_snapshot >= 0 AND recoverable_rate_snapshot <= 100),
  CHECK (taxable_amount >= 0),
  CHECK (tax_amount >= 0),
  CHECK (recoverable_tax_amount >= 0),
  CHECK (nonrecoverable_tax_amount >= 0),
  CHECK (tax_amount = recoverable_tax_amount + nonrecoverable_tax_amount),
  CHECK (calculation IN ('exclusive','inclusive'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_line_tax_document
  ON public.accounting_vendor_line_tax_components(company_id, document_id, document_line_id, sequence_no, id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_tax_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  adjustment_date DATE NOT NULL,
  direction VARCHAR(20) NOT NULL,
  amount NUMERIC(19,2) NOT NULL,
  offset_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  reason VARCHAR(500) NOT NULL,
  reference VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversed_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  created_by UUID,
  approved_by UUID,
  posted_by UUID,
  reversed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('input','output')),
  CHECK (amount > 0),
  CHECK (status IN ('draft','approved','posted','reversed','cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_adjustments_company_date
  ON public.accounting_tax_adjustments(company_id, adjustment_date DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE VIEW public.accounting_purchase_tax_register AS
SELECT
  d.company_id,
  d.id AS document_id,
  d.document_number,
  d.document_type,
  d.document_date,
  d.vendor_id,
  t.tax_code_id,
  t.tax_code_snapshot,
  t.tax_name_snapshot,
  t.rate_snapshot,
  t.recoverable_rate_snapshot,
  CASE WHEN d.document_type='credit_note' THEN -t.taxable_amount ELSE t.taxable_amount END::numeric(19,4) AS taxable_amount,
  CASE WHEN d.document_type='credit_note' THEN -t.tax_amount ELSE t.tax_amount END::numeric(19,4) AS tax_amount,
  CASE WHEN d.document_type='credit_note' THEN -t.recoverable_tax_amount ELSE t.recoverable_tax_amount END::numeric(19,4) AS recoverable_tax_amount,
  CASE WHEN d.document_type='credit_note' THEN -t.nonrecoverable_tax_amount ELSE t.nonrecoverable_tax_amount END::numeric(19,4) AS nonrecoverable_tax_amount,
  d.currency,
  d.exchange_rate,
  d.base_currency
FROM public.accounting_vendor_line_tax_components t
JOIN public.accounting_vendor_documents d
  ON d.company_id=t.company_id
 AND d.id=t.document_id
WHERE t.deleted_at IS NULL
  AND d.deleted_at IS NULL
  AND d.status IN ('posted','partially_settled','settled');
`;
