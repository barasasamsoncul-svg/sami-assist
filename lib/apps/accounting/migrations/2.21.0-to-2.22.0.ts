import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';
import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';
import {
  ACCOUNTING_FINANCING_SQL,
} from '@/lib/apps/accounting/financing-schema';

export const ACCOUNTING_2_21_0_TO_2_22_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.21.0-to-2.22.0-loans-financing',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.21.0',
    toVersion:
      '2.22.0',
    async run(
      client,
    ) {
      await executeSafeSamiModuleMigrationSql(
        client,
        ACCOUNTING_FINANCING_SQL,
      );
    },
  };
