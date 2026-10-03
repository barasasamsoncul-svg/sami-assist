import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_DIMENSIONS_SQL } from '@/lib/apps/accounting/dimensions-schema';

export const ACCOUNTING_2_23_0_TO_2_24_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.23.0-to-2.24.0-project-departmental',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.23.0',
  toVersion: '2.24.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client, ACCOUNTING_DIMENSIONS_SQL);
  },
};
