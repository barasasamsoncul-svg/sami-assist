import 'server-only';

export function financeSpecialistDepthSql(
  moduleKey:
    string,
) {
  switch (
    moduleKey
  ) {
    case 'purchase':
      return `
-- Baseline Purchase tables are created before specialist extension SQL. Establish
-- nullable company columns now so company-safe indexes/FKs below are valid before
-- the normal enterprise hardening pass performs any unambiguous legacy backfill.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS company_id UUID;
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS company_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_company_id_id
  ON public.purchase_orders(company_id, id);
-- Inventory is a required Purchase dependency. Reassert the composite reference
-- keys here so receipt constraints are safe even when upgrading an older workspace.
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_id_id
  ON public.products(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_company_id_id
  ON public.warehouses(company_id, id);

CREATE TABLE IF NOT EXISTS public.purchase_requisitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requisition_number VARCHAR(100) NOT NULL,
  requested_by UUID,
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  needed_by DATE,
  department_name VARCHAR(160),
  reason TEXT,
  estimated_total NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (estimated_total >= 0),
  CHECK (status IN ('draft','submitted','approved','rejected','converted','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requisition_number
  ON public.purchase_requisitions(company_id, requisition_number)
  WHERE deleted_at IS NULL;

-- Keep the requisition department optional without requiring a separate HR master.
ALTER TABLE public.purchase_requisitions
  ADD COLUMN IF NOT EXISTS department_name VARCHAR(160);

CREATE TABLE IF NOT EXISTS public.purchase_requisition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  product_reference UUID,
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL,
  estimated_unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  preferred_supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (estimated_unit_cost >= 0)
);
CREATE INDEX IF NOT EXISTS idx_purchase_requisition_lines_req
  ON public.purchase_requisition_lines(company_id, requisition_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  receipt_number VARCHAR(100) NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ,
  received_by UUID,
  warehouse_reference UUID,
  supplier_delivery_reference VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','received','inspected','posted','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_receipt_number
  ON public.purchase_receipts(company_id, receipt_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.purchase_receipt_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  receipt_id UUID NOT NULL REFERENCES public.purchase_receipts(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_reference UUID,
  quantity_received NUMERIC(19,4) NOT NULL,
  quantity_rejected NUMERIC(19,4) NOT NULL DEFAULT 0,
  rejection_reason TEXT,
  lot_reference VARCHAR(160),
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity_received >= 0),
  CHECK (quantity_rejected >= 0),
  CHECK (quantity_rejected <= quantity_received)
);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_receipt
  ON public.purchase_receipt_lines(company_id, receipt_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  price_list_number VARCHAR(100) NOT NULL,
  name VARCHAR(200) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  valid_from DATE,
  valid_to DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from),
  CHECK (status IN ('draft','active','expired','archived'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_lists_company_number
  ON public.supplier_price_lists(company_id, price_list_number)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_lists_company_id_id
  ON public.supplier_price_lists(company_id, id);
CREATE INDEX IF NOT EXISTS idx_supplier_price_lists_supplier_status
  ON public.supplier_price_lists(company_id, supplier_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  price_list_id UUID NOT NULL REFERENCES public.supplier_price_lists(id) ON DELETE RESTRICT,
  product_reference UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_sku VARCHAR(120),
  description TEXT NOT NULL,
  unit_of_measure VARCHAR(40) NOT NULL DEFAULT 'unit',
  minimum_quantity NUMERIC(19,4) NOT NULL DEFAULT 1,
  unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  valid_from DATE,
  valid_to DATE,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (minimum_quantity > 0),
  CHECK (unit_cost >= 0),
  CHECK (valid_from IS NULL OR valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_list_items_company_id_id
  ON public.supplier_price_list_items(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_list_items_product
  ON public.supplier_price_list_items(company_id, price_list_id, product_reference)
  WHERE product_reference IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_list_items_sku
  ON public.supplier_price_list_items(company_id, price_list_id, LOWER(BTRIM(supplier_sku)))
  WHERE NULLIF(BTRIM(supplier_sku), '') IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_price_list_items_list
  ON public.supplier_price_list_items(company_id, price_list_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_rfqs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_number VARCHAR(100) NOT NULL,
  requisition_id UUID REFERENCES public.purchase_requisitions(id) ON DELETE RESTRICT,
  title VARCHAR(255) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  response_due_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('draft','sent','closed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfqs_company_number
  ON public.supplier_rfqs(company_id, rfq_number)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfqs_company_id_id
  ON public.supplier_rfqs(company_id, id);

CREATE TABLE IF NOT EXISTS public.supplier_rfq_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES public.supplier_rfqs(id) ON DELETE RESTRICT,
  source_requisition_line_id UUID REFERENCES public.purchase_requisition_lines(id) ON DELETE RESTRICT,
  product_reference UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL,
  unit_of_measure VARCHAR(40) NOT NULL DEFAULT 'unit',
  estimated_unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (estimated_unit_cost >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_lines_company_id_id
  ON public.supplier_rfq_lines(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_lines_company_rfq_id_id
  ON public.supplier_rfq_lines(company_id, rfq_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_lines_source_requisition
  ON public.supplier_rfq_lines(company_id, rfq_id, source_requisition_line_id)
  WHERE source_requisition_line_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_rfq_lines_rfq
  ON public.supplier_rfq_lines(company_id, rfq_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_rfq_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL REFERENCES public.supplier_rfqs(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  response_number VARCHAR(100),
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  quoted_total NUMERIC(19,2) NOT NULL DEFAULT 0,
  delivery_lead_days INTEGER,
  valid_until DATE,
  payment_terms TEXT,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quoted_total >= 0),
  CHECK (delivery_lead_days IS NULL OR delivery_lead_days >= 0),
  CHECK (status IN ('draft','submitted','accepted','rejected','withdrawn'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_responses_company_id_id
  ON public.supplier_rfq_responses(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_responses_company_rfq_id_id
  ON public.supplier_rfq_responses(company_id, rfq_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_responses_company_supplier
  ON public.supplier_rfq_responses(company_id, rfq_id, supplier_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_rfq_responses_rfq_status
  ON public.supplier_rfq_responses(company_id, rfq_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.supplier_rfq_response_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  rfq_id UUID NOT NULL,
  response_id UUID NOT NULL,
  rfq_line_id UUID NOT NULL,
  quantity NUMERIC(19,4) NOT NULL,
  unit_cost NUMERIC(19,4) NOT NULL DEFAULT 0,
  line_total NUMERIC(19,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (quantity > 0),
  CHECK (unit_cost >= 0),
  CHECK (line_total >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_response_lines_company_id_id
  ON public.supplier_rfq_response_lines(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_response_lines_unique_source
  ON public.supplier_rfq_response_lines(company_id, response_id, rfq_line_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_supplier_rfq_response_lines_rfq
  ON public.supplier_rfq_response_lines(company_id, rfq_id, response_id)
  WHERE deleted_at IS NULL;

-- Purchase lines map to the shared Inventory product master. Existing unmapped
-- purchase lines stay unmapped until an operator explicitly links a product.
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS requisition_id UUID;
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS product_reference UUID,
  ADD COLUMN IF NOT EXISTS source_requisition_line_id UUID;
ALTER TABLE public.purchase_receipts
  ADD COLUMN IF NOT EXISTS warehouse_reference UUID;
ALTER TABLE public.purchase_receipt_lines
  ADD COLUMN IF NOT EXISTS product_reference UUID;

ALTER TABLE public.purchase_order_items
  ALTER COLUMN quantity TYPE NUMERIC(19,4) USING quantity::NUMERIC(19,4),
  ALTER COLUMN unit_cost TYPE NUMERIC(19,4) USING unit_cost::NUMERIC(19,4),
  ALTER COLUMN line_total TYPE NUMERIC(19,2) USING line_total::NUMERIC(19,2);
ALTER TABLE public.purchase_orders
  ALTER COLUMN total_amount TYPE NUMERIC(19,2) USING total_amount::NUMERIC(19,2);

DO $sami_purchase_value_checks$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_purchase_order_items_quantity_positive'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT ck_purchase_order_items_quantity_positive
      CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_purchase_order_items_unit_cost_nonnegative'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT ck_purchase_order_items_unit_cost_nonnegative
      CHECK (unit_cost >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_purchase_order_items_line_total_nonnegative'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT ck_purchase_order_items_line_total_nonnegative
      CHECK (line_total >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ck_purchase_orders_total_nonnegative'
      AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT ck_purchase_orders_total_nonnegative
      CHECK (total_amount >= 0) NOT VALID;
  END IF;
END
$sami_purchase_value_checks$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_order_items_company_id_id
  ON public.purchase_order_items(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_receipts_company_id_id
  ON public.purchase_receipts(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_orders_company_requisition_supplier
  ON public.purchase_orders(company_id, requisition_id, supplier_id)
  WHERE requisition_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_order_items_company_requisition_line
  ON public.purchase_order_items(company_id, source_requisition_line_id)
  WHERE source_requisition_line_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_company_product
  ON public.purchase_order_items(company_id, product_reference)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_lines_company_po_item
  ON public.purchase_receipt_lines(company_id, purchase_order_item_id)
  WHERE deleted_at IS NULL;

DO $sami_purchase_inventory_links$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_products_company'
      AND conrelid = 'public.products'::regclass
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT fk_purchase_products_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_warehouses_company'
      AND conrelid = 'public.warehouses'::regclass
  ) THEN
    ALTER TABLE public.warehouses
      ADD CONSTRAINT fk_purchase_warehouses_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_orders_company'
      AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT fk_purchase_orders_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_order_items_company'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT fk_purchase_order_items_company
      FOREIGN KEY (company_id) REFERENCES public.companies(id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_order_items_company_order'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT fk_purchase_order_items_company_order
      FOREIGN KEY (company_id, purchase_order_id)
      REFERENCES public.purchase_orders(company_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipts_company_order'
      AND conrelid = 'public.purchase_receipts'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipts
      ADD CONSTRAINT fk_purchase_receipts_company_order
      FOREIGN KEY (company_id, purchase_order_id)
      REFERENCES public.purchase_orders(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipt_lines_company_receipt'
      AND conrelid = 'public.purchase_receipt_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipt_lines
      ADD CONSTRAINT fk_purchase_receipt_lines_company_receipt
      FOREIGN KEY (company_id, receipt_id)
      REFERENCES public.purchase_receipts(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_order_items_product'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT fk_purchase_order_items_product
      FOREIGN KEY (product_reference) REFERENCES public.products(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_order_items_company_product'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT fk_purchase_order_items_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipts_warehouse'
      AND conrelid = 'public.purchase_receipts'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipts
      ADD CONSTRAINT fk_purchase_receipts_warehouse
      FOREIGN KEY (warehouse_reference) REFERENCES public.warehouses(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipts_company_warehouse'
      AND conrelid = 'public.purchase_receipts'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipts
      ADD CONSTRAINT fk_purchase_receipts_company_warehouse
      FOREIGN KEY (company_id, warehouse_reference)
      REFERENCES public.warehouses(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipt_lines_product'
      AND conrelid = 'public.purchase_receipt_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipt_lines
      ADD CONSTRAINT fk_purchase_receipt_lines_product
      FOREIGN KEY (product_reference) REFERENCES public.products(id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipt_lines_company_product'
      AND conrelid = 'public.purchase_receipt_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipt_lines
      ADD CONSTRAINT fk_purchase_receipt_lines_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_receipt_lines_company_po_item'
      AND conrelid = 'public.purchase_receipt_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_receipt_lines
      ADD CONSTRAINT fk_purchase_receipt_lines_company_po_item
      FOREIGN KEY (company_id, purchase_order_item_id)
      REFERENCES public.purchase_order_items(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END
$sami_purchase_inventory_links$;

-- Install order is deliberately flexible: if Accounting was installed first,
-- Purchase adds the same composite FK once its supplier master exists.
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_suppliers_company_id_id
  ON public.suppliers(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requisitions_company_id_id
  ON public.purchase_requisitions(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_requisition_lines_company_id_id
  ON public.purchase_requisition_lines(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_price_list_items_company_list_id
  ON public.supplier_price_list_items(company_id, price_list_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_supplier_rfq_response_lines_company_rfq_id_id
  ON public.supplier_rfq_response_lines(company_id, rfq_id, id);

-- Enforce company-safe relations for purchasing sources and requisition lines.
-- NOT VALID keeps upgrades additive while immediately checking new or changed rows.
DO $sami_purchase_company_relations$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_orders_company_supplier'
      AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT fk_purchase_orders_company_supplier
      FOREIGN KEY (company_id, supplier_id)
      REFERENCES public.suppliers(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_requisition_lines_company_requisition'
      AND conrelid = 'public.purchase_requisition_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_requisition_lines
      ADD CONSTRAINT fk_purchase_requisition_lines_company_requisition
      FOREIGN KEY (company_id, requisition_id)
      REFERENCES public.purchase_requisitions(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_requisition_lines_company_product'
      AND conrelid = 'public.purchase_requisition_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_requisition_lines
      ADD CONSTRAINT fk_purchase_requisition_lines_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_requisition_lines_company_supplier'
      AND conrelid = 'public.purchase_requisition_lines'::regclass
  ) THEN
    ALTER TABLE public.purchase_requisition_lines
      ADD CONSTRAINT fk_purchase_requisition_lines_company_supplier
      FOREIGN KEY (company_id, preferred_supplier_id)
      REFERENCES public.suppliers(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_orders_company_requisition'
      AND conrelid = 'public.purchase_orders'::regclass
  ) THEN
    ALTER TABLE public.purchase_orders
      ADD CONSTRAINT fk_purchase_orders_company_requisition
      FOREIGN KEY (company_id, requisition_id)
      REFERENCES public.purchase_requisitions(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_purchase_order_items_company_requisition_line'
      AND conrelid = 'public.purchase_order_items'::regclass
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT fk_purchase_order_items_company_requisition_line
      FOREIGN KEY (company_id, source_requisition_line_id)
      REFERENCES public.purchase_requisition_lines(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_price_lists_company_supplier'
      AND conrelid = 'public.supplier_price_lists'::regclass
  ) THEN
    ALTER TABLE public.supplier_price_lists
      ADD CONSTRAINT fk_supplier_price_lists_company_supplier
      FOREIGN KEY (company_id, supplier_id)
      REFERENCES public.suppliers(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_price_list_items_company_list'
      AND conrelid = 'public.supplier_price_list_items'::regclass
  ) THEN
    ALTER TABLE public.supplier_price_list_items
      ADD CONSTRAINT fk_supplier_price_list_items_company_list
      FOREIGN KEY (company_id, price_list_id)
      REFERENCES public.supplier_price_lists(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_price_list_items_company_product'
      AND conrelid = 'public.supplier_price_list_items'::regclass
  ) THEN
    ALTER TABLE public.supplier_price_list_items
      ADD CONSTRAINT fk_supplier_price_list_items_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfqs_company_requisition'
      AND conrelid = 'public.supplier_rfqs'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfqs
      ADD CONSTRAINT fk_supplier_rfqs_company_requisition
      FOREIGN KEY (company_id, requisition_id)
      REFERENCES public.purchase_requisitions(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_lines_company_rfq'
      AND conrelid = 'public.supplier_rfq_lines'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_lines
      ADD CONSTRAINT fk_supplier_rfq_lines_company_rfq
      FOREIGN KEY (company_id, rfq_id)
      REFERENCES public.supplier_rfqs(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_lines_company_requisition_line'
      AND conrelid = 'public.supplier_rfq_lines'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_lines
      ADD CONSTRAINT fk_supplier_rfq_lines_company_requisition_line
      FOREIGN KEY (company_id, source_requisition_line_id)
      REFERENCES public.purchase_requisition_lines(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_lines_company_product'
      AND conrelid = 'public.supplier_rfq_lines'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_lines
      ADD CONSTRAINT fk_supplier_rfq_lines_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_responses_company_rfq'
      AND conrelid = 'public.supplier_rfq_responses'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_responses
      ADD CONSTRAINT fk_supplier_rfq_responses_company_rfq
      FOREIGN KEY (company_id, rfq_id)
      REFERENCES public.supplier_rfqs(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_responses_company_supplier'
      AND conrelid = 'public.supplier_rfq_responses'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_responses
      ADD CONSTRAINT fk_supplier_rfq_responses_company_supplier
      FOREIGN KEY (company_id, supplier_id)
      REFERENCES public.suppliers(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_response_lines_company_response'
      AND conrelid = 'public.supplier_rfq_response_lines'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_response_lines
      ADD CONSTRAINT fk_supplier_rfq_response_lines_company_response
      FOREIGN KEY (company_id, rfq_id, response_id)
      REFERENCES public.supplier_rfq_responses(company_id, rfq_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_supplier_rfq_response_lines_company_rfq_line'
      AND conrelid = 'public.supplier_rfq_response_lines'::regclass
  ) THEN
    ALTER TABLE public.supplier_rfq_response_lines
      ADD CONSTRAINT fk_supplier_rfq_response_lines_company_rfq_line
      FOREIGN KEY (company_id, rfq_id, rfq_line_id)
      REFERENCES public.supplier_rfq_lines(company_id, rfq_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END
$sami_purchase_company_relations$;

DO $sami_purchase_accounting_supplier_link$
BEGIN
  IF to_regclass('public.accounting_vendors') IS NOT NULL THEN
    ALTER TABLE public.accounting_vendors
      ADD COLUMN IF NOT EXISTS purchase_supplier_id UUID;

    CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_vendors_company_purchase_supplier
      ON public.accounting_vendors(company_id, purchase_supplier_id)
      WHERE purchase_supplier_id IS NOT NULL AND deleted_at IS NULL;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_accounting_vendors_company_purchase_supplier'
        AND conrelid = 'public.accounting_vendors'::regclass
    ) THEN
      ALTER TABLE public.accounting_vendors
        ADD CONSTRAINT fk_accounting_vendors_company_purchase_supplier
        FOREIGN KEY (company_id, purchase_supplier_id)
        REFERENCES public.suppliers(company_id, id)
        ON DELETE RESTRICT NOT VALID;
    END IF;

    -- If Accounting was installed first, backfill pre-existing Purchase suppliers.
    EXECUTE $sami_purchase_vendor_backfill$
      INSERT INTO public.accounting_vendors (
        company_id, vendor_code, name, email, phone, tax_number,
        purchase_supplier_id, status, created_at, updated_at
      )
      SELECT
        supplier.company_id,
        'PUR-' || UPPER(supplier.id::text),
        supplier.name,
        supplier.email,
        supplier.phone,
        supplier.tax_number,
        supplier.id,
        CASE
          WHEN LOWER(COALESCE(supplier.status, 'active')) = 'blocked' THEN 'blocked'
          WHEN LOWER(COALESCE(supplier.status, 'active')) IN ('inactive', 'archived') THEN 'inactive'
          ELSE 'active'
        END,
        NOW(),
        NOW()
      FROM public.suppliers supplier
      WHERE supplier.company_id IS NOT NULL
        AND supplier.deleted_at IS NULL
        AND NULLIF(BTRIM(supplier.name), '') IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM public.accounting_vendors vendor
          WHERE vendor.company_id = supplier.company_id
            AND vendor.purchase_supplier_id = supplier.id
            AND vendor.deleted_at IS NULL
        )
      ON CONFLICT DO NOTHING
    $sami_purchase_vendor_backfill$;
  END IF;
END
$sami_purchase_accounting_supplier_link$;
`;

    case 'expenses':
      return `
CREATE TABLE IF NOT EXISTS public.expense_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  daily_limit NUMERIC(19,4),
  per_claim_limit NUMERIC(19,4),
  receipt_required_above NUMERIC(19,4),
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (daily_limit IS NULL OR daily_limit >= 0),
  CHECK (per_claim_limit IS NULL OR per_claim_limit >= 0),
  CHECK (receipt_required_above IS NULL OR receipt_required_above >= 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_expense_policies_company
  ON public.expense_policies(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.expense_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_number VARCHAR(100) NOT NULL,
  employee_reference UUID,
  period_start DATE,
  period_end DATE,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  reimbursed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK (total_amount >= 0),
  CHECK (status IN ('draft','submitted','approved','rejected','reimbursed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_expense_report_number
  ON public.expense_reports(company_id, report_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.expense_report_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.expense_reports(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  expense_date DATE NOT NULL,
  category_id UUID REFERENCES public.expense_categories(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  merchant VARCHAR(255),
  receipt_file_id UUID,
  policy_exception BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0)
);
CREATE INDEX IF NOT EXISTS idx_expense_report_lines_report
  ON public.expense_report_lines(company_id, report_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.expense_mileage_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  rate_per_unit NUMERIC(19,4) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'km',
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (rate_per_unit >= 0),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (unit IN ('km','mile')),
  CHECK (status IN ('active','inactive'))
);
`;

    case 'fixed_assets':
      return `
CREATE TABLE IF NOT EXISTS public.asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  default_useful_life_months INTEGER,
  default_depreciation_method VARCHAR(40) NOT NULL DEFAULT 'straight_line',
  asset_account_reference UUID,
  depreciation_account_reference UUID,
  expense_account_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (default_useful_life_months IS NULL OR default_useful_life_months > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_asset_categories_company
  ON public.asset_categories(company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_impairments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  impairment_date DATE NOT NULL,
  previous_book_value NUMERIC(19,4) NOT NULL,
  impairment_amount NUMERIC(19,4) NOT NULL,
  new_book_value NUMERIC(19,4) NOT NULL,
  reason TEXT NOT NULL,
  journal_reference UUID,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (previous_book_value >= 0),
  CHECK (impairment_amount >= 0),
  CHECK (new_book_value >= 0),
  CHECK (impairment_amount <= previous_book_value),
  CHECK (status IN ('draft','approved','posted','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_asset_impairments_asset
  ON public.asset_impairments(company_id, asset_id, impairment_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.asset_insurance_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  insurer VARCHAR(200) NOT NULL,
  policy_number VARCHAR(120) NOT NULL,
  insured_value NUMERIC(19,4) NOT NULL DEFAULT 0,
  premium_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  coverage_start DATE,
  coverage_end DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (insured_value >= 0),
  CHECK (premium_amount >= 0),
  CHECK (coverage_end IS NULL OR coverage_start IS NULL OR coverage_end >= coverage_start),
  CHECK (status IN ('active','expired','cancelled'))
);
`;

    case 'tax':
      return `
CREATE TABLE IF NOT EXISTS public.tax_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  tax_type VARCHAR(60) NOT NULL,
  rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  recoverable_percent NUMERIC(5,2) NOT NULL DEFAULT 100,
  effective_from DATE,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (rate >= 0),
  CHECK (recoverable_percent >= 0 AND recoverable_percent <= 100),
  CHECK (effective_to IS NULL OR effective_from IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('active','inactive'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tax_codes_company_code
  ON public.tax_codes(company_id, code)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.tax_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id) ON DELETE CASCADE,
  resource_type VARCHAR(80),
  country_code VARCHAR(3),
  priority INTEGER NOT NULL DEFAULT 100,
  valid_from DATE,
  valid_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (priority >= 0),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_tax_rules_company
  ON public.tax_rules(company_id, priority)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.withholding_certificates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  certificate_number VARCHAR(120) NOT NULL,
  counterparty_name VARCHAR(255) NOT NULL,
  tax_code_id UUID REFERENCES public.tax_codes(id) ON DELETE SET NULL,
  gross_amount NUMERIC(19,4) NOT NULL,
  withheld_amount NUMERIC(19,4) NOT NULL,
  certificate_date DATE NOT NULL,
  period_start DATE,
  period_end DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (gross_amount >= 0),
  CHECK (withheld_amount >= 0),
  CHECK (withheld_amount <= gross_amount),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start),
  CHECK (status IN ('draft','issued','void'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_withholding_certificate_number
  ON public.withholding_certificates(company_id, certificate_number)
  WHERE deleted_at IS NULL;
`;

    case 'budgeting':
      return `
CREATE TABLE IF NOT EXISTS public.budget_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  scenario_type VARCHAR(30) NOT NULL DEFAULT 'base',
  probability NUMERIC(5,2) NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (scenario_type IN ('base','optimistic','pessimistic','custom')),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (status IN ('draft','active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_budget_scenarios_budget
  ON public.budget_scenarios(company_id, budget_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.budget_scenario_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.budget_scenarios(id) ON DELETE CASCADE,
  budget_line_id UUID REFERENCES public.budget_lines(id) ON DELETE SET NULL,
  planned_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (planned_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_budget_scenario_lines_scenario
  ON public.budget_scenario_lines(company_id, scenario_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.budget_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  requested_by UUID,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approver_user_id UUID,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (status IN ('pending','approved','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_budget_approvals_budget
  ON public.budget_approvals(company_id, budget_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'cash_flow':
      return `
CREATE TABLE IF NOT EXISTS public.cash_flow_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  forecast_id UUID NOT NULL REFERENCES public.cash_flow_forecasts(id) ON DELETE CASCADE,
  name VARCHAR(160) NOT NULL,
  scenario_type VARCHAR(30) NOT NULL DEFAULT 'base',
  probability NUMERIC(5,2) NOT NULL DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (scenario_type IN ('base','optimistic','pessimistic','custom')),
  CHECK (probability >= 0 AND probability <= 100),
  CHECK (status IN ('active','archived'))
);
CREATE INDEX IF NOT EXISTS idx_cash_flow_scenarios_forecast
  ON public.cash_flow_scenarios(company_id, forecast_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.cash_flow_scenario_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.cash_flow_scenarios(id) ON DELETE CASCADE,
  expected_date DATE NOT NULL,
  flow_type VARCHAR(20) NOT NULL,
  category VARCHAR(100),
  amount NUMERIC(19,4) NOT NULL,
  probability NUMERIC(5,2) NOT NULL DEFAULT 100,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (flow_type IN ('inflow','outflow')),
  CHECK (amount >= 0),
  CHECK (probability >= 0 AND probability <= 100)
);
CREATE INDEX IF NOT EXISTS idx_cash_flow_scenario_items
  ON public.cash_flow_scenario_items(company_id, scenario_id, expected_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.liquidity_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  threshold_amount NUMERIC(19,4) NOT NULL,
  forecast_date DATE,
  projected_balance NUMERIC(19,4),
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  acknowledged_by UUID,
  acknowledged_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (severity IN ('info','warning','critical')),
  CHECK (status IN ('open','acknowledged','resolved'))
);
CREATE INDEX IF NOT EXISTS idx_liquidity_alerts_company
  ON public.liquidity_alerts(company_id, status, severity)
  WHERE deleted_at IS NULL;
`;

    case 'billing':
      return `
CREATE TABLE IF NOT EXISTS public.billing_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cycle_number VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  run_at TIMESTAMPTZ,
  issued_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (issued_count >= 0),
  CHECK (total_amount >= 0),
  CHECK (status IN ('draft','running','completed','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_billing_cycle_number
  ON public.billing_cycles(company_id, cycle_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.billing_account_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_account_id UUID NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  invoiced_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  outstanding_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  overdue_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (invoiced_amount >= 0),
  CHECK (paid_amount >= 0),
  CHECK (credit_amount >= 0),
  CHECK (overdue_amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_billing_account_balances_account
  ON public.billing_account_balances(company_id, billing_account_id, as_of_date DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.billing_dunning_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  billing_account_id UUID NOT NULL REFERENCES public.billing_accounts(id) ON DELETE CASCADE,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  overdue_amount NUMERIC(19,4) NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  next_action_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (overdue_amount > 0),
  CHECK (stage > 0),
  CHECK (status IN ('open','contacted','promise_to_pay','escalated','resolved','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_billing_dunning_company
  ON public.billing_dunning_cases(company_id, status, next_action_at)
  WHERE deleted_at IS NULL;
`;

    case 'subscriptions':
      return `
CREATE TABLE IF NOT EXISTS public.subscription_plan_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE CASCADE,
  currency VARCHAR(3) NOT NULL DEFAULT 'KES',
  billing_interval VARCHAR(30) NOT NULL DEFAULT 'monthly',
  amount NUMERIC(19,4) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0),
  CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_plan_prices
  ON public.subscription_plan_prices(company_id, plan_id, currency, effective_from)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.subscription_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  change_type VARCHAR(30) NOT NULL,
  from_plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  to_plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  effective_date DATE NOT NULL,
  proration_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  reason TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'scheduled',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (change_type IN ('upgrade','downgrade','pause','resume','cancel','renew')),
  CHECK (status IN ('scheduled','applied','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_subscription
  ON public.subscription_changes(company_id, subscription_id, effective_date)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.subscription_usage_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  metric_key VARCHAR(100) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  quantity NUMERIC(19,4) NOT NULL,
  unit_price NUMERIC(19,4) NOT NULL,
  amount NUMERIC(19,4) NOT NULL,
  billed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (quantity >= 0),
  CHECK (unit_price >= 0),
  CHECK (amount >= 0),
  CHECK (status IN ('pending','billed','waived','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_usage_charges
  ON public.subscription_usage_charges(company_id, subscription_id, period_start)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.subscription_renewals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  renewal_date DATE NOT NULL,
  renewal_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  invoice_reference UUID,
  renewed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (renewal_amount >= 0),
  CHECK (status IN ('pending','renewed','failed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_subscription_renewals
  ON public.subscription_renewals(company_id, subscription_id, renewal_date)
  WHERE deleted_at IS NULL;
`;

    case 'payments':
      return `
CREATE TABLE IF NOT EXISTS public.payment_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_number VARCHAR(100) NOT NULL,
  payment_account_id UUID REFERENCES public.payment_accounts(id) ON DELETE SET NULL,
  direction VARCHAR(20) NOT NULL DEFAULT 'outbound',
  payment_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  submitted_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (direction IN ('inbound','outbound')),
  CHECK (payment_count >= 0),
  CHECK (total_amount >= 0),
  CHECK (status IN ('draft','submitted','processing','completed','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_number
  ON public.payment_batches(company_id, batch_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.payment_batches(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.business_payments(id) ON DELETE RESTRICT,
  amount NUMERIC(19,4) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0),
  CHECK (status IN ('pending','processed','failed','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_batch_item
  ON public.payment_batch_items(company_id, batch_id, payment_id)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.business_payments(id) ON DELETE RESTRICT,
  refund_reference VARCHAR(160),
  amount NUMERIC(19,4) NOT NULL,
  reason TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  external_reference VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'requested',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount > 0),
  CHECK (status IN ('requested','approved','processing','completed','rejected','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_payment_refunds_payment
  ON public.payment_refunds(company_id, payment_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.business_payments(id) ON DELETE RESTRICT,
  dispute_reference VARCHAR(160),
  disputed_amount NUMERIC(19,4) NOT NULL,
  reason TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution VARCHAR(80),
  status VARCHAR(30) NOT NULL DEFAULT 'open',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (disputed_amount > 0),
  CHECK (status IN ('open','under_review','won','lost','closed','cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_payment_disputes_payment
  ON public.payment_disputes(company_id, payment_id, status)
  WHERE deleted_at IS NULL;
`;

    case 'commissions':
      return `
CREATE TABLE IF NOT EXISTS public.commission_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.commission_plans(id) ON DELETE CASCADE,
  threshold_from NUMERIC(19,4) NOT NULL DEFAULT 0,
  threshold_to NUMERIC(19,4),
  rate NUMERIC(9,4) NOT NULL DEFAULT 0,
  sequence INTEGER NOT NULL DEFAULT 1,
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (threshold_from >= 0),
  CHECK (threshold_to IS NULL OR threshold_to >= threshold_from),
  CHECK (rate >= 0 AND rate <= 100),
  CHECK (sequence > 0),
  CHECK (status IN ('active','inactive'))
);
CREATE INDEX IF NOT EXISTS idx_commission_tiers_plan
  ON public.commission_tiers(company_id, plan_id, sequence)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.commission_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payout_number VARCHAR(100) NOT NULL,
  user_id UUID NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_commission NUMERIC(19,4) NOT NULL DEFAULT 0,
  adjustments NUMERIC(19,4) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (period_end >= period_start),
  CHECK (gross_commission >= 0),
  CHECK (payable_amount >= 0),
  CHECK (status IN ('draft','submitted','approved','paid','cancelled'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission_payout_number
  ON public.commission_payouts(company_id, payout_number)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.commission_payout_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payout_id UUID NOT NULL REFERENCES public.commission_payouts(id) ON DELETE CASCADE,
  commission_entry_id UUID REFERENCES public.commission_entries(id) ON DELETE SET NULL,
  amount NUMERIC(19,4) NOT NULL,
  adjustment_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
  note TEXT,
  created_by UUID, updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CHECK (amount >= 0)
);
CREATE INDEX IF NOT EXISTS idx_commission_payout_lines_payout
  ON public.commission_payout_lines(company_id, payout_id)
  WHERE deleted_at IS NULL;
`;

    default:
      return '';
  }
}
