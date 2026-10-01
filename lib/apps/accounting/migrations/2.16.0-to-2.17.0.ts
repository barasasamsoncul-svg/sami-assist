import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_KENYA_SQL } from '@/lib/apps/accounting/kenya-schema';

export const ACCOUNTING_2_16_0_TO_2_17_0:SamiModuleMigrationDefinition={
  key:'accounting-2.16.0-to-2.17.0-kenya-etims',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.16.0',
  toVersion:'2.17.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_KENYA_SQL);
  },
};
