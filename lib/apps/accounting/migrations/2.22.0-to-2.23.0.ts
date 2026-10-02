import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_BUDGETS_SQL } from '@/lib/apps/accounting/budgets-schema';

export const ACCOUNTING_2_22_0_TO_2_23_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.22.0-to-2.23.0-budgets-forecasts',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.22.0',
  toVersion: '2.23.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(
      client,
      ACCOUNTING_BUDGETS_SQL,
    );
  },
};
