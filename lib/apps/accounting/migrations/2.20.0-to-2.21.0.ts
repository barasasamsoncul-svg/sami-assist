import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';
import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';
import {
  ACCOUNTING_ACCRUALS_SQL,
} from '@/lib/apps/accounting/accruals-schema';

export const ACCOUNTING_2_20_0_TO_2_21_0:
  SamiModuleMigrationDefinition = {
    key:
      'accounting-2.20.0-to-2.21.0-accruals-deferrals',
    moduleKey:
      'accounting',
    namespace:
      'accounting',
    fromVersion:
      '2.20.0',
    toVersion:
      '2.21.0',
    async run(
      client,
    ) {
      await executeSafeSamiModuleMigrationSql(
        client,
        ACCOUNTING_ACCRUALS_SQL,
      );
    },
  };
