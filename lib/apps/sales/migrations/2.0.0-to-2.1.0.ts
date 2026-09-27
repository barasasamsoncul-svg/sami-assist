import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';


const SQL = `
  ALTER TABLE public.sales_quote_items
    ADD COLUMN IF NOT EXISTS external_product_id UUID;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS external_product_id UUID;

  ALTER TABLE public.sales_order_items_v2
    ADD COLUMN IF NOT EXISTS stock_reservation_id UUID;

  CREATE INDEX IF NOT EXISTS idx_sales_quote_items_external_product
    ON public.sales_quote_items(company_id, external_product_id)
    WHERE external_product_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_order_items_external_product
    ON public.sales_order_items_v2(company_id, external_product_id)
    WHERE external_product_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_sales_order_items_reservation
    ON public.sales_order_items_v2(company_id, stock_reservation_id)
    WHERE stock_reservation_id IS NOT NULL;
`;


export const SALES_2_0_0_TO_2_1_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-2.0.0-to-2.1.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '2.0.0',
    toVersion:
      '2.1.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
