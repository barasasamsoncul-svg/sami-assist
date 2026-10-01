/** Shared by fresh installs and the versioned upgrade. */
export const ACCOUNTING_PAYMENTS_SQL = `
CREATE TABLE IF NOT EXISTS public.accounting_payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  request_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  kind VARCHAR(30) NOT NULL CHECK (kind IN ('vendor_payment','settlement')),
  reference VARCHAR(255) NOT NULL CHECK (length(trim(reference)) > 0),
  payment_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL,
  source_account_id UUID NOT NULL REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
  destination_account_id UUID REFERENCES public.accounting_bank_accounts(id) ON DELETE RESTRICT,
  fee_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  gross_amount NUMERIC(15,2) NOT NULL CHECK (gross_amount > 0),
  fee_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (fee_amount >= 0),
  net_amount NUMERIC(15,2) NOT NULL CHECK (net_amount > 0),
  notes VARCHAR(2000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','posted','reversed','cancelled')),
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  reversal_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  approved_by UUID, approved_at TIMESTAMPTZ, posted_by UUID, posted_at TIMESTAMPTZ,
  reversed_by UUID, reversed_at TIMESTAMPTZ,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ,
  UNIQUE(company_id,id), UNIQUE(company_id,request_key),
  CHECK (source_account_id IS DISTINCT FROM destination_account_id),
  CHECK ((kind='vendor_payment' AND destination_account_id IS NULL AND fee_amount=0 AND net_amount=gross_amount)
    OR (kind='settlement' AND destination_account_id IS NOT NULL AND gross_amount=net_amount+fee_amount)),
  CHECK ((fee_amount=0 AND fee_account_id IS NULL) OR (fee_amount>0 AND fee_account_id IS NOT NULL)),
  CHECK ((status IN ('posted','reversed')) = (posted_journal_id IS NOT NULL)),
  CHECK ((status='reversed') = (reversal_journal_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_payment_external_reference
 ON public.accounting_payment_batches(company_id,source_account_id,lower(trim(reference)))
 WHERE status <> 'cancelled';
CREATE INDEX IF NOT EXISTS idx_accounting_payment_batches_date
 ON public.accounting_payment_batches(company_id,payment_date DESC,created_at DESC);
CREATE TABLE IF NOT EXISTS public.accounting_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,
  bill_document_id UUID NOT NULL REFERENCES public.accounting_vendor_documents(id) ON DELETE RESTRICT,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), deleted_at TIMESTAMPTZ,
  FOREIGN KEY(company_id,batch_id) REFERENCES public.accounting_payment_batches(company_id,id) ON DELETE RESTRICT,
  UNIQUE(company_id,batch_id,bill_document_id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_payment_allocations_bill
 ON public.accounting_payment_allocations(company_id,bill_document_id);
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
        THEN (COALESCE(bill_credit.applied_amount,0) + COALESCE(payments.applied_amount,0))
      ELSE COALESCE(credit_use.applied_amount,0)
    END::numeric(19,4) AS applied_amount,
    GREATEST(
      d.total_amount -
      CASE
        WHEN d.document_type='bill'
          THEN (COALESCE(bill_credit.applied_amount,0) + COALESCE(payments.applied_amount,0))
        ELSE COALESCE(credit_use.applied_amount,0)
      END,
      0
    )::numeric(19,4) AS open_amount,
    GREATEST(
      d.base_total_amount -
      ROUND(
        CASE
          WHEN d.document_type='bill'
            THEN (COALESCE(bill_credit.applied_amount,0) + COALESCE(payments.applied_amount,0))
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
  LEFT JOIN LATERAL (
    SELECT SUM(a.amount) AS applied_amount
    FROM public.accounting_payment_allocations a
    JOIN public.accounting_payment_batches b ON b.company_id=a.company_id AND b.id=a.batch_id
    WHERE a.company_id=d.company_id AND a.bill_document_id=d.id
      AND b.status='posted' AND b.deleted_at IS NULL AND a.deleted_at IS NULL
  ) payments ON TRUE
  WHERE d.deleted_at IS NULL
    AND d.status IN ('posted','partially_settled','settled');

`;
