import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  readdir,
} from 'node:fs/promises';
import path from 'node:path';

const root =
  process.cwd();

async function source(
  file,
) {
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}

function compact(
  value,
) {
  return value.replace(
    /\s+/g,
    ' ',
  );
}

test('Category 13: workspace app lifecycle is authorized only by trusted apps.manage context', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /getPermissionContext/,
  );

  assert.match(
    service,
    /SAMI_PERMISSIONS \.APPS_MANAGE/,
  );

  assert.match(
    service,
    /permissionContextHas/,
  );

  assert.doesNotMatch(
    service,
    /role\.name|administrator|workspace_admin|fuzzy/i,
    'Workspace app lifecycle must not derive authority from role names.',
  );

  assert.match(
    service,
    /current\.tenantId !== original\.tenantId/,
  );
});

test('Category 13: install resolves dependencies and never provisions a workspace database', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /resolveInstallPlan/,
  );

  assert.match(
    service,
    /normalizeDependencies/,
  );

  assert.match(
    service,
    /getTenantDatabaseName/,
  );

  assert.match(
    service,
    /WORKSPACE_NOT_READY/,
  );

  assert.doesNotMatch(
    service,
    /provisionTenantDatabase|CREATE DATABASE|DROP DATABASE/,
  );
});

test('Category 13: lifecycle preserves business data on disable and uninstall', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /status = \$3/,
  );

  assert.match(
    service,
    /dataRetained: true/,
  );

  assert.match(
    service,
    /'uninstalled'/,
  );

  assert.match(
    service,
    /'disabled'/,
  );

  assert.doesNotMatch(
    service,
    /DROP TABLE|DROP SCHEMA|TRUNCATE|DELETE FROM/i,
  );
});

test('Category 13: dependency apps cannot be disabled or uninstalled while required', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /getActiveDependents/,
  );

  assert.match(
    service,
    /m\.dependencies.*?\? \$2/,
  );

  assert.match(
    service,
    /APP_DEPENDENCY_BLOCKED/,
  );

  assert.match(
    service,
    /blockers: dependents/,
  );
});

test('Category 13: install state is serialized and schema failures remain recoverable', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /pg_advisory_lock/,
  );

  assert.match(
    service,
    /status = 'pending'|status = 'pending'/,
  );

  assert.match(
    service,
    /status = 'installed'/,
  );

  assert.match(
    service,
    /schemaClient\.query\( 'BEGIN', \)/,
  );

  assert.match(
    service,
    /schemaClient\.query\( 'COMMIT', \)/,
  );

  assert.match(
    service,
    /schemaClient\.query\( 'ROLLBACK', \)/,
  );

  assert.match(
    service,
    /status = 'failed'/,
  );

  assert.match(
    service,
    /installed_at = COALESCE/,
  );

  assert.match(
    service,
    /pg_advisory_unlock/,
  );
});

test('Category 13: normal reinstall preserves prior app data without rerunning first-install schema', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /hadSuccessfulInstall = Boolean\( existing \?\.installed_at, \)/,
  );

  assert.match(
    service,
    /if \( !hadSuccessfulInstall \)/,
  );

  assert.match(
    service,
    /installed_at = COALESCE\( installed_at, NOW\(\) \)/,
  );
});


