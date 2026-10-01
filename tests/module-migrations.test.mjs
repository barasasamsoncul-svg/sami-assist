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
    /key:\s*"accounting"[\s\S]*version:\s*'2\.6\.0'/,
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


test('Accounting policy writes cannot bypass the validated Setup service', async () => {
  const [
    setupService,
    domainHooks,
  ] = await Promise.all([
    source('lib/apps/accounting/setup.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
  ]);

  assert.match(
    setupService,
    /requireEnterpriseModuleTableContext\([\s\S]*'accounting'[\s\S]*'accounting_settings'[\s\S]*'settings'/,
  );

  assert.match(
    setupService,
    /validateAccountMappings/,
  );

  assert.match(
    setupService,
    /ON CONFLICT \(\s*company_id\s*\)/,
  );

  assert.match(
    domainHooks,
    /moduleKey ===[\s\S]*'accounting'[\s\S]*table ===[\s\S]*'accounting_settings'[\s\S]*validated Accounting Setup workspace/,
    'The generic enterprise editor must not write Accounting policy directly.',
  );
});


test('Accounting 2.5 Chart of Accounts is migration-backed and company scoped', async () => {
  const [
    firstParty,
    runtimeMigrations,
    migration,
    specialistDepth,
    chartService,
    domainHooks,
    journalCommand,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.4.0-to-2.5.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/chart-of-accounts.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/accounting/journal-command.ts'),
  ]);

  assert.match(
    firstParty,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.6\.0'/,
  );

  assert.match(
    runtimeMigrations,
    /ACCOUNTING_2_4_0_TO_2_5_0/,
  );

  assert.match(
    migration,
    /fromVersion:\s*'2\.4\.0'[\s\S]*toVersion:\s*'2\.5\.0'/,
  );

  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS accounts_code_key[\s\S]*uq_accounts_company_code[\s\S]*company_id, code/,
    'Account codes must be unique inside a company, not across all SaMi tenants.',
  );

  for (const marker of [
    'normal_balance',
    'reconcile',
    'allow_manual_posting',
    'is_control_account',
    'system_role',
    'template_key',
  ]) {
    assert.match(migration, new RegExp(marker));
    assert.match(specialistDepth, new RegExp(marker));
  }

  assert.match(
    chartService,
    /ACCOUNTING_CHART_TEMPLATES/,
  );

  assert.match(
    chartService,
    /An account already used by journal entries cannot change account type or normal balance/,
  );

  assert.match(
    chartService,
    /Bring this account to a zero posted balance before archiving it/,
  );

  assert.match(
    domainHooks,
    /table ===[\s\S]*'accounts'[\s\S]*validated Accounting account workspace/,
    'Generic enterprise mutations must not bypass Chart of Accounts validation.',
  );

  assert.match(
    journalCommand,
    /allow_manual_posting[\s\S]*only accepts trusted subsystem postings/,
    'Manual journals must honor system-only account controls.',
  );
});


test('Accounting 2.6 centralizes double-entry posting and reversal invariants', async () => {
  const [
    firstParty,
    runtimeMigrations,
    migration,
    specialistDepth,
    ledgerEngine,
    domainHooks,
    invoicingAccounting,
    journalCommand,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.5.0-to-2.6.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/ledger-engine.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/invoicing/accounting.ts'),
    source('lib/apps/accounting/journal-command.ts'),
  ]);

  assert.match(
    firstParty,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.6\.0'/,
  );

  assert.match(
    runtimeMigrations,
    /ACCOUNTING_2_5_0_TO_2_6_0/,
  );

  assert.match(
    migration,
    /fromVersion:\s*'2\.5\.0'[\s\S]*toVersion:\s*'2\.6\.0'/,
  );

  for (const marker of [
    'source_module',
    'source_event_key',
    'posting_kind',
    'posted_at',
    'reversal_of_journal_id',
    'reversed_by_journal_id',
    'uq_journals_company_number',
    'uq_journals_company_source_event',
    'journal_lines_nonnegative_amounts',
    'journal_lines_one_sided_amount',
  ]) {
    assert.match(migration, new RegExp(marker));
    assert.match(specialistDepth, new RegExp(marker));
  }

  assert.match(
    ledgerEngine,
    /postBalancedLedgerJournal/,
  );
  assert.match(
    ledgerEngine,
    /reversePostedLedgerJournal/,
  );
  assert.match(
    ledgerEngine,
    /persisted lines are not balanced/,
  );
  assert.match(
    ledgerEngine,
    /Create an open fiscal period covering this accounting date first/,
  );
  assert.match(
    ledgerEngine,
    /company Accounting lock date/,
  );

  assert.match(
    domainHooks,
    /table ===[\s\S]*'journals'[\s\S]*'journal_lines'[\s\S]*validated double-entry journal services/,
    'Generic enterprise CRUD must not bypass the Accounting journal engine.',
  );

  assert.match(
    invoicingAccounting,
    /postBalancedLedgerJournal/,
    'Invoicing postings must use the Accounting ledger engine.',
  );
  assert.match(
    invoicingAccounting,
    /reversePostedLedgerJournal/,
    'Invoicing reversals must use compensating Accounting journals.',
  );
  assert.doesNotMatch(
    invoicingAccounting,
    /ON CONFLICT \(code\)/,
    'Invoicing must not rely on the removed global account-code uniqueness constraint.',
  );
  assert.match(
    invoicingAccounting,
    /ON CONFLICT \(\s*company_id,\s*code\s*\)[\s\S]*WHERE deleted_at IS NULL/,
    'Automatic account provisioning must respect company-scoped account codes.',
  );

  assert.match(
    journalCommand,
    /source_module[\s\S]*'accounting'[\s\S]*'manual_journal'/,
    'Manual drafts must carry Accounting provenance.',
  );
});
