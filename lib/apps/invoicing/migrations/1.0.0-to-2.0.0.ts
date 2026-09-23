import fs from 'fs/promises';
import path from 'path';

import type {
  SamiModuleMigrationDefinition,
} from '@/lib/modules/migrations';
import {
  executeSafeSamiModuleMigrationSql,
} from '@/lib/modules/migrations';

export const INVOICING_1_0_0_TO_2_0_0:
  SamiModuleMigrationDefinition = {
    key: 'invoicing-1.0.0-to-2.0.0',
    moduleKey: 'invoicing',
    namespace: 'invoicing',
    fromVersion: '1.0.0',
    toVersion: '2.0.0',
    run: async client => {
      /*
       * v2 creates new namespaced tables. Legacy v1 tables are retained
       * untouched so historical development data can be reconciled safely.
       */
      const sql =
        await fs.readFile(
          path.join(
            process.cwd(),
            'lib',
            'apps',
            'invoicing',
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
