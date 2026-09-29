import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.invoicing_retainers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
    payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE RESTRICT,
    retainer_number VARCHAR(140) NOT NULL,
    retainer_type VARCHAR(20) NOT NULL DEFAULT 'retainer'
      CHECK (retainer_type IN ('retainer','deposit')),
    purpose TEXT,
    expected_use_date DATE,
    idempotency_key VARCHAR(160),
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, retainer_number),
    UNIQUE(payment_id)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_retainers_customer
    ON public.invoicing_retainers(company_id, customer_id, created_at DESC);

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_retainers_idempotency
    ON public.invoicing_retainers(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  CREATE OR REPLACE VIEW public.invoicing_retainer_balances AS
  SELECT
    r.id AS retainer_id,
    r.company_id,
    r.customer_id,
    r.payment_id,
    r.retainer_number,
    r.retainer_type,
    r.purpose,
    r.expected_use_date,
    p.payment_number,
    p.payment_date AS received_date,
    p.amount,
    p.currency,
    p.exchange_rate,
    p.method,
    p.reference,
    p.status AS payment_status,
    b.allocated_amount,
    b.refunded_amount,
    b.unapplied_amount AS available_amount,
    CASE
      WHEN p.status = 'reversed'
        THEN 'reversed'
      WHEN b.refunded_amount >= p.amount - 0.0001
        THEN 'refunded'
      WHEN b.allocated_amount >= p.amount - 0.0001
        THEN 'applied'
      WHEN b.allocated_amount > 0
        AND b.refunded_amount > 0
        THEN 'partially_used'
      WHEN b.allocated_amount > 0
        THEN 'partially_applied'
      WHEN b.refunded_amount > 0
        THEN 'partially_refunded'
      ELSE 'active'
    END AS effective_status,
    p.reconciled_at,
    r.created_by,
    r.created_at,
    r.updated_at
  FROM public.invoicing_retainers r
  INNER JOIN public.invoicing_payments p
    ON p.id = r.payment_id
   AND p.company_id = r.company_id
   AND p.deleted_at IS NULL
  INNER JOIN public.invoicing_payment_balances b
    ON b.payment_id = r.payment_id
   AND b.company_id = r.company_id;

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
    'retainer',
    'RET-',
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


export const INVOICING_2_12_0_TO_2_13_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.12.0-to-2.13.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.12.0',
    toVersion:
      '2.13.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
