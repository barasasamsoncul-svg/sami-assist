import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.journals
    ADD COLUMN IF NOT EXISTS source_module VARCHAR(80),
    ADD COLUMN IF NOT EXISTS source_type VARCHAR(120),
    ADD COLUMN IF NOT EXISTS source_id VARCHAR(160),
    ADD COLUMN IF NOT EXISTS source_event_key VARCHAR(255),
    ADD COLUMN IF NOT EXISTS posting_kind VARCHAR(30)
      NOT NULL DEFAULT 'manual'
      CHECK (posting_kind IN ('manual','system','reversal','opening')),
    ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversal_of_journal_id UUID
      REFERENCES public.journals(id)
      ON DELETE RESTRICT,
    ADD COLUMN IF NOT EXISTS reversed_by_journal_id UUID
      REFERENCES public.journals(id)
      ON DELETE RESTRICT;

  ALTER TABLE public.journals
    DROP CONSTRAINT IF EXISTS journals_journal_number_key;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_company_number
    ON public.journals(company_id, journal_number)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_company_source_event
    ON public.journals(company_id, source_module, source_event_key)
    WHERE deleted_at IS NULL
      AND source_module IS NOT NULL
      AND source_event_key IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_journals_company_source
    ON public.journals(company_id, source_module, source_type, source_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_journals_company_posted
    ON public.journals(company_id, status, journal_date, posted_at)
    WHERE deleted_at IS NULL;

  ALTER TABLE public.journal_lines
    DROP CONSTRAINT IF EXISTS journal_lines_one_sided_amount,
    DROP CONSTRAINT IF EXISTS journal_lines_nonnegative_amounts;

  ALTER TABLE public.journal_lines
    ADD CONSTRAINT journal_lines_nonnegative_amounts
      CHECK (debit >= 0 AND credit >= 0),
    ADD CONSTRAINT journal_lines_one_sided_amount
      CHECK (
        (debit > 0 AND credit = 0)
        OR
        (credit > 0 AND debit = 0)
      );

  CREATE INDEX IF NOT EXISTS idx_journal_lines_company_journal
    ON public.journal_lines(company_id, journal_id, id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_journal_lines_company_account
    ON public.journal_lines(company_id, account_id, id)
    WHERE deleted_at IS NULL;
`;


export const ACCOUNTING_2_5_0_TO_2_6_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.5.0-to-2.6.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.5.0',
    toVersion:
      '2.6.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
