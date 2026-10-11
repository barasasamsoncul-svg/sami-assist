import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS shipped_quantity NUMERIC(18,4) NOT NULL DEFAULT 0;

  WITH shipment_totals AS (
    SELECT
      shipment_item.sales_order_line_id,
      shipment_item.company_id,
      COALESCE(SUM(shipment_item.quantity) FILTER (
        WHERE shipment.inventory_posted_at IS NOT NULL
      ), 0) AS posted_quantity,
      COALESCE(SUM(shipment_item.quantity) FILTER (
        WHERE shipment.inventory_posted_at IS NOT NULL
          AND shipment.status <> 'delivered'
      ), 0) AS posted_not_delivered_quantity
    FROM public.sales_shipment_items shipment_item
    INNER JOIN public.sales_shipments shipment
      ON shipment.id = shipment_item.shipment_id
     AND shipment.company_id = shipment_item.company_id
    GROUP BY shipment_item.sales_order_line_id, shipment_item.company_id
  ), repaired AS (
    SELECT
      line.id,
      line.company_id,
      LEAST(
        line.quantity,
        GREATEST(line.delivered_quantity, COALESCE(totals.posted_quantity, 0))
      ) AS shipped_quantity,
      LEAST(
        line.quantity,
        GREATEST(
          0,
          line.delivered_quantity - COALESCE(totals.posted_not_delivered_quantity, 0)
        )
      ) AS delivered_quantity
    FROM public.sales_order_items_v2 line
    LEFT JOIN shipment_totals totals
      ON totals.sales_order_line_id = line.id
     AND totals.company_id = line.company_id
  )
  UPDATE public.sales_order_items_v2 line
  SET
    shipped_quantity = repaired.shipped_quantity,
    delivered_quantity = LEAST(repaired.delivered_quantity, repaired.shipped_quantity)
  FROM repaired
  WHERE line.id = repaired.id
    AND line.company_id = repaired.company_id
    AND line.shipped_quantity = 0;

  DO $sales_migration$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.sales_order_items_v2'::regclass
        AND conname = 'sales_order_items_v2_shipped_quantity_lte_quantity'
    ) THEN
      ALTER TABLE public.sales_order_items_v2
        ADD CONSTRAINT sales_order_items_v2_shipped_quantity_lte_quantity
        CHECK (shipped_quantity <= quantity);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.sales_order_items_v2'::regclass
        AND conname = 'sales_order_items_v2_delivered_quantity_lte_shipped'
    ) THEN
      ALTER TABLE public.sales_order_items_v2
        ADD CONSTRAINT sales_order_items_v2_delivered_quantity_lte_shipped
        CHECK (delivered_quantity <= shipped_quantity);
    END IF;
  END
  $sales_migration$;
`;

export const SALES_3_4_3_TO_3_4_4:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.3-to-3.4.4',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.3',
    toVersion: '3.4.4',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
