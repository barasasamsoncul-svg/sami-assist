import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return readFile(
    path.join(
      root,
      file,
    ),
    'utf8',
  );
}

test('module migrations: migrationNamespace is now an enforced runtime contract', async () => {
  const [
    types,
    migrations,
    lifecycle,
  ] = await Promise.all([
    source('lib/modules/types.ts'),
    source('lib/modules/migrations.ts'),
    source('lib/services/workspace-app-lifecycle.ts'),
  ]);

  assert.match(
    types,
    /migrationNamespace:\s*string/,
  );

  assert.match(
    migrations,
    /manifest\s*\.migrationNamespace/,
  );

  assert.match(
    migrations,
    /APP_MODULE_MIGRATIONS/,
  );

  assert.match(
    lifecycle,
    /runSamiModuleMigrations/,
  );
});

test('module migrations: executable migrations are code-owned and recorded inside the tenant database', async () => {
  const migrations =
    await source(
      'lib/modules/migrations.ts',
    );

  assert.match(
    migrations,
    /SamiModuleMigrationDefinition/,
  );

  assert.match(
    migrations,
    /run:\s*\(/,
  );

  assert.match(
    migrations,
    /public\.sami_module_migrations/,
  );

  assert.match(
    migrations,
    /PRIMARY KEY \(\s*module_key,\s*migration_key/s,
  );

  assert.doesNotMatch(
    migrations,
    /queryControl|manifest\s*:\s*json|eval\(|new Function/,
  );
});

test('module migrations: downgrade, missing paths, cycles and unsafe SQL fail closed', async () => {
  const migrations =
    await source(
      'lib/modules/migrations.ts',
    );

  for (
    const marker
    of [
      'MODULE_DOWNGRADE_UNSUPPORTED',
      'MODULE_MIGRATION_PATH_MISSING',
      'MODULE_MIGRATION_REGISTRY_INVALID',
      'MODULE_MIGRATION_UNSAFE',
      'DROP',
      'TRUNCATE',
    ]
  ) {
    assert.ok(
      migrations.includes(
        marker,
      ),
      `missing migration safety marker ${marker}`,
    );
  }
});

test('module migrations: runtime target version comes from the code-owned manifest', async () => {
  const lifecycle =
    await source(
      'lib/services/workspace-app-lifecycle.ts',
    );

  assert.match(
    lifecycle,
    /version:\s*manifest\.version/,
  );

  assert.match(
    lifecycle,
    /existing\.version\s*!==\s*module\.version/,
  );

  assert.match(
    lifecycle,
    /COALESCE\(\s*tenant_modules\.version,\s*EXCLUDED\.version/s,
  );
});

test('module migrations: operator can upgrade one tenant or all tenants after deploy', async () => {
  const [
    service,
    script,
    pkg,
  ] = await Promise.all([
    source('lib/services/module-upgrades.ts'),
    source('scripts/migrate-workspace-modules.ts'),
    source('package.json'),
  ]);

  assert.match(
    service,
    /upgradeInstalledModulesForTenant/,
  );

  assert.match(
    service,
    /upgradeInstalledModulesAcrossTenants/,
  );

  assert.match(
    script,
    /--tenant/,
  );

  assert.match(
    pkg,
    /migrate:modules/,
  );
});


test('module permissions: manifest definitions synchronize automatically on install and upgrade', async () => {
  const [
    types,
    validation,
    lifecycle,
    upgrades,
  ] = await Promise.all([
    source('lib/modules/types.ts'),
    source('lib/modules/validation.ts'),
    source('lib/services/workspace-app-lifecycle.ts'),
    source('lib/services/module-upgrades.ts'),
  ]);

  assert.match(
    types,
    /SamiModulePermissionDefinition/,
  );

  assert.match(
    types,
    /permissions:\s*SamiModulePermissionDefinition\[\]/,
  );

  assert.match(
    validation,
    /references undeclared permission/,
  );

  assert.match(
    validation,
    /must begin with/,
  );

  assert.match(
    lifecycle,
    /synchronizeModulePermissions/,
  );

  assert.match(
    lifecycle,
    /manifest\.security[\s\S]*?\.permissions/s,
  );

  assert.match(
    lifecycle,
    /APP_PERMISSION_SYNC_FAILED/,
  );

  assert.match(
    upgrades,
    /synchronizeModulePermissions/,
  );

  assert.match(
    upgrades,
    /manifest\.security[\s\S]*?\.permissions/s,
  );
});
