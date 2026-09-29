-- ============================================================
-- SaMi Invoicing Module Schema v2.0.0
-- Non-destructive, company-scoped and integration-ready.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.invoicing_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.invoicing_payment_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  description TEXT,
  due_days INTEGER NOT NULL DEFAULT 30 CHECK (due_days >= 0),
  discount_percentage NUMERIC(7,4) NOT NULL DEFAULT 0 CHECK (discount_percentage BETWEEN 0 AND 100),
  discount_days INTEGER CHECK (discount_days IS NULL OR discount_days >= 0),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_terms_company_name
  ON public.invoicing_payment_terms(company_id, LOWER(name))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_terms_company
  ON public.invoicing_payment_terms(company_id, is_active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_tax_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (rate BETWEEN 0 AND 100),
  tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
  country_code VARCHAR(2),
  external_tax_id UUID,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_rates_company_name
  ON public.invoicing_tax_rates(company_id, LOWER(name))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_tax_rates_company
  ON public.invoicing_tax_rates(company_id, is_active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_crm_contact_id UUID,
  customer_type VARCHAR(30) NOT NULL DEFAULT 'company'
    CHECK (customer_type IN ('individual','company','government','non_profit')),
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  contact_name VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(60),
  website VARCHAR(255),
  billing_address TEXT,
  shipping_address TEXT,
  city VARCHAR(120),
  state VARCHAR(120),
  postal_code VARCHAR(40),
  country VARCHAR(120),
  country_code VARCHAR(2),
  tax_id VARCHAR(120),
  registration_number VARCHAR(120),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  payment_terms_id UUID REFERENCES public.invoicing_payment_terms(id) ON DELETE SET NULL,
  credit_limit NUMERIC(19,4) CHECK (credit_limit IS NULL OR credit_limit >= 0),
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','inactive','blocked')),
  reminder_mode VARCHAR(20) NOT NULL DEFAULT 'inherit'
    CHECK (reminder_mode IN ('inherit','enabled','paused','disabled')),
  reminder_pause_until TIMESTAMPTZ,
  reminder_pause_reason TEXT,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoicing_customers_company
  ON public.invoicing_customers(company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_customers_search
  ON public.invoicing_customers(company_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_catalog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_product_id UUID,
  item_type VARCHAR(30) NOT NULL DEFAULT 'service'
    CHECK (item_type IN ('service','product')),
  name VARCHAR(255) NOT NULL,
  sku VARCHAR(120),
  description TEXT,
  unit VARCHAR(40) NOT NULL DEFAULT 'unit',
  unit_price NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  default_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_catalog_company_sku
  ON public.invoicing_catalog_items(company_id, LOWER(sku))
  WHERE sku IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_catalog_company
  ON public.invoicing_catalog_items(company_id, is_active)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  primary_color VARCHAR(16) NOT NULL DEFAULT '#164a9f',
  secondary_color VARCHAR(16) NOT NULL DEFAULT '#0f172a',
  accent_color VARCHAR(16),
  logo_url TEXT,
  font_family VARCHAR(100) NOT NULL DEFAULT 'Inter',
  layout VARCHAR(40) NOT NULL DEFAULT 'modern',
  show_company_logo BOOLEAN NOT NULL DEFAULT TRUE,
  show_company_address BOOLEAN NOT NULL DEFAULT TRUE,
  show_company_contact BOOLEAN NOT NULL DEFAULT TRUE,
  show_tax_id BOOLEAN NOT NULL DEFAULT TRUE,
  show_payment_instructions BOOLEAN NOT NULL DEFAULT TRUE,
  show_tax_breakdown BOOLEAN NOT NULL DEFAULT TRUE,
  show_discount BOOLEAN NOT NULL DEFAULT TRUE,
  footer_text TEXT,
  terms_text TEXT,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_templates_company_name
  ON public.invoicing_templates(company_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type VARCHAR(40) NOT NULL,
  prefix VARCHAR(40) NOT NULL,
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  padding SMALLINT NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  format VARCHAR(120) NOT NULL DEFAULT '{prefix}{number}',
  reset_frequency VARCHAR(20) NOT NULL DEFAULT 'never'
    CHECK (reset_frequency IN ('never','monthly','yearly','fiscal_year')),
  last_reset_key VARCHAR(30),
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, document_type)
);

CREATE TABLE IF NOT EXISTS public.invoicing_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  default_currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  default_due_days INTEGER NOT NULL DEFAULT 30 CHECK (default_due_days >= 0),
  default_payment_terms_id UUID REFERENCES public.invoicing_payment_terms(id) ON DELETE SET NULL,
  default_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE SET NULL,
  default_template_id UUID REFERENCES public.invoicing_templates(id) ON DELETE SET NULL,
  tax_calculation VARCHAR(20) NOT NULL DEFAULT 'exclusive'
    CHECK (tax_calculation IN ('exclusive','inclusive')),
  allow_partial_payments BOOLEAN NOT NULL DEFAULT TRUE,
  allow_credit_notes BOOLEAN NOT NULL DEFAULT TRUE,
  require_approval BOOLEAN NOT NULL DEFAULT FALSE,
  auto_send_recurring BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  reminder_days_after INTEGER[] NOT NULL DEFAULT ARRAY[1,7,14],
  portal_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  portal_access_days INTEGER NOT NULL DEFAULT 90
    CHECK (portal_access_days BETWEEN 1 AND 3650),
  portal_allow_messages BOOLEAN NOT NULL DEFAULT TRUE,
  portal_show_payment_history BOOLEAN NOT NULL DEFAULT TRUE,
  portal_show_credit_notes BOOLEAN NOT NULL DEFAULT TRUE,
  payment_instructions TEXT,
  bank_details TEXT,
  terms_and_conditions TEXT,
  invoice_email_subject VARCHAR(255),
  invoice_email_message TEXT,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE TABLE IF NOT EXISTS public.invoicing_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  bill_to_name VARCHAR(255),
  bill_to_email VARCHAR(255),
  bill_to_phone VARCHAR(60),
  bill_to_address TEXT,
  bill_to_tax_id VARCHAR(120),
  payment_terms_name_snapshot VARCHAR(140),
  tax_calculation VARCHAR(20) NOT NULL DEFAULT 'exclusive'
    CHECK (tax_calculation IN ('exclusive','inclusive')),
  template_id UUID REFERENCES public.invoicing_templates(id) ON DELETE SET NULL,
  external_sales_order_id UUID,
  invoice_number VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','rejected','confirmed','sent','viewed','partially_paid','paid','overdue','cancelled','void','written_off')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  reference VARCHAR(255),
  purchase_order_number VARCHAR(180),
  service_date DATE,
  ship_to_address TEXT,
  salesperson_user_id UUID,
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  shipping_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  rounding_adjustment NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  payment_instructions TEXT,
  public_token_hash VARCHAR(64),
  public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  submitted_by UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  rejected_at TIMESTAMPTZ,
  rejected_by UUID,
  confirmed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(company_id, invoice_number),
  CHECK (due_date >= invoice_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_public_token_hash
  ON public.invoicing_invoices(public_token_hash)
  WHERE public_token_hash IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_invoices_company_status
  ON public.invoicing_invoices(company_id, status, invoice_date DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_invoices_customer
  ON public.invoicing_invoices(company_id, customer_id, invoice_date DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_invoices_due
  ON public.invoicing_invoices(company_id, due_date)
  WHERE deleted_at IS NULL AND status NOT IN ('paid','cancelled','void','written_off');

CREATE TABLE IF NOT EXISTS public.invoicing_invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  catalog_item_id UUID REFERENCES public.invoicing_catalog_items(id) ON DELETE SET NULL,
  external_product_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sku_snapshot VARCHAR(120),
  unit VARCHAR(40) NOT NULL DEFAULT 'unit',
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent','fixed')),
  discount_value NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE SET NULL,
  tax_name_snapshot VARCHAR(120),
  tax_rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_invoice_items_invoice
  ON public.invoicing_invoice_items(invoice_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.invoicing_document_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  document_type VARCHAR(30) NOT NULL DEFAULT 'invoice'
    CHECK (document_type IN ('invoice')),
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_reason VARCHAR(40) NOT NULL
    CHECK (snapshot_reason IN ('confirmed','delivery','legacy_backfill','manual')),
  invoice_status VARCHAR(30) NOT NULL,
  renderer_version VARCHAR(80) NOT NULL,
  payload JSONB NOT NULL,
  payload_sha256 VARCHAR(64) NOT NULL,
  pdf_bytes BYTEA NOT NULL,
  pdf_sha256 VARCHAR(64) NOT NULL,
  pdf_size_bytes INTEGER NOT NULL
    CHECK (pdf_size_bytes BETWEEN 1 AND 20971520),
  created_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(invoice_id, version_no),
  UNIQUE(invoice_id, pdf_sha256)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_document_snapshot_primary
  ON public.invoicing_document_snapshots(invoice_id)
  WHERE is_primary = TRUE;
CREATE INDEX IF NOT EXISTS idx_invoicing_document_snapshots_invoice
  ON public.invoicing_document_snapshots(company_id, invoice_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_invoicing_document_snapshots_hash
  ON public.invoicing_document_snapshots(company_id, pdf_sha256);

CREATE TABLE IF NOT EXISTS public.invoicing_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_status_history_invoice
  ON public.invoicing_status_history(invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoicing_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_payment_id UUID,
  payment_number VARCHAR(140) NOT NULL,
  customer_id UUID REFERENCES public.invoicing_customers(id) ON DELETE SET NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  method VARCHAR(50) NOT NULL DEFAULT 'other',
  reference VARCHAR(255),
  idempotency_key VARCHAR(160),
  accounting_model VARCHAR(30) NOT NULL DEFAULT 'customer_credit'
    CHECK (accounting_model IN ('legacy_direct_ar','customer_credit')),
  status VARCHAR(30) NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft','posted','reversed')),
  reconciled_at TIMESTAMPTZ,
  reconciled_by UUID,
  reconciliation_reference VARCHAR(255),
  reconciliation_notes TEXT,
  notes TEXT,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(company_id, payment_number)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_payments_company
  ON public.invoicing_payments(company_id, payment_date DESC, id DESC)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payments_idempotency
  ON public.invoicing_payments(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_payments_reconciled
  ON public.invoicing_payments(company_id, reconciled_at DESC)
  WHERE deleted_at IS NULL AND reconciled_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted','reversed')),
  operation_key VARCHAR(160),
  created_by UUID,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID,
  reversal_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_allocations_invoice
  ON public.invoicing_payment_allocations(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_allocations_payment
  ON public.invoicing_payment_allocations(payment_id, created_at, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_allocation_operation
  ON public.invoicing_payment_allocations(company_id, operation_key)
  WHERE operation_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE RESTRICT,
  refund_number VARCHAR(140) NOT NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  method VARCHAR(50) NOT NULL DEFAULT 'other',
  reference VARCHAR(255),
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'posted'
    CHECK (status IN ('posted','reversed')),
  idempotency_key VARCHAR(160),
  created_by UUID,
  updated_by UUID,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID,
  reversal_reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, refund_number)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_refunds_payment
  ON public.invoicing_payment_refunds(payment_id, refund_date DESC, id DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_refunds_idempotency
  ON public.invoicing_payment_refunds(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

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
      SELECT SUM(a.amount)
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
        SELECT SUM(a.amount)
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
CREATE TABLE IF NOT EXISTS public.invoicing_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  credit_note_number VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'issued'
    CHECK (status IN ('draft','issued','applied','refunded','cancelled')),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reason TEXT NOT NULL,
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(19,4) NOT NULL CHECK (total_amount > 0),
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(company_id, credit_note_number)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_credit_notes_invoice
  ON public.invoicing_credit_notes(invoice_id, issue_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_credit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.invoicing_credit_notes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES public.invoicing_invoice_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.invoicing_recurring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  source_invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled')),
  interval_unit VARCHAR(20) NOT NULL DEFAULT 'month'
    CHECK (interval_unit IN ('day','week','month','quarter','year')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  next_run_at DATE NOT NULL,
  max_occurrences INTEGER CHECK (max_occurrences IS NULL OR max_occurrences > 0),
  run_count INTEGER NOT NULL DEFAULT 0 CHECK (run_count >= 0),
  consecutive_failures INTEGER NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  max_retry_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_retry_attempts BETWEEN 1 AND 20),
  auto_send BOOLEAN NOT NULL DEFAULT FALSE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  invoice_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  last_run_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  retry_after TIMESTAMPTZ,
  last_error_code VARCHAR(120),
  last_error_message TEXT,
  paused_at TIMESTAMPTZ,
  paused_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  completion_reason VARCHAR(120),
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoicing_recurring_due
  ON public.invoicing_recurring_templates(company_id, next_run_at)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_recurring_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  recurring_template_id UUID NOT NULL REFERENCES public.invoicing_recurring_templates(id) ON DELETE CASCADE,
  scheduled_for DATE NOT NULL,
  run_key VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'failed'
    CHECK (status IN ('processing','succeeded','failed','skipped')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  delivery_status VARCHAR(20) NOT NULL DEFAULT 'not_requested'
    CHECK (delivery_status IN ('not_requested','pending','sent','failed')),
  delivery_error_code VARCHAR(120),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_code VARCHAR(120),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(recurring_template_id, scheduled_for),
  UNIQUE(company_id, run_key)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_recurring_runs_schedule
  ON public.invoicing_recurring_runs(recurring_template_id, scheduled_for DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoicing_recurring_runs_company_status
  ON public.invoicing_recurring_runs(company_id, status, last_attempt_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_recurring_generated_invoice
  ON public.invoicing_invoices(company_id, (metadata ->> 'recurringRunKey'))
  WHERE deleted_at IS NULL AND metadata ? 'recurringRunKey';

CREATE TABLE IF NOT EXISTS public.invoicing_dunning_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_dunning_policy_name
  ON public.invoicing_dunning_policies(company_id, LOWER(name))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_dunning_default
  ON public.invoicing_dunning_policies(company_id)
  WHERE is_default = TRUE AND is_active = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_dunning_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  policy_id UUID NOT NULL REFERENCES public.invoicing_dunning_policies(id) ON DELETE CASCADE,
  stage_key VARCHAR(120) NOT NULL,
  name VARCHAR(180) NOT NULL,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  offset_days INTEGER NOT NULL CHECK (offset_days BETWEEN -365 AND 3650),
  severity VARCHAR(20) NOT NULL DEFAULT 'friendly'
    CHECK (severity IN ('friendly','firm','final')),
  channels JSONB NOT NULL DEFAULT '["email"]'::jsonb,
  auto_send BOOLEAN NOT NULL DEFAULT TRUE,
  retry_limit INTEGER NOT NULL DEFAULT 3 CHECK (retry_limit BETWEEN 1 AND 20),
  retry_delay_minutes INTEGER NOT NULL DEFAULT 60 CHECK (retry_delay_minutes BETWEEN 5 AND 10080),
  subject_template VARCHAR(255),
  message_template TEXT,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(policy_id, stage_key),
  UNIQUE(policy_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_dunning_stages_due
  ON public.invoicing_dunning_stages(policy_id, offset_days, sequence_no)
  WHERE auto_send = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  dunning_policy_id UUID REFERENCES public.invoicing_dunning_policies(id) ON DELETE SET NULL,
  dunning_stage_id UUID REFERENCES public.invoicing_dunning_stages(id) ON DELETE SET NULL,
  reminder_type VARCHAR(120) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sending','sent','failed','cancelled','suppressed')),
  channel VARCHAR(20) NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','in_app','whatsapp')),
  source VARCHAR(20) NOT NULL DEFAULT 'worker'
    CHECK (source IN ('worker','manual','retry')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 20),
  last_attempt_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  sent_by UUID,
  failure_code VARCHAR(120),
  failure_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_due
  ON public.invoicing_reminders(company_id, scheduled_for)
  WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_retry
  ON public.invoicing_reminders(company_id, next_attempt_at)
  WHERE status IN ('scheduled','failed');
CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_invoice_history
  ON public.invoicing_reminders(invoice_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_reminders_once
  ON public.invoicing_reminders(invoice_id, reminder_type, channel);

CREATE TABLE IF NOT EXISTS public.invoicing_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  destination_fingerprint VARCHAR(128),
  provider VARCHAR(80),
  provider_message_id VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  error_code VARCHAR(120),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_delivery_invoice
  ON public.invoicing_delivery_log(invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoicing_portal_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired')),
  expires_at TIMESTAMPTZ NOT NULL,
  last_used_at TIMESTAMPTZ,
  created_by UUID,
  revoked_by UUID,
  revoked_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(token_hash)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_portal_access_customer_active
  ON public.invoicing_portal_access(company_id, customer_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_invoicing_portal_access_expiry
  ON public.invoicing_portal_access(company_id, expires_at)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.invoicing_portal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  portal_access_id UUID REFERENCES public.invoicing_portal_access(id) ON DELETE SET NULL,
  direction VARCHAR(30) NOT NULL
    CHECK (direction IN ('customer_to_business','business_to_customer','system')),
  category VARCHAR(30) NOT NULL DEFAULT 'general'
    CHECK (category IN ('general','invoice_question','dispute','payment_promise')),
  subject VARCHAR(255),
  body TEXT NOT NULL,
  idempotency_key VARCHAR(120),
  promised_amount NUMERIC(19,4) CHECK (promised_amount IS NULL OR promised_amount > 0),
  promised_date DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','resolved','closed')),
  customer_name_snapshot VARCHAR(255),
  customer_email_snapshot VARCHAR(255),
  resolved_by UUID,
  resolved_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_portal_messages_customer
  ON public.invoicing_portal_messages(company_id, customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoicing_portal_messages_inbox
  ON public.invoicing_portal_messages(company_id, status, created_at DESC)
  WHERE direction = 'customer_to_business';
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_portal_message_idempotency
  ON public.invoicing_portal_messages(portal_access_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_portal_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
  portal_access_id UUID REFERENCES public.invoicing_portal_access(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  event_type VARCHAR(60) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_portal_events_customer
  ON public.invoicing_portal_events(company_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoicing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  event_key VARCHAR(120) NOT NULL,
  actor_user_id UUID,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_events_invoice
  ON public.invoicing_events(invoice_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoicing_accounting_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_key VARCHAR(220) NOT NULL,
  source_type VARCHAR(60) NOT NULL,
  source_id UUID NOT NULL,
  journal_id UUID NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, event_key)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_accounting_links_source
  ON public.invoicing_accounting_links(company_id, source_type, source_id);

CREATE OR REPLACE FUNCTION public.validate_invoice_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
    AND NEW.status IN ('confirmed','sent','viewed','paid','overdue','written_off')
    THEN RETURN NEW;
  END IF;

  IF OLD.status = 'paid'
    AND NEW.status IN ('confirmed','sent','viewed','partially_paid','overdue')
    THEN RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Invalid invoice status transition from % to %', OLD.status, NEW.status;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_invoicing_invoice_status_transition'
  ) THEN
    CREATE TRIGGER trg_invoicing_invoice_status_transition
    BEFORE INSERT OR UPDATE OF status ON public.invoicing_invoices
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_invoice_status_transition();
  END IF;
END
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'invoicing_payment_terms',
    'invoicing_tax_rates',
    'invoicing_customers',
    'invoicing_catalog_items',
    'invoicing_templates',
    'invoicing_sequences',
    'invoicing_settings',
    'invoicing_invoices',
    'invoicing_invoice_items',
    'invoicing_payments',
    'invoicing_credit_notes',
    'invoicing_recurring_templates',
    'invoicing_recurring_runs',
    'invoicing_portal_access',
    'invoicing_portal_messages'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger WHERE tgname = 'trg_' || table_name || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.invoicing_touch_updated_at()',
        'trg_' || table_name || '_updated_at',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

INSERT INTO public.invoicing_payment_terms (company_id, name, description, due_days, is_default, sort_order)
SELECT c.id, 'Net 30', 'Payment due within 30 days.', 30, TRUE, 30
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO public.invoicing_payment_terms (company_id, name, description, due_days, is_default, sort_order)
SELECT c.id, 'Due on receipt', 'Payment due immediately.', 0, FALSE, 0
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO public.invoicing_tax_rates (company_id, name, rate, tax_type, is_default)
SELECT c.id, 'VAT 16%', 16, 'vat', TRUE
FROM public.companies c
WHERE c.is_active = TRUE
  AND UPPER(COALESCE(c.country_code, 'KE')) = 'KE'
ON CONFLICT DO NOTHING;

INSERT INTO public.invoicing_templates (company_id, name, is_default, layout)
SELECT c.id, 'Modern', TRUE, 'modern'
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT DO NOTHING;

INSERT INTO public.invoicing_sequences (company_id, document_type, prefix, next_number, padding, format)
SELECT c.id, 'invoice', 'INV-', 1, 6, '{prefix}{number}'
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.invoicing_sequences (company_id, document_type, prefix, next_number, padding, format)
SELECT c.id, 'payment', 'PAY-', 1, 6, '{prefix}{number}'
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.invoicing_sequences (company_id, document_type, prefix, next_number, padding, format)
SELECT c.id, 'credit_note', 'CN-', 1, 6, '{prefix}{number}'
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT (company_id, document_type) DO NOTHING;

INSERT INTO public.invoicing_settings (
  company_id,
  default_currency,
  default_payment_terms_id,
  default_tax_rate_id,
  default_template_id
)
SELECT
  c.id,
  COALESCE(c.currency, 'KES'),
  (SELECT pt.id FROM public.invoicing_payment_terms pt WHERE pt.company_id = c.id AND pt.is_default = TRUE AND pt.deleted_at IS NULL ORDER BY pt.created_at LIMIT 1),
  (SELECT tr.id FROM public.invoicing_tax_rates tr WHERE tr.company_id = c.id AND tr.is_default = TRUE AND tr.deleted_at IS NULL ORDER BY tr.created_at LIMIT 1),
  (SELECT it.id FROM public.invoicing_templates it WHERE it.company_id = c.id AND it.is_default = TRUE AND it.deleted_at IS NULL ORDER BY it.created_at LIMIT 1)
FROM public.companies c
WHERE c.is_active = TRUE
ON CONFLICT (company_id) DO NOTHING;

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
    SUM(cn.credited_amount) FILTER (
      WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void')
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
      WHERE i.status NOT IN ('draft','pending_approval','rejected','cancelled','void','written_off')
    ),
    0
  )::numeric(19,4) AS outstanding_total
FROM public.invoicing_invoices i
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
  FROM public.invoicing_payment_allocations a
  INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
  WHERE a.invoice_id = i.id
    AND a.status = 'posted'
    AND p.status = 'posted'
    AND p.deleted_at IS NULL
) pa ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(c.total_amount),0)::numeric(19,4) AS credited_amount
  FROM public.invoicing_credit_notes c
  WHERE c.invoice_id = i.id
    AND c.status IN ('issued','applied','refunded')
    AND c.deleted_at IS NULL
) cn ON TRUE
WHERE i.deleted_at IS NULL
GROUP BY i.company_id, i.customer_id;

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
  SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
  FROM public.invoicing_payment_allocations a
  INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
  WHERE a.invoice_id = i.id
    AND a.status = 'posted'
    AND p.status = 'posted'
    AND p.deleted_at IS NULL
) pa ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(c.total_amount),0)::numeric(19,4) AS credited_amount
  FROM public.invoicing_credit_notes c
  WHERE c.invoice_id = i.id
    AND c.status IN ('issued','applied','refunded')
    AND c.deleted_at IS NULL
) cn ON TRUE
WHERE i.deleted_at IS NULL;

CREATE OR REPLACE VIEW public.invoicing_monthly_summary AS
SELECT
  company_id,
  DATE_TRUNC('month', invoice_date)::date AS month,
  currency,
  COUNT(*)::int AS invoice_count,
  COALESCE(SUM(total_amount),0)::numeric(19,4) AS invoiced_total
FROM public.invoicing_invoices
WHERE deleted_at IS NULL
  AND status NOT IN ('draft','pending_approval','rejected','cancelled','void')
GROUP BY company_id, DATE_TRUNC('month', invoice_date), currency;
