CREATE TABLE IF NOT EXISTS public.sales_settings (
  company_id UUID PRIMARY KEY,
  default_currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  default_validity_days INTEGER NOT NULL DEFAULT 14 CHECK (default_validity_days BETWEEN 1 AND 365),
  terms_and_conditions TEXT,
  default_notes TEXT,
  email_message TEXT,
  primary_color VARCHAR(20) NOT NULL DEFAULT '#164a9f',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
  footer_text TEXT,
  allow_online_acceptance BOOLEAN NOT NULL DEFAULT TRUE,
  allow_online_rejection BOOLEAN NOT NULL DEFAULT TRUE,
  allow_partial_invoicing BOOLEAN NOT NULL DEFAULT TRUE,
  require_billing_customer_for_invoice BOOLEAN NOT NULL DEFAULT TRUE,
  invoice_policy VARCHAR(30) NOT NULL DEFAULT 'ordered'
    CHECK (invoice_policy IN ('ordered','delivered')),
  lock_confirmed_orders BOOLEAN NOT NULL DEFAULT TRUE,
  require_quote_approval BOOLEAN NOT NULL DEFAULT FALSE,
  quote_approval_threshold NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (quote_approval_threshold >= 0),
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sales_sequences (
  company_id UUID NOT NULL,
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('quote','order')),
  prefix VARCHAR(30) NOT NULL,
  next_number BIGINT NOT NULL DEFAULT 1 CHECK (next_number > 0),
  padding INTEGER NOT NULL DEFAULT 6 CHECK (padding BETWEEN 1 AND 12),
  format VARCHAR(120) NOT NULL DEFAULT '{prefix}{number}',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, document_type)
);

CREATE TABLE IF NOT EXISTS public.sales_quote_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name VARCHAR(180) NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  terms TEXT,
  footer_text TEXT,
  primary_color VARCHAR(20) NOT NULL DEFAULT '#164a9f',
  secondary_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_templates_name
  ON public.sales_quote_templates(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_templates_default
  ON public.sales_quote_templates(company_id)
  WHERE is_default = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  billing_customer_id UUID,
  template_id UUID REFERENCES public.sales_quote_templates(id) ON DELETE SET NULL,
  quote_number VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','accepted','rejected','expired','cancelled','converted')),
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reference VARCHAR(255),
  salesperson_user_id UUID,
  approval_status VARCHAR(30) NOT NULL DEFAULT 'not_required'
    CHECK (approval_status IN ('not_required','draft','pending','approved','rejected')),
  approval_requested_at TIMESTAMPTZ,
  approval_requested_by UUID,
  approved_at TIMESTAMPTZ,
  approved_by UUID,
  approval_rejected_at TIMESTAMPTZ,
  approval_rejected_by UUID,
  approval_rejection_reason TEXT,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(80),
  customer_tax_id VARCHAR(120),
  billing_address TEXT,
  shipping_address TEXT,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  shipping_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  internal_notes TEXT,
  sales_order_id UUID,
  latest_invoice_id UUID,
  public_token_hash VARCHAR(64),
  public_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quotes_number
  ON public.sales_quotes(company_id, quote_number)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_company_status
  ON public.sales_quotes(company_id, status, quote_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_customer
  ON public.sales_quotes(company_id, billing_customer_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_public_token
  ON public.sales_quotes(public_token_hash)
  WHERE public_enabled = TRUE AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  catalog_item_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sku_snapshot VARCHAR(180),
  unit VARCHAR(60) NOT NULL DEFAULT 'unit',
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent','fixed')),
  discount_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_name_snapshot VARCHAR(180),
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  line_total NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_items_quote
  ON public.sales_quote_items(quote_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.sales_orders_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  quote_id UUID REFERENCES public.sales_quotes(id) ON DELETE SET NULL,
  latest_invoice_id UUID,
  order_number VARCHAR(100) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed','cancelled','closed')),
  fulfillment_status VARCHAR(30) NOT NULL DEFAULT 'not_started'
    CHECK (fulfillment_status IN ('not_started','partial','fulfilled')),
  invoice_status VARCHAR(30) NOT NULL DEFAULT 'not_invoiced'
    CHECK (invoice_status IN ('not_invoiced','partial','invoiced')),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  reference VARCHAR(255),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(80),
  customer_tax_id VARCHAR(120),
  billing_address TEXT,
  shipping_address TEXT,
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  tax_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  shipping_total NUMERIC(18,2) NOT NULL DEFAULT 0,
  shipping_invoiced BOOLEAN NOT NULL DEFAULT FALSE,
  total_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_v2_number
  ON public.sales_orders_v2(company_id, order_number)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_orders_v2_quote
  ON public.sales_orders_v2(company_id, quote_id)
  WHERE quote_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_orders_v2_company_status
  ON public.sales_orders_v2(company_id, status, order_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_order_items_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  catalog_item_id UUID,
  sort_order INTEGER NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  sku_snapshot VARCHAR(180),
  unit VARCHAR(60) NOT NULL DEFAULT 'unit',
  quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  delivered_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  invoiced_quantity NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (invoiced_quantity >= 0),
  unit_price NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_type VARCHAR(20) NOT NULL DEFAULT 'percent'
    CHECK (discount_type IN ('percent','fixed')),
  discount_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_name_snapshot VARCHAR(180),
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  subtotal NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  line_total NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (delivered_quantity <= quantity),
  CHECK (invoiced_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS idx_sales_order_items_v2_order
  ON public.sales_order_items_v2(sales_order_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.sales_order_invoice_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(120) NOT NULL,
  source_reference VARCHAR(255) NOT NULL,
  invoice_id UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'creating'
    CHECK (status IN ('creating','created','failed')),
  requested_lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_code VARCHAR(120),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_order_invoice_batches_key
  ON public.sales_order_invoice_batches(company_id, sales_order_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_sales_order_invoice_batches_order
  ON public.sales_order_invoice_batches(sales_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_quote_approval_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_history_quote
  ON public.sales_quote_approval_history(quote_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_quote_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_history_quote
  ON public.sales_quote_status_history(quote_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_order_history_order
  ON public.sales_order_status_history(sales_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL,
  destination_fingerprint VARCHAR(64),
  provider VARCHAR(80),
  provider_message_id VARCHAR(255),
  status VARCHAR(30) NOT NULL,
  error_code VARCHAR(120),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_delivery_quote
  ON public.sales_delivery_log(quote_id, created_at DESC);
