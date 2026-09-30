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

test('module migrations: executable migrations are app-owned and recorded inside the tenant database', async () => {
  const [
    migrations,
    migrationTypes,
    runtimeMigrations,
  ] =
    await Promise.all([
      source(
        'lib/modules/migrations.ts',
      ),
      source(
        'lib/modules/migration-types.ts',
      ),
      source(
        'lib/apps/runtime-migrations.ts',
      ),
    ]);

  assert.match(
    migrationTypes,
    /SamiModuleMigrationDefinition/,
  );

  assert.match(
    migrationTypes,
    /run:/,
  );

  assert.match(
    runtimeMigrations,
    /APP_RUNTIME_MODULE_MIGRATIONS/,
  );

  assert.doesNotMatch(
    runtimeMigrations,
    /runtime-registry/,
    'Bootstrap migration discovery must not depend on the general runtime registry.',
  );

  assert.match(
    migrations,
    /APP_RUNTIME_MODULE_MIGRATIONS/,
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
    /apps\/(?:sales|invoicing|enterprise)/,
    'The migration kernel must not import individual business-app migrations.',
  );

  assert.doesNotMatch(
    migrations,
    /queryControl|manifest\s*:\s*json|eval\(|new Function/,
  );
});

test('module migrations: downgrade, missing paths, cycles and unsafe SQL fail closed', async () => {
  const [
    migrations,
    errors,
    safety,
  ] =
    await Promise.all([
      source(
        'lib/modules/migrations.ts',
      ),
      source(
        'lib/modules/migration-errors.ts',
      ),
      source(
        'lib/modules/migration-safety.ts',
      ),
    ]);

  for (
    const marker
    of [
      'MODULE_DOWNGRADE_UNSUPPORTED',
      'MODULE_MIGRATION_PATH_MISSING',
      'MODULE_MIGRATION_REGISTRY_INVALID',
    ]
  ) {
    assert.ok(
      migrations.includes(
        marker,
      ) ||
      errors.includes(
        marker,
      ),
      `missing migration safety marker ${marker}`,
    );
  }

  for (
    const marker
    of [
      'MODULE_MIGRATION_UNSAFE',
      'DROP',
      'TRUNCATE',
    ]
  ) {
    assert.ok(
      safety.includes(
        marker,
      ) ||
      errors.includes(
        marker,
      ),
      `missing migration SQL safety marker ${marker}`,
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


test('Invoicing releases migrate installed tenants before promotion', async () => {
  const [
    upgrades,
    releaseScript,
    pkg,
  ] = await Promise.all([
    source('lib/services/module-upgrades.ts'),
    source('scripts/migrate-invoicing-before-release.ts'),
    source('package.json'),
  ]);

  assert.match(
    upgrades,
    /upgradeInstalledModuleAcrossTenants/,
  );

  assert.match(
    releaseScript,
    /upgradeInstalledModuleAcrossTenants\(\s*'invoicing'/s,
    'The release command must upgrade only Invoicing tenants before code promotion.',
  );

  assert.match(
    releaseScript,
    /expand-before-promote/,
    'The release command must make the expand-before-promote deployment contract explicit.',
  );

  assert.match(
    pkg,
    /migrate:invoicing:release/,
  );
});


test('Accounting 2.4 setup schema is migration-backed and available on fresh installs', async () => {
  const [
    firstParty,
    contract,
    runtimeMigrations,
    migration,
    catalog,
    specialistCatalog,
    specialistDepth,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/modules/enterprise-contract.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.3.0-to-2.4.0.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
  ]);

  assert.match(
    firstParty,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.4\.0'/,
  );

  assert.match(
    contract,
    /manifest\.version ===[\s\S]*'1\.0\.0'[\s\S]*\? '2\.3\.0'[\s\S]*: manifest\.version/,
    'Specialist apps must be able to advance beyond the shared 2.3 baseline.',
  );

  assert.match(
    runtimeMigrations,
    /ACCOUNTING_2_3_0_TO_2_4_0/,
  );

  assert.match(
    migration,
    /fromVersion:\s*'2\.3\.0'[\s\S]*toVersion:\s*'2\.4\.0'/,
  );

  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS public\.accounting_settings/,
  );

  assert.match(
    catalog,
    /accounting:\s*\[[^\]]*'accounting_settings'/,
  );

  assert.match(
    specialistCatalog,
    /accounting:\s*\[[^\]]*'accounting_settings'/,
  );

  assert.match(
    specialistDepth,
    /CREATE TABLE IF NOT EXISTS public\.accounting_settings/,
    'Fresh Accounting installs must receive the same setup table without replaying an upgrade migration.',
  );
});
