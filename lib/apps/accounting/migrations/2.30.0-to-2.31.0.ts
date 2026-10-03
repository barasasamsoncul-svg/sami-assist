import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_COLLABORATION_SQL } from '@/lib/apps/accounting/collaboration-schema';

export const ACCOUNTING_2_30_0_TO_2_31_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.30.0-to-2.31.0-collaboration',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.30.0',
  toVersion: '2.31.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_COLLABORATION_SQL);
  },
};
