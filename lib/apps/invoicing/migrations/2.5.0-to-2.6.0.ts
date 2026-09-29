import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_payments
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160),
    ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reconciled_by UUID,
    ADD COLUMN IF NOT EXISTS reconciliation_reference VARCHAR(255),
    ADD COLUMN IF NOT EXISTS reconciliation_notes TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payments_idempotency
    ON public.invoicing_payments(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
      AND deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_invoicing_payments_reconciled
    ON public.invoicing_payments(company_id, reconciled_at DESC)
    WHERE deleted_at IS NULL
      AND reconciled_at IS NOT NULL;

  ALTER TABLE public.invoicing_payment_allocations
    DROP CONSTRAINT IF EXISTS invoicing_payment_allocations_payment_id_invoice_id_key;

  ALTER TABLE public.invoicing_payment_allocations
    ADD COLUMN IF NOT EXISTS operation_key VARCHAR(160);

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_allocations_payment
    ON public.invoicing_payment_allocations(payment_id, created_at, id);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_allocation_operation
    ON public.invoicing_payment_allocations(company_id, operation_key)
    WHERE operation_key IS NOT NULL;

  CREATE OR REPLACE VIEW public.invoicing_payment_balances AS
  SELECT
    p.id AS payment_id,
    p.company_id,
    p.customer_id,
    p.status,
    p.amount,
    p.currency,
    COALESCE(
      SUM(a.amount),
      0
    )::numeric(19,4) AS allocated_amount,
    GREATEST(
      p.amount -
      COALESCE(
        SUM(a.amount),
        0
      ),
      0
    )::numeric(19,4) AS unapplied_amount,
    p.reconciled_at,
    p.reconciled_by,
    p.reconciliation_reference,
    p.reconciliation_notes
  FROM public.invoicing_payments p
  LEFT JOIN public.invoicing_payment_allocations a
    ON a.payment_id = p.id
   AND a.company_id = p.company_id
  WHERE p.deleted_at IS NULL
  GROUP BY
    p.id,
    p.company_id,
    p.customer_id,
    p.status,
    p.amount,
    p.currency,
    p.reconciled_at,
    p.reconciled_by,
    p.reconciliation_reference,
    p.reconciliation_notes;
`;


export const INVOICING_2_5_0_TO_2_6_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.5.0-to-2.6.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
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
