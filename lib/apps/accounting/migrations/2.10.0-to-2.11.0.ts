import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.accounting_settings
    ADD COLUMN IF NOT EXISTS default_expense_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS employee_expense_payable_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS corporate_card_clearing_account_id UUID
      REFERENCES public.accounts(id) ON DELETE RESTRICT;

  CREATE TABLE IF NOT EXISTS public.accounting_expense_category_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    category_id UUID NOT NULL,
    expense_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    input_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    recoverable_tax_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (recoverable_tax_percent >= 0 AND recoverable_tax_percent <= 100)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expense_category_mapping
    ON public.accounting_expense_category_mappings(company_id, category_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_expense_report_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    expense_report_id UUID NOT NULL,
    employee_reference UUID,
    settlement_mode VARCHAR(30) NOT NULL,
    settlement_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    base_currency VARCHAR(3) NOT NULL,
    gross_base_amount NUMERIC(19,2) NOT NULL,
    net_expense_base_amount NUMERIC(19,2) NOT NULL,
    recoverable_tax_base_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    posting_date DATE NOT NULL,
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
    CHECK (settlement_mode IN ('employee_reimbursement','company_paid','corporate_card')),
    CHECK (gross_base_amount >= 0),
    CHECK (net_expense_base_amount >= 0),
    CHECK (recoverable_tax_base_amount >= 0),
    CHECK (gross_base_amount = net_expense_base_amount + recoverable_tax_base_amount),
    CHECK (status IN ('posted','reversed'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expense_report_posting
    ON public.accounting_expense_report_postings(company_id, expense_report_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_expense_report_postings_status
    ON public.accounting_expense_report_postings(company_id, status, posting_date)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_expense_line_postings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    report_posting_id UUID NOT NULL REFERENCES public.accounting_expense_report_postings(id) ON DELETE CASCADE,
    expense_report_line_id UUID NOT NULL,
    category_id UUID,
    expense_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    input_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    gross_base_amount NUMERIC(19,2) NOT NULL,
    expense_base_amount NUMERIC(19,2) NOT NULL,
    recoverable_tax_base_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (gross_base_amount > 0),
    CHECK (expense_base_amount >= 0),
    CHECK (recoverable_tax_base_amount >= 0),
    CHECK (gross_base_amount = expense_base_amount + recoverable_tax_base_amount)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expense_line_posting
    ON public.accounting_expense_line_postings(company_id, expense_report_line_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_expense_reimbursements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    report_posting_id UUID NOT NULL REFERENCES public.accounting_expense_report_postings(id) ON DELETE RESTRICT,
    expense_report_id UUID NOT NULL,
    request_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    payment_date DATE NOT NULL,
    payment_account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    amount NUMERIC(19,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    posted_journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    posted_by UUID NOT NULL,
    posted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    notes TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (amount > 0),
    CHECK (status IN ('posted','reversed'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_expense_reimbursement_request
    ON public.accounting_expense_reimbursements(company_id, request_key)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_expense_reimbursements_report
    ON public.accounting_expense_reimbursements(company_id, expense_report_id, status)
    WHERE deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.accounting_expense_reimbursement_balances AS
  SELECT
    p.company_id,
    p.expense_report_id,
    p.id AS report_posting_id,
    p.employee_reference,
    p.base_currency,
    p.gross_base_amount,
    COALESCE(
      SUM(r.amount) FILTER (
        WHERE r.status='posted' AND r.deleted_at IS NULL
      ),
      0
    )::numeric(19,2) AS reimbursed_amount,
    GREATEST(
      p.gross_base_amount -
      COALESCE(
        SUM(r.amount) FILTER (
          WHERE r.status='posted' AND r.deleted_at IS NULL
        ),
        0
      ),
      0
    )::numeric(19,2) AS outstanding_amount
  FROM public.accounting_expense_report_postings p
  LEFT JOIN public.accounting_expense_reimbursements r
    ON r.company_id=p.company_id
   AND r.report_posting_id=p.id
  WHERE p.deleted_at IS NULL
    AND p.status='posted'
    AND p.settlement_mode='employee_reimbursement'
  GROUP BY
    p.company_id,
    p.expense_report_id,
    p.id,
    p.employee_reference,
    p.base_currency,
    p.gross_base_amount;
`;


export const ACCOUNTING_2_10_0_TO_2_11_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.10.0-to-2.11.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.10.0',
    toVersion:
      '2.11.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
