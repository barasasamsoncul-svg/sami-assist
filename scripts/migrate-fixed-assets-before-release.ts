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
  getSamiModuleManifest,
} from '@/lib/modules/registry';
import {
  runSamiModuleMigrations,
} from '@/lib/modules/migrations';

config({
  path:
    '.env.local',
});

config();

async function main() {
  const manifest =
    getSamiModuleManifest(
      'fixed_assets',
    );

  if (
    !manifest
  ) {
    throw new Error(
      'Fixed Assets manifest is unavailable.',
    );
  }

  const installed =
    await queryControl(
      `
        SELECT
          t.id::text
            AS tenant_id,
          t.name
            AS tenant_name,
          tm.version,
          tm.status
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
         AND m.deleted_at
             IS NULL
        INNER JOIN tenants t
          ON t.id =
             tm.tenant_id
         AND t.deleted_at
             IS NULL
        WHERE tm.deleted_at
              IS NULL
          AND LOWER(
                m.key
              ) =
              'fixed_assets'
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
          t.id
      `,
    );

  const results:
    Array<
      Record<
        string,
        unknown
      >
    > = [];

  for (
    const row
    of installed.rows
  ) {
    const tenantId =
      String(
        row.tenant_id,
      );
    const currentVersion =
      typeof row.version ===
        'string'
        ? row.version
        : '1.0.0';
    const pool =
      await getTenantPoolByTenantId(
        tenantId,
      );

    const migrated =
      await runSamiModuleMigrations({
        tenantPool:
          pool,
        moduleKey:
          'fixed_assets',
        currentVersion,
        targetVersion:
          manifest.version,
      });

    results.push({
      tenantId,
      tenantName:
        row.tenant_name,
      controlVersion:
        currentVersion,
      targetVersion:
        manifest.version,
      tenantDatabaseVersion:
        migrated.currentVersion,
      appliedMigrations:
        migrated.appliedMigrations,
      changed:
        migrated.changed,
      controlVersionUpdated:
        false,
    });
  }

  console.log(
    JSON.stringify(
      {
        release:
          'fixed_assets',
        mode:
          'expand-before-promote',
        targetVersion:
          manifest.version,
        installedTenants:
          installed.rows.length,
        controlPlaneVersionUpdate:
          'deferred-until-production-code-is-ready',
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
        '[SaMi] Fixed Assets pre-release expansion failed:',
        error,
      );

      process.exit(
        1,
      );
    },
  );
