import type { SamiModuleMigrationDefinition } from '@/lib/modules/migration-types';
import { executeSafeSamiModuleMigrationSql } from '@/lib/modules/migration-safety';
import { ACCOUNTING_TAX_SQL } from '@/lib/apps/accounting/tax-schema';
export const ACCOUNTING_2_15_0_TO_2_16_0:SamiModuleMigrationDefinition={key:'accounting-2.15.0-to-2.16.0-tax-engine',moduleKey:'accounting',namespace:'accounting',fromVersion:'2.15.0',toVersion:'2.16.0',async run(client,context){await executeSafeSamiModuleMigrationSql(client,context,ACCOUNTING_TAX_SQL);}};
