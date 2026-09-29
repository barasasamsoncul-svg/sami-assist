import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_invoices
    DROP CONSTRAINT IF EXISTS invoicing_invoices_status_check;

  ALTER TABLE public.invoicing_invoices
    ADD CONSTRAINT invoicing_invoices_status_check
    CHECK (
      status IN (
        'draft',
        'pending_approval',
        'rejected',
        'confirmed',
        'sent',
        'viewed',
        'partially_paid',
        'paid',
        'overdue',
        'cancelled',
        'void',
        'written_off'
      )
    );

  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS submitted_by UUID,
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by UUID,
    ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS rejected_by UUID;

  CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $
  BEGIN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'draft'
      AND NEW.status IN ('pending_approval','confirmed','cancelled','void')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'pending_approval'
      AND NEW.status IN ('confirmed','rejected','cancelled','void')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'rejected'
      AND NEW.status IN ('draft','pending_approval','cancelled','void')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'confirmed'
      AND NEW.status IN ('sent','partially_paid','paid','overdue','cancelled','void','written_off')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'sent'
      AND NEW.status IN ('viewed','partially_paid','paid','overdue','cancelled','void','written_off')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'viewed'
      AND NEW.status IN ('partially_paid','paid','overdue','cancelled','void','written_off')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'overdue'
      AND NEW.status IN ('partially_paid','paid','cancelled','void','written_off')
      THEN RETURN NEW;
    END IF;

    IF OLD.status = 'partially_paid'
      AND NEW.status IN ('paid','overdue','written_off')
      THEN RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid invoice status transition from % to %', OLD.status, NEW.status;
  END;
  $;

  CREATE OR REPLACE VIEW public.invoicing_customer_balances AS
  SELECT
    i.company_id,
    i.customer_id,
    COUNT(*) FILTER (
      WHERE i.status NOT IN (
        'draft',
        'pending_approval',
        'rejected',
        'cancelled',
        'void'
      )
    )::int AS invoice_count,
    COALESCE(
      SUM(i.total_amount) FILTER (
        WHERE i.status NOT IN (
          'draft',
          'pending_approval',
          'rejected',
          'cancelled',
          'void'
        )
      ),
      0
    )::numeric(19,4) AS invoiced_total,
    COALESCE(
      SUM(pa.paid_amount) FILTER (
        WHERE i.status NOT IN (
          'draft',
          'pending_approval',
          'rejected',
          'cancelled',
          'void'
        )
      ),
      0
    )::numeric(19,4) AS paid_total,
    COALESCE(
      SUM(cn.credited_amount) FILTER (
        WHERE i.status NOT IN (
          'draft',
          'pending_approval',
          'rejected',
          'cancelled',
          'void'
        )
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
        WHERE i.status NOT IN (
          'draft',
          'pending_approval',
          'rejected',
          'cancelled',
          'void',
          'written_off'
        )
      ),
      0
    )::numeric(19,4) AS outstanding_total
  FROM public.invoicing_invoices i
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        SUM(a.amount),
        0
      )::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p
      ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        SUM(c.total_amount),
        0
      )::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_notes c
    WHERE c.invoice_id = i.id
      AND c.status IN (
        'issued',
        'applied',
        'refunded'
      )
      AND c.deleted_at IS NULL
  ) cn ON TRUE
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
      WHEN i.status IN (
        'draft',
        'pending_approval',
        'rejected',
        'cancelled',
        'void',
        'written_off'
      )
        THEN 0::numeric(19,4)
      ELSE GREATEST(
        i.total_amount -
        COALESCE(pa.paid_amount,0) -
        COALESCE(cn.credited_amount,0),
        0
      )::numeric(19,4)
    END AS balance_due,
    CASE
      WHEN i.status IN (
        'draft',
        'pending_approval',
        'rejected',
        'paid',
        'cancelled',
        'void',
        'written_off'
      )
        THEN i.status
      WHEN i.due_date < CURRENT_DATE
        AND i.status IN (
          'confirmed',
          'sent',
          'viewed',
          'partially_paid',
          'overdue'
        )
        THEN 'overdue'
      ELSE i.status
    END AS effective_status,
    CASE
      WHEN i.status IN (
        'draft',
        'pending_approval',
        'rejected'
      )
        THEN 0
      ELSE GREATEST(
        CURRENT_DATE - i.due_date,
        0
      )
    END AS days_overdue,
    CASE
      WHEN i.status IN (
        'draft',
        'pending_approval',
        'rejected'
      )
        THEN 'not_posted'
      WHEN i.due_date >= CURRENT_DATE
        THEN 'current'
      WHEN CURRENT_DATE - i.due_date <= 30
        THEN '1-30'
      WHEN CURRENT_DATE - i.due_date <= 60
        THEN '31-60'
      WHEN CURRENT_DATE - i.due_date <= 90
        THEN '61-90'
      ELSE '90+'
    END AS aging_bucket
  FROM public.invoicing_invoices i
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        SUM(a.amount),
        0
      )::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p
      ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COALESCE(
        SUM(c.total_amount),
        0
      )::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_notes c
    WHERE c.invoice_id = i.id
      AND c.status IN (
        'issued',
        'applied',
        'refunded'
      )
      AND c.deleted_at IS NULL
  ) cn ON TRUE
  WHERE i.deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.invoicing_monthly_summary AS
  SELECT
    company_id,
    DATE_TRUNC(
      'month',
      invoice_date
    )::date AS month,
    currency,
    COUNT(*)::int AS invoice_count,
    COALESCE(
      SUM(total_amount),
      0
    )::numeric(19,4) AS invoiced_total
  FROM public.invoicing_invoices
  WHERE deleted_at IS NULL
    AND status NOT IN (
      'draft',
      'pending_approval',
      'rejected',
      'cancelled',
      'void'
    )
  GROUP BY
    company_id,
    DATE_TRUNC(
      'month',
      invoice_date
    ),
    currency;
`;


export const INVOICING_2_4_0_TO_2_5_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.4.0-to-2.5.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
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
