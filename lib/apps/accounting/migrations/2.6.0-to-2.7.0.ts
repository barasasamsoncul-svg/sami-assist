import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.journals
    ADD COLUMN IF NOT EXISTS approved_by UUID,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approval_note TEXT,
    ADD COLUMN IF NOT EXISTS posted_by UUID;

  CREATE INDEX IF NOT EXISTS idx_journals_company_workflow
    ON public.journals(company_id, status, journal_date, created_at)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_recurring_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
      REFERENCES public.companies(id)
      ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    starts_on DATE NOT NULL,
    next_run_on DATE NOT NULL,
    ends_on DATE,
    reference_prefix VARCHAR(80),
    description TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    last_generated_at TIMESTAMPTZ,
    last_generated_journal_id UUID
      REFERENCES public.journals(id)
      ON DELETE SET NULL,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
    CHECK (status IN ('active','paused','ended')),
    CHECK (ends_on IS NULL OR ends_on >= starts_on),
    CHECK (next_run_on >= starts_on)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_recurring_name
    ON public.accounting_recurring_journals(company_id, name)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_recurring_due
    ON public.accounting_recurring_journals(company_id, status, next_run_on)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_recurring_journal_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL
      REFERENCES public.companies(id)
      ON DELETE CASCADE,
    recurring_journal_id UUID NOT NULL
      REFERENCES public.accounting_recurring_journals(id)
      ON DELETE CASCADE,
    account_id UUID NOT NULL
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    description TEXT,
    debit NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit NUMERIC(15,2) NOT NULL DEFAULT 0,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (sequence >= 0),
    CHECK (debit >= 0 AND credit >= 0),
    CHECK (
      (debit > 0 AND credit = 0)
      OR
      (credit > 0 AND debit = 0)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_recurring_lines
    ON public.accounting_recurring_journal_lines(
      company_id,
      recurring_journal_id,
      sequence,
      id
    )
    WHERE deleted_at IS NULL;
`;


export const ACCOUNTING_2_6_0_TO_2_7_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.6.0-to-2.7.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.6.0',
    toVersion:
      '2.7.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
