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
  document_type VARCHAR(30) NOT NULL CHECK (document_type IN ('quote','order','shipment','return')),
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
  base_currency VARCHAR(3) NOT NULL DEFAULT 'KES'
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1
    CHECK (exchange_rate > 0),
  exchange_rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  exchange_rate_source VARCHAR(120) NOT NULL DEFAULT 'base',
  base_total_amount NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (base_total_amount >= 0),
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
  accepted_by_name VARCHAR(255),
  accepted_by_email VARCHAR(320),
  acceptance_note TEXT,
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

CREATE INDEX IF NOT EXISTS idx_sales_quotes_currency_date
  ON public.sales_quotes(company_id, currency, quote_date DESC)
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
  external_product_id UUID,
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
  base_currency VARCHAR(3) NOT NULL DEFAULT 'KES'
    CHECK (base_currency ~ '^[A-Z]{3}$'),
  exchange_rate NUMERIC(19,8) NOT NULL DEFAULT 1
    CHECK (exchange_rate > 0),
  exchange_rate_date DATE NOT NULL DEFAULT CURRENT_DATE,
  exchange_rate_source VARCHAR(120) NOT NULL DEFAULT 'base',
  base_total_amount NUMERIC(18,2) NOT NULL DEFAULT 0
    CHECK (base_total_amount >= 0),
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

CREATE INDEX IF NOT EXISTS idx_sales_orders_currency_date
  ON public.sales_orders_v2(company_id, currency, order_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_order_items_v2 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  catalog_item_id UUID,
  external_product_id UUID,
  stock_reservation_id UUID,
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


-- Sales v3 commercial engine: pricing, revisions, optional products and margin snapshots.
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS current_revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS pricelist_id UUID;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_quote_items
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_orders_v2
  ADD COLUMN IF NOT EXISTS pricelist_id UUID;
ALTER TABLE public.sales_orders_v2
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_orders_v2
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_orders_v2
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

ALTER TABLE public.sales_order_items_v2
  ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18,4) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_order_items_v2
  ADD COLUMN IF NOT EXISTS cost_total NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_order_items_v2
  ADD COLUMN IF NOT EXISTS margin_amount NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE public.sales_order_items_v2
  ADD COLUMN IF NOT EXISTS margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.sales_pricelists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name VARCHAR(180) NOT NULL,
  code VARCHAR(80),
  currency VARCHAR(3) NOT NULL,
  billing_customer_id UUID,
  valid_from DATE,
  valid_until DATE,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pricelists_name
  ON public.sales_pricelists(company_id, LOWER(BTRIM(name)))
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pricelists_code
  ON public.sales_pricelists(company_id, LOWER(BTRIM(code)))
  WHERE code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_pricelists_active
  ON public.sales_pricelists(company_id, is_active, priority, name)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_pricelist_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  pricelist_id UUID NOT NULL REFERENCES public.sales_pricelists(id) ON DELETE CASCADE,
  catalog_item_id UUID,
  min_quantity NUMERIC(18,4) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
  calculation VARCHAR(30) NOT NULL
    CHECK (calculation IN ('fixed','discount_percent','markup_percent')),
  amount NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  priority INTEGER NOT NULL DEFAULT 100,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_pricelist_rules_lookup
  ON public.sales_pricelist_rules(
    company_id,
    pricelist_id,
    catalog_item_id,
    min_quantity DESC,
    priority
  );

CREATE TABLE IF NOT EXISTS public.sales_quote_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  company_id UUID NOT NULL,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  reason TEXT,
  snapshot JSONB NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(quote_id, revision_number)
);
CREATE INDEX IF NOT EXISTS idx_sales_quote_revisions_quote
  ON public.sales_quote_revisions(quote_id, revision_number DESC);

