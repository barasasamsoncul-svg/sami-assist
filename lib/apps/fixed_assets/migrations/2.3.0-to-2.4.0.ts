import 'server-only';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migration-types';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migration-safety';

import {
  FIXED_ASSETS_ACCOUNTING_SQL,
} from '@/lib/apps/fixed_assets/accounting-schema';

export const FIXED_ASSETS_2_3_0_TO_2_4_0:
  SamiModuleMigrationDefinition = {
    key:
      'fixed-assets-2.3.0-to-2.4.0-accounting-control',
    moduleKey:
      'fixed_assets',
    namespace:
      'fixed_assets',
    fromVersion:
      '2.3.0',
    toVersion:
      '2.4.0',
    run:
      async client => {
        await executeSafeSamiModuleMigrationSql(
          client,
          FIXED_ASSETS_ACCOUNTING_SQL,
        );
      },
  };
