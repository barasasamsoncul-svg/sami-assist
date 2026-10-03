import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_FINANCIAL_STATEMENTS_SQL } from '@/lib/apps/accounting/financial-statements-schema';

export const ACCOUNTING_2_26_0_TO_2_27_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.26.0-to-2.27.0-financial-statements',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.26.0',
  toVersion: '2.27.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_FINANCIAL_STATEMENTS_SQL);
  },
};
