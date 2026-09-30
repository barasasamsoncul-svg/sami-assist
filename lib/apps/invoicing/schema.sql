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
  code VARCHAR(80),
  jurisdiction_code VARCHAR(80),
  price_included BOOLEAN NOT NULL DEFAULT FALSE,
  valid_from DATE,
  valid_to DATE,
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_rate_code
  ON public.invoicing_tax_rates(company_id, LOWER(code))
  WHERE code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_tax_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  code VARCHAR(80),
  description TEXT,
  tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
  country_code VARCHAR(2),
  jurisdiction_code VARCHAR(80),
  calculation_mode VARCHAR(20) NOT NULL DEFAULT 'sum'
    CHECK (calculation_mode IN ('sum','compound')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_group_name
  ON public.invoicing_tax_groups(company_id, LOWER(name))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_group_code
  ON public.invoicing_tax_groups(company_id, LOWER(code))
  WHERE code IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_tax_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
  tax_rate_id UUID NOT NULL REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
  sequence_no INTEGER NOT NULL DEFAULT 10 CHECK (sequence_no > 0),
  compound BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(group_id, tax_rate_id)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_tax_group_members_group
  ON public.invoicing_tax_group_members(company_id, group_id, sequence_no, id);

CREATE TABLE IF NOT EXISTS public.invoicing_fiscal_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(140) NOT NULL,
  code VARCHAR(80),
  description TEXT,
  country_code VARCHAR(2),
  customer_type VARCHAR(30),
  priority INTEGER NOT NULL DEFAULT 100,
  auto_apply BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_fiscal_position_name
  ON public.invoicing_fiscal_positions(company_id, LOWER(name))
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_fiscal_position_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fiscal_position_id UUID NOT NULL REFERENCES public.invoicing_fiscal_positions(id) ON DELETE CASCADE,
  source_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
  source_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
  destination_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
  destination_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE RESTRICT,
  exempt BOOLEAN NOT NULL DEFAULT FALSE,
  label VARCHAR(180),
  sequence_no INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (source_tax_rate_id IS NOT NULL OR source_tax_group_id IS NOT NULL),
  CHECK (
    exempt = TRUE
    OR destination_tax_rate_id IS NOT NULL
    OR destination_tax_group_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_invoicing_fiscal_position_mappings
  ON public.invoicing_fiscal_position_mappings(company_id, fiscal_position_id, sequence_no, id);

CREATE TABLE IF NOT EXISTS public.invoicing_tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  country_code VARCHAR(2),
  customer_type VARCHAR(30),
  tax_category VARCHAR(80),
  source_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
  source_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
  destination_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE RESTRICT,
  destination_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE RESTRICT,
  action VARCHAR(20) NOT NULL DEFAULT 'map'
    CHECK (action IN ('map','exempt','keep')),
  valid_from DATE,
  valid_to DATE,
  stop_processing BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invoicing_tax_rules_match
  ON public.invoicing_tax_rules(company_id, is_active, priority, country_code, customer_type, tax_category)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_tax_exemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE CASCADE,
  exemption_type VARCHAR(80) NOT NULL DEFAULT 'customer',
  certificate_number VARCHAR(180),
  tax_type VARCHAR(40),
  country_code VARCHAR(2),
  valid_from DATE,
  valid_to DATE,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','revoked','expired')),
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_tax_exemptions_customer
  ON public.invoicing_tax_exemptions(company_id, customer_id, status, valid_to);

CREATE TABLE IF NOT EXISTS public.invoicing_tax_localizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  country_code VARCHAR(2) NOT NULL,
  jurisdiction_code VARCHAR(80),
  tax_registration_number VARCHAR(180),
  default_tax_type VARCHAR(40) NOT NULL DEFAULT 'vat',
  filing_frequency VARCHAR(20) NOT NULL DEFAULT 'monthly'
    CHECK (filing_frequency IN ('monthly','quarterly','annual','custom')),
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_tax_localization_name
  ON public.invoicing_tax_localizations(company_id, LOWER(name))
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
  fiscal_position_id UUID,
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
  tax_category VARCHAR(80),
  default_tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE SET NULL,
  default_tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE SET NULL,
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
  design_version INTEGER NOT NULL DEFAULT 1 CHECK (design_version > 0),
  density VARCHAR(20) NOT NULL DEFAULT 'comfortable'
    CHECK (density IN ('compact','comfortable','spacious')),
  header_style VARCHAR(20) NOT NULL DEFAULT 'band'
    CHECK (header_style IN ('band','minimal','split')),
  document_title VARCHAR(80) NOT NULL DEFAULT 'Invoice',
  from_label VARCHAR(40) NOT NULL DEFAULT 'From',
  bill_to_label VARCHAR(40) NOT NULL DEFAULT 'Bill to',
  notes_label VARCHAR(40) NOT NULL DEFAULT 'Notes',
  terms_label VARCHAR(40) NOT NULL DEFAULT 'Terms',
  payment_label VARCHAR(60) NOT NULL DEFAULT 'Payment instructions',
  footer_alignment VARCHAR(10) NOT NULL DEFAULT 'left'
    CHECK (footer_alignment IN ('left','center','right')),
  show_status BOOLEAN NOT NULL DEFAULT TRUE,
  show_page_numbers BOOLEAN NOT NULL DEFAULT TRUE,
  show_sku BOOLEAN NOT NULL DEFAULT TRUE,
  show_unit BOOLEAN NOT NULL DEFAULT TRUE,
  show_quantity BOOLEAN NOT NULL DEFAULT TRUE,
  show_unit_price BOOLEAN NOT NULL DEFAULT TRUE,
  show_line_tax BOOLEAN NOT NULL DEFAULT TRUE,
  show_line_discount BOOLEAN NOT NULL DEFAULT TRUE,
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
  base_currency VARCHAR(3),
  exchange_rate_mode VARCHAR(20) NOT NULL DEFAULT 'table'
    CHECK (exchange_rate_mode IN ('table','manual')),
  allow_cross_currency_payments BOOLEAN NOT NULL DEFAULT TRUE,
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

CREATE TABLE IF NOT EXISTS public.invoicing_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL,
  base_currency VARCHAR(3) NOT NULL,
  rate_to_base NUMERIC(19,8) NOT NULL CHECK (rate_to_base > 0),
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
  fiscal_position_id UUID,
  tax_localization_id UUID,
  tax_context JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_id UUID REFERENCES public.invoicing_templates(id) ON DELETE SET NULL,
  external_sales_order_id UUID,
  invoice_number VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','pending_approval','rejected','confirmed','sent','viewed','partially_paid','paid','overdue','cancelled','void','written_off')),
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1 CHECK (exchange_rate > 0),
  base_currency VARCHAR(3),
  exchange_rate_date DATE,
  exchange_rate_source VARCHAR(120),
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
  tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE SET NULL,
  tax_name_snapshot VARCHAR(120),
  tax_rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  tax_components JSONB NOT NULL DEFAULT '[]'::jsonb,
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
  base_currency VARCHAR(3),
  exchange_rate_date DATE,
  exchange_rate_source VARCHAR(120),
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
  payment_amount NUMERIC(19,4),
  invoice_amount NUMERIC(19,4),
  payment_exchange_rate NUMERIC(19,8),
  invoice_exchange_rate NUMERIC(19,8),
  base_payment_amount NUMERIC(19,4),
  base_invoice_amount NUMERIC(19,4),
  realized_fx_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
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

CREATE OR REPLACE VIEW public.invoicing_tax_rate_usage AS
SELECT
  rate.company_id,
  rate.id AS tax_rate_id,
  rate.name,
  rate.code,
  rate.tax_type,
  rate.country_code,
  rate.rate,
  rate.is_active,
  COUNT(item.id)::int AS invoice_line_count,
  COALESCE(SUM(item.tax_amount),0)::numeric(19,4) AS tax_amount
FROM public.invoicing_tax_rates rate
LEFT JOIN public.invoicing_invoice_items item
  ON item.tax_rate_id = rate.id
 AND item.company_id = rate.company_id
WHERE rate.deleted_at IS NULL
GROUP BY
  rate.company_id,
  rate.id,
  rate.name,
  rate.code,
  rate.tax_type,
  rate.country_code,
  rate.rate,
  rate.is_active;

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

CREATE TABLE IF NOT EXISTS public.invoicing_retainers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  payment_id UUID NOT NULL REFERENCES public.invoicing_payments(id) ON DELETE RESTRICT,
  retainer_number VARCHAR(140) NOT NULL,
  retainer_type VARCHAR(20) NOT NULL DEFAULT 'retainer'
    CHECK (retainer_type IN ('retainer','deposit')),
  purpose TEXT,
  expected_use_date DATE,
  idempotency_key VARCHAR(160),
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, retainer_number),
  UNIQUE(payment_id)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_retainers_customer
  ON public.invoicing_retainers(company_id, customer_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_retainers_idempotency
  ON public.invoicing_retainers(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE VIEW public.invoicing_retainer_balances AS
SELECT
  r.id AS retainer_id,
  r.company_id,
  r.customer_id,
  r.payment_id,
  r.retainer_number,
  r.retainer_type,
  r.purpose,
  r.expected_use_date,
  p.payment_number,
  p.payment_date AS received_date,
  p.amount,
  p.currency,
  p.exchange_rate,
  p.method,
  p.reference,
  p.status AS payment_status,
  b.allocated_amount,
  b.refunded_amount,
  b.unapplied_amount AS available_amount,
  CASE
    WHEN p.status = 'reversed'
      THEN 'reversed'
    WHEN b.refunded_amount >= p.amount - 0.0001
      THEN 'refunded'
    WHEN b.allocated_amount >= p.amount - 0.0001
      THEN 'applied'
    WHEN b.allocated_amount > 0
      AND b.refunded_amount > 0
      THEN 'partially_used'
    WHEN b.allocated_amount > 0
      THEN 'partially_applied'
    WHEN b.refunded_amount > 0
      THEN 'partially_refunded'
    ELSE 'active'
  END AS effective_status,
  p.reconciled_at,
  r.created_by,
  r.created_at,
  r.updated_at
FROM public.invoicing_retainers r
INNER JOIN public.invoicing_payments p
  ON p.id = r.payment_id
 AND p.company_id = r.company_id
 AND p.deleted_at IS NULL
INNER JOIN public.invoicing_payment_balances b
  ON b.payment_id = r.payment_id
 AND b.company_id = r.company_id;

CREATE TABLE IF NOT EXISTS public.invoicing_payment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  plan_number VARCHAR(140) NOT NULL,
  name VARCHAR(180) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','cancelled')),
  currency VARCHAR(3) NOT NULL,
  original_due_date DATE NOT NULL,
  final_due_date DATE NOT NULL,
  total_amount NUMERIC(19,4) NOT NULL CHECK (total_amount > 0),
  settled_baseline_amount NUMERIC(19,4) NOT NULL DEFAULT 0
    CHECK (settled_baseline_amount >= 0),
  installment_count INTEGER NOT NULL CHECK (installment_count BETWEEN 2 AND 120),
  notes TEXT,
  idempotency_key VARCHAR(160),
  activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  activated_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancellation_reason TEXT,
  created_by UUID,
  updated_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, plan_number)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_plan_active_invoice
  ON public.invoicing_payment_plans(company_id, invoice_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_payment_plan_idempotency
  ON public.invoicing_payment_plans(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_plans_customer
  ON public.invoicing_payment_plans(company_id, customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoicing_payment_plan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.invoicing_payment_plans(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  sequence_no INTEGER NOT NULL CHECK (sequence_no > 0),
  label VARCHAR(180),
  due_date DATE NOT NULL,
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(plan_id, sequence_no)
);
CREATE INDEX IF NOT EXISTS idx_invoicing_payment_plan_installments_due
  ON public.invoicing_payment_plan_installments(company_id, due_date, plan_id);

CREATE TABLE IF NOT EXISTS public.invoicing_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.invoicing_customers(id) ON DELETE RESTRICT,
  credit_note_number VARCHAR(140) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'issued'
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
    ),
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reason TEXT NOT NULL,
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(19,4) NOT NULL CHECK (total_amount > 0),
  idempotency_key VARCHAR(120),
  issued_at TIMESTAMPTZ,
  issued_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  cancellation_reason TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_credit_notes_idempotency
  ON public.invoicing_credit_notes(company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.invoicing_credit_note_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.invoicing_credit_notes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_item_id UUID REFERENCES public.invoicing_invoice_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  tax_rate NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  subtotal NUMERIC(19,4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
  ON public.invoicing_credit_note_applications(credit_note_id, status, applied_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoicing_credit_applications_invoice
  ON public.invoicing_credit_note_applications(target_invoice_id, status, applied_at DESC);

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
  ON public.invoicing_credit_note_refunds(credit_note_id, status, refund_date DESC, id DESC);

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
  document_snapshot_id UUID REFERENCES public.invoicing_document_snapshots(id) ON DELETE SET NULL,
  status VARCHAR(30) NOT NULL,
  error_code VARCHAR(120),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoicing_delivery_invoice
  ON public.invoicing_delivery_log(invoice_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoicing_delivery_snapshot
  ON public.invoicing_delivery_log(document_snapshot_id)
  WHERE document_snapshot_id IS NOT NULL;

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
    'invoicing_credit_note_applications',
    'invoicing_credit_note_refunds',
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

INSERT INTO public.invoicing_sequences (company_id, document_type, prefix, next_number, padding, format)
SELECT c.id, 'credit_refund', 'CRF-', 1, 6, '{prefix}{number}'
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
  INNER JOIN public.invoicing_payments p ON p.id = a.payment_id
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
    NULLIF(MAX(invoice.base_currency),''),
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
      COALESCE(invoice.exchange_rate,1)
    ),
    0
  )::numeric(19,4) AS invoiced_base_amount,
  COALESCE(
    SUM(
      aging.balance_due *
      COALESCE(invoice.exchange_rate,1)
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

CREATE OR REPLACE VIEW public.invoicing_aging_base AS
SELECT
  aging.company_id,
  aging.invoice_id,
  aging.invoice_number,
  aging.customer_id,
  aging.invoice_date,
  aging.due_date,
  aging.currency,
  COALESCE(
    invoice.base_currency,
    setting.base_currency,
    setting.default_currency,
    aging.currency
  ) AS base_currency,
  COALESCE(
    invoice.exchange_rate,
    1
  )::numeric(19,8) AS exchange_rate,
  aging.total_amount,
  aging.balance_due,
  (
    aging.total_amount *
    COALESCE(
      invoice.exchange_rate,
      1
    )
  )::numeric(19,4) AS base_total_amount,
  (
    aging.balance_due *
    COALESCE(
      invoice.exchange_rate,
      1
    )
  )::numeric(19,4) AS base_balance_due,
  aging.effective_status,
  aging.days_overdue,
  aging.aging_bucket
FROM public.invoicing_aging aging
INNER JOIN public.invoicing_invoices invoice
  ON invoice.id = aging.invoice_id
 AND invoice.company_id = aging.company_id
LEFT JOIN public.invoicing_settings setting
  ON setting.company_id = aging.company_id;

CREATE OR REPLACE VIEW public.invoicing_payment_plan_installment_balances AS
WITH base AS (
  SELECT
    installment.id,
    installment.company_id,
    installment.plan_id,
    installment.invoice_id,
    installment.sequence_no,
    installment.label,
    installment.due_date,
    installment.amount,
    plan.plan_number,
    plan.name AS plan_name,
    plan.status AS plan_status,
    plan.currency,
    invoice.invoice_number,
    invoice.customer_id,
    customer.name AS customer_name,
    GREATEST(
      invoice.total_amount -
      COALESCE(aging.balance_due, invoice.total_amount) -
      plan.settled_baseline_amount,
      0
    )::numeric(19,4) AS invoice_settled_amount,
    COALESCE(
      SUM(installment.amount) OVER (
        PARTITION BY installment.plan_id
        ORDER BY installment.sequence_no
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ),
      0
    )::numeric(19,4) AS prior_scheduled_amount
  FROM public.invoicing_payment_plan_installments installment
  INNER JOIN public.invoicing_payment_plans plan
    ON plan.id = installment.plan_id
   AND plan.company_id = installment.company_id
  INNER JOIN public.invoicing_invoices invoice
    ON invoice.id = installment.invoice_id
   AND invoice.company_id = installment.company_id
   AND invoice.deleted_at IS NULL
  INNER JOIN public.invoicing_customers customer
    ON customer.id = invoice.customer_id
   AND customer.company_id = invoice.company_id
   AND customer.deleted_at IS NULL
  LEFT JOIN public.invoicing_aging aging
    ON aging.invoice_id = invoice.id
   AND aging.company_id = invoice.company_id
)
SELECT
  base.*,
  GREATEST(
    LEAST(
      base.invoice_settled_amount -
      base.prior_scheduled_amount,
      base.amount
    ),
    0
  )::numeric(19,4) AS paid_amount,
  GREATEST(
    base.amount -
    GREATEST(
      LEAST(
        base.invoice_settled_amount -
        base.prior_scheduled_amount,
        base.amount
      ),
      0
    ),
    0
  )::numeric(19,4) AS balance_due,
  CASE
    WHEN base.plan_status = 'cancelled'
      THEN 'cancelled'
    WHEN GREATEST(
           LEAST(
             base.invoice_settled_amount -
             base.prior_scheduled_amount,
             base.amount
           ),
           0
         ) >= base.amount - 0.0001
      THEN 'paid'
    WHEN GREATEST(
           LEAST(
             base.invoice_settled_amount -
             base.prior_scheduled_amount,
             base.amount
           ),
           0
         ) > 0
      THEN 'partially_paid'
    WHEN base.due_date < CURRENT_DATE
      THEN 'overdue'
    WHEN base.due_date = CURRENT_DATE
      THEN 'due'
    ELSE 'scheduled'
  END AS effective_status
FROM base;

CREATE OR REPLACE VIEW public.invoicing_payment_plan_balances AS
SELECT
  plan.id AS plan_id,
  plan.company_id,
  plan.invoice_id,
  plan.customer_id,
  plan.plan_number,
  plan.name,
  plan.status AS stored_status,
  plan.currency,
  plan.total_amount,
  plan.settled_baseline_amount,
  plan.installment_count,
  plan.notes,
  plan.activated_at,
  plan.cancelled_at,
  plan.cancellation_reason,
  plan.created_by,
  plan.created_at,
  COALESCE(SUM(balance.paid_amount), 0)::numeric(19,4) AS paid_amount,
  COALESCE(SUM(balance.balance_due), 0)::numeric(19,4) AS balance_due,
  COUNT(*) FILTER (WHERE balance.effective_status = 'paid')::int AS paid_installments,
  COUNT(*) FILTER (WHERE balance.effective_status = 'overdue')::int AS overdue_installments,
  MIN(balance.due_date) FILTER (
    WHERE balance.effective_status IN ('scheduled','due','partially_paid','overdue')
  ) AS next_due_date,
  CASE
    WHEN plan.status = 'cancelled'
      THEN 'cancelled'
    WHEN COALESCE(SUM(balance.balance_due), 0) <= 0.0001
      THEN 'completed'
    WHEN COUNT(*) FILTER (WHERE balance.effective_status = 'overdue') > 0
      THEN 'overdue'
    ELSE 'active'
  END AS effective_status
FROM public.invoicing_payment_plans plan
INNER JOIN public.invoicing_payment_plan_installment_balances balance
  ON balance.plan_id = plan.id
 AND balance.company_id = plan.company_id
GROUP BY
  plan.id,
  plan.company_id,
  plan.invoice_id,
  plan.customer_id,
  plan.plan_number,
  plan.name,
  plan.status,
  plan.currency,
  plan.total_amount,
  plan.settled_baseline_amount,
  plan.installment_count,
  plan.notes,
  plan.activated_at,
  plan.cancelled_at,
  plan.cancellation_reason,
  plan.created_by,
  plan.created_at;

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
  SELECT COALESCE(SUM(a.amount),0)::numeric(19,4) AS applied_amount
  FROM public.invoicing_credit_note_applications a
  WHERE a.credit_note_id = cn.id
    AND a.company_id = cn.company_id
    AND a.status = 'posted'
) app ON TRUE
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(r.amount),0)::numeric(19,4) AS refunded_amount
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
GROUP BY company_id, customer_id, currency;

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


-- ============================================================
-- Part 16: Kenya KRA eTIMS fiscalization
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invoicing_etims_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    solution_type VARCHAR(10) NOT NULL DEFAULT 'oscu'
      CHECK (solution_type IN ('oscu','vscu')),
    environment VARCHAR(12) NOT NULL DEFAULT 'sandbox'
      CHECK (environment IN ('sandbox','production')),
    taxpayer_pin VARCHAR(20) NOT NULL,
    branch_id VARCHAR(20) NOT NULL DEFAULT '00',
    device_serial_number VARCHAR(120) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'configured'
      CHECK (status IN ('disabled','configured','activated','error')),
    default_payment_type_code VARCHAR(4) NOT NULL DEFAULT '02',
    next_transaction_invoice_no BIGINT NOT NULL DEFAULT 1
      CHECK (next_transaction_invoice_no > 0),
    kra_sdc_id VARCHAR(120),
    kra_mrc_no VARCHAR(120),
    initialization_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_device_init_at TIMESTAMPTZ,
    last_reference_sync_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_error_at TIMESTAMPTZ,
    last_error_code VARCHAR(120),
    last_error_message TEXT,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id)
  );

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    catalog_item_id UUID NOT NULL REFERENCES public.invoicing_catalog_items(id) ON DELETE CASCADE,
    item_classification_code VARCHAR(40) NOT NULL,
    item_code VARCHAR(120) NOT NULL,
    origin_country_code VARCHAR(3) NOT NULL DEFAULT 'KE',
    packaging_unit_code VARCHAR(20) NOT NULL,
    quantity_unit_code VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, catalog_item_id),
    UNIQUE(company_id, item_code)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_item_mappings_company
    ON public.invoicing_etims_item_mappings(company_id, is_active, catalog_item_id);

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_tax_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    tax_rate_id UUID REFERENCES public.invoicing_tax_rates(id) ON DELETE CASCADE,
    tax_group_id UUID REFERENCES public.invoicing_tax_groups(id) ON DELETE CASCADE,
    tax_type_code VARCHAR(1) NOT NULL
      CHECK (tax_type_code IN ('A','B','C','D','E')),
    kra_rate NUMERIC(9,4) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
      (tax_rate_id IS NOT NULL AND tax_group_id IS NULL)
      OR
      (tax_rate_id IS NULL AND tax_group_id IS NOT NULL)
    )
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_tax_rate_mapping
    ON public.invoicing_etims_tax_mappings(company_id, tax_rate_id)
    WHERE tax_rate_id IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS uq_invoicing_etims_tax_group_mapping
    ON public.invoicing_etims_tax_mappings(company_id, tax_group_id)
    WHERE tax_group_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_reference_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    reference_type VARCHAR(40) NOT NULL,
    external_key VARCHAR(160) NOT NULL DEFAULT 'snapshot',
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    source_updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by UUID,
    UNIQUE(company_id, reference_type, external_key)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_reference_cache_company
    ON public.invoicing_etims_reference_cache(company_id, reference_type, synced_at DESC);

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES public.invoicing_invoices(id) ON DELETE RESTRICT,
    credit_note_id UUID REFERENCES public.invoicing_credit_notes(id) ON DELETE RESTRICT,
    source_key VARCHAR(180) NOT NULL,
    submission_type VARCHAR(20) NOT NULL
      CHECK (submission_type IN ('sale','credit_note')),
    solution_type VARCHAR(10) NOT NULL
      CHECK (solution_type IN ('oscu','vscu')),
    environment VARCHAR(12) NOT NULL
      CHECK (environment IN ('sandbox','production')),
    transaction_invoice_no BIGINT NOT NULL CHECK (transaction_invoice_no > 0),
    source_hash VARCHAR(64) NOT NULL,
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'submitting'
      CHECK (status IN ('queued','submitting','succeeded','failed','retryable')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at TIMESTAMPTZ,
    next_retry_at TIMESTAMPTZ,
    kra_result_code VARCHAR(120),
    kra_result_message TEXT,
    kra_result_date VARCHAR(80),
    receipt_no BIGINT,
    total_receipt_no BIGINT,
    sdc_id VARCHAR(120),
    mrc_no VARCHAR(120),
    receipt_publication_date VARCHAR(80),
    internal_data TEXT,
    receipt_signature TEXT,
    verification_url TEXT,
    submitted_by UUID,
    succeeded_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, source_key)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_company
    ON public.invoicing_etims_submissions(company_id, status, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_invoice
    ON public.invoicing_etims_submissions(company_id, invoice_id, created_at DESC)
    WHERE invoice_id IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_submissions_credit
    ON public.invoicing_etims_submissions(company_id, credit_note_id, created_at DESC)
    WHERE credit_note_id IS NOT NULL;

  CREATE TABLE IF NOT EXISTS public.invoicing_etims_submission_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL REFERENCES public.invoicing_etims_submissions(id) ON DELETE CASCADE,
    attempt_no INTEGER NOT NULL CHECK (attempt_no > 0),
    request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    http_status INTEGER,
    kra_result_code VARCHAR(120),
    error_code VARCHAR(120),
    error_message TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE(submission_id, attempt_no)
  );
  CREATE INDEX IF NOT EXISTS idx_invoicing_etims_attempts_submission
    ON public.invoicing_etims_submission_attempts(submission_id, attempt_no DESC);
