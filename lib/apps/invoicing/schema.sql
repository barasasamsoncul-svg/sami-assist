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
  reminder_days_before INTEGER NOT NULL DEFAULT 3,
  reminder_days_after INTEGER[] NOT NULL DEFAULT ARRAY[1,7,14],
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
    CHECK (status IN ('draft','confirmed','sent','viewed','partially_paid','paid','overdue','cancelled','void','written_off')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  reference VARCHAR(255),
  purchase_order_number VARCHAR(180),
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
  method VARCHAR(50) NOT NULL DEFAULT 'other',
  reference VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'posted'
    CHECK (status IN ('draft','posted','reversed')),
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

CREATE TABLE IF NOT EXISTS public.invoicing_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(payment_id, invoice_id)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_allocations_invoice
  ON public.invoicing_payment_allocations(invoice_id);

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
  name VARCHAR(255) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed','cancelled')),
  interval_unit VARCHAR(20) NOT NULL DEFAULT 'month'
    CHECK (interval_unit IN ('day','week','month','quarter','year')),
  interval_count INTEGER NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  next_run_at DATE NOT NULL,
  auto_send BOOLEAN NOT NULL DEFAULT FALSE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  invoice_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE SET NULL,
  last_run_at TIMESTAMPTZ,
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

CREATE TABLE IF NOT EXISTS public.invoicing_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE CASCADE,
  reminder_type VARCHAR(40) NOT NULL,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','sent','failed','cancelled')),
  channel VARCHAR(20) NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','sms','in_app','whatsapp')),
  failure_code VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_reminders_due
  ON public.invoicing_reminders(company_id, scheduled_for)
  WHERE status = 'scheduled';

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

  IF OLD.status = 'draft' AND NEW.status IN ('confirmed','sent','cancelled','void') THEN RETURN NEW; END IF;
  IF OLD.status = 'confirmed' AND NEW.status IN ('sent','partially_paid','paid','overdue','cancelled','void','written_off') THEN RETURN NEW; END IF;
  IF OLD.status = 'sent' AND NEW.status IN ('viewed','partially_paid','paid','overdue','cancelled','void','written_off') THEN RETURN NEW; END IF;
  IF OLD.status = 'viewed' AND NEW.status IN ('partially_paid','paid','overdue','cancelled','void','written_off') THEN RETURN NEW; END IF;
  IF OLD.status = 'overdue' AND NEW.status IN ('partially_paid','paid','cancelled','void','written_off') THEN RETURN NEW; END IF;
  IF OLD.status = 'partially_paid' AND NEW.status IN ('paid','overdue','written_off') THEN RETURN NEW; END IF;

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
    'invoicing_recurring_templates'
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
  COUNT(*) FILTER (WHERE i.status NOT IN ('cancelled','void'))::int AS invoice_count,
  COALESCE(SUM(i.total_amount) FILTER (WHERE i.status NOT IN ('cancelled','void')), 0)::numeric(19,4) AS invoiced_total,
  COALESCE(SUM(pa.paid_amount), 0)::numeric(19,4) AS paid_total,
  COALESCE(SUM(cn.credited_amount), 0)::numeric(19,4) AS credited_total,
  COALESCE(SUM(GREATEST(i.total_amount - COALESCE(pa.paid_amount,0) - COALESCE(cn.credited_amount,0),0))
    FILTER (WHERE i.status NOT IN ('cancelled','void','written_off')), 0)::numeric(19,4) AS outstanding_total
FROM public.invoicing_invoices i
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS paid_amount
  FROM public.invoicing_payment_allocations a
  INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
  WHERE a.invoice_id = i.id
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
  GREATEST(i.total_amount - COALESCE(pa.paid_amount,0) - COALESCE(cn.credited_amount,0),0)::numeric(19,4) AS balance_due,
  CASE
    WHEN i.status IN ('paid','cancelled','void','written_off') THEN i.status
    WHEN i.due_date < CURRENT_DATE THEN 'overdue'
    ELSE i.status
  END AS effective_status,
  GREATEST((CURRENT_DATE - i.due_date), 0) AS days_overdue,
  CASE
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
  AND status NOT IN ('cancelled','void')
GROUP BY company_id, DATE_TRUNC('month', invoice_date), currency;
