import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_payment_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
    plan_number VARCHAR(140) NOT NULL,
    name VARCHAR(180) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
      CHECK (status IN ('active','cancelled')),
    currency VARCHAR(3) NOT NULL,
    total_amount NUMERIC(19,4) NOT NULL CHECK (total_amount > 0),
    installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 2 AND 120),
    notes TEXT,
    idempotency_key VARCHAR(160),
    activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    activated_by UUID,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID,
    cancellation_reason TEXT,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, plan_number)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_plan_active_invoice
    ON public.invoicing_payment_plans(company_id, invoice_id)
    WHERE status = 'active';

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_plan_idempotency
    ON public.invoicing_payment_plans(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_plans_customer
    ON public.invoicing_payment_plans(company_id, customer_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS public.invoicing_payment_plan_installments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.invoicing_payment_plans(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
    label VARCHAR(180),
    due_date DATE NOT NULL,
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(plan_id, sequence_no)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_payment_plan_installments_due
    ON public.invoicing_payment_plan_installments(company_id, due_date, plan_id);

  CREATE OR REPLACE VIEW public.invoicing_payment_plan_installment_balances AS
  WITH base AS (
    SELECT
      installment.id,
      installment.company_id,
      installment.plan_id,
      installment.invoice_id,
      installment.sequence_no,
      installment.label,
      installment.due_date,
      installment.amount,
      plan.plan_number,
      plan.name AS plan_name,
      plan.status AS plan_status,
      plan.currency,
      invoice.invoice_number,
      invoice.customer_id,
      customer.name AS customer_name,
      GREATEST(
        invoice.total_amount -
        COALESCE(aging.balance_due, invoice.total_amount),
        0
      )::numeric(19,4) AS invoice_settled_amount,
      COALESCE(
        SUM(installment.amount) OVER (
          PARTITION BY installment.plan_id
          ORDER BY installment.sequence_no
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ),
        0
      )::numeric(19,4) AS prior_scheduled_amount
    FROM public.invoicing_payment_plan_installments installment
    INNER JOIN public.invoicing_payment_plans plan
      ON plan.id = installment.plan_id
     AND plan.company_id = installment.company_id
    INNER JOIN public.invoicing_invoices invoice
      ON invoice.id = installment.invoice_id
     AND invoice.company_id = installment.company_id
     AND invoice.deleted_at IS NULL
    INNER JOIN public.invoicing_customers customer
      ON customer.id = invoice.customer_id
     AND customer.company_id = invoice.company_id
     AND customer.deleted_at IS NULL
    LEFT JOIN public.invoicing_aging aging
      ON aging.invoice_id = invoice.id
     AND aging.company_id = invoice.company_id
  )
  SELECT
    base.*,
    GREATEST(
      LEAST(
        base.invoice_settled_amount -
        base.prior_scheduled_amount,
        base.amount
      ),
      0
    )::numeric(19,4) AS paid_amount,
    GREATEST(
      base.amount -
      GREATEST(
        LEAST(
          base.invoice_settled_amount -
          base.prior_scheduled_amount,
          base.amount
        ),
        0
      ),
      0
    )::numeric(19,4) AS balance_due,
    CASE
      WHEN base.plan_status = 'cancelled'
        THEN 'cancelled'
      WHEN GREATEST(
             LEAST(
               base.invoice_settled_amount -
               base.prior_scheduled_amount,
               base.amount
             ),
             0
           ) >= base.amount - 0.0001
        THEN 'paid'
      WHEN GREATEST(
             LEAST(
               base.invoice_settled_amount -
               base.prior_scheduled_amount,
               base.amount
             ),
             0
           ) > 0
        THEN 'partially_paid'
      WHEN base.due_date < CURRENT_DATE
        THEN 'overdue'
      WHEN base.due_date = CURRENT_DATE
        THEN 'due'
      ELSE 'scheduled'
    END AS effective_status
  FROM base;

  CREATE OR REPLACE VIEW public.invoicing_payment_plan_balances AS
  SELECT
    plan.id AS plan_id,
    plan.company_id,
    plan.invoice_id,
    plan.customer_id,
    plan.plan_number,
    plan.name,
    plan.status AS stored_status,
    plan.currency,
    plan.total_amount,
    plan.installment_count,
    plan.notes,
    plan.activated_at,
    plan.cancelled_at,
    plan.cancellation_reason,
    plan.created_by,
    plan.created_at,
    COALESCE(SUM(balance.paid_amount), 0)::numeric(19,4) AS paid_amount,
    COALESCE(SUM(balance.balance_due), 0)::numeric(19,4) AS balance_due,
    COUNT(*) FILTER (WHERE balance.effective_status = 'paid')::int AS paid_installments,
    COUNT(*) FILTER (WHERE balance.effective_status = 'overdue')::int AS overdue_installments,
    MIN(balance.due_date) FILTER (
      WHERE balance.effective_status IN ('scheduled','due','partially_paid','overdue')
    ) AS next_due_date,
    CASE
      WHEN plan.status = 'cancelled'
        THEN 'cancelled'
      WHEN COALESCE(SUM(balance.balance_due), 0) <= 0.0001
        THEN 'completed'
      WHEN COUNT(*) FILTER (WHERE balance.effective_status = 'overdue') > 0
        THEN 'overdue'
      ELSE 'active'
    END AS effective_status
  FROM public.invoicing_payment_plans plan
  INNER JOIN public.invoicing_payment_plan_installment_balances balance
    ON balance.plan_id = plan.id
   AND balance.company_id = plan.company_id
  GROUP BY
    plan.id,
    plan.company_id,
    plan.invoice_id,
    plan.customer_id,
    plan.plan_number,
    plan.name,
    plan.status,
    plan.currency,
    plan.total_amount,
    plan.installment_count,
    plan.notes,
    plan.activated_at,
    plan.cancelled_at,
    plan.cancellation_reason,
    plan.created_by,
    plan.created_at;

  INSERT INTO public.invoicing_sequences (
    company_id,
    document_type,
    prefix,
    next_number,
    padding,
    format,
    updated_by
  )
  SELECT
    c.id,
    'payment_plan',
    'PLN-',
    1,
    6,
    '{prefix}{number}',
    NULL
  FROM public.companies c
  ON CONFLICT (
    company_id,
    document_type
  )
  DO NOTHING;
`;


export const INVOICING_2_13_0_TO_2_14_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.13.0-to-2.14.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.13.0',
    toVersion:
      '2.14.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
