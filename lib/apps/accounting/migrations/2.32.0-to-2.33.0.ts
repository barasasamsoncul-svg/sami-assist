import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_OPERATIONAL_RECOVERY_SQL } from '@/lib/apps/accounting/operational-recovery-schema';

export const ACCOUNTING_2_32_0_TO_2_33_0:SamiModuleMigrationDefinition={
  key:'accounting-2.32.0-to-2.33.0-operational-recovery',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.32.0',
  toVersion:'2.33.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_OPERATIONAL_RECOVERY_SQL);
  },
};
