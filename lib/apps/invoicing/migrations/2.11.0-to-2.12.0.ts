import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_credit_notes
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(120),
    ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS issued_by UUID,
    ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS cancelled_by UUID,
    ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

  ALTER TABLE public.invoicing_credit_notes
    DROP CONSTRAINT IF EXISTS invoicing_credit_notes_status_check;

  ALTER TABLE public.invoicing_credit_notes
    ADD CONSTRAINT invoicing_credit_notes_status_check
      CHECK (
        status IN (
          'draft',
          'issued',
          'partially_applied',
          'applied',
          'partially_refunded',
          'refunded',
          'cancelled'
        )
      );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_credit_notes_idempotency
    ON public.invoicing_credit_notes(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  ALTER TABLE public.invoicing_credit_note_items
    ADD COLUMN IF NOT EXISTS subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS public.invoicing_credit_note_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    credit_note_id UUID NOT NULL REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    target_invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    application_type VARCHAR(30) NOT NULL DEFAULT 'customer_credit'
      CHECK (application_type IN ('source_offset','customer_credit')),
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'posted'
      CHECK (status IN ('posted','reversed')),
    operation_key VARCHAR(160) NOT NULL,
    applied_by UUID,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, operation_key)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_credit_applications_credit
    ON public.invoicing_credit_note_applications(
      credit_note_id,
      status,
      applied_at DESC
    );

  CREATE INDEX IF NOT EXISTS idx_invoicing_credit_applications_invoice
    ON public.invoicing_credit_note_applications(
      target_invoice_id,
      status,
      applied_at DESC
    );

  CREATE TABLE IF NOT EXISTS public.invoicing_credit_note_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    credit_note_id UUID NOT NULL REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    refund_number VARCHAR(140) NOT NULL,
    refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
    method VARCHAR(40) NOT NULL DEFAULT 'bank',
    reference VARCHAR(255),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'posted'
      CHECK (status IN ('posted','reversed')),
    idempotency_key VARCHAR(120),
    created_by UUID,
    reversed_by UUID,
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, refund_number)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_credit_refunds_idempotency
    ON public.invoicing_credit_note_refunds(company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_invoicing_credit_refunds_credit
    ON public.invoicing_credit_note_refunds(
      credit_note_id,
      status,
      refund_date DESC,
      id DESC
    );

  INSERT INTO public.invoicing_sequences (
    company_id,
    document_type,
    prefix,
    next_number,
    padding,
    format
  )
  SELECT
    c.id,
    'credit_refund',
    'CRF-',
    1,
    6,
    '{prefix}{number}'
  FROM public.companies c
  WHERE c.is_active = TRUE
  ON CONFLICT (
    company_id,
    document_type
  )
  DO NOTHING;

  INSERT INTO public.invoicing_credit_note_applications (
    company_id,
    credit_note_id,
    target_invoice_id,
    application_type,
    amount,
    status,
    operation_key,
    applied_by,
    applied_at,
    metadata
  )
  SELECT
    cn.company_id,
    cn.id,
    cn.invoice_id,
    'source_offset',
    cn.total_amount,
    'posted',
    'legacy-source-offset:' || cn.id::text,
    cn.created_by,
    cn.created_at,
    jsonb_build_object(
      'backfilledByMigration',
      TRUE
    )
  FROM public.invoicing_credit_notes cn
  WHERE cn.deleted_at IS NULL
    AND cn.status <> 'cancelled'
    AND NOT EXISTS (
      SELECT 1
      FROM public.invoicing_credit_note_applications app
      WHERE app.company_id = cn.company_id
        AND app.credit_note_id = cn.id
        AND app.status = 'posted'
    )
  ON CONFLICT (
    company_id,
    operation_key
  )
  DO NOTHING;

  CREATE OR REPLACE VIEW public.invoicing_credit_note_balances AS
  SELECT
    cn.company_id,
    cn.id AS credit_note_id,
    cn.customer_id,
    cn.invoice_id AS source_invoice_id,
    cn.credit_note_number,
    cn.currency,
    cn.status,
    cn.total_amount,
    COALESCE(app.applied_amount,0)::numeric(19,4) AS applied_amount,
    COALESCE(ref.refunded_amount,0)::numeric(19,4) AS refunded_amount,
    GREATEST(
      cn.total_amount -
      COALESCE(app.applied_amount,0) -
      COALESCE(ref.refunded_amount,0),
      0
    )::numeric(19,4) AS available_amount
  FROM public.invoicing_credit_notes cn
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(a.amount),0)::numeric(19,4) AS applied_amount
    FROM public.invoicing_credit_note_applications a
    WHERE a.credit_note_id = cn.id
      AND a.company_id = cn.company_id
      AND a.status = 'posted'
  ) app ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(r.amount),0)::numeric(19,4) AS refunded_amount
    FROM public.invoicing_credit_note_refunds r
    WHERE r.credit_note_id = cn.id
      AND r.company_id = cn.company_id
      AND r.status = 'posted'
  ) ref ON TRUE
  WHERE cn.deleted_at IS NULL
    AND cn.status <> 'cancelled';

  CREATE OR REPLACE VIEW public.invoicing_customer_credit_balances AS
  SELECT
    company_id,
    customer_id,
    currency,
    COALESCE(SUM(available_amount),0)::numeric(19,4) AS available_credit
  FROM public.invoicing_credit_note_balances
  GROUP BY
    company_id,
    customer_id,
    currency;

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
      SUM(ca.credited_amount) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
      ),
      0
    )::numeric(19,4) AS credited_total,
    COALESCE(
      SUM(
        GREATEST(
          i.total_amount -
          COALESCE(pa.paid_amount,0) -
          COALESCE(ca.credited_amount,0),
          0
        )
      ) FILTER (
        WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void','written_off')
      ),
      0
    )::numeric(19,4) AS outstanding_total
  FROM public.invoicing_invoices i
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p
      ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND a.status = 'posted'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(a.amount),0)::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_note_applications a
    INNER JOIN public.invoicing_credit_notes cn
      ON cn.id = a.credit_note_id
     AND cn.company_id = a.company_id
    WHERE a.target_invoice_id = i.id
      AND a.status = 'posted'
      AND cn.status <> 'cancelled'
      AND cn.deleted_at IS NULL
  ) ca ON TRUE
  WHERE i.deleted_at IS NULL
  GROUP BY
    i.company_id,
    i.customer_id;

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
        COALESCE(ca.credited_amount,0),
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
    SELECT
      COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p
      ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND a.status = 'posted'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(SUM(a.amount),0)::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_note_applications a
    INNER JOIN public.invoicing_credit_notes cn
      ON cn.id = a.credit_note_id
     AND cn.company_id = a.company_id
    WHERE a.target_invoice_id = i.id
      AND a.status = 'posted'
      AND cn.status <> 'cancelled'
      AND cn.deleted_at IS NULL
  ) ca ON TRUE
  WHERE i.deleted_at IS NULL;

  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_invoicing_credit_note_applications_updated_at'
    ) THEN
      CREATE TRIGGER trg_invoicing_credit_note_applications_updated_at
      BEFORE UPDATE ON public.invoicing_credit_note_applications
      FOR EACH ROW
      EXECUTE FUNCTION public.invoicing_touch_updated_at();
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgname = 'trg_invoicing_credit_note_refunds_updated_at'
    ) THEN
      CREATE TRIGGER trg_invoicing_credit_note_refunds_updated_at
      BEFORE UPDATE ON public.invoicing_credit_note_refunds
      FOR EACH ROW
      EXECUTE FUNCTION public.invoicing_touch_updated_at();
    END IF;
  END
  $$;
`;


export const INVOICING_2_11_0_TO_2_12_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.11.0-to-2.12.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.11.0',
    toVersion:
      '2.12.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
