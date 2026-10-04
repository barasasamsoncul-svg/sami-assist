import 'server-only';

import {
  config,
} from 'dotenv';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  compareSamiModuleVersions,
  runSamiModuleMigrations,
} from '@/lib/modules/migrations';

import {
  getSamiModuleManifest,
} from '@/lib/modules/registry';


config({
  path:
    '.env.local',
});

config();


async function main() {
  const installed =
    await queryControl(
      `
        SELECT
          t.id::text AS tenant_id,
          t.name AS tenant_name,
          m.key AS module_key,
          tm.version
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id = tm.module_id
         AND m.deleted_at IS NULL
        INNER JOIN tenants t
          ON t.id = tm.tenant_id
         AND t.deleted_at IS NULL
        WHERE tm.deleted_at IS NULL
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
        ORDER BY
          t.name,
          m.key
      `,
    );

  const results:
    Record<string, unknown>[] =
    [];

  for (
    const row
    of installed.rows
  ) {
    const moduleKey =
      String(
        row.module_key ||
        '',
      )
        .trim()
        .toLowerCase();

    const manifest =
      getSamiModuleManifest(
        moduleKey,
      );

    if (
      !manifest
    ) {
      continue;
    }

    const currentVersion =
      String(
        row.version ||
        '1.0.0',
      );

    const targetVersion =
      manifest.version;

    const comparison =
      compareSamiModuleVersions(
        currentVersion,
        targetVersion,
      );

    if (
      comparison ===
        0
    ) {
      continue;
    }

    if (
      comparison >
        0
    ) {
      throw new Error(
        `Installed module ${moduleKey} for ${String(row.tenant_name || row.tenant_id)} is ahead of the runtime manifest (${currentVersion} > ${targetVersion}).`,
      );
    }

    const tenantPool =
      await getTenantPoolByTenantId(
        String(
          row.tenant_id,
        ),
      );

    const migrated =
      await runSamiModuleMigrations({
        tenantPool,
        moduleKey,
        currentVersion,
        targetVersion,
      });

    results.push({
      ...migrated,
      tenantId:
        String(
          row.tenant_id,
        ),
      tenantName:
        row.tenant_name,
      controlVersionUpdated:
        false,
    });
  }

  console.log(
    JSON.stringify(
      {
        release:
          'installed-modules',
        mode:
          'expand-before-promote',
        controlVersionUpdated:
          false,
        results,
      },
      null,
      2,
    ),
  );
}


main()
  .then(
    () =>
      process.exit(
        0,
      ),
  )
  .catch(
    error => {
      console.error(
        '[SaMi] Pre-promotion module expansion failed:',
        error,
      );

      process.exit(
        1,
      );
    },
  );
