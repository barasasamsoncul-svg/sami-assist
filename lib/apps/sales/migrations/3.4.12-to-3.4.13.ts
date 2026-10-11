import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_pipeline_saved_views
    ADD COLUMN IF NOT EXISTS score_view VARCHAR(20) NOT NULL DEFAULT 'all'
      CHECK (score_view IN ('all','high','medium','low'));
`;

export const SALES_3_4_12_TO_3_4_13:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.12-to-3.4.13',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.12',
    toVersion: '3.4.13',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
