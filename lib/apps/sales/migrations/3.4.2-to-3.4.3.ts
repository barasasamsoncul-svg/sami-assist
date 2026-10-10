import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS acceptance_signature_consent_text TEXT;
`;

export const SALES_3_4_2_TO_3_4_3:
  SamiModuleMigrationDefinition = {
    key: 'sales-3.4.2-to-3.4.3',
    moduleKey: 'sales',
    namespace: 'sales',
    fromVersion: '3.4.2',
    toVersion: '3.4.3',
    run: async client => {
      await executeSafeSamiModuleMigrationSql(client, SQL);
    },
  };
