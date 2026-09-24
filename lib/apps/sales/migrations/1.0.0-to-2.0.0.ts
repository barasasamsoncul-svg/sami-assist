import fs from 'fs/promises';
import path from 'path';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';

import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';


export const SALES_1_0_0_TO_2_0_0:
  SamiModuleMigrationDefinition = {
    key:
      'sales-1.0.0-to-2.0.0',
    moduleKey:
      'sales',
    namespace:
      'sales',
    fromVersion:
      '1.0.0',
    toVersion:
      '2.0.0',
    run:
      async client => {
        const sql =
          await fs.readFile(
            path.join(
              process.cwd(),
              'lib',
              'apps',
              'sales',
              'schema.sql',
            ),
            'utf8',
          );

        await executeSafeSamiModuleMigrationSql(
          client,
          sql,
        );
      },
  };
