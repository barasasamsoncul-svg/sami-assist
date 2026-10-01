export const ACCOUNTING_FX_SQL = `
ALTER TABLE public.accounting_settings
  ADD COLUMN IF NOT EXISTS fx_unrealized_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS fx_unrealized_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.accounting_fx_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  base_currency VARCHAR(3) NOT NULL,
  rate_source_mode VARCHAR(20) NOT NULL DEFAULT 'mixed',
  default_rate_type VARCHAR(20) NOT NULL DEFAULT 'spot',
  auto_reverse_revaluation BOOLEAN NOT NULL DEFAULT FALSE,
  revaluation_reversal_days SMALLINT NOT NULL DEFAULT 1,
  unrealized_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  unrealized_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  provider_key VARCHAR(80),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (base_currency ~ '^[A-Z]{3}$'),
  CHECK (rate_source_mode IN ('manual','invoicing','provider','mixed')),
  CHECK (default_rate_type IN ('spot','closing','average')),
  CHECK (revaluation_reversal_days BETWEEN 1 AND 31),
  CHECK (status IN ('active','archived'))
);

CREATE TABLE IF NOT EXISTS public.accounting_fx_currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(3) NOT NULL,
  name VARCHAR(120) NOT NULL,
  symbol VARCHAR(16),
  decimal_places SMALLINT NOT NULL DEFAULT 2,
  is_base BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (code ~ '^[A-Z]{3}$'),
  CHECK (decimal_places BETWEEN 0 AND 6),
  UNIQUE(company_id,code)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_fx_base_currency
  ON public.accounting_fx_currencies(company_id)
  WHERE is_base=TRUE;

CREATE TABLE IF NOT EXISTS public.accounting_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  rate_to_base NUMERIC(19,8) NOT NULL,
  rate_type VARCHAR(20) NOT NULL DEFAULT 'spot',
  effective_date DATE NOT NULL,
  source_type VARCHAR(30) NOT NULL DEFAULT 'manual',
  source_name VARCHAR(120),
  external_reference VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (base_currency ~ '^[A-Z]{3}$'),
  CHECK (currency <> base_currency),
  CHECK (rate_to_base > 0),
  CHECK (rate_type IN ('spot','closing','average')),
  CHECK (source_type IN ('manual','provider','import','invoicing')),
  UNIQUE(company_id,currency,base_currency,rate_type,effective_date,source_type)
);
CREATE INDEX IF NOT EXISTS idx_accounting_exchange_rates_lookup
  ON public.accounting_exchange_rates(company_id,currency,base_currency,rate_type,effective_date DESC)
  WHERE is_active=TRUE;

CREATE TABLE IF NOT EXISTS public.accounting_fx_financial_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
  source_type VARCHAR(80) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  source_event_key VARCHAR(255) NOT NULL,
  movement_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL,
  foreign_amount NUMERIC(19,4) NOT NULL,
  base_amount NUMERIC(19,2) NOT NULL,
  rate_to_base NUMERIC(19,8) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted',
  reversal_of_id UUID REFERENCES public.accounting_fx_financial_movements(id) ON DELETE RESTRICT,
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (rate_to_base > 0),
  CHECK (status IN ('posted','reversed')),
  CHECK (foreign_amount <> 0),
  CHECK (base_amount <> 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_fx_financial_event
  ON public.accounting_fx_financial_movements(company_id,bank_account_id,source_event_key);
CREATE INDEX IF NOT EXISTS idx_accounting_fx_financial_account_date
  ON public.accounting_fx_financial_movements(company_id,bank_account_id,movement_date,id);

CREATE TABLE IF NOT EXISTS public.accounting_fx_revaluation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  rate_type VARCHAR(20) NOT NULL DEFAULT 'closing',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  source_count INTEGER NOT NULL DEFAULT 0,
  total_gain NUMERIC(19,2) NOT NULL DEFAULT 0,
  total_loss NUMERIC(19,2) NOT NULL DEFAULT 0,
  net_adjustment NUMERIC(19,2) NOT NULL DEFAULT 0,
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  generated_by UUID,
  posted_by UUID,
  reversed_by UUID,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_at TIMESTAMPTZ,
  reversed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (base_currency ~ '^[A-Z]{3}$'),
  CHECK (rate_type IN ('spot','closing','average')),
  CHECK (status IN ('draft','posted','reversed','cancelled')),
  CHECK (source_count >= 0),
  CHECK (total_gain >= 0),
  CHECK (total_loss >= 0),
  UNIQUE(company_id,as_of_date,rate_type)
);

CREATE TABLE IF NOT EXISTS public.accounting_fx_revaluation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  run_id UUID NOT NULL REFERENCES public.accounting_fx_revaluation_runs(id) ON DELETE CASCADE,
  source_type VARCHAR(20) NOT NULL,
  source_id VARCHAR(160) NOT NULL,
  source_reference VARCHAR(255),
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  position_nature VARCHAR(20) NOT NULL,
  currency VARCHAR(3) NOT NULL,
  foreign_balance NUMERIC(19,4) NOT NULL,
  historical_base_balance NUMERIC(19,2) NOT NULL,
  closing_rate NUMERIC(19,8) NOT NULL,
  revalued_base_balance NUMERIC(19,2) NOT NULL,
  adjustment_amount NUMERIC(19,2) NOT NULL,
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_type IN ('receivable','payable','bank')),
  CHECK (position_nature IN ('asset','liability')),
  CHECK (currency ~ '^[A-Z]{3}$'),
  CHECK (closing_rate > 0),
  UNIQUE(company_id,run_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_fx_revaluation_lines_run
  ON public.accounting_fx_revaluation_lines(company_id,run_id,source_type,currency);

ALTER TABLE public.accounting_fx_settings
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_fx_currencies
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_exchange_rates
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_fx_financial_movements
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_fx_revaluation_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_fx_revaluation_lines
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_payment_batches
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS base_gross_amount NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS rate_source VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rate_date DATE,
  ADD COLUMN IF NOT EXISTS fx_managed BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.accounting_payment_allocations
  ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS bill_amount NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS payment_exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS bill_exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS base_payment_amount NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS base_bill_amount NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS realized_fx_amount NUMERIC(19,2) NOT NULL DEFAULT 0;

ALTER TABLE public.accounting_statement_import_batches
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3);

ALTER TABLE public.accounting_statement_import_rows
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(19,2);

ALTER TABLE public.accounting_bank_statement_lines
  ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(19,2);

ALTER TABLE public.accounting_reconciliations
  ADD COLUMN IF NOT EXISTS statement_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS statement_foreign_amount NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS statement_exchange_rate NUMERIC(19,8);

ALTER TABLE public.accounting_internal_transfers
  ADD COLUMN IF NOT EXISTS source_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS destination_currency VARCHAR(3),
  ADD COLUMN IF NOT EXISTS source_amount NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS destination_amount NUMERIC(19,4),
  ADD COLUMN IF NOT EXISTS source_exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS destination_exchange_rate NUMERIC(19,8),
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(19,2),
  ADD COLUMN IF NOT EXISTS realized_fx_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fx_managed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE OR REPLACE VIEW public.accounting_financial_account_balances AS
WITH ledger AS (
  SELECT
    b.company_id,
    b.id AS bank_account_id,
    b.ledger_account_id,
    COALESCE(SUM(CASE
      WHEN j.status='posted' AND j.deleted_at IS NULL AND l.deleted_at IS NULL
      THEN l.debit-l.credit ELSE 0 END),0)::numeric(19,2) AS base_book_balance
  FROM public.accounting_bank_accounts b
  LEFT JOIN public.journal_lines l
    ON l.company_id=b.company_id AND l.account_id=b.ledger_account_id
  LEFT JOIN public.journals j
    ON j.company_id=l.company_id AND j.id=l.journal_id
  WHERE b.deleted_at IS NULL
  GROUP BY b.company_id,b.id,b.ledger_account_id
), foreign_moves AS (
  SELECT
    m.company_id,m.bank_account_id,
    COALESCE(SUM(CASE WHEN m.status='posted' THEN m.foreign_amount ELSE 0 END),0)::numeric(19,4) AS foreign_balance
  FROM public.accounting_fx_financial_movements m
  GROUP BY m.company_id,m.bank_account_id
)
SELECT
  b.company_id,
  b.id AS bank_account_id,
  b.ledger_account_id,
  b.account_type,
  b.currency,
  COALESCE(l.base_book_balance,0)::numeric(19,2) AS book_balance,
  COALESCE(l.base_book_balance,0)::numeric(19,2) AS base_book_balance,
  CASE
    WHEN base.code IS NULL OR UPPER(b.currency)=UPPER(base.code)
      THEN COALESCE(l.base_book_balance,0)::numeric(19,4)
    ELSE COALESCE(f.foreign_balance,0)::numeric(19,4)
  END AS foreign_balance
FROM public.accounting_bank_accounts b
LEFT JOIN public.accounting_fx_currencies base
  ON base.company_id=b.company_id
 AND base.is_base=TRUE
LEFT JOIN ledger l ON l.company_id=b.company_id AND l.bank_account_id=b.id
LEFT JOIN foreign_moves f ON f.company_id=b.company_id AND f.bank_account_id=b.id
WHERE b.deleted_at IS NULL;
`;
