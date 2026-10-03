import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_PAYROLL_SQL } from '@/lib/apps/accounting/payroll-schema';

export const ACCOUNTING_2_24_0_TO_2_25_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.24.0-to-2.25.0-payroll-accounting',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.24.0',
  toVersion: '2.25.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_PAYROLL_SQL);
  },
};
