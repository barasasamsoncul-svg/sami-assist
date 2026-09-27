import 'server-only';

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
  synchronizeModulePermissions,
} from '@/lib/auth/module-permissions';

import {
  compareSamiModuleVersions,
  runSamiModuleMigrations,
} from '@/lib/modules/migrations';

export type WorkspaceModuleUpgrade = {
  tenantId: string;
  moduleKey: string;
  previousVersion: string;
  currentVersion: string;
  targetVersion: string;
  appliedMigrations: string[];
  changed: boolean;
};

type InstalledModuleRow = {
  module_id:
    string;
  module_key:
    string;
  version:
    string | null;
  status:
    string;
};

function normalizeKey(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}

async function listInstalledModules(
  tenantId:
    string,
): Promise<
  InstalledModuleRow[]
> {
  const result =
    await queryControl(
      `
        SELECT
          tm.module_id,
          LOWER(m.key) AS module_key,
          tm.version,
          tm.status
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id = tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.deleted_at IS NULL
          AND m.deleted_at IS NULL
          AND LOWER(
            COALESCE(
              tm.status,
              ''
            )
          ) IN (
            'installed',
            'active',
            'enabled',
            'disabled',
            'uninstalled'
          )
        ORDER BY LOWER(m.key)
      `,
      [
        tenantId,
      ],
    );

  return result.rows.map(
    row => ({
      module_id:
        String(
          row.module_id,
        ),
      module_key:
        normalizeKey(
          row.module_key,
        ),
      version:
        typeof row.version ===
          'string'
          ? row.version
          : null,
      status:
        normalizeKey(
          row.status,
        ),
    }),
  );
}

async function upgradeInstalledModuleRow(
  tenantId:
    string,
  pool:
    Awaited<
      ReturnType<
        typeof getTenantPoolByTenantId
      >
    >,
  row:
    InstalledModuleRow,
): Promise<
  WorkspaceModuleUpgrade | null
> {
  const manifest =
    getSamiModuleManifest(
      row.module_key,
    );

  if (
    !manifest
  ) {
    return null;
  }

  const currentVersion =
    row.version ||
    '1.0.0';

  const targetVersion =
    manifest.version;

  await synchronizeModulePermissions({
    moduleKey:
      manifest.key,
    permissions:
      manifest.security
        .permissions,
  });

  if (
    compareSamiModuleVersions(
      currentVersion,
      targetVersion,
    ) ===
    0
  ) {
    return null;
  }

  const migrated =
    await runSamiModuleMigrations({
      tenantPool:
        pool,
      moduleKey:
        row.module_key,
      currentVersion,
      targetVersion,
    });

  await queryControl(
    `
      UPDATE tenant_modules
      SET
        version = $3,
        updated_at = NOW()
      WHERE tenant_id = $1
        AND module_id = $2
    `,
    [
      tenantId,
      row.module_id,
      targetVersion,
    ],
  );

  return {
    tenantId,
    moduleKey:
      row.module_key,
    previousVersion:
      migrated
        .previousVersion,
    currentVersion:
      migrated
        .currentVersion,
    targetVersion:
      migrated
        .targetVersion,
    appliedMigrations:
      migrated
        .appliedMigrations,
    changed:
      migrated
        .changed,
  };
}


export async function upgradeInstalledModuleForTenant(
  tenantId:
    string,
  moduleKeyInput:
    string,
): Promise<
  WorkspaceModuleUpgrade | null
> {
  const moduleKey =
    normalizeKey(
      moduleKeyInput,
    );

  const installed =
    await listInstalledModules(
      tenantId,
    );

  const row =
    installed.find(
      candidate =>
        candidate.module_key ===
          moduleKey &&
        [
          'installed',
          'active',
          'enabled',
        ].includes(
          candidate.status,
        ),
    );

  if (
    !row
  ) {
    return null;
  }

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  return upgradeInstalledModuleRow(
    tenantId,
    pool,
    row,
  );
}


export async function upgradeInstalledModulesForTenant(
  tenantId:
    string,
): Promise<
  WorkspaceModuleUpgrade[]
> {
  const installed =
    await listInstalledModules(
      tenantId,
    );

  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const results:
    WorkspaceModuleUpgrade[] =
    [];

  for (
    const row
    of installed
  ) {
    const upgraded =
      await upgradeInstalledModuleRow(
        tenantId,
        pool,
        row,
      );

    if (
      upgraded
    ) {
      results.push(
        upgraded,
      );
    }
  }

  return results;
}

export async function listTenantsWithInstalledModules() {
  const result =
    await queryControl(
      `
        SELECT DISTINCT
          t.id
        FROM tenants t
        INNER JOIN tenant_modules tm
          ON tm.tenant_id = t.id
        WHERE t.deleted_at IS NULL
          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) IN (
            'active',
            'provisioning'
          )
          AND tm.deleted_at IS NULL
        ORDER BY t.id
      `,
    );

  return result.rows
    .map(
      row =>
        String(
          row.id,
        ),
    )
    .filter(
      Boolean,
    );
}

export async function upgradeInstalledModulesAcrossTenants() {
  const tenantIds =
    await listTenantsWithInstalledModules();

  const results:
    WorkspaceModuleUpgrade[] =
    [];

  for (
    const tenantId
    of tenantIds
  ) {
    results.push(
      ...(
        await upgradeInstalledModulesForTenant(
          tenantId,
        )
      ),
    );
  }

  return {
    tenantsChecked:
      tenantIds.length,
    upgrades:
      results,
  };
}
