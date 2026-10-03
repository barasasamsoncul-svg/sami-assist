import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_PERIOD_CLOSING_SQL } from '@/lib/apps/accounting/period-closing-schema';

export const ACCOUNTING_2_28_0_TO_2_29_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.28.0-to-2.29.0-period-closing',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.28.0',
  toVersion: '2.29.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_PERIOD_CLOSING_SQL);
  },
};
