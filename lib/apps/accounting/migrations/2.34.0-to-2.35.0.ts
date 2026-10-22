import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_INVENTORY_VALUATION_SQL } from '@/lib/apps/accounting/inventory-valuation-schema';

export const ACCOUNTING_2_34_0_TO_2_35_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.34.0-to-2.35.0-purchase-inventory-valuation',
  moduleKey: 'accounting',
  namespace: 'accounting',
  fromVersion: '2.34.0',
  toVersion: '2.35.0',
  async run(client) {
    await executeSafeSamiModuleMigrationSql(
      client,
      ACCOUNTING_INVENTORY_VALUATION_SQL,
    );
  },
};
