export const ACCOUNTING_PARITY_HARDENING_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_document_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES public.files(id) ON DELETE RESTRICT,
  request_key UUID NOT NULL,
  extraction_type VARCHAR(40) NOT NULL DEFAULT 'vendor_bill',
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  provider VARCHAR(80),
  model VARCHAR(180),
  source_digest VARCHAR(64),
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  requested_by UUID,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (extraction_type IN ('vendor_bill','receipt','supplier_credit','invoice')),
  CHECK (status IN ('pending','extracted','reviewed','rejected','failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_document_extraction_request
  ON public.accounting_document_extractions(company_id,request_key);

CREATE INDEX IF NOT EXISTS idx_accounting_document_extractions_file
  ON public.accounting_document_extractions(company_id,file_id,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_document_extractions_status
  ON public.accounting_document_extractions(company_id,status,created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(180) NOT NULL,
  description TEXT,
  dataset VARCHAR(60) NOT NULL,
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  group_by VARCHAR(80),
  sort_spec JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (dataset IN ('general_ledger','trial_balance','receivables','payables','bank_reconciliation','budget_variance')),
  CHECK (status IN ('active','archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_custom_report_name
  ON public.accounting_custom_reports(company_id,LOWER(name))
  WHERE deleted_at IS NULL AND status='active';

CREATE INDEX IF NOT EXISTS idx_accounting_custom_reports_company
  ON public.accounting_custom_reports(company_id,status,updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_custom_report_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.accounting_custom_reports(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'completed',
  row_count INTEGER NOT NULL DEFAULT 0,
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('completed','failed')),
  CHECK (row_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_accounting_custom_report_runs
  ON public.accounting_custom_report_runs(company_id,report_id,generated_at DESC);
`;
