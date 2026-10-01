import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.accounting_bank_accounts
    ADD COLUMN IF NOT EXISTS account_type VARCHAR(20) NOT NULL DEFAULT 'bank',
    ADD COLUMN IF NOT EXISTS institution_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS branch_name VARCHAR(160),
    ADD COLUMN IF NOT EXISTS account_holder_name VARCHAR(200),
    ADD COLUMN IF NOT EXISTS account_reference_masked VARCHAR(80),
    ADD COLUMN IF NOT EXISTS mobile_money_provider VARCHAR(80),
    ADD COLUMN IF NOT EXISTS country_code VARCHAR(3),
    ADD COLUMN IF NOT EXISTS allow_overdraft BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS overdraft_limit NUMERIC(19,2) NOT NULL DEFAULT 0;

  UPDATE public.accounting_bank_accounts
  SET
    institution_name=COALESCE(institution_name,bank_name),
    account_reference_masked=COALESCE(
      account_reference_masked,
      CASE
        WHEN account_number_last4 IS NOT NULL
          THEN '••••' || account_number_last4
        ELSE NULL
      END
    )
  WHERE institution_name IS NULL
     OR account_reference_masked IS NULL;

  ALTER TABLE public.accounting_bank_accounts
    DROP CONSTRAINT IF EXISTS accounting_bank_accounts_account_type_check,
    DROP CONSTRAINT IF EXISTS accounting_bank_accounts_overdraft_limit_check;

  ALTER TABLE public.accounting_bank_accounts
    ADD CONSTRAINT accounting_bank_accounts_account_type_check
      CHECK (account_type IN ('bank','cash','mobile_money')) NOT VALID,
    ADD CONSTRAINT accounting_bank_accounts_overdraft_limit_check
      CHECK (overdraft_limit >= 0) NOT VALID;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_bank_accounts_ledger
    ON public.accounting_bank_accounts(company_id, ledger_account_id)
    WHERE deleted_at IS NULL
      AND ledger_account_id IS NOT NULL
      AND status <> 'closed';

  CREATE INDEX IF NOT EXISTS idx_accounting_bank_accounts_type_status
    ON public.accounting_bank_accounts(company_id, account_type, status, name)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_internal_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    transfer_number VARCHAR(100) NOT NULL,
    request_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    transfer_date DATE NOT NULL,
    source_bank_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
    destination_bank_account_id UUID NOT NULL
      REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
    currency VARCHAR(3) NOT NULL,
    amount NUMERIC(19,2) NOT NULL,
    reference VARCHAR(255),
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
    CHECK (source_bank_account_id <> destination_bank_account_id),
    CHECK (amount > 0),
    CHECK (status IN ('posted','reversed'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_internal_transfer_number
    ON public.accounting_internal_transfers(company_id, transfer_number)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_internal_transfer_request
    ON public.accounting_internal_transfers(company_id, request_key)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_internal_transfers_date
    ON public.accounting_internal_transfers(company_id, transfer_date DESC, created_at DESC)
    WHERE deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.accounting_financial_account_balances AS
  SELECT
    b.company_id,
    b.id AS bank_account_id,
    b.ledger_account_id,
    b.account_type,
    b.currency,
    COALESCE(
      SUM(
        CASE
          WHEN j.status='posted'
            AND j.deleted_at IS NULL
            AND l.deleted_at IS NULL
          THEN l.debit-l.credit
          ELSE 0
        END
      ),
      0
    )::numeric(19,2) AS book_balance
  FROM public.accounting_bank_accounts b
  LEFT JOIN public.journal_lines l
    ON l.company_id=b.company_id
   AND l.account_id=b.ledger_account_id
  LEFT JOIN public.journals j
    ON j.company_id=l.company_id
   AND j.id=l.journal_id
  WHERE b.deleted_at IS NULL
  GROUP BY
    b.company_id,
    b.id,
    b.ledger_account_id,
    b.account_type,
    b.currency;
`;


export const ACCOUNTING_2_11_0_TO_2_12_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.11.0-to-2.12.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.11.0',
    toVersion:
      '2.12.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
