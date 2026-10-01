import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  CREATE TABLE IF NOT EXISTS public.accounting_vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_code VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    tax_number VARCHAR(100),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    purchase_supplier_id UUID,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (payment_terms_days >= 0 AND payment_terms_days <= 3650),
    CHECK (status IN ('active','inactive','blocked'))
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_vendors_company_code
    ON public.accounting_vendors(company_id, vendor_code)
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_vendors_company_status
    ON public.accounting_vendors(company_id, status, name)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_vendor_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    vendor_id UUID NOT NULL REFERENCES public.accounting_vendors(id) ON DELETE RESTRICT,
    document_type VARCHAR(20) NOT NULL,
    document_number VARCHAR(100) NOT NULL,
    vendor_reference VARCHAR(160),
    document_date DATE NOT NULL,
    due_date DATE,
    currency VARCHAR(3) NOT NULL,
    exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1,
    base_currency VARCHAR(3) NOT NULL,
    subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_total NUMERIC(19,4) NOT NULL DEFAULT 0,
    total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    base_total_amount NUMERIC(19,2) NOT NULL DEFAULT 0,
    status VARCHAR(30) NOT NULL DEFAULT 'draft',
    source_module VARCHAR(80),
    source_type VARCHAR(120),
    source_id VARCHAR(160),
    approved_by UUID,
    approved_at TIMESTAMPTZ,
    posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    posted_at TIMESTAMPTZ,
    reversed_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
    reversed_at TIMESTAMPTZ,
    cancelled_by UUID,
    cancelled_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (document_type IN ('bill','credit_note')),
    CHECK (exchange_rate > 0),
    CHECK (subtotal >= 0 AND tax_total >= 0 AND total_amount >= 0),
    CHECK (base_total_amount >= 0),
    CHECK (total_amount = subtotal + tax_total),
    CHECK (
      status IN (
        'draft',
        'approved',
        'posted',
        'partially_settled',
        'settled',
        'reversed',
        'cancelled'
      )
    ),
    CHECK (
      document_type <> 'bill'
      OR due_date IS NOT NULL
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_vendor_document_number
    ON public.accounting_vendor_documents(company_id, document_number)
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_vendor_reference
    ON public.accounting_vendor_documents(
      company_id,
      vendor_id,
      document_type,
      vendor_reference
    )
    WHERE deleted_at IS NULL
      AND vendor_reference IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_vendor_documents_due
    ON public.accounting_vendor_documents(company_id, status, due_date, vendor_id)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_vendor_document_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
    description TEXT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    line_subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
    tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    line_total NUMERIC(19,4) NOT NULL DEFAULT 0,
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

  CREATE INDEX IF NOT EXISTS idx_accounting_vendor_document_lines
    ON public.accounting_vendor_document_lines(
      company_id,
      document_id,
      sequence,
      id
    )
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.accounting_vendor_credit_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    credit_document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE RESTRICT,
    bill_document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE RESTRICT,
    amount NUMERIC(19,4) NOT NULL,
    application_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(20) NOT NULL DEFAULT 'posted',
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (amount > 0),
    CHECK (status IN ('posted','reversed')),
    CHECK (credit_document_id <> bill_document_id)
  );

  CREATE INDEX IF NOT EXISTS idx_accounting_vendor_credit_applications_credit
    ON public.accounting_vendor_credit_applications(
      company_id,
      credit_document_id,
      status
    )
    WHERE deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_accounting_vendor_credit_applications_bill
    ON public.accounting_vendor_credit_applications(
      company_id,
      bill_document_id,
      status
    )
    WHERE deleted_at IS NULL;

  CREATE OR REPLACE VIEW public.accounting_vendor_document_balances AS
  SELECT
    d.company_id,
    d.id AS document_id,
    d.vendor_id,
    d.document_type,
    d.document_number,
    d.vendor_reference,
    d.document_date,
    d.due_date,
    d.currency,
    d.exchange_rate,
    d.base_currency,
    d.total_amount,
    d.base_total_amount,
    d.status,
    CASE
      WHEN d.document_type='bill'
        THEN COALESCE(bill_credit.applied_amount,0)
      ELSE COALESCE(credit_use.applied_amount,0)
    END::numeric(19,4) AS applied_amount,
    GREATEST(
      d.total_amount -
      CASE
        WHEN d.document_type='bill'
          THEN COALESCE(bill_credit.applied_amount,0)
        ELSE COALESCE(credit_use.applied_amount,0)
      END,
      0
    )::numeric(19,4) AS open_amount,
    GREATEST(
      d.base_total_amount -
      ROUND(
        CASE
          WHEN d.document_type='bill'
            THEN COALESCE(bill_credit.applied_amount,0)
          ELSE COALESCE(credit_use.applied_amount,0)
        END * d.exchange_rate,
        2
      ),
      0
    )::numeric(19,2) AS base_open_amount
  FROM public.accounting_vendor_documents d
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS applied_amount
    FROM public.accounting_vendor_credit_applications a
    WHERE a.company_id=d.company_id
      AND a.bill_document_id=d.id
      AND a.status='posted'
      AND a.deleted_at IS NULL
  ) bill_credit ON TRUE
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS applied_amount
    FROM public.accounting_vendor_credit_applications a
    WHERE a.company_id=d.company_id
      AND a.credit_document_id=d.id
      AND a.status='posted'
      AND a.deleted_at IS NULL
  ) credit_use ON TRUE
  WHERE d.deleted_at IS NULL
    AND d.status IN ('posted','partially_settled','settled');

  CREATE OR REPLACE VIEW public.accounting_payables_aging AS
  SELECT
    b.company_id,
    b.document_id,
    b.vendor_id,
    b.document_number,
    b.vendor_reference,
    b.document_date,
    b.due_date,
    b.currency,
    b.exchange_rate,
    b.base_currency,
    b.total_amount,
    b.open_amount,
    b.base_open_amount,
    GREATEST((CURRENT_DATE - b.due_date),0)::int AS days_overdue,
    CASE
      WHEN b.due_date >= CURRENT_DATE THEN 'current'
      WHEN CURRENT_DATE - b.due_date <= 30 THEN '1-30'
      WHEN CURRENT_DATE - b.due_date <= 60 THEN '31-60'
      WHEN CURRENT_DATE - b.due_date <= 90 THEN '61-90'
      ELSE '90+'
    END AS aging_bucket
  FROM public.accounting_vendor_document_balances b
  WHERE b.document_type='bill'
    AND b.status IN ('posted','partially_settled')
    AND b.open_amount > 0;

  CREATE OR REPLACE VIEW public.accounting_vendor_balances AS
  SELECT
    v.company_id,
    v.id AS vendor_id,
    COALESCE(SUM(b.base_open_amount) FILTER (WHERE b.document_type='bill'),0)::numeric(19,2)
      AS outstanding_bills,
    COALESCE(SUM(b.base_open_amount) FILTER (WHERE b.document_type='credit_note'),0)::numeric(19,2)
      AS available_credits,
    (
      COALESCE(SUM(b.base_open_amount) FILTER (WHERE b.document_type='bill'),0) -
      COALESCE(SUM(b.base_open_amount) FILTER (WHERE b.document_type='credit_note'),0)
    )::numeric(19,2) AS net_payable
  FROM public.accounting_vendors v
  LEFT JOIN public.accounting_vendor_document_balances b
    ON b.company_id=v.company_id
   AND b.vendor_id=v.id
  WHERE v.deleted_at IS NULL
  GROUP BY v.company_id,v.id;
`;


export const ACCOUNTING_2_8_0_TO_2_9_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.8.0-to-2.9.0',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.8.0',
    toVersion:
      '2.9.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
