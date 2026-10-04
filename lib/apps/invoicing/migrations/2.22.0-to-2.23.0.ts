import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  /*
   * Invoicing 2.23 — provider refund lifecycle.
   *
   * Pending provider refunds must not affect financial balances until the
   * provider confirms success. Existing balance views already count only
   * status='posted', so expanding the status domain is backwards-compatible.
   */
  ALTER TABLE public.invoicing_payment_refunds
    DROP CONSTRAINT IF EXISTS invoicing_payment_refunds_status_check;

  ALTER TABLE public.invoicing_payment_refunds
    ADD CONSTRAINT invoicing_payment_refunds_status_check
    CHECK (
      status IN (
        'pending',
        'requires_action',
        'posted',
        'failed',
        'reversed'
      )
    );

  ALTER TABLE public.invoicing_credit_note_refunds
    DROP CONSTRAINT IF EXISTS invoicing_credit_note_refunds_status_check;

  ALTER TABLE public.invoicing_credit_note_refunds
    ADD CONSTRAINT invoicing_credit_note_refunds_status_check
    CHECK (
      status IN (
        'pending',
        'requires_action',
        'posted',
        'failed',
        'reversed'
      )
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_refunds_provider_status
    ON public.invoicing_payment_refunds(
      company_id,
      status,
      updated_at DESC
    )
    WHERE status IN (
      'pending',
      'requires_action',
      'failed'
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_credit_refunds_provider_status
    ON public.invoicing_credit_note_refunds(
      company_id,
      status,
      updated_at DESC
    )
    WHERE status IN (
      'pending',
      'requires_action',
      'failed'
    );
`;

export const INVOICING_2_22_0_TO_2_23_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.22.0-to-2.23.0-provider-refunds',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.22.0',
    toVersion:
      '2.23.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
