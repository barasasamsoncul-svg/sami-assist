import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_INTERNATIONAL_LOCALIZATION_SQL } from '@/lib/apps/accounting/international-schema';

export const ACCOUNTING_2_17_0_TO_2_18_0:SamiModuleMigrationDefinition={
  key:'accounting-2.17.0-to-2.18.0-international-localization',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.17.0',
  toVersion:'2.18.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_INTERNATIONAL_LOCALIZATION_SQL);
  },
};
