import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.accounting_purchase_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    min_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    max_amount NUMERIC(19,2),
    approver_role VARCHAR(80),
    approver_user_id UUID,
    require_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    require_three_way_match BOOLEAN NOT NULL DEFAULT TRUE,
    quantity_tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
    price_tolerance_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
    amount_tolerance NUMERIC(19,2) NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (min_amount >= 0),
    CHECK (max_amount IS NULL OR max_amount >= min_amount),
    CHECK (quantity_tolerance_percent >= 0 AND quantity_tolerance_percent <= 100),
    CHECK (price_tolerance_percent >= 0 AND price_tolerance_percent <= 100),
    CHECK (amount_tolerance >= 0),
    CHECK (approver_role IS NOT NULL OR approver_user_id IS NOT NULL)
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_purchase_policies_company
    ON public.accounting_purchase_policies(company_id, active, min_amount)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_purchase_requisitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    requisition_number VARCHAR(100) NOT NULL,
    requested_by UUID NOT NULL,
    requested_on DATE NOT NULL DEFAULT CURRENT_DATE,
    needed_by DATE,
    department VARCHAR(160),
    cost_center VARCHAR(160),
    purpose TEXT NOT NULL,
    currency VARCHAR(3) NOT NULL,
    estimated_total NUMERIC(19,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    submitted_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    rejected_by UUID,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (estimated_total >= 0),
    CHECK (status IN ('draft','submitted','approved','rejected','converted','cancelled'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_purchase_requisition_number
    ON public.accounting_purchase_requisitions(company_id, requisition_number)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_purchase_requisition_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    requisition_id UUID NOT NULL REFERENCES public.accounting_purchase_requisitions(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
    estimated_unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    estimated_total NUMERIC(19,4) NOT NULL DEFAULT 0,
    preferred_vendor_id UUID REFERENCES public.accounting_vendors(id) ON DELETE SET NULL,
    expense_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (quantity > 0),
    CHECK (estimated_unit_price >= 0),
    CHECK (estimated_total >= 0),
    CHECK (sequence >= 0)
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_purchase_requisition_lines
    ON public.accounting_purchase_requisition_lines(company_id, requisition_id, sequence)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_purchase_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    purchase_order_number VARCHAR(100) NOT NULL,
    requisition_id UUID REFERENCES public.accounting_purchase_requisitions(id) ON DELETE SET NULL,
    vendor_id UUID NOT NULL REFERENCES public.accounting_vendors(id) ON DELETE RESTRICT,
    order_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expected_date DATE,
    currency VARCHAR(3) NOT NULL,
    exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
    subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_total NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    base_total_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    approval_policy_id UUID REFERENCES public.accounting_purchase_policies(id) ON DELETE SET NULL,
    submitted_at TIMESTAMPTZ,
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (exchange_rate > 0),
    CHECK (subtotal >= 0 AND tax_total >= 0 AND total_amount >= 0 AND base_total_amount >= 0),
    CHECK (total_amount = subtotal + tax_total),
    CHECK (status IN ('draft','submitted','approved','partially_received','received','closed','cancelled'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_purchase_order_number
    ON public.accounting_purchase_orders(company_id, purchase_order_number)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_purchase_orders_vendor_status
    ON public.accounting_purchase_orders(company_id, vendor_id, status, order_date)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_purchase_order_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    purchase_order_id UUID NOT NULL REFERENCES public.accounting_purchase_orders(id) ON DELETE CASCADE,
    requisition_line_id UUID REFERENCES public.accounting_purchase_requisition_lines(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    unit_price NUMERIC(19,4) NOT NULL,
    line_subtotal NUMERIC(19,4) NOT NULL,
    tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(19,4) NOT NULL,
    expense_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (quantity > 0),
    CHECK (unit_price >= 0),
    CHECK (line_subtotal >= 0 AND tax_amount >= 0 AND line_total >= 0),
    CHECK (line_total = line_subtotal + tax_amount),
    CHECK (sequence >= 0)
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_purchase_order_lines
    ON public.accounting_purchase_order_lines(company_id, purchase_order_id, sequence)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_goods_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    receipt_number VARCHAR(100) NOT NULL,
    purchase_order_id UUID NOT NULL REFERENCES public.accounting_purchase_orders(id) ON DELETE RESTRICT,
    received_on DATE NOT NULL DEFAULT CURRENT_DATE,
    received_by UUID NOT NULL,
    delivery_reference VARCHAR(160),
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'draft',
    confirmed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (status IN ('draft','confirmed','cancelled'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_goods_receipt_number
    ON public.accounting_goods_receipts(company_id, receipt_number)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_goods_receipt_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    receipt_id UUID NOT NULL REFERENCES public.accounting_goods_receipts(id) ON DELETE CASCADE,
    purchase_order_line_id UUID NOT NULL REFERENCES public.accounting_purchase_order_lines(id) ON DELETE RESTRICT,
    quantity_received NUMERIC(19,4) NOT NULL,
    accepted_quantity NUMERIC(19,4) NOT NULL,
    rejected_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    rejection_reason TEXT,
    sequence INTEGER NOT NULL DEFAULT 10,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (quantity_received > 0),
    CHECK (accepted_quantity >= 0),
    CHECK (rejected_quantity >= 0),
    CHECK (accepted_quantity + rejected_quantity = quantity_received),
    CHECK (sequence >= 0)
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_goods_receipt_lines
    ON public.accounting_goods_receipt_lines(company_id, receipt_id, purchase_order_line_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_purchase_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE RESTRICT,
    purchase_order_id UUID NOT NULL REFERENCES public.accounting_purchase_orders(id) ON DELETE RESTRICT,
    match_type VARCHAR(20) NOT NULL DEFAULT 'three_way',
    ordered_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    received_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    invoiced_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    amount_variance NUMERIC(19,2) NOT NULL DEFAULT 0,
    quantity_variance_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
    price_variance_percent NUMERIC(9,4) NOT NULL DEFAULT 0,
    result VARCHAR(20) NOT NULL DEFAULT 'pending',
    override_reason TEXT,
    overridden_by UUID,
    overridden_at TIMESTAMPTZ,
    checked_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (match_type IN ('two_way','three_way')),
    CHECK (result IN ('pending','matched','exception','overridden'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_purchase_match_document
    ON public.accounting_purchase_matches(company_id, vendor_document_id)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_purchase_matches_order
    ON public.accounting_purchase_matches(company_id, purchase_order_id, result)
    WHERE deleted_at IS NULL;

  ALTER TABLE public.accounting_vendor_documents
    ADD COLUMN IF NOT EXISTS purchase_order_id UUID
      REFERENCES public.accounting_purchase_orders(id) ON DELETE SET NULL;

  ALTER TABLE public.accounting_vendor_documents
    ADD COLUMN IF NOT EXISTS purchase_match_status VARCHAR(20)
      CHECK (
        purchase_match_status IS NULL
        OR purchase_match_status IN ('not_required','pending','matched','exception','overridden')
      );

  CREATE OR REPLACE VIEW public.accounting_purchase_order_receipt_totals AS
  SELECT
    po.company_id,
    po.id AS purchase_order_id,
    COALESCE(SUM(pol.quantity),0)::numeric(19,4) AS ordered_quantity,
    COALESCE(SUM(received.accepted_quantity),0)::numeric(19,4) AS accepted_quantity
  FROM public.accounting_purchase_orders po
  JOIN public.accounting_purchase_order_lines pol
    ON pol.company_id=po.company_id
   AND pol.purchase_order_id=po.id
   AND pol.deleted_at IS NULL
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(grl.accepted_quantity),0)::numeric(19,4) AS accepted_quantity
    FROM public.accounting_goods_receipt_lines grl
    JOIN public.accounting_goods_receipts gr
      ON gr.company_id=grl.company_id
     AND gr.id=grl.receipt_id
     AND gr.deleted_at IS NULL
     AND gr.status='confirmed'
    WHERE grl.company_id=po.company_id
      AND grl.purchase_order_line_id=pol.id
      AND grl.deleted_at IS NULL
  ) received ON TRUE
  WHERE po.deleted_at IS NULL
  GROUP BY po.company_id,po.id;
`;


export const ACCOUNTING_2_9_0_TO_2_10_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.9.0-to-2.10.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.9.0',
    toVersion:
      '2.10.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
