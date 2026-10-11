import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_order_saved_views
    ADD COLUMN IF NOT EXISTS sort_by VARCHAR(40) NOT NULL DEFAULT 'newest'
      CHECK (sort_by IN (
        'newest',
        'oldest',
        'value_high',
        'value_low',
        'delivery_first',
        'invoice_first',
        'customer_az'
      ));
`;

export const SALES_3_4_9_TO_3_4_10:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.9-to-3.4.10',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.9',
    toVersion: '3.4.10',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
