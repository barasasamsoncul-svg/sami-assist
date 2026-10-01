export const ACCOUNTING_KENYA_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_kenya_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  vat_registered BOOLEAN NOT NULL DEFAULT TRUE,
  vat_return_day SMALLINT NOT NULL DEFAULT 20,
  etims_sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_etims_sync_at TIMESTAMPTZ,
  last_sync_status VARCHAR(20) NOT NULL DEFAULT 'idle',
  last_sync_inserted INTEGER NOT NULL DEFAULT 0,
  last_sync_unmapped INTEGER NOT NULL DEFAULT 0,
  last_sync_error TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (vat_return_day BETWEEN 1 AND 28),
  CHECK (last_sync_status IN ('idle','success','partial','error')),
  CHECK (last_sync_inserted >= 0),
  CHECK (last_sync_unmapped >= 0)
);

CREATE TABLE IF NOT EXISTS public.accounting_kenya_tax_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  tax_code_id UUID NOT NULL REFERENCES public.accounting_tax_codes(id) ON DELETE RESTRICT,
  etims_tax_type_code VARCHAR(1) NOT NULL,
  effective_from DATE,
  effective_to DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_legacy BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (etims_tax_type_code IN ('A','B','C','D','E')),
  CHECK (status IN ('active','archived')),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_kenya_tax_mapping_tax
  ON public.accounting_kenya_tax_mappings(company_id,tax_code_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_kenya_tax_mapping_etims_active
  ON public.accounting_kenya_tax_mappings(company_id,etims_tax_type_code)
  WHERE deleted_at IS NULL AND status='active';

CREATE TABLE IF NOT EXISTS public.accounting_kenya_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  inserted_count INTEGER NOT NULL DEFAULT 0,
  replayed_count INTEGER NOT NULL DEFAULT 0,
  unmapped_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('running','success','partial','error')),
  CHECK (inserted_count >= 0),
  CHECK (replayed_count >= 0),
  CHECK (unmapped_count >= 0),
  CHECK (source_count >= 0)
);
CREATE INDEX IF NOT EXISTS idx_accounting_kenya_sync_runs_company
  ON public.accounting_kenya_sync_runs(company_id,started_at DESC);

ALTER TABLE public.accounting_kenya_settings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_kenya_sync_runs
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS entry_effect SMALLINT NOT NULL DEFAULT 1 CHECK (entry_effect IN (-1,1)),
  ADD COLUMN IF NOT EXISTS authority VARCHAR(40),
  ADD COLUMN IF NOT EXISTS authority_reference VARCHAR(180),
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_accounting_tax_ledger_authority
  ON public.accounting_tax_ledger_entries(company_id,authority,transaction_date)
  WHERE deleted_at IS NULL AND authority IS NOT NULL;
`;
