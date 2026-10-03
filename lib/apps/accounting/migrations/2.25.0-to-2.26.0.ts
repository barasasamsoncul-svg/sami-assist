import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_CONSOLIDATION_SQL } from '@/lib/apps/accounting/consolidation-schema';

export const ACCOUNTING_2_25_0_TO_2_26_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.25.0-to-2.26.0-multi-company-consolidation',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.25.0',
  toVersion: '2.26.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_CONSOLIDATION_SQL);
  },
};
