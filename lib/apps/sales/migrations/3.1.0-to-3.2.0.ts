import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_sequences
    DROP CONSTRAINT IF EXISTS sales_sequences_document_type_check;

  ALTER TABLE public.sales_sequences
    ADD CONSTRAINT sales_sequences_document_type_check
      CHECK (document_type IN ('quote','order','shipment','return'));

  INSERT INTO public.sales_sequences (
    company_id,
    document_type,
    prefix,
    next_number,
    padding,
    format
  )
  SELECT
    company_id,
    'shipment',
    'SHP-',
    1,
    6,
    '{prefix}{number}'
  FROM public.sales_sequences
  GROUP BY company_id
  ON CONFLICT (company_id, document_type)
  DO NOTHING;

  INSERT INTO public.sales_sequences (
    company_id,
    document_type,
    prefix,
    next_number,
    padding,
    format
  )
  SELECT
    company_id,
    'return',
    'RMA-',
    1,
    6,
    '{prefix}{number}'
  FROM public.sales_sequences
  GROUP BY company_id
  ON CONFLICT (company_id, document_type)
  DO NOTHING;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(20) NOT NULL DEFAULT 'none'
      CHECK (deposit_type IN ('none','percent','fixed'));

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_value >= 0);

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_type VARCHAR(20) NOT NULL DEFAULT 'none'
      CHECK (deposit_type IN ('none','percent','fixed'));

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_value NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_value >= 0);

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_required_amount NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_required_amount >= 0);

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_received_amount NUMERIC(18,2) NOT NULL DEFAULT 0
      CHECK (deposit_received_amount >= 0);

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_retainer_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_payment_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS deposit_status VARCHAR(30) NOT NULL DEFAULT 'none'
      CHECK (deposit_status IN (
        'none',
        'pending',
        'received',
        'partially_applied',
        'applied',
        'refunded'
      ));

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC(18,4) NOT NULL DEFAULT 0
      CHECK (returned_quantity >= 0);

  CREATE TABLE IF NOT EXISTS public.sales_shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
    shipment_number VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ready'
      CHECK (status IN (
        'draft',
        'ready',
        'shipped',
        'in_transit',
        'delivered',
        'failed',
        'cancelled'
      )),
    carrier VARCHAR(180),
    service_level VARCHAR(180),
    tracking_number VARCHAR(255),
    tracking_url TEXT,
    recipient_name VARCHAR(255),
    proof_note TEXT,
    shipped_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    inventory_posted_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, shipment_number)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_shipments_order
    ON public.sales_shipments(company_id, sales_order_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sales_shipments_tracking
    ON public.sales_shipments(company_id, tracking_number)
    WHERE tracking_number IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.sales_shipment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    shipment_id UUID NOT NULL REFERENCES public.sales_shipments(id) ON DELETE CASCADE,
    sales_order_line_id UUID NOT NULL REFERENCES public.sales_order_items_v2(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(shipment_id, sales_order_line_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_shipment_items_line
    ON public.sales_shipment_items(company_id, sales_order_line_id);

  CREATE TABLE IF NOT EXISTS public.sales_returns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
    return_number VARCHAR(120) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'requested'
      CHECK (status IN (
        'requested',
        'approved',
        'received',
        'credited',
        'partially_refunded',
        'refunded',
        'cancelled'
      )),
    reason TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    credited_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, return_number)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_returns_order
    ON public.sales_returns(company_id, sales_order_id, created_at DESC);

  CREATE TABLE IF NOT EXISTS public.sales_return_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    return_id UUID NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    sales_order_line_id UUID NOT NULL REFERENCES public.sales_order_items_v2(id) ON DELETE RESTRICT,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(return_id, sales_order_line_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_return_items_line
    ON public.sales_return_items(company_id, sales_order_line_id);

  CREATE TABLE IF NOT EXISTS public.sales_return_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    return_id UUID NOT NULL REFERENCES public.sales_returns(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL,
    credit_note_id UUID NOT NULL,
    credit_note_number VARCHAR(140) NOT NULL,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
    available_credit NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (available_credit >= 0),
    refunded_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(return_id, invoice_id),
    UNIQUE(company_id, credit_note_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_return_credits_return
    ON public.sales_return_credits(company_id, return_id, created_at);

  CREATE TABLE IF NOT EXISTS public.sales_forecast_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    as_of_date DATE NOT NULL,
    horizon_days INTEGER NOT NULL CHECK (horizon_days BETWEEN 1 AND 365),
    open_pipeline NUMERIC(18,2) NOT NULL DEFAULT 0,
    weighted_pipeline NUMERIC(18,2) NOT NULL DEFAULT 0,
    committed_orders NUMERIC(18,2) NOT NULL DEFAULT 0,
    expected_revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, as_of_date, horizon_days)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_forecast_snapshots_date
    ON public.sales_forecast_snapshots(company_id, as_of_date DESC, horizon_days);
`;

export const SALES_3_1_0_TO_3_2_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-3.1.0-to-3.2.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '3.1.0',
    toVersion:
      '3.2.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
