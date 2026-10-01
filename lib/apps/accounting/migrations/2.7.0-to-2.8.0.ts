import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.accounting_opening_balance_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    as_of_date DATE NOT NULL,
    source_type VARCHAR(20) NOT NULL DEFAULT 'migration',
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    import_key UUID NOT NULL,
    request_hash VARCHAR(64) NOT NULL,
    validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    validated_at TIMESTAMPTZ,
    validated_by UUID,
    posted_at TIMESTAMPTZ,
    posted_by UUID,
    posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (source_type IN ('manual','csv','migration')),
    CHECK (status IN ('draft','validated','posted','cancelled'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_opening_import_key
    ON public.accounting_opening_balance_batches(company_id, import_key)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_opening_batches_company
    ON public.accounting_opening_balance_batches(company_id, status, as_of_date, created_at)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_opening_balance_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES public.accounting_opening_balance_batches(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    source_row_key VARCHAR(160),
    account_code_input VARCHAR(50) NOT NULL,
    account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
    description TEXT,
    raw_debit VARCHAR(80),
    raw_credit VARCHAR(80),
    debit NUMERIC(15,2),
    credit NUMERIC(15,2),
    subledger_type VARCHAR(20) NOT NULL DEFAULT 'none',
    subledger_reference VARCHAR(160),
    subledger_name VARCHAR(255),
    validation_status VARCHAR(20) NOT NULL DEFAULT 'unchecked',
    validation_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (row_number > 0),
    CHECK (subledger_type IN ('none','customer','vendor','bank','tax','employee','other')),
    CHECK (validation_status IN ('unchecked','valid','warning','error'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_opening_batch_row
    ON public.accounting_opening_balance_lines(company_id, batch_id, row_number)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_opening_lines_account
    ON public.accounting_opening_balance_lines(company_id, account_id, batch_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_opening_lines_subledger
    ON public.accounting_opening_balance_lines(
      company_id,
      batch_id,
      subledger_type,
      subledger_reference
    )
    WHERE deleted_at IS NULL;
`;


export const ACCOUNTING_2_7_0_TO_2_8_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.7.0-to-2.8.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.7.0',
    toVersion:
      '2.8.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
