import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_PARITY_HARDENING_SQL } from '@/lib/apps/accounting/parity-hardening-schema';

export const ACCOUNTING_2_33_0_TO_2_34_0:SamiModuleMigrationDefinition={
  key:'accounting-2.33.0-to-2.34.0-parity-hardening',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.33.0',
  toVersion:'2.34.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_PARITY_HARDENING_SQL);
  },
};
