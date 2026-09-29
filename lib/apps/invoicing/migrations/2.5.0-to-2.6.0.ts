import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_payments
    ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
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
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'posted',
    ADD COLUMN IF NOT EXISTS operation_key VARCHAR(160),
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_by UUID,
    ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

  ALTER TABLE public.invoicing_payment_allocations
    DROP CONSTRAINT IF EXISTS invoicing_payment_allocations_status_check;

  ALTER TABLE public.invoicing_payment_allocations
    ADD CONSTRAINT invoicing_payment_allocations_status_check
    CHECK (status IN ('posted','reversed'));

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_allocations_payment
    ON public.invoicing_payment_allocations(payment_id, created_at, id);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_allocation_operation
    ON public.invoicing_payment_allocations(company_id, operation_key)
    WHERE operation_key IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE RESTRICT,
    refund_number VARCHAR(140) NOT NULL,
    refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    method VARCHAR(50) NOT NULL DEFAULT 'other',
    reference VARCHAR(255),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted'
      CHECK (status IN ('posted','reversed')),
    idempotency_key VARCHAR(160),
    created_by UUID,
    updated_by UUID,
    reversed_at TIMESTAMPTZ,
    reversed_by UUID,
    reversal_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, refund_number)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_refunds_payment
    ON public.invoicing_payment_refunds(payment_id, refund_date DESC, id DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_refunds_idempotency
    ON public.invoicing_payment_refunds(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  CREATE OR REPLACE VIEW public.invoicing_payment_balances AS
  SELECT
    p.id AS payment_id,
    p.company_id,
    p.customer_id,
    p.status,
    p.amount,
    p.currency,
    p.exchange_rate,
    COALESCE(
      (
        SELECT SUM(a.amount)
        FROM public.invoicing_payment_allocations a
        WHERE a.payment_id = p.id
          AND a.company_id = p.company_id
          AND a.status = 'posted'
      ),
      0
    )::numeric(19,4) AS allocated_amount,
    COALESCE(
      (
        SELECT SUM(r.amount)
        FROM public.invoicing_payment_refunds r
        WHERE r.payment_id = p.id
          AND r.company_id = p.company_id
          AND r.status = 'posted'
      ),
      0
    )::numeric(19,4) AS refunded_amount,
    GREATEST(
      p.amount -
      COALESCE(
        (
          SELECT SUM(a.amount)
          FROM public.invoicing_payment_allocations a
          WHERE a.payment_id = p.id
            AND a.company_id = p.company_id
            AND a.status = 'posted'
        ),
        0
      ) -
      COALESCE(
        (
          SELECT SUM(r.amount)
          FROM public.invoicing_payment_refunds r
          WHERE r.payment_id = p.id
            AND r.company_id = p.company_id
            AND r.status = 'posted'
        ),
        0
      ),
      0
    )::numeric(19,4) AS unapplied_amount,
    p.reconciled_at,
    p.reconciled_by,
    p.reconciliation_reference,
    p.reconciliation_notes
  FROM public.invoicing_payments p
  WHERE p.deleted_at IS NULL;
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
