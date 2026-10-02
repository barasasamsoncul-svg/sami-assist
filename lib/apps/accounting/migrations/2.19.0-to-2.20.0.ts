import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_INVENTORY_VALUATION_SQL } from '@/lib/apps/accounting/inventory-valuation-schema';

export const ACCOUNTING_2_19_0_TO_2_20_0:SamiModuleMigrationDefinition={
  key:'accounting-2.19.0-to-2.20.0-inventory-valuation',
  moduleKey:'accounting',
  namespace:'accounting',
  fromVersion:'2.19.0',
  toVersion:'2.20.0',
  async run(client){
    await executeSafeSamiModuleMigrationSql(client,ACCOUNTING_INVENTORY_VALUATION_SQL);
  },
};
