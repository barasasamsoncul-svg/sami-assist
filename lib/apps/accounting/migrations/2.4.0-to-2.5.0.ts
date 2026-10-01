import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.accounts
    ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(10)
      NOT NULL DEFAULT 'debit'
      CHECK (normal_balance IN ('debit','credit')),
    ADD COLUMN IF NOT EXISTS reconcile BOOLEAN
      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS allow_manual_posting BOOLEAN
      NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS is_control_account BOOLEAN
      NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS system_role VARCHAR(80),
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS sequence INTEGER
      NOT NULL DEFAULT 100
      CHECK (sequence >= 0),
    ADD COLUMN IF NOT EXISTS template_key VARCHAR(80);

  CREATE INDEX IF NOT EXISTS idx_accounts_company_parent
    ON public.accounts(company_id, parent_account_id, code)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounts_company_type
    ON public.accounts(company_id, account_type, is_active, code)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_company_system_role
    ON public.accounts(company_id, system_role)
    WHERE deleted_at IS NULL
      AND system_role IS NOT NULL;
`;


export const ACCOUNTING_2_4_0_TO_2_5_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.4.0-to-2.5.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.4.0',
    toVersion:
      '2.5.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
