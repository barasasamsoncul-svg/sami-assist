import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_settings
    ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS exchange_rate_mode VARCHAR(20) NOT NULL DEFAULT 'table',
    ADD COLUMN IF NOT EXISTS allow_cross_currency_payments BOOLEAN NOT NULL DEFAULT TRUE;

  UPDATE public.invoicing_settings
  SET base_currency =
    COALESCE(
      base_currency,
      default_currency,
      'KES'
    )
  WHERE base_currency IS NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_currencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    code VARCHAR(3) NOT NULL,
    name VARCHAR(120) NOT NULL,
    symbol VARCHAR(16) NOT NULL,
    decimal_places SMALLINT NOT NULL DEFAULT 2
      CHECK (decimal_places BETWEEN 0 AND 6),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_base BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, code)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_currency_base
    ON public.invoicing_currencies(company_id)
    WHERE is_base = TRUE;

  CREATE INDEX IF NOT EXISTS idx_invoicing_currencies_active
    ON public.invoicing_currencies(company_id, is_active, code);

  INSERT INTO public.invoicing_currencies (
    company_id,
    code,
    name,
    symbol,
    decimal_places,
    is_active,
    is_base
  )
  SELECT
    s.company_id,
    COALESCE(s.base_currency, s.default_currency, 'KES'),
    COALESCE(s.base_currency, s.default_currency, 'KES'),
    COALESCE(s.base_currency, s.default_currency, 'KES'),
    2,
    TRUE,
    TRUE
  FROM public.invoicing_settings s
  ON CONFLICT (
    company_id,
    code
  )
  DO UPDATE
  SET
    is_active = TRUE,
    is_base = TRUE,
    updated_at = NOW();

  CREATE TABLE IF NOT EXISTS public.invoicing_exchange_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    currency VARCHAR(3) NOT NULL,
    base_currency VARCHAR(3) NOT NULL,
    rate_to_base NUMERIC(19,8) NOT NULL
      CHECK (rate_to_base > 0),
    effective_date DATE NOT NULL,
    source_type VARCHAR(30) NOT NULL DEFAULT 'manual'
      CHECK (source_type IN ('manual','provider','import')),
    source_name VARCHAR(120),
    note TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (currency <> base_currency),
    UNIQUE(company_id, currency, base_currency, effective_date)
  );

  CREATE INDEX IF NOT EXISTS idx_invoicing_exchange_rates_lookup
    ON public.invoicing_exchange_rates(
      company_id,
      currency,
      base_currency,
      effective_date DESC
    )
    WHERE is_active = TRUE;

  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
    ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(120);

  ALTER TABLE public.invoicing_payments
    ADD COLUMN IF NOT EXISTS base_currency VARCHAR(3),
    ADD COLUMN IF NOT EXISTS exchange_rate_date DATE,
    ADD COLUMN IF NOT EXISTS exchange_rate_source VARCHAR(120);

  UPDATE public.invoicing_invoices invoice
  SET
    base_currency =
      COALESCE(
        invoice.base_currency,
        setting.base_currency,
        setting.default_currency,
        invoice.currency
      ),
    exchange_rate_date =
      COALESCE(
        invoice.exchange_rate_date,
        invoice.invoice_date
      ),
    exchange_rate_source =
      COALESCE(
        invoice.exchange_rate_source,
        CASE
          WHEN invoice.exchange_rate = 1
            AND invoice.currency = COALESCE(
              setting.base_currency,
              setting.default_currency,
              invoice.currency
            )
            THEN 'base'
          ELSE 'legacy_locked_rate'
        END
      )
  FROM public.invoicing_settings setting
  WHERE setting.company_id =
        invoice.company_id;

  UPDATE public.invoicing_payments payment
  SET
    base_currency =
      COALESCE(
        payment.base_currency,
        setting.base_currency,
        setting.default_currency,
        payment.currency
      ),
    exchange_rate_date =
      COALESCE(
        payment.exchange_rate_date,
        payment.payment_date
      ),
    exchange_rate_source =
      COALESCE(
        payment.exchange_rate_source,
        CASE
          WHEN payment.exchange_rate = 1
            AND payment.currency = COALESCE(
              setting.base_currency,
              setting.default_currency,
              payment.currency
            )
            THEN 'base'
          ELSE 'legacy_locked_rate'
        END
      )
  FROM public.invoicing_settings setting
  WHERE setting.company_id =
        payment.company_id;

  ALTER TABLE public.invoicing_payment_allocations
    ADD COLUMN IF NOT EXISTS payment_amount NUMERIC(19,4),
    ADD COLUMN IF NOT EXISTS invoice_amount NUMERIC(19,4),
    ADD COLUMN IF NOT EXISTS payment_exchange_rate NUMERIC(19,8),
    ADD COLUMN IF NOT EXISTS invoice_exchange_rate NUMERIC(19,8),
    ADD COLUMN IF NOT EXISTS base_payment_amount NUMERIC(19,4),
    ADD COLUMN IF NOT EXISTS base_invoice_amount NUMERIC(19,4),
    ADD COLUMN IF NOT EXISTS realized_fx_amount NUMERIC(19,4) NOT NULL DEFAULT 0;

  UPDATE public.invoicing_payment_allocations allocation
  SET
    payment_amount =
      COALESCE(
        allocation.payment_amount,
        allocation.amount
      ),
    invoice_amount =
      COALESCE(
        allocation.invoice_amount,
        allocation.amount
      ),
    payment_exchange_rate =
      COALESCE(
        allocation.payment_exchange_rate,
        payment.exchange_rate,
        1
      ),
    invoice_exchange_rate =
      COALESCE(
        allocation.invoice_exchange_rate,
        invoice.exchange_rate,
        1
      ),
    base_payment_amount =
      COALESCE(
        allocation.base_payment_amount,
        ROUND(
          (
            allocation.amount *
            COALESCE(
              payment.exchange_rate,
              1
            )
          )::numeric,
          4
        )
      ),
    base_invoice_amount =
      COALESCE(
        allocation.base_invoice_amount,
        ROUND(
          (
            allocation.amount *
            COALESCE(
              invoice.exchange_rate,
              1
            )
          )::numeric,
          4
        )
      ),
    realized_fx_amount =
      COALESCE(
        allocation.realized_fx_amount,
        0
      )
  FROM
    public.invoicing_payments payment,
    public.invoicing_invoices invoice
  WHERE payment.id =
        allocation.payment_id
    AND invoice.id =
        allocation.invoice_id
    AND payment.company_id =
        allocation.company_id
    AND invoice.company_id =
        allocation.company_id;

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
        SELECT SUM(
          COALESCE(
            a.payment_amount,
            a.amount
          )
        )
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
          SELECT SUM(
            COALESCE(
              a.payment_amount,
              a.amount
            )
          )
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
    SELECT COALESCE(
      SUM(
        COALESCE(
          a.invoice_amount,
          a.amount
        )
      ),
      0
    )::numeric(19,4) AS paid_amount
    FROM public.invoicing_payment_allocations a
    INNER JOIN public.invoicing_payments p
      ON p.id = a.payment_id
    WHERE a.invoice_id = i.id
      AND a.status = 'posted'
      AND p.status = 'posted'
      AND p.deleted_at IS NULL
  ) pa ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS credited_amount
    FROM public.invoicing_credit_note_applications a
    INNER JOIN public.invoicing_credit_notes cn
      ON cn.id = a.credit_note_id
     AND cn.company_id = a.company_id
    WHERE a.target_invoice_id = i.id
      AND a.status = 'posted'
      AND cn.status <> 'cancelled'
      AND cn.deleted_at IS NULL
  ) cn ON TRUE
  WHERE i.deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.invoicing_currency_exposure AS
  SELECT
    aging.company_id,
    aging.currency,
    COALESCE(
      NULLIF(
        MAX(invoice.base_currency),
        ''
      ),
      MAX(setting.base_currency),
      MAX(setting.default_currency),
      aging.currency
    ) AS base_currency,
    COUNT(*) FILTER (
      WHERE aging.balance_due > 0
    )::int AS open_invoice_count,
    COALESCE(
      SUM(aging.total_amount),
      0
    )::numeric(19,4) AS invoiced_amount,
    COALESCE(
      SUM(aging.balance_due),
      0
    )::numeric(19,4) AS open_amount,
    COALESCE(
      SUM(
        aging.total_amount *
        COALESCE(
          invoice.exchange_rate,
          1
        )
      ),
      0
    )::numeric(19,4) AS invoiced_base_amount,
    COALESCE(
      SUM(
        aging.balance_due *
        COALESCE(
          invoice.exchange_rate,
          1
        )
      ),
      0
    )::numeric(19,4) AS open_base_amount
  FROM public.invoicing_aging aging
  INNER JOIN public.invoicing_invoices invoice
    ON invoice.id = aging.invoice_id
   AND invoice.company_id = aging.company_id
  LEFT JOIN public.invoicing_settings setting
    ON setting.company_id = aging.company_id
  GROUP BY
    aging.company_id,
    aging.currency;
`;


export const INVOICING_2_14_0_TO_2_15_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.14.0-to-2.15.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.14.0',
    toVersion:
      '2.15.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
