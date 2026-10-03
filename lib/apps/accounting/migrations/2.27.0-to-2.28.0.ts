import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_MANAGEMENT_REPORTING_SQL } from '@/lib/apps/accounting/management-reporting-schema';

export const ACCOUNTING_2_27_0_TO_2_28_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.27.0-to-2.28.0-management-exception-reporting',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.27.0',
  toVersion: '2.28.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_MANAGEMENT_REPORTING_SQL);
  },
};
