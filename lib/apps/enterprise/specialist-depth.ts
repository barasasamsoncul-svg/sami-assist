import 'server-only';

import {
  isSpecialistEnterpriseModuleKey,
  type SpecialistEnterpriseModuleKey,
} from '@/lib/apps/enterprise/specialist-catalog';

import {
  financeSpecialistDepthSql,
} from '@/lib/apps/enterprise/specialist-finance-depth';

import {
  peopleSpecialistDepthSql,
} from '@/lib/apps/enterprise/specialist-people-depth';


import {
  specialistBreadthDepthSql,
} from '@/lib/apps/enterprise/specialist-breadth-depth';


import {
  commerceParityDepthSql,
} from '@/lib/apps/enterprise/strict-parity-commerce-depth';

import {
  peopleMarketingParityDepthSql,
} from '@/lib/apps/enterprise/strict-parity-people-marketing-depth';




function accountingSql() {
  return `
CREATE TABLE IF NOT EXISTS public.accounting_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_year_start_month SMALLINT NOT NULL DEFAULT 1,
  fiscal_year_start_day SMALLINT NOT NULL DEFAULT 1,
  default_receivable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_payable_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  retained_earnings_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  output_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  input_tax_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  default_cash_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_gain_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  fx_loss_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  write_off_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  rounding_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  rounding_method VARCHAR(30) NOT NULL DEFAULT 'half_up',
  global_lock_date DATE,
  lock_posted_entries BOOLEAN NOT NULL DEFAULT TRUE,
  require_open_period BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  CHECK (fiscal_year_start_day BETWEEN 1 AND 31),
  CHECK (rounding_method IN ('half_up','half_even'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_settings_active
  ON public.accounting_settings(company_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(10)
    NOT NULL DEFAULT 'debit'
    CHECK (normal_balance IN ('debit','credit')),
  ADD COLUMN IF NOT EXISTS reconcile BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS allow_manual_posting BOOLEAN
    NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_control_account BOOLEAN
    NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS system_role VARCHAR(80),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS sequence INTEGER
    NOT NULL DEFAULT 100
    CHECK (sequence >= 0),
  ADD COLUMN IF NOT EXISTS template_key VARCHAR(80);

ALTER TABLE public.accounts
  DROP CONSTRAINT IF EXISTS accounts_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_company_code
  ON public.accounts(company_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_company_parent
  ON public.accounts(company_id, parent_account_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_accounts_company_type
  ON public.accounts(company_id, account_type, is_active, code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_company_system_role
  ON public.accounts(company_id, system_role)
  WHERE deleted_at IS NULL
    AND system_role IS NOT NULL;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_module VARCHAR(80),
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(120),
  ADD COLUMN IF NOT EXISTS source_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS source_event_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS posting_kind VARCHAR(30)
    NOT NULL DEFAULT 'manual'
    CHECK (posting_kind IN ('manual','system','reversal','opening')),
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reversal_of_journal_id UUID
    REFERENCES public.journals(id)
    ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS reversed_by_journal_id UUID
    REFERENCES public.journals(id)
    ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approved_by UUID,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approval_note TEXT,
  ADD COLUMN IF NOT EXISTS posted_by UUID;

CREATE INDEX IF NOT EXISTS idx_journals_company_workflow
  ON public.journals(company_id, status, journal_date, created_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.journals
  DROP CONSTRAINT IF EXISTS journals_journal_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_company_number
  ON public.journals(company_id, journal_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_journals_company_source_event
  ON public.journals(company_id, source_module, source_event_key)
  WHERE deleted_at IS NULL
    AND source_module IS NOT NULL
    AND source_event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_company_source
  ON public.journals(company_id, source_module, source_type, source_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.journal_lines
  ADD COLUMN IF NOT EXISTS company_id UUID
    REFERENCES public.companies(id)
    ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ
    NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

ALTER TABLE public.journal_lines
  DROP CONSTRAINT IF EXISTS journal_lines_one_sided_amount,
  DROP CONSTRAINT IF EXISTS journal_lines_nonnegative_amounts;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT journal_lines_nonnegative_amounts
    CHECK (debit >= 0 AND credit >= 0)
    NOT VALID,
  ADD CONSTRAINT journal_lines_one_sided_amount
    CHECK (
      (debit > 0 AND credit = 0)
      OR
      (credit > 0 AND debit = 0)
    )
    NOT VALID;

CREATE INDEX IF NOT EXISTS idx_journal_lines_company_journal
  ON public.journal_lines(company_id, journal_id, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_journal_lines_company_account
  ON public.journal_lines(company_id, account_id, id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_fiscal_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  starts_on DATE NOT NULL,
  ends_on DATE NOT NULL,
  lock_date DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (ends_on >= starts_on),
  CHECK (status IN ('open','closing','closed'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_periods_company
  ON public.accounting_fiscal_periods(company_id, starts_on, ends_on)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ledger_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  name VARCHAR(160) NOT NULL,
  bank_name VARCHAR(160),
  account_number_last4 VARCHAR(4),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  opening_balance NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','inactive','closed'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_bank_accounts_company
  ON public.accounting_bank_accounts(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_account_id UUID NOT NULL REFERENCES public.accounting_bank_accounts(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  description TEXT,
  external_reference VARCHAR(255),
  amount NUMERIC(19,4) NOT NULL,
  matched_journal_line_id UUID REFERENCES public.journal_lines(id) ON DELETE SET NULL,
  reconciliation_status VARCHAR(30) NOT NULL DEFAULT 'unmatched',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (reconciliation_status IN ('unmatched','suggested','matched','excluded'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_statement_company_status
  ON public.accounting_bank_statement_lines(company_id, reconciliation_status, transaction_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  match_text VARCHAR(255),
  min_amount NUMERIC(19,4),
  max_amount NUMERIC(19,4),
  target_account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_rules_company
  ON public.accounting_reconciliation_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_recurring_journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  frequency VARCHAR(20) NOT NULL,
  starts_on DATE NOT NULL,
  next_run_on DATE NOT NULL,
  ends_on DATE,
  reference_prefix VARCHAR(80),
  description TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  last_generated_at TIMESTAMPTZ,
  last_generated_journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  CHECK (status IN ('active','paused','ended')),
  CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CHECK (next_run_on >= starts_on)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_recurring_name
  ON public.accounting_recurring_journals(company_id, name)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_recurring_due
  ON public.accounting_recurring_journals(company_id, status, next_run_on)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_recurring_journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recurring_journal_id UUID NOT NULL REFERENCES public.accounting_recurring_journals(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  description TEXT,
  debit NUMERIC(15,2) NOT NULL DEFAULT 0,
  credit NUMERIC(15,2) NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 10,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence >= 0),
  CHECK (debit >= 0 AND credit >= 0),
  CHECK (
    (debit > 0 AND credit = 0)
    OR
    (credit > 0 AND debit = 0)
  )
);
CREATE INDEX IF NOT EXISTS idx_accounting_recurring_lines
  ON public.accounting_recurring_journal_lines(company_id, recurring_journal_id, sequence, id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_opening_balance_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  as_of_date DATE NOT NULL,
  source_type VARCHAR(20) NOT NULL DEFAULT 'migration',
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  import_key UUID NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  validation_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  validated_at TIMESTAMPTZ,
  validated_by UUID,
  posted_at TIMESTAMPTZ,
  posted_by UUID,
  posted_journal_id UUID REFERENCES public.journals(id) ON DELETE RESTRICT,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (source_type IN ('manual','csv','migration')),
  CHECK (status IN ('draft','validated','posted','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_opening_import_key
  ON public.accounting_opening_balance_batches(company_id, import_key)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_opening_batches_company
  ON public.accounting_opening_balance_batches(company_id, status, as_of_date, created_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_opening_balance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.accounting_opening_balance_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  source_row_key VARCHAR(160),
  account_code_input VARCHAR(50) NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE RESTRICT,
  description TEXT,
  raw_debit VARCHAR(80),
  raw_credit VARCHAR(80),
  debit NUMERIC(15,2),
  credit NUMERIC(15,2),
  subledger_type VARCHAR(20) NOT NULL DEFAULT 'none',
  subledger_reference VARCHAR(160),
  subledger_name VARCHAR(255),
  validation_status VARCHAR(20) NOT NULL DEFAULT 'unchecked',
  validation_messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (row_number > 0),
  CHECK (subledger_type IN ('none','customer','vendor','bank','tax','employee','other')),
  CHECK (validation_status IN ('unchecked','valid','warning','error'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_opening_batch_row
  ON public.accounting_opening_balance_lines(company_id, batch_id, row_number)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_opening_lines_account
  ON public.accounting_opening_balance_lines(company_id, account_id, batch_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_accounting_opening_lines_subledger
  ON public.accounting_opening_balance_lines(company_id, batch_id, subledger_type, subledger_reference)
  WHERE deleted_at IS NULL;

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
}


function inventorySql() {
  return `
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_number VARCHAR(160) NOT NULL,
  manufactured_on DATE,
  expires_on DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (expires_on IS NULL OR manufactured_on IS NULL OR expires_on >= manufactured_on),
  CHECK (status IN ('active','quarantined','expired','consumed'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_lots_company_product_number
  ON public.inventory_lots(company_id, product_id, lot_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  quantity NUMERIC(19,4) NOT NULL,
  source_type VARCHAR(80),
  source_reference VARCHAR(160),
  required_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (status IN ('active','allocated','consumed','released','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_company_product
  ON public.stock_reservations(company_id, product_id, warehouse_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_reorder_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  min_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  max_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  reorder_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  lead_time_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (min_quantity >= 0),
  CHECK (max_quantity >= min_quantity),
  CHECK (reorder_quantity >= 0),
  CHECK (lead_time_days >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reorder_company_product_warehouse
  ON public.inventory_reorder_rules(company_id, product_id, warehouse_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  adjustment_number VARCHAR(100) NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  counted_quantity NUMERIC(19,4) NOT NULL,
  system_quantity NUMERIC(19,4) NOT NULL,
  difference_quantity NUMERIC(19,4) NOT NULL,
  reason TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (counted_quantity >= 0),
  CHECK (system_quantity >= 0),
  CHECK (status IN ('draft','submitted','approved','posted','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_adjustment_number
  ON public.inventory_adjustments(company_id, adjustment_number)
  WHERE deleted_at IS NULL;
`;
}


function warehouseSql() {
  return `
CREATE TABLE IF NOT EXISTS public.warehouse_putaway_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_reference UUID,
  source_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  destination_location_id UUID NOT NULL REFERENCES public.warehouse_locations(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_warehouse_putaway_rules_company
  ON public.warehouse_putaway_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_picking_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  assigned_user_id UUID,
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','ready','in_progress','completed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_picking_batch_number
  ON public.warehouse_picking_batches(company_id, batch_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_picking_batch_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.warehouse_picking_batches(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL REFERENCES public.warehouse_operations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence > 0),
  CHECK (status IN ('active','completed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_batch_operation
  ON public.warehouse_picking_batch_operations(company_id, batch_id, operation_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.warehouse_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  package_number VARCHAR(120) NOT NULL,
  current_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  weight NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (weight >= 0),
  CHECK (status IN ('open','packed','in_transit','delivered','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_package_number
  ON public.warehouse_packages(company_id, package_number)
  WHERE deleted_at IS NULL;
`;
}


function payrollSql() {
  return `
CREATE TABLE IF NOT EXISTS public.payroll_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  component_type VARCHAR(30) NOT NULL,
  calculation_type VARCHAR(30) NOT NULL DEFAULT 'fixed',
  default_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  percentage_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  taxable BOOLEAN NOT NULL DEFAULT TRUE,
  statutory BOOLEAN NOT NULL DEFAULT FALSE,
  sequence INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (component_type IN ('earning','deduction','employer_contribution')),
  CHECK (calculation_type IN ('fixed','percentage')),
  CHECK (default_amount >= 0),
  CHECK (percentage_rate >= 0 AND percentage_rate <= 100),
  CHECK (sequence >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_component_code
  ON public.payroll_components(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payroll_employee_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE CASCADE,
  component_id UUID NOT NULL REFERENCES public.payroll_components(id) ON DELETE RESTRICT,
  amount_override NUMERIC(19,4),
  percentage_override NUMERIC(9,4),
  effective_from DATE,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount_override IS NULL OR amount_override >= 0),
  CHECK (percentage_override IS NULL OR (percentage_override >= 0 AND percentage_override <= 100)),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_components_employee
  ON public.payroll_employee_components(company_id, payroll_employee_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id UUID NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  payroll_employee_id UUID NOT NULL REFERENCES public.payroll_employees(id) ON DELETE RESTRICT,
  payslip_number VARCHAR(120) NOT NULL,
  gross_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  deduction_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  employer_contribution_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  net_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  generated_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (gross_amount >= 0),
  CHECK (deduction_amount >= 0),
  CHECK (employer_contribution_amount >= 0),
  CHECK (net_amount >= 0),
  CHECK (status IN ('draft','computed','approved','paid','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payslip_number
  ON public.payslips(company_id, payslip_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payslip_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payslip_id UUID NOT NULL REFERENCES public.payslips(id) ON DELETE CASCADE,
  component_id UUID REFERENCES public.payroll_components(id) ON DELETE SET NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  line_type VARCHAR(30) NOT NULL,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  rate NUMERIC(19,4) NOT NULL DEFAULT 1,
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (line_type IN ('earning','deduction','employer_contribution')),
  CHECK (quantity >= 0),
  CHECK (rate >= 0),
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_payslip_lines_payslip
  ON public.payslip_lines(company_id, payslip_id)
  WHERE deleted_at IS NULL;
`;
}


function crmSql() {
  return `
CREATE TABLE IF NOT EXISTS public.crm_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  entity_type VARCHAR(30) NOT NULL DEFAULT 'opportunity',
  name VARCHAR(120) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 100,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (entity_type IN ('lead','opportunity')),
  CHECK (sequence >= 0),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (NOT (is_won AND is_lost)),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_stages_company_entity
  ON public.crm_stages(company_id, entity_type, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_scoring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  field_key VARCHAR(120) NOT NULL,
  operator VARCHAR(30) NOT NULL,
  comparison_value TEXT,
  score_delta INTEGER NOT NULL DEFAULT 0,
  priority INTEGER NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (operator IN ('equals','contains','greater_than','less_than','is_set')),
  CHECK (priority >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_crm_scoring_rules_company
  ON public.crm_scoring_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  owner_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (target_amount >= 0),
  CHECK (status IN ('draft','active','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_crm_forecasts_company_period
  ON public.crm_forecasts(company_id, period_start, period_end)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.crm_forecast_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  forecast_id UUID NOT NULL REFERENCES public.crm_forecasts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
  forecast_category VARCHAR(30) NOT NULL DEFAULT 'pipeline',
  amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0,
  weighted_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (forecast_category IN ('pipeline','best_case','commit','closed')),
  CHECK (amount >= 0),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (weighted_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_crm_forecast_lines_forecast
  ON public.crm_forecast_lines(company_id, forecast_id)
  WHERE deleted_at IS NULL;
`;
}


function projectsSql() {
  return `
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  dependency_type VARCHAR(30) NOT NULL DEFAULT 'finish_to_start',
  lag_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (task_id <> depends_on_task_id),
  CHECK (dependency_type IN ('finish_to_start','start_to_start','finish_to_finish','start_to_finish')),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_dependencies_pair
  ON public.task_dependencies(company_id, task_id, depends_on_task_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  budget_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (budget_amount >= 0),
  CHECK (approved_amount >= 0),
  CHECK (status IN ('draft','submitted','approved','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_project_budgets_project
  ON public.project_budgets(company_id, project_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_budget_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.project_budgets(id) ON DELETE CASCADE,
  category VARCHAR(120) NOT NULL,
  planned_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  actual_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  committed_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (planned_amount >= 0),
  CHECK (actual_amount >= 0),
  CHECK (committed_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_project_budget_lines_budget
  ON public.project_budget_lines(company_id, budget_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.project_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resource_type VARCHAR(30) NOT NULL DEFAULT 'user',
  resource_reference UUID,
  role_name VARCHAR(120),
  allocation_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  hourly_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  starts_on DATE,
  ends_on DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (resource_type IN ('user','equipment','vendor')),
  CHECK (allocation_percent >= 0 AND allocation_percent <= 100),
  CHECK (hourly_cost >= 0),
  CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_project_resources_project
  ON public.project_resources(company_id, project_id, status)
  WHERE deleted_at IS NULL;
`;
}


function helpdeskSql() {
  return `
CREATE TABLE IF NOT EXISTS public.helpdesk_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  priority VARCHAR(30),
  first_response_minutes INTEGER NOT NULL DEFAULT 60,
  resolution_minutes INTEGER NOT NULL DEFAULT 480,
  business_hours_only BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (first_response_minutes > 0),
  CHECK (resolution_minutes > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_sla_policies_company
  ON public.helpdesk_sla_policies(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_sla_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  sla_policy_id UUID REFERENCES public.helpdesk_sla_policies(id) ON DELETE SET NULL,
  first_response_due_at TIMESTAMPTZ,
  first_response_at TIMESTAMPTZ,
  resolution_due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  breached_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('active','met','breached','paused','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_sla_tracking_ticket
  ON public.ticket_sla_tracking(company_id, ticket_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(180) NOT NULL,
  summary TEXT,
  body TEXT NOT NULL,
  category VARCHAR(120),
  published_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','published','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_knowledge_article_slug
  ON public.knowledge_articles(company_id, slug)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.ticket_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  escalated_to UUID,
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('open','acknowledged','resolved','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_ticket_escalations_ticket
  ON public.ticket_escalations(company_id, ticket_id, status)
  WHERE deleted_at IS NULL;
`;
}


function manufacturingSql() {
  return `
CREATE TABLE IF NOT EXISTS public.work_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  capacity NUMERIC(19,4) NOT NULL DEFAULT 1,
  cost_per_hour NUMERIC(19,4) NOT NULL DEFAULT 0,
  efficiency_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (capacity > 0),
  CHECK (cost_per_hour >= 0),
  CHECK (efficiency_percent > 0 AND efficiency_percent <= 100),
  CHECK (status IN ('active','maintenance','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_center_code
  ON public.work_centers(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_routings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bom_id UUID REFERENCES public.boms(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  version VARCHAR(50),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_routings_bom
  ON public.manufacturing_routings(company_id, bom_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_routing_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  routing_id UUID NOT NULL REFERENCES public.manufacturing_routings(id) ON DELETE CASCADE,
  work_center_id UUID REFERENCES public.work_centers(id) ON DELETE SET NULL,
  sequence INTEGER NOT NULL DEFAULT 1,
  operation_name VARCHAR(200) NOT NULL,
  setup_minutes NUMERIC(19,4) NOT NULL DEFAULT 0,
  run_minutes_per_unit NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (sequence > 0),
  CHECK (setup_minutes >= 0),
  CHECK (run_minutes_per_unit >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_routing_steps_routing
  ON public.manufacturing_routing_steps(company_id, routing_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.manufacturing_material_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  manufacturing_order_id UUID NOT NULL REFERENCES public.manufacturing_orders(id) ON DELETE CASCADE,
  component_product_id UUID,
  required_quantity NUMERIC(19,4) NOT NULL,
  reserved_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  consumed_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
  warehouse_reference UUID,
  lot_reference VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'required',
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (required_quantity > 0),
  CHECK (reserved_quantity >= 0),
  CHECK (consumed_quantity >= 0),
  CHECK (reserved_quantity <= required_quantity),
  CHECK (consumed_quantity <= required_quantity),
  CHECK (status IN ('required','reserved','partially_reserved','consumed','released','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_manufacturing_material_reservations_order
  ON public.manufacturing_material_reservations(company_id, manufacturing_order_id, status)
  WHERE deleted_at IS NULL;
`;
}


export function specialistDepthSql(
  moduleKey:
    string,
) {
  if (
    !isSpecialistEnterpriseModuleKey(
      moduleKey,
    )
  ) {
    return '';
  }

  const key:
    SpecialistEnterpriseModuleKey =
    moduleKey;

  let coreSql =
    '';

  switch (
    key
  ) {
    case 'accounting':
      coreSql =
        accountingSql();
      break;
    case 'inventory':
      coreSql =
        inventorySql();
      break;
    case 'warehouse':
      coreSql =
        warehouseSql();
      break;
    case 'payroll':
      coreSql =
        payrollSql();
      break;
    case 'crm':
      coreSql =
        crmSql();
      break;
    case 'projects':
      coreSql =
        projectsSql();
      break;
    case 'helpdesk':
      coreSql =
        helpdeskSql();
      break;
    case 'manufacturing':
      coreSql =
        manufacturingSql();
      break;
  }

  return [
    coreSql,
    financeSpecialistDepthSql(
      key,
    ),
    peopleSpecialistDepthSql(
      key,
    ),
    specialistBreadthDepthSql(
      key,
    ),
    commerceParityDepthSql(
      key,
    ),
    peopleMarketingParityDepthSql(
      key,
    ),
  ]
    .filter(
      sql =>
        sql.trim(),
    )
    .join(
      '\n',
    );
}