CREATE TABLE IF NOT EXISTS public.sales_quote_optional_items (
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
  tax_name_snapshot VARCHAR(180),
  tax_rate NUMERIC(8,4) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  is_selected BOOLEAN NOT NULL DEFAULT FALSE,
  selected_at TIMESTAMPTZ,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sales_quote_optional_items_quote
  ON public.sales_quote_optional_items(quote_id, sort_order, id);


-- Sales 3.1 organization, targets and commissions.
ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS sales_team_id UUID;

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS territory_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS salesperson_user_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS sales_team_id UUID;

  ALTER TABLE public.sales_orders_v2
    ADD COLUMN IF NOT EXISTS territory_id UUID;

  CREATE TABLE IF NOT EXISTS public.sales_territories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    parent_territory_id UUID REFERENCES public.sales_territories(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_territories_name
    ON public.sales_territories(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_territories_code
    ON public.sales_territories(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    manager_user_id UUID,
    territory_id UUID REFERENCES public.sales_territories(id) ON DELETE SET NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_teams_name
    ON public.sales_teams(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_teams_code
    ON public.sales_teams(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_teams_active
    ON public.sales_teams(company_id, is_active, name)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    team_id UUID NOT NULL REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member'
      CHECK (role IN ('manager','member')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    left_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, team_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_team_members_user
    ON public.sales_team_members(company_id, user_id, is_active);

  CREATE TABLE IF NOT EXISTS public.sales_targets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    target_scope VARCHAR(20) NOT NULL
      CHECK (target_scope IN ('company','team','user')),
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    user_id UUID,
    metric VARCHAR(20) NOT NULL
      CHECK (metric IN ('revenue','margin','orders')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    target_value NUMERIC(18,2) NOT NULL CHECK (target_value >= 0),
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (period_end >= period_start),
    CHECK (
      (target_scope = 'company' AND team_id IS NULL AND user_id IS NULL)
      OR (target_scope = 'team' AND team_id IS NOT NULL AND user_id IS NULL)
      OR (target_scope = 'user' AND team_id IS NULL AND user_id IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_sales_targets_period
    ON public.sales_targets(company_id, period_start, period_end, target_scope)
    WHERE deleted_at IS NULL AND is_active = TRUE;

  CREATE TABLE IF NOT EXISTS public.sales_commission_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(180) NOT NULL,
    code VARCHAR(80),
    basis VARCHAR(20) NOT NULL
      CHECK (basis IN ('revenue','margin')),
    rate_percent NUMERIC(9,4) NOT NULL CHECK (rate_percent BETWEEN 0 AND 100),
    threshold_amount NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (threshold_amount >= 0),
    cap_amount NUMERIC(18,2) CHECK (cap_amount IS NULL OR cap_amount >= 0),
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_plans_name
    ON public.sales_commission_plans(company_id, LOWER(BTRIM(name)))
    WHERE deleted_at IS NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_commission_plans_code
    ON public.sales_commission_plans(company_id, LOWER(BTRIM(code)))
    WHERE code IS NOT NULL AND deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_commission_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    plan_id UUID NOT NULL REFERENCES public.sales_commission_plans(id) ON DELETE CASCADE,
    assignee_type VARCHAR(20) NOT NULL
      CHECK (assignee_type IN ('user','team')),
    user_id UUID,
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE CASCADE,
    valid_from DATE,
    valid_until DATE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CHECK (
      (assignee_type = 'user' AND user_id IS NOT NULL AND team_id IS NULL)
      OR (assignee_type = 'team' AND user_id IS NULL AND team_id IS NOT NULL)
    )
  );

  CREATE INDEX IF NOT EXISTS idx_sales_commission_assignments_active
    ON public.sales_commission_assignments(company_id, plan_id, assignee_type, is_active);

  CREATE TABLE IF NOT EXISTS public.sales_commission_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    order_id UUID NOT NULL REFERENCES public.sales_orders_v2(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES public.sales_commission_plans(id) ON DELETE RESTRICT,
    assignment_id UUID NOT NULL REFERENCES public.sales_commission_assignments(id) ON DELETE RESTRICT,
    user_id UUID,
    team_id UUID REFERENCES public.sales_teams(id) ON DELETE SET NULL,
    basis VARCHAR(20) NOT NULL CHECK (basis IN ('revenue','margin')),
    basis_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    commission_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
    currency VARCHAR(3) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'accrued'
      CHECK (status IN ('accrued','reversed','paid')),
    source_event_key VARCHAR(255) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    accrued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, source_event_key)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_order
    ON public.sales_commission_entries(company_id, order_id, status);

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_user
    ON public.sales_commission_entries(company_id, user_id, accrued_at DESC)
    WHERE user_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_commission_entries_team
    ON public.sales_commission_entries(company_id, team_id, accrued_at DESC)
    WHERE team_id IS NOT NULL;


-- Sales 3.2 commercial operations, returns, deposits and forecasting.
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

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS credited_quantity NUMERIC(18,4) NOT NULL DEFAULT 0
      CHECK (credited_quantity >= 0);

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

  CREATE TABLE IF NOT EXISTS public.sales_return_credit_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    return_credit_id UUID NOT NULL REFERENCES public.sales_return_credits(id) ON DELETE CASCADE,
    return_item_id UUID NOT NULL REFERENCES public.sales_return_items(id) ON DELETE RESTRICT,
    invoice_item_id UUID NOT NULL,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(return_credit_id, return_item_id, invoice_item_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_return_credit_items_return
    ON public.sales_return_credit_items(company_id, return_item_id);

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


-- Sales 3.4 lead and opportunity pipeline.

  CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    name VARCHAR(120) NOT NULL,
    sequence INTEGER NOT NULL DEFAULT 10,
    probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    stage_type VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(company_id, name)
  );

  CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stages_company
    ON public.sales_pipeline_stages(company_id, is_active, sequence, name);

  CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    lead_number VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','contacted','qualified','disqualified','converted')),
    name VARCHAR(255) NOT NULL,
    company_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(320),
    phone VARCHAR(80),
    source VARCHAR(120),
    notes TEXT,
    salesperson_user_id UUID,
    sales_team_id UUID,
    territory_id UUID,
    converted_opportunity_id UUID,
    disqualification_reason TEXT,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_leads_number
    ON public.sales_leads(company_id, lead_number) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_leads_company_status
    ON public.sales_leads(company_id, status, created_at DESC) WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    opportunity_number VARCHAR(100) NOT NULL,
    lead_id UUID REFERENCES public.sales_leads(id) ON DELETE SET NULL,
    billing_customer_id UUID,
    stage_id UUID NOT NULL REFERENCES public.sales_pipeline_stages(id),
    name VARCHAR(255) NOT NULL,
    customer_name VARCHAR(255),
    contact_name VARCHAR(255),
    email VARCHAR(320),
    phone VARCHAR(80),
    currency VARCHAR(3) NOT NULL DEFAULT 'KES',
    expected_value NUMERIC(18,2) NOT NULL DEFAULT 0 CHECK (expected_value >= 0),
    probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    salesperson_user_id UUID,
    sales_team_id UUID,
    territory_id UUID,
    source VARCHAR(120),
    notes TEXT,
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason TEXT,
    latest_quote_id UUID REFERENCES public.sales_quotes(id) ON DELETE SET NULL,
    created_by UUID,
    updated_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_opportunities_number
    ON public.sales_opportunities(company_id, opportunity_number) WHERE deleted_at IS NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_opportunities_pipeline
    ON public.sales_opportunities(company_id, stage_id, expected_close_date)
    WHERE deleted_at IS NULL;

  CREATE TABLE IF NOT EXISTS public.sales_opportunity_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    opportunity_id UUID NOT NULL REFERENCES public.sales_opportunities(id) ON DELETE CASCADE,
    from_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
    to_stage_id UUID NOT NULL REFERENCES public.sales_pipeline_stages(id),
    probability NUMERIC(5,2) NOT NULL,
    reason TEXT,
    changed_by UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_sales_opportunity_stage_history
    ON public.sales_opportunity_stage_history(opportunity_id, created_at DESC);

  ALTER TABLE public.sales_sequences DROP CONSTRAINT IF EXISTS sales_sequences_document_type_check;
  ALTER TABLE public.sales_sequences ADD CONSTRAINT sales_sequences_document_type_check
    CHECK (document_type IN ('quote','order','shipment','return','lead','opportunity'));

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE SET NULL;
  CREATE INDEX IF NOT EXISTS idx_sales_quotes_opportunity
    ON public.sales_quotes(company_id, opportunity_id) WHERE opportunity_id IS NOT NULL AND deleted_at IS NULL;
-- Sales 3.4 pipeline stages and quote-level pipeline columns.
CREATE TABLE IF NOT EXISTS public.sales_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  code VARCHAR(60),
  name VARCHAR(120) NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 10,
  probability NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  stage_type VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (stage_type IN ('open','won','lost')),
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  fold_in_kanban BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  color VARCHAR(20),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(company_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_pipeline_stages_code
  ON public.sales_pipeline_stages(company_id, LOWER(BTRIM(code)))
  WHERE deleted_at IS NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sales_pipeline_stages_company
  ON public.sales_pipeline_stages(company_id, is_active, sequence, name);

ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS expected_close_date DATE;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS probability_override NUMERIC(5,2)
    CHECK (
      probability_override IS NULL
      OR (probability_override >= 0 AND probability_override <= 100)
    );
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS stage_entered_at TIMESTAMPTZ;
ALTER TABLE public.sales_quotes
  ADD COLUMN IF NOT EXISTS last_stage_change_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_stage
  ON public.sales_quotes(company_id, stage_id, quote_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_quotes_expected_close
  ON public.sales_quotes(company_id, expected_close_date)
  WHERE deleted_at IS NULL AND expected_close_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.sales_quote_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL,
  from_probability NUMERIC(5,2),
  to_probability NUMERIC(5,2),
  reason TEXT,
  changed_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_stage_history_quote
  ON public.sales_quote_stage_history(company_id, quote_id, created_at DESC);

-- Advanced quote approval workflow (Sales 3.4.2).
CREATE TABLE IF NOT EXISTS public.sales_quote_approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  name VARCHAR(160) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 100,
  min_quote_total NUMERIC(20,6),
  max_discount_percent NUMERIC(7,4),
  min_margin_percent NUMERIC(7,4),
  currency_code VARCHAR(3),
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (min_quote_total IS NULL OR min_quote_total >= 0),
  CHECK (max_discount_percent IS NULL OR max_discount_percent BETWEEN 0 AND 100),
  CHECK (min_margin_percent IS NULL OR min_margin_percent BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policies_company
  ON public.sales_quote_approval_policies(company_id, is_active, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.sales_quote_approval_policy_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  policy_id UUID NOT NULL REFERENCES public.sales_quote_approval_policies(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  approver_user_id UUID,
  approver_role_key VARCHAR(120),
  required_approvals INTEGER NOT NULL DEFAULT 1 CHECK (required_approvals > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(policy_id, step_order),
  CHECK (approver_user_id IS NOT NULL OR approver_role_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_policy_steps_policy
  ON public.sales_quote_approval_policy_steps(company_id, policy_id, step_order);

CREATE TABLE IF NOT EXISTS public.sales_quote_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  quote_id UUID NOT NULL REFERENCES public.sales_quotes(id) ON DELETE CASCADE,
  policy_id UUID REFERENCES public.sales_quote_approval_policies(id) ON DELETE SET NULL,
  quote_fingerprint TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','superseded','cancelled')),
  current_step_order INTEGER NOT NULL DEFAULT 1 CHECK (current_step_order > 0),
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_request_pending
  ON public.sales_quote_approval_requests(company_id, quote_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_requests_queue
  ON public.sales_quote_approval_requests(company_id, status, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.sales_quote_approval_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL,
  request_id UUID NOT NULL REFERENCES public.sales_quote_approval_requests(id) ON DELETE CASCADE,
  policy_step_id UUID REFERENCES public.sales_quote_approval_policy_steps(id) ON DELETE SET NULL,
  step_order INTEGER NOT NULL CHECK (step_order > 0),
  reviewer_user_id UUID NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('approved','rejected')),
  reason TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(request_id, step_order, reviewer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_quote_approval_decisions_request
  ON public.sales_quote_approval_decisions(company_id, request_id, step_order, decided_at);
