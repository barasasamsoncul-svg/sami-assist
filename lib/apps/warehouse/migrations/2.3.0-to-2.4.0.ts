import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

/**
 * Upgrade Warehouse from the initial location/operation schema to the
 * company-boundary contract used by the specialist Warehouse workspace.
 * Existing ambiguous cross-company links are not rewritten; NOT VALID keeps
 * history intact while enforcing every new or updated row.
 */
export const WAREHOUSE_2_3_0_TO_2_4_0: SamiModuleMigrationDefinition = {
  key: 'warehouse-2.3.0-to-2.4.0-company-boundary-hardening',
  moduleKey: 'warehouse',
  namespace: 'warehouse',
  fromVersion: '2.3.0',
  toVersion: '2.4.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, `
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_locations_company_id_id
  ON public.warehouse_locations(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_operations_company_id_id
  ON public.warehouse_operations(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_picking_batches_company_id_id
  ON public.warehouse_picking_batches(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_products_company_id_id
  ON public.products(company_id, id);

CREATE INDEX IF NOT EXISTS idx_warehouse_location_code_lookup
  ON public.warehouse_locations(company_id, lower(code))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_operations_active_queue
  ON public.warehouse_operations(company_id, status, created_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_operation_lines_operation
  ON public.warehouse_operation_lines(company_id, operation_id, created_at)
  WHERE deleted_at IS NULL;

DO $sami_warehouse_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_warehouse_locations_company_parent'
      AND conrelid = 'public.warehouse_locations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_locations
      ADD CONSTRAINT fk_warehouse_locations_company_parent
      FOREIGN KEY (company_id, parent_location_id)
      REFERENCES public.warehouse_locations(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_warehouse_operations_company_source'
      AND conrelid = 'public.warehouse_operations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_operations
      ADD CONSTRAINT fk_warehouse_operations_company_source
      FOREIGN KEY (company_id, source_location_id)
      REFERENCES public.warehouse_locations(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_warehouse_operations_company_destination'
      AND conrelid = 'public.warehouse_operations'::regclass
  ) THEN
    ALTER TABLE public.warehouse_operations
      ADD CONSTRAINT fk_warehouse_operations_company_destination
      FOREIGN KEY (company_id, destination_location_id)
      REFERENCES public.warehouse_locations(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_warehouse_operation_lines_company_operation'
      AND conrelid = 'public.warehouse_operation_lines'::regclass
  ) THEN
    ALTER TABLE public.warehouse_operation_lines
      ADD CONSTRAINT fk_warehouse_operation_lines_company_operation
      FOREIGN KEY (company_id, operation_id)
      REFERENCES public.warehouse_operations(company_id, id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'fk_warehouse_operation_lines_company_product'
      AND conrelid = 'public.warehouse_operation_lines'::regclass
  ) THEN
    ALTER TABLE public.warehouse_operation_lines
      ADD CONSTRAINT fk_warehouse_operation_lines_company_product
      FOREIGN KEY (company_id, product_reference)
      REFERENCES public.products(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;

  IF to_regclass('public.warehouse_putaway_rules') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_putaway_company_destination'
        AND conrelid = 'public.warehouse_putaway_rules'::regclass
    ) THEN
      ALTER TABLE public.warehouse_putaway_rules
        ADD CONSTRAINT fk_warehouse_putaway_company_destination
        FOREIGN KEY (company_id, destination_location_id)
        REFERENCES public.warehouse_locations(company_id, id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_putaway_company_source'
        AND conrelid = 'public.warehouse_putaway_rules'::regclass
    ) THEN
      ALTER TABLE public.warehouse_putaway_rules
        ADD CONSTRAINT fk_warehouse_putaway_company_source
        FOREIGN KEY (company_id, source_location_id)
        REFERENCES public.warehouse_locations(company_id, id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_putaway_company_product'
        AND conrelid = 'public.warehouse_putaway_rules'::regclass
    ) THEN
      ALTER TABLE public.warehouse_putaway_rules
        ADD CONSTRAINT fk_warehouse_putaway_company_product
        FOREIGN KEY (company_id, product_reference)
        REFERENCES public.products(company_id, id)
        ON DELETE RESTRICT NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.warehouse_picking_batch_operations') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_batch_operations_company_batch'
        AND conrelid = 'public.warehouse_picking_batch_operations'::regclass
    ) THEN
      ALTER TABLE public.warehouse_picking_batch_operations
        ADD CONSTRAINT fk_warehouse_batch_operations_company_batch
        FOREIGN KEY (company_id, batch_id)
        REFERENCES public.warehouse_picking_batches(company_id, id)
        ON DELETE CASCADE NOT VALID;
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_batch_operations_company_operation'
        AND conrelid = 'public.warehouse_picking_batch_operations'::regclass
    ) THEN
      ALTER TABLE public.warehouse_picking_batch_operations
        ADD CONSTRAINT fk_warehouse_batch_operations_company_operation
        FOREIGN KEY (company_id, operation_id)
        REFERENCES public.warehouse_operations(company_id, id)
        ON DELETE CASCADE NOT VALID;
    END IF;
  END IF;

  IF to_regclass('public.warehouse_packages') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'fk_warehouse_packages_company_location'
        AND conrelid = 'public.warehouse_packages'::regclass
    ) THEN
    ALTER TABLE public.warehouse_packages
      ADD CONSTRAINT fk_warehouse_packages_company_location
      FOREIGN KEY (company_id, current_location_id)
      REFERENCES public.warehouse_locations(company_id, id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END
$sami_warehouse_constraints$;

-- A legacy duplicate code can prevent a unique index. Preserve those rows for
-- operator review; newly created locations are serialized by the service layer.
DO $sami_warehouse_location_code$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class index_row
    INNER JOIN pg_namespace namespace_row ON namespace_row.oid = index_row.relnamespace
    WHERE namespace_row.nspname = 'public'
      AND index_row.relname = 'uq_warehouse_location_company_code'
  ) AND NOT EXISTS (
    SELECT 1
    FROM public.warehouse_locations
    WHERE deleted_at IS NULL
    GROUP BY company_id, lower(code)
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX uq_warehouse_location_company_code
      ON public.warehouse_locations(company_id, lower(code))
      WHERE deleted_at IS NULL;
  END IF;
END
$sami_warehouse_location_code$;
`);
  },
};
