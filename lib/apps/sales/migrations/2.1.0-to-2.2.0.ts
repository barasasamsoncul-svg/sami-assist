import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';

const SQL = `
  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS accepted_by_name VARCHAR(255);

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS accepted_by_email VARCHAR(320);

  ALTER TABLE public.sales_quotes
    ADD COLUMN IF NOT EXISTS acceptance_note TEXT;
`;

export const SALES_2_1_0_TO_2_2_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-2.1.0-to-2.2.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '2.1.0',
    toVersion:
      '2.2.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
