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

  CREATE OR REPLACE VIEW public.invoicing_customer_balances AS
  SELECT
    i.company_id,
    i.customer_id,
    COUNT(*) FILTER (
      WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
    )::int AS invoice_count,
    COALESCE(
      SUM(i.total_amount) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
      ),
      0
    )::numeric(19,4) AS invoiced_total,
    COALESCE(
      SUM(pa.paid_amount) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
      ),
      0
    )::numeric(19,4) AS paid_total,
    COALESCE(
      SUM(cn.credited_amount) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
      ),
      0
    )::numeric(19,4) AS credited_total,
    COALESCE(
      SUM(
        GREATEST(
          i.total_amount -
          COALESCE(pa.paid_amount,0) -
          COALESCE(cn.credited_amount,0),
          0
        )
      ) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void','written_off')
      ),
      0
    )::numeric(19,4) AS outstanding_total
  FROM public.invoicing_invoices i
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND a.status = 'posted'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(c.total_amount),0)::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_notes c
    WHERE c.invoice_id = i.id
      AND c.status IN ('issued','applied','refunded')
      AND c.deleted_at IS NULL
  ) cn ON TRUE
  WHERE i.deleted_at IS NULL
  GROUP BY i.company_id, i.customer_id;
  
  CREATE OR REPLACE VIEW public.invoicing_aging AS
  SELECT
    i.company_id,
    i.id AS invoice_id,
    i.invoice_number,
    i.customer_id,
    i.invoice_date,
    i.due_date,
    i.currency,
    i.total_amount,
    CASE
      WHEN i.status IN ('draft','pending_approval','rejected','cancelled','void','written_off')
        THEN 0::numeric(19,4)
      ELSE GREATEST(
        i.total_amount -
        COALESCE(pa.paid_amount,0) -
        COALESCE(cn.credited_amount,0),
        0
      )::numeric(19,4)
    END AS balance_due,
    CASE
      WHEN i.status IN ('draft','pending_approval','rejected','paid','cancelled','void','written_off')
        THEN i.status
      WHEN i.due_date < CURRENT_DATE
        AND i.status IN ('confirmed','sent','viewed','partially_paid','overdue')
        THEN 'overdue'
      ELSE i.status
    END AS effective_status,
    CASE
      WHEN i.status IN ('draft','pending_approval','rejected')
        THEN 0
      ELSE GREATEST((CURRENT_DATE - i.due_date), 0)
    END AS days_overdue,
    CASE
      WHEN i.status IN ('draft','pending_approval','rejected')
        THEN 'not_posted'
      WHEN i.due_date >= CURRENT_DATE THEN 'current'
      WHEN CURRENT_DATE - i.due_date <= 30 THEN '1-30'
      WHEN CURRENT_DATE - i.due_date <= 60 THEN '31-60'
      WHEN CURRENT_DATE - i.due_date <= 90 THEN '61-90'
      ELSE '90+'
    END AS aging_bucket
  FROM public.invoicing_invoices i
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND a.status = 'posted'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(c.total_amount),0)::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_notes c
    WHERE c.invoice_id = i.id
      AND c.status IN ('issued','applied','refunded')
      AND c.deleted_at IS NULL
  ) cn ON TRUE
  WHERE i.deleted_at IS NULL;
  
  CREATE OR REPLACE VIEW public.invoicing_monthly_summary AS
  SELECT
    company_id,
    DATE_TRUNC('month', invoice_date)::date AS month,
    currency,
    COUNT(*)::int AS invoice_count,
    COALESCE(SUM(total_amount),0)::numeric(19,4) AS invoiced_total
  FROM public.invoicing_invoices
  WHERE deleted_at IS NULL
    AND status NOT IN ('draft','pending_approval','rejected','cancelled','void')
  GROUP BY company_id, DATE_TRUNC('month', invoice_date), currency;
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
