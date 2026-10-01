import 'server-only';
import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_PAYMENTS_SQL } from '../payments-schema';
export const ACCOUNTING_2_14_0_TO_2_15_0: SamiModuleMigrationDefinition = {
  key: 'accounting-2.14.0-to-2.15.0', moduleKey: 'accounting', namespace: 'accounting',
  fromVersion: '2.14.0', toVersion: '2.15.0',
  run: async client => { await executeSafeSamiModuleMigrationSql(client, ACCOUNTING_PAYMENTS_SQL); },
};
