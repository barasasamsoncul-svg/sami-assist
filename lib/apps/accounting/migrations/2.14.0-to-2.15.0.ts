import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.accounting_settings
    ADD COLUMN IF NOT EXISTS payment_outstanding_receipts_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_outstanding_payments_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_unapplied_receipts_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_unapplied_payments_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_fee_expense_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS payment_dispute_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT;

  CREATE TABLE IF NOT EXISTS public.accounting_payment_account_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    payment_account_id UUID NOT NULL,
    financial_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
    fee_expense_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_account_mapping
    ON public.accounting_payment_account_mappings(company_id,payment_account_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_payment_mapping_financial
    ON public.accounting_payment_account_mappings(company_id,financial_account_id,active)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_payment_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    business_payment_id UUID NOT NULL,
    payment_account_id UUID,
    direction VARCHAR(20) NOT NULL,
    payment_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL,
    gross_base_amount NUMERIC(19,2) NOT NULL,
    source_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    posted_journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    posted_by UUID NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (direction IN ('inbound','outbound')),
    CHECK (gross_base_amount > 0),
    CHECK (status IN ('posted','reversed'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_business_payment_posting
    ON public.accounting_payment_postings(company_id,business_payment_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_payment_postings_account
    ON public.accounting_payment_postings(
      company_id,payment_account_id,status,payment_date DESC
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_payment_allocation_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    payment_allocation_id UUID NOT NULL,
    business_payment_id UUID NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id UUID NOT NULL,
    direction VARCHAR(20) NOT NULL,
    amount_base NUMERIC(19,2) NOT NULL,
    source_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    posted_journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    posted_by UUID NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (direction IN ('inbound','outbound')),
    CHECK (amount_base > 0),
    CHECK (status IN ('posted','reversed'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_allocation_posting
    ON public.accounting_payment_allocation_postings(company_id,payment_allocation_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_payment_settlement_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settlement_number VARCHAR(100) NOT NULL,
    request_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    payment_account_id UUID NOT NULL,
    financial_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
    settlement_date DATE NOT NULL,
    currency VARCHAR(3) NOT NULL,
    inbound_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    outbound_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    fee_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    net_amount NUMERIC(19,2) NOT NULL,
    provider_reference VARCHAR(255),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    posted_journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    posted_by UUID NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (inbound_amount >= 0),
    CHECK (outbound_amount >= 0),
    CHECK (fee_amount >= 0),
    CHECK (status IN ('posted','reversed')),
    CHECK (net_amount = inbound_amount - outbound_amount - fee_amount)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_settlement_number
    ON public.accounting_payment_settlement_batches(company_id,settlement_number)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_settlement_request
    ON public.accounting_payment_settlement_batches(company_id,request_key)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_payment_settlements_account
    ON public.accounting_payment_settlement_batches(
      company_id,payment_account_id,settlement_date DESC
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_payment_settlement_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    settlement_batch_id UUID NOT NULL
      REFERENCES public.accounting_payment_settlement_batches(id) ON DELETE CASCADE,
    payment_posting_id UUID NOT NULL
      REFERENCES public.accounting_payment_postings(id) ON DELETE RESTRICT,
    business_payment_id UUID NOT NULL,
    direction VARCHAR(20) NOT NULL,
    settlement_amount NUMERIC(19,2) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (direction IN ('inbound','outbound')),
    CHECK (settlement_amount > 0),
    CHECK (sequence >= 0)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_settlement_item
    ON public.accounting_payment_settlement_items(
      company_id,settlement_batch_id,payment_posting_id
    )
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_payment_settlement_payment
    ON public.accounting_payment_settlement_items(
      company_id,payment_posting_id
    )
    WHERE deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.accounting_payment_unsettled_balances AS
  SELECT
    p.company_id,
    p.id AS payment_posting_id,
    p.business_payment_id,
    p.payment_account_id,
    p.direction,
    p.payment_date,
    p.currency,
    p.gross_base_amount,
    COALESCE(
      SUM(i.settlement_amount) FILTER (
        WHERE b.status='posted'
          AND b.deleted_at IS NULL
          AND i.deleted_at IS NULL
      ),
      0
    )::numeric(19,2) AS settled_base_amount,
    GREATEST(
      p.gross_base_amount -
      COALESCE(
        SUM(i.settlement_amount) FILTER (
          WHERE b.status='posted'
            AND b.deleted_at IS NULL
            AND i.deleted_at IS NULL
        ),
        0
      ),
      0
    )::numeric(19,2) AS unsettled_base_amount
  FROM public.accounting_payment_postings p
  LEFT JOIN public.accounting_payment_settlement_items i
    ON i.company_id=p.company_id
   AND i.payment_posting_id=p.id
   AND i.deleted_at IS NULL
  LEFT JOIN public.accounting_payment_settlement_batches b
    ON b.company_id=i.company_id
   AND b.id=i.settlement_batch_id
  WHERE p.deleted_at IS NULL
    AND p.status='posted'
  GROUP BY
    p.company_id,
    p.id,
    p.business_payment_id,
    p.payment_account_id,
    p.direction,
    p.payment_date,
    p.currency,
    p.gross_base_amount;
`;


export const ACCOUNTING_2_14_0_TO_2_15_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.14.0-to-2.15.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.14.0',
    toVersion:
      '2.15.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
