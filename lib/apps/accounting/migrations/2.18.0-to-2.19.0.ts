import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_FX_SQL } from '@/lib/apps/accounting/fx-schema';

export const ACCOUNTING_2_18_0_TO_2_19_0:SamiModuleMigrationDefinition={
  key:'accounting-2.18.0-to-2.19.0-foreign-currency',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.18.0',
  toVersion:'2.19.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_FX_SQL);
  },
};