test('Category 13: app lifecycle API accepts no browser tenant selector', async () => {
  const route =
    await source(
      'app/api/workspace/apps/[appKey]/route.ts',
    );

  assert.match(
    route,
    /installWorkspaceApp/,
  );

  assert.match(
    route,
    /enableWorkspaceApp/,
  );

  assert.match(
    route,
    /disableWorkspaceApp/,
  );

  assert.match(
    route,
    /uninstallWorkspaceApp/,
  );

  assert.doesNotMatch(
    route,
    /tenantId|currentTenantId|searchParams\.get\(['"]tenant/i,
    'The browser may select an app key/action, never a tenant.',
  );

  assert.match(
    route,
    /isSameOrigin/,
  );
});

test('Category 13: Settings exposes real install, enable, disable and uninstall actions with SaMiOverlay', async () => {
  const [
    settings,
    client,
  ] =
    await Promise.all([
      source(
        'app/settings/SettingsClient.tsx',
      ),
      source(
        'app/settings/components/AppsSettings.tsx',
      ),
    ]);

  assert.match(
    settings,
    /workspaceModules=\{\s*managedModules\s*\}/s,
  );

  assert.match(
    client,
    /\/api\/workspace\/apps\//,
  );

  assert.match(
    client,
    /['"]Install['"]/,
  );

  assert.match(
    client,
    /\bEnable\b/,
  );

  assert.match(
    client,
    /\bDisable\b/,
  );

  assert.match(
    client,
    /\bUninstall\b/,
  );

  assert.match(
    client,
    /SaMiOverlay/,
  );

  assert.match(
    client,
    /confirmAction/,
  );

  assert.match(
    client,
    /router\.refresh\(\)/,
  );

  assert.doesNotMatch(
    client,
    /\/api\/auth\/install-app/,
    'Normal workspace app management must never use the onboarding installer.',
  );
});

test('Category 13: Apps administration receives lifecycle rows while ordinary navigation remains active-only', async () => {
  const shell =
    compact(
      await source(
        'lib/auth/workspace-shell.ts',
      ),
    );

  assert.match(
    shell,
    /accessibleModules = installedModules/,
  );

  assert.match(
    shell,
    /managedModules: canManageApps \? modules : \[\]/,
  );

  assert.match(
    shell,
    /HIDDEN_MODULE_STATUSES/,
  );
});

test('Category 13: legacy onboarding no longer enforces an app-count plan limit', async () => {
  const onboarding =
    await source(
      'app/api/auth/install-app/route.ts',
    );

  assert.match(
    onboarding,
    /const includedApps =\s*-1/s,
  );

  assert.doesNotMatch(
    onboarding,
    /UPGRADE_REQUIRED/,
  );

  assert.doesNotMatch(
    onboarding,
    /reservedAppCount/,
  );
});

test('Category 13: every first-party app has a schema payload and unsafe replacement SQL is guarded', async () => {
  const [
    catalog,
    lifecycle,
  ] =
    await Promise.all([
      source(
        'lib/sami-apps.ts',
      ),
      source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    ]);

  const start =
    catalog.indexOf(
      'export const SAMI_APPS',
    );

  const end =
    catalog.indexOf(
      'export const APP_CATEGORIES',
      start,
    );

  const keys = [
    ...catalog
      .slice(
        start,
        end,
      )
      .matchAll(
        /\bkey:\s*"([^"]+)"/g,
      ),
  ].map(
    match =>
      match[1],
  );

  const directories =
    await readdir(
      path.join(
        root,
        'lib/apps',
      ),
      {
        withFileTypes:
          true,
      },
    );

  const appDirs =
    new Set(
      directories
        .filter(
          entry =>
            entry.isDirectory(),
        )
        .map(
          entry =>
            entry.name,
        ),
    );

  for (
    const key
    of keys
  ) {
    assert.ok(
      appDirs.has(
        key,
      ),
      `Missing app directory for ${key}.`,
    );

    const schema =
      await source(
        `lib/apps/${key}/schema.sql`,
      );

    assert.ok(
      schema.trim(),
      `Schema for ${key} must not be empty.`,
    );
  }

  assert.match(
    lifecycle,
    /prepareInstallSchema/,
  );

  assert.match(
    lifecycle,
    /INVOICING_MANAGED_TABLES/,
  );

  assert.match(
    lifecycle,
    /information_schema\.tables/,
  );

  assert.match(
    lifecycle,
    /APP_SCHEMA_UNSAFE/,
  );

  assert.match(
    lifecycle,
    /managedTableSet\.has/,
  );

  assert.match(
    lifecycle,
    /DROP\\s\+TABLE\\s\+IF\\s\+EXISTS/,
  );
});
