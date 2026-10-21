import 'server-only';
import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/** Establish the shared, company-scoped stock-ledger contract. Ambiguous legacy ownership is never guessed. */
export const INVENTORY_2_3_0_TO_2_4_0: SamiModuleMigrationDefinition = {
  key: 'inventory-2.3.0-to-2.4.0-stock-ledger-integrity',
  moduleKey: 'inventory',
  namespace: 'inventory',
  fromVersion: '2.3.0',
  toVersion: '2.4.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, `
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS barcode VARCHAR(120),
  ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(40) NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.warehouses
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.warehouses DROP CONSTRAINT IF EXISTS warehouses_code_key;

-- Backfill only records whose product and warehouse already agree on company ownership.
UPDATE public.stock_levels sl SET company_id = p.company_id
FROM public.products p, public.warehouses w
WHERE sl.company_id IS NULL AND sl.product_id = p.id AND sl.warehouse_id = w.id
  AND p.company_id IS NOT NULL AND p.company_id = w.company_id
  AND p.deleted_at IS NULL AND w.deleted_at IS NULL;

UPDATE public.stock_movements sm SET company_id = p.company_id
FROM public.products p, public.warehouses w
WHERE sm.company_id IS NULL AND sm.product_id = p.id AND sm.warehouse_id = w.id
  AND p.company_id IS NOT NULL AND p.company_id = w.company_id
  AND p.deleted_at IS NULL AND w.deleted_at IS NULL;

UPDATE public.stock_reservations sr SET company_id = p.company_id
FROM public.products p, public.warehouses w
WHERE sr.company_id IS NULL AND sr.product_id = p.id AND sr.warehouse_id = w.id
  AND p.company_id IS NOT NULL AND p.company_id = w.company_id
  AND p.deleted_at IS NULL AND w.deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_sku
  ON public.products(company_id, sku)
  WHERE company_id IS NOT NULL AND sku IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_barcode
  ON public.products(company_id, barcode)
  WHERE company_id IS NOT NULL AND barcode IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_company_code
  ON public.warehouses(company_id, code)
  WHERE company_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_one_default_per_company
  ON public.warehouses(company_id)
  WHERE company_id IS NOT NULL AND is_default = TRUE AND is_active = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_company_id_id ON public.products(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouses_company_id_id ON public.warehouses(company_id, id);

CREATE INDEX IF NOT EXISTS idx_stock_levels_company_product_warehouse
  ON public.stock_levels(company_id, product_id, warehouse_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_created
  ON public.stock_movements(company_id, created_at DESC, id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company_product_created
  ON public.stock_movements(company_id, product_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_lots_company_expiry
  ON public.inventory_lots(company_id, expires_on, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_stock_reservations_company_active
  ON public.stock_reservations(company_id, product_id, warehouse_id, status)
  WHERE deleted_at IS NULL AND status IN ('active', 'allocated');
CREATE INDEX IF NOT EXISTS idx_inventory_reorder_company_status
  ON public.inventory_reorder_rules(company_id, status, product_id, warehouse_id) WHERE deleted_at IS NULL;

DO $sami_inventory_constraints$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_products_company_required' AND conrelid='public.products'::regclass) THEN
    ALTER TABLE public.products ADD CONSTRAINT ck_products_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_warehouses_company_required' AND conrelid='public.warehouses'::regclass) THEN
    ALTER TABLE public.warehouses ADD CONSTRAINT ck_warehouses_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_company_required' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_movements_company_required' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT ck_stock_movements_company_required CHECK (company_id IS NOT NULL) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_quantity_nonnegative' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_quantity_nonnegative CHECK (quantity >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_levels_reorder_nonnegative' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT ck_stock_levels_reorder_nonnegative CHECK (reorder_level >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_stock_movements_quantity_positive' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT ck_stock_movements_quantity_positive CHECK (quantity > 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_levels_company_product' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT fk_stock_levels_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_levels_company_warehouse' AND conrelid='public.stock_levels'::regclass) THEN
    ALTER TABLE public.stock_levels ADD CONSTRAINT fk_stock_levels_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_movements_company_product' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT fk_stock_movements_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_movements_company_warehouse' AND conrelid='public.stock_movements'::regclass) THEN
    ALTER TABLE public.stock_movements ADD CONSTRAINT fk_stock_movements_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_reservations_company_product' AND conrelid='public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations ADD CONSTRAINT fk_stock_reservations_company_product FOREIGN KEY (company_id,product_id) REFERENCES public.products(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_stock_reservations_company_warehouse' AND conrelid='public.stock_reservations'::regclass) THEN
    ALTER TABLE public.stock_reservations ADD CONSTRAINT fk_stock_reservations_company_warehouse FOREIGN KEY (company_id,warehouse_id) REFERENCES public.warehouses(company_id,id) ON DELETE RESTRICT NOT VALID;
  END IF;
END
$sami_inventory_constraints$;
`);
  },
};
