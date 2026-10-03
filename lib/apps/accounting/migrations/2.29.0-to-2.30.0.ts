import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_APPROVAL_CONTROLS_SQL } from '@/lib/apps/accounting/approval-controls-schema';

export const ACCOUNTING_2_29_0_TO_2_30_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.29.0-to-2.30.0-approval-controls',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.29.0',
  toVersion: '2.30.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_APPROVAL_CONTROLS_SQL);
  },
};
