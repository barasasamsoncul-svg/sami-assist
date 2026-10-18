import 'server-only';

import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_settings
    ADD COLUMN IF NOT EXISTS credit_limit_enforced BOOLEAN NOT NULL DEFAULT FALSE;
`;

export const SALES_3_4_21_TO_3_4_22: SamiModuleMigrationDefinition = {
  key: 'sales-3.4.21-to-3.4.22',
  moduleKey: 'sales',
  namespace: 'sales',
  fromVersion: '3.4.21',
  toVersion: '3.4.22',
  run: async client => executeSafeSamiModuleMigrationSql(client, SQL),
};
