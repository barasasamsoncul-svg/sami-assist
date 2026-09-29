import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';


const SQL = `
  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS service_date DATE;

  ALTER TABLE public.invoicing_invoices
    ADD COLUMN IF NOT EXISTS ship_to_address TEXT;
`;


export const INVOICING_2_3_0_TO_2_4_0:
  SamiModuleMigrationDefinition = {
    key:
      'invoicing-2.3.0-to-2.4.0',
    moduleKey:
      'invoicing',
    namespace:
      'invoicing',
    fromVersion:
      '2.3.0',
    toVersion:
      '2.4.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          SQL,
        );
      },
  };
