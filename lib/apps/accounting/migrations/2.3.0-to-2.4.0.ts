import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.accounting_settings (
    company_id UUID PRIMARY KEY
      REFERENCES public.companies(id)
      ON DELETE CASCADE,

    fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1,
    fiscal_year_start_day SMALLINT NOT NULL DEFAULT 1,

    default_receivable_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    default_payable_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    retained_earnings_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    output_tax_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    input_tax_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    default_cash_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    fx_gain_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    fx_loss_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    write_off_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,
    rounding_account_id UUID
      REFERENCES public.accounts(id)
      ON DELETE RESTRICT,

    rounding_method VARCHAR(30) NOT NULL DEFAULT 'half_up',
    global_lock_date DATE,
    lock_posted_entries BOOLEAN NOT NULL DEFAULT TRUE,
    require_open_period BOOLEAN NOT NULL DEFAULT TRUE,

    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,

    CHECK (
      fiscal_year_start_month
      BETWEEN 1 AND 12
    ),
    CHECK (
      fiscal_year_start_day
      BETWEEN 1 AND 31
    ),
    CHECK (
      rounding_method IN (
        'half_up',
        'half_even'
      )
    )
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_settings_active
    ON public.accounting_settings(company_id)
    WHERE deleted_at IS NULL;
`;


export const ACCOUNTING_2_3_0_TO_2_4_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.3.0-to-2.4.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.3.0',
    toVersion:
      '2.4.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
