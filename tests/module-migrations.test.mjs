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
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/,
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
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/,
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
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/,
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


test('Accounting 2.7 journal workflow is migration-backed and fresh-install complete', async () => {
  const [
    firstParty,
    runtimeMigrations,
    migration,
    specialistDepth,
    catalog,
    specialistCatalog,
    ledgerEngine,
    journalService,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.6.0-to-2.7.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/accounting/ledger-engine.ts'),
    source('lib/apps/accounting/journals.ts'),
  ]);

  assert.match(
    firstParty,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/,
  );

  assert.match(runtimeMigrations, /ACCOUNTING_2_6_0_TO_2_7_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.6\.0'[\s\S]*toVersion:\s*'2\.7\.0'/,
  );

  for (const marker of [
    'approved_by',
    'approved_at',
    'approval_note',
    'posted_by',
    'accounting_recurring_journals',
    'accounting_recurring_journal_lines',
    'idx_accounting_recurring_due',
  ]) {
    assert.match(migration, new RegExp(marker));
    assert.match(specialistDepth, new RegExp(marker));
  }

  assert.match(
    catalog,
    /accounting_recurring_journals[\s\S]*accounting_recurring_journal_lines/,
  );
  assert.match(
    specialistCatalog,
    /accounting_recurring_journals[\s\S]*accounting_recurring_journal_lines/,
  );
  assert.match(ledgerEngine, /postApprovedManualLedgerJournal/);
  assert.match(
    ledgerEngine,
    /status = 'posted'[\s\S]*posted_at = NOW\(\)[\s\S]*posted_by = \$3/,
    'Approved manual journals must be promoted atomically on the same record.',
  );
  assert.match(journalService, /approveAccountingJournal/);
  assert.match(journalService, /createRecurringAccountingJournal/);
  assert.match(journalService, /generateRecurringAccountingJournal/);
  assert.match(journalService, /reversePostedLedgerJournal/);
  assert.match(
    journalService,
    /source_module[\s\S]*another app[\s\S]*subledger stays synchronized/,
    'Source-generated journals must be corrected through their originating app.',
  );

  const domainHooks = await source('lib/apps/enterprise/domain-hooks.ts');
  assert.match(
    domainHooks,
    /accounting_recurring_journals[\s\S]*accounting_recurring_journal_lines[\s\S]*validated double-entry journal services/,
    'Generic enterprise CRUD must not bypass recurring journal validation.',
  );
});


test('Accounting 2.8 opening balances are migration-backed and workflow protected', async () => {
  const [
    firstParty,
    runtimeMigrations,
    migration,
    specialistDepth,
    catalog,
    specialistCatalog,
    domainHooks,
    ledgerEngine,
    openingService,
    openingUi,
    accountingWorkspace,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.7.0-to-2.8.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/accounting/ledger-engine.ts'),
    source('lib/apps/accounting/opening-balances.ts'),
    source('app/apps/accounting/AccountingOpeningBalances.tsx'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
  ]);

  assert.match(
    firstParty,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/,
  );

  assert.match(runtimeMigrations, /ACCOUNTING_2_7_0_TO_2_8_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.7\.0'[\s\S]*toVersion:\s*'2\.8\.0'/,
  );

  for (const marker of [
    'accounting_opening_balance_batches',
    'accounting_opening_balance_lines',
    'uq_accounting_opening_import_key',
    'idx_accounting_opening_lines_subledger',
    'validation_summary',
    'posted_journal_id',
  ]) {
    assert.match(migration, new RegExp(marker));
    assert.match(specialistDepth, new RegExp(marker));
  }

  assert.match(
    catalog,
    /accounting_opening_balance_batches[\s\S]*accounting_opening_balance_lines/,
  );
  assert.match(
    specialistCatalog,
    /accounting_opening_balance_batches[\s\S]*accounting_opening_balance_lines/,
  );
  assert.match(
    domainHooks,
    /accounting_opening_balance_batches[\s\S]*accounting_opening_balance_lines[\s\S]*validated Accounting migration workspace/,
    'Generic enterprise CRUD must not bypass opening-balance migration validation.',
  );

  assert.match(
    ledgerEngine,
    /input\.postingKind ===[\s\S]*'opening'[\s\S]*10000[\s\S]*200/,
    'Only opening postings may exceed the ordinary 200-line journal limit.',
  );

  assert.match(openingService, /createOpeningBalanceBatch/);
  assert.match(openingService, /updateOpeningBalanceLine/);
  assert.match(openingService, /revalidateOpeningBalanceBatch/);
  assert.match(openingService, /postOpeningBalanceBatch/);
  assert.match(openingService, /cancelOpeningBalanceBatch/);
  assert.match(
    openingService,
    /asset_receivable[\s\S]*customer[\s\S]*liability_payable[\s\S]*vendor/,
    'AR/AP opening balances must require matching subledger detail.',
  );
  assert.match(
    openingService,
    /postBalancedLedgerJournal[\s\S]*postingKind:[\s\S]*"opening"/,
    'Opening balances must post through the authoritative ledger engine.',
  );
  assert.match(
    openingService,
    /LIMIT \$3[\s\S]*OFFSET \$4/,
    'Opening-balance detail must be paginated for large migrations.',
  );

  assert.match(openingUi, /CSV import/);
  assert.match(openingUi, /Manual entry/);
  assert.match(openingUi, /Save & revalidate/);
  assert.match(openingUi, /Receivables & payables reconciliation/);
  assert.match(
    accountingWorkspace,
    /opening-balances[\s\S]*AccountingOpeningBalances/,
    'Opening Balances must be a dedicated Accounting workspace surface.',
  );

  const journalService = await source('lib/apps/accounting/journals.ts');
  const journalUi = await source('app/apps/accounting/AccountingJournals.tsx');
  assert.match(
    journalService,
    /opening_balance_batch/,
    'Generic journal reversal must not desynchronize a posted opening-balance batch.',
  );
  assert.match(
    journalUi,
    /selected\.source_type !==[\s\S]*"opening_balance_batch"/,
    'Opening journals must not expose the generic reversal button.',
  );
});


test('Accounting Receivables reuses the authoritative Invoicing subledger', async () => {
  const [
    receivables,
    workspace,
    foundation,
    invoicingAccounting,
  ] = await Promise.all([
    source('lib/apps/accounting/receivables.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/invoicing/accounting.ts'),
  ]);

  for (const marker of [
    'invoicing_aging_base',
    'invoicing_payment_balances',
    'invoicing_credit_note_balances',
    'invoicing_customers',
    'invoicing_invoices',
  ]) {
    assert.match(
      receivables,
      new RegExp(marker),
      'Receivables must read ' + marker + ' instead of creating a duplicate customer ledger.',
    );
  }

  assert.doesNotMatch(
    receivables,
    /INSERT\s+INTO\s+invoicing_|UPDATE\s+invoicing_|DELETE\s+FROM\s+invoicing_/i,
    'Accounting Receivables must not mutate locked Invoicing transactions.',
  );

  assert.match(
    receivables,
    /system_role='receivable_control'/,
    'AR must reconcile the configured or canonical receivable control account.',
  );

  assert.match(
    receivables,
    /system_role='invoicing_customer_credit'/,
    'Customer credits must reconcile their dedicated Accounting liability account.',
  );

  assert.match(
    receivables,
    /accounting_opening_balance_lines[\s\S]*asset_receivable/,
    'Posted legacy opening AR must be visible in the control reconciliation.',
  );

  assert.match(
    receivables,
    /ROUND\(base_balance_due,2\)/,
    'Subledger control totals must align to the two-decimal ledger posting boundary.',
  );

  assert.match(
    workspace,
    /dedicatedSection ===[\s\S]*'receivables'[\s\S]*AccountingReceivables/,
    'Receivables must render as a dedicated Accounting workspace.',
  );

  assert.match(
    foundation,
    /"receivables"/,
    'Receivables must be a registered Accounting section.',
  );

  assert.match(
    invoicingAccounting,
    /Accounts receivable[\s\S]*customer_credit/,
    'The Accounting control model must remain aligned with Invoicing journal semantics.',
  );
});


test('Accounting 2.9 Payables is migration-backed and ledger controlled', async () => {
  const [
    manifest,
    migrations,
    migration,
    payables,
    workspace,
    foundation,
    domainHooks,
    catalog,
    specialistCatalog,
    specialistDepth,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.8.0-to-2.9.0.ts'),
    source('lib/apps/accounting/payables.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(migrations,/ACCOUNTING_2_8_0_TO_2_9_0/);

  for (const marker of [
    'accounting_vendors',
    'accounting_vendor_documents',
    'accounting_vendor_document_lines',
    'accounting_vendor_credit_applications',
    'accounting_payables_aging',
    'accounting_vendor_balances',
  ]) {
    assert.match(migration,new RegExp(marker),'Payables migration must own '+marker+'.');
    assert.match(specialistDepth,new RegExp(marker),'Fresh Accounting installs must include '+marker+'.');
  }

  assert.match(payables,/postBalancedLedgerJournal/);
  assert.match(payables,/reversePostedLedgerJournal/);
  assert.match(payables,/default_payable_account_id[\s\S]*payable_control[\s\S]*liability_payable/);
  assert.match(payables,/accounting_opening_balance_lines/);
  assert.match(payables,/accounting_payables_aging/);
  assert.match(payables,/accounting_vendor_credit_applications/);

  assert.match(workspace,/dedicatedSection ===[\s\S]*'payables'[\s\S]*AccountingPayables/);
  assert.match(foundation,/"payables"/);
  assert.match(domainHooks,/accounting_vendor_documents[\s\S]*validated Accounting payables services/);
  assert.match(catalog,/accounting_vendor_documents/);
  assert.match(specialistCatalog,/accounting_vendor_documents/);
});


test('Accounting 2.10 Purchasing controls are migration-backed and gate PO bills', async () => {
  const [
    manifest,
    migrations,
    migration,
    purchasing,
    payables,
    workspace,
    foundation,
    domainHooks,
    catalog,
    specialistCatalog,
    specialistDepth,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.9.0-to-2.10.0.ts'),
    source('lib/apps/accounting/purchasing.ts'),
    source('lib/apps/accounting/payables.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(migrations,/ACCOUNTING_2_9_0_TO_2_10_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.9\.0'[\s\S]*toVersion:\s*'2\.10\.0'/,
  );

  for (const marker of [
    'accounting_purchase_policies',
    'accounting_purchase_requisitions',
    'accounting_purchase_requisition_lines',
    'accounting_purchase_orders',
    'accounting_purchase_order_lines',
    'accounting_goods_receipts',
    'accounting_goods_receipt_lines',
    'accounting_purchase_matches',
    'accounting_purchase_order_receipt_totals',
    'purchase_match_status',
  ]) {
    assert.match(
      migration,
      new RegExp(marker),
      'Purchasing migration must own ' + marker + '.',
    );
    assert.match(
      specialistDepth,
      new RegExp(marker),
      'Fresh Accounting installs must include ' + marker + '.',
    );
  }

  for (const marker of [
    'createPurchasePolicy',
    'createPurchaseRequisition',
    'transitionPurchaseRequisition',
    'createPurchaseOrder',
    'transitionPurchaseOrder',
    'createGoodsReceipt',
    'matchVendorBillToPurchaseOrder',
    'overridePurchaseMatch',
  ]) {
    assert.match(
      purchasing,
      new RegExp(marker),
      'Purchasing service must expose ' + marker + '.',
    );
  }

  assert.match(
    purchasing,
    /roleAllows[\s\S]*approver_role/,
    'Purchase-order approval must enforce the configured approver role or user.',
  );
  assert.match(
    purchasing,
    /require_three_way_match[\s\S]*quantity_tolerance_percent[\s\S]*price_tolerance_percent[\s\S]*amount_tolerance/,
    'Purchasing matching must honor configured receipt, quantity, price and amount tolerances.',
  );
  assert.match(
    purchasing,
    /receivedDocumentCurrency[\s\S]*rateUnits/,
    'Received purchase value must be translated to base currency before comparison.',
  );
  assert.match(
    migration,
    /request_key[\s\S]*request_hash[\s\S]*uq_accounting_purchase_order_request/,
    'Purchasing documents must own retry-safe request identity.',
  );
  assert.match(
    purchasing,
    /requestHash[\s\S]*pg_advisory_xact_lock[\s\S]*request key was already used with different content/,
    'Purchasing retries must replay identical creates and reject changed payloads.',
  );
  assert.match(
    purchasing,
    /accounting\.purchasing\.requisition_created[\s\S]*accounting\.purchasing\.order_created[\s\S]*accounting\.purchasing\.receipt_confirmed/,
    'Core purchasing lifecycle events must be written to the workspace audit trail.',
  );
  assert.match(
    payables,
    /purchase_order_id[\s\S]*purchase_match_status[\s\S]*matched[\s\S]*overridden[\s\S]*before posting/,
    'PO-linked vendor bills must not post before passing purchasing controls.',
  );
  assert.match(
    workspace,
    /dedicatedSection ===[\s\S]*'purchasing'[\s\S]*AccountingPurchasing/,
    'Purchasing must render as a dedicated Accounting workspace.',
  );
  assert.match(foundation,/"purchasing"/);
  assert.match(
    domainHooks,
    /accounting_purchase_orders[\s\S]*accounting_purchase_matches[\s\S]*validated Accounting purchasing services/,
    'Generic enterprise CRUD must not bypass purchasing workflow controls.',
  );
  assert.match(catalog,/accounting_purchase_orders/);
  assert.match(specialistCatalog,/accounting_purchase_orders/);
});


test('Accounting 2.11 controls approved expenses and employee reimbursements without duplicating claims', async () => {
  const [
    manifest,
    migrations,
    migration,
    expenses,
    workspace,
    foundation,
    domainHooks,
    financeTransitions,
    specialistDepth,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.10.0-to-2.11.0.ts'),
    source('lib/apps/accounting/expenses.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-finance-transitions.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
  ]);

  assert.match(
    manifest,
    /key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'[\s\S]*optionalDepends:\s*\['expenses'\]/,
  );
  assert.match(migrations,/ACCOUNTING_2_10_0_TO_2_11_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.10\.0'[\s\S]*toVersion:\s*'2\.11\.0'/,
  );

  for (const marker of [
    'accounting_expense_category_mappings',
    'accounting_expense_report_postings',
    'accounting_expense_line_postings',
    'accounting_expense_reimbursements',
    'accounting_expense_reimbursement_balances',
    'employee_expense_payable_account_id',
    'corporate_card_clearing_account_id',
  ]) {
    assert.match(migration,new RegExp(marker),'Expense accounting migration must own '+marker+'.');
    assert.match(specialistDepth,new RegExp(marker),'Fresh Accounting installs must include '+marker+'.');
  }

  assert.doesNotMatch(
    migration,
    /REFERENCES public\.expense_(?:categories|reports|report_lines)/,
    'Accounting migrations must not require optional Expenses tables to exist.',
  );

  for (const marker of [
    'postExpenseReport',
    'reverseExpenseReportPosting',
    'reimburseExpenseReport',
    'reverseExpenseReimbursement',
    'postBalancedLedgerJournal',
    'reversePostedLedgerJournal',
    'requestHash',
    'expensesTablesAvailable',
  ]) {
    assert.match(expenses,new RegExp(marker));
  }

  assert.match(
    expenses,
    /status[\s\S]*approved[\s\S]*before posting it to Accounting/,
    'Only approved operational expense reports may reach the ledger.',
  );
  assert.match(
    expenses,
    /outstanding[\s\S]*Reimbursement exceeds the outstanding employee expense balance/,
    'Employee reimbursements must not over-settle the Accounting payable.',
  );
  assert.match(
    financeTransitions,
    /accounting_expense_report_postings[\s\S]*outstanding employee reimbursement in Accounting/,
    'Expenses cannot mark a report reimbursed while Accounting still carries a payable.',
  );
  assert.match(
    domainHooks,
    /accounting_expense_category_mappings[\s\S]*accounting_expense_reimbursements[\s\S]*validated Accounting expense services/,
    'Generic CRUD must not bypass expense accounting controls.',
  );
  assert.match(workspace,/Expenses & Reimbursements[\s\S]*AccountingExpenses/);
  assert.match(foundation,/"expenses"/);
});


test('Accounting 2.12 controls bank cash mobile money and internal transfers', async () => {
  const [
    manifest,
    migrations,
    migration,
    service,
    workspace,
    foundation,
    domainHooks,
    specialistDepth,
    catalog,
    specialistCatalog,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.11.0-to-2.12.0.ts'),
    source('lib/apps/accounting/bank-cash.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(migrations,/ACCOUNTING_2_11_0_TO_2_12_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.11\.0'[\s\S]*toVersion:\s*'2\.12\.0'/,
  );

  for (const marker of [
    'account_type',
    'mobile_money_provider',
    'allow_overdraft',
    'overdraft_limit',
    'accounting_internal_transfers',
    'accounting_financial_account_balances',
    'uq_accounting_internal_transfer_request',
  ]) {
    assert.match(migration,new RegExp(marker),'Financial-account migration must own '+marker+'.');
    assert.match(specialistDepth,new RegExp(marker),'Fresh Accounting installs must include '+marker+'.');
  }

  for (const marker of [
    'createFinancialAccount',
    'updateFinancialAccount',
    'changeFinancialAccountStatus',
    'createInternalTransfer',
    'reverseInternalTransfer',
    'postBalancedLedgerJournal',
    'reversePostedLedgerJournal',
    'signedLedgerCents',
    'pg_advisory_xact_lock',
  ]) {
    assert.match(service,new RegExp(marker));
  }

  assert.match(
    service,
    /accounting_fx_currencies[\s\S]*Enable this currency in Accounting → Foreign Currency/,
    'Foreign financial accounts must require an explicitly enabled Accounting FX currency.',
  );
  assert.match(
    service,
    /Cross-currency internal transfers require the foreign-currency accounting workflow/,
    'The ordinary Bank/Cash transfer path must continue routing cross-currency movement to Accounting FX.',
  );
  assert.match(
    service,
    /Bring the linked ledger account to zero before closing[\s\S]*Resolve or exclude outstanding statement lines/,
    'Financial accounts must not close with ledger balances or unresolved statements.',
  );
  assert.match(
    service,
    /exceeds the available balance and configured overdraft limit/,
    'Internal transfers must enforce the source account overdraft policy.',
  );
  assert.match(
    domainHooks,
    /accounting_bank_accounts[\s\S]*accounting_internal_transfers[\s\S]*validated Accounting financial-account services/,
    'Generic CRUD must not bypass financial-account controls.',
  );
  assert.match(catalog,/accounting_internal_transfers/);
  assert.match(specialistCatalog,/accounting_internal_transfers/);
  assert.match(workspace,/Bank, Cash & Mobile Money[\s\S]*AccountingBankCash/);
  assert.match(foundation,/"bank-cash"/);
});


test('Accounting 2.13 imports statements and protects normalized feed intake', async () => {
  const [
    manifest,
    migrations,
    migration,
    statements,
    workspace,
    foundation,
    domainHooks,
    specialistDepth,
    catalog,
    specialistCatalog,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.12.0-to-2.13.0.ts'),
    source('lib/apps/accounting/statements.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(migrations,/ACCOUNTING_2_12_0_TO_2_13_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.12\.0'[\s\S]*toVersion:\s*'2\.13\.0'/,
  );

  for (const marker of [
    'accounting_bank_feed_connections',
    'accounting_statement_import_batches',
    'accounting_statement_import_rows',
    'external_transaction_id',
    'fingerprint',
    'raw_details',
    'uq_accounting_statement_import_request',
    'uq_accounting_statement_source_file',
    'uq_accounting_statement_external_transaction',
  ]) {
    assert.match(migration,new RegExp(marker),'Statement migration must own '+marker+'.');
    assert.match(specialistDepth,new RegExp(marker),'Fresh Accounting installs must include '+marker+'.');
  }

  for (const marker of [
    'parseCsv',
    'parseOfx',
    'parseQif',
    'importStatementFile',
    'createFeedConnection',
    'ingestNormalizedFeed',
    'acceptPossibleDuplicate',
    'pg_advisory_xact_lock',
    'sourceSha',
  ]) {
    assert.match(statements,new RegExp(marker));
  }

  assert.match(
    statements,
    /duplicate external transaction ID cannot be force-imported/,
    'Authoritative provider transaction IDs must never be bypassed as duplicates.',
  );
  assert.match(
    statements,
    /statement-account:/,
    'Imports for one financial account must be serialized before duplicate checks.',
  );
  assert.match(
    statements,
    /SAVEPOINT[\s\S]*ROLLBACK TO SAVEPOINT[\s\S]*RELEASE SAVEPOINT/,
    'A bad statement row must not abort the entire PostgreSQL import batch.',
  );
  assert.match(
    statements,
    /cancelStatementImportBatch[\s\S]*matched reconciliation lines cannot be undone/,
    'Statement imports may be undone only before matched reconciliation exists.',
  );
  assert.match(
    domainHooks,
    /accounting_bank_feed_connections[\s\S]*accounting_statement_import_batches[\s\S]*accounting_bank_statement_lines[\s\S]*validated Accounting statement import services/,
    'Generic CRUD must not bypass statement intake controls.',
  );
  assert.match(catalog,/accounting_statement_import_batches/);
  assert.match(specialistCatalog,/accounting_statement_import_rows/);
  assert.match(workspace,/Statements & Feeds[\s\S]*AccountingStatements/);
  assert.match(foundation,/"statements"/);
});


test('Accounting 2.14 provides immutable bank reconciliation with split matches and controlled adjustments', async () => {
  const [
    manifest,
    migrations,
    migration,
    reconciliation,
    workspace,
    foundation,
    domainHooks,
    specialistDepth,
    catalog,
    specialistCatalog,
  ] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.13.0-to-2.14.0.ts'),
    source('lib/apps/accounting/reconciliation.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
  ]);

  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(migrations,/ACCOUNTING_2_13_0_TO_2_14_0/);
  assert.match(
    migration,
    /fromVersion:\s*'2\.13\.0'[\s\S]*toVersion:\s*'2\.14\.0'/,
  );

  for (const marker of [
    'accounting_reconciliations',
    'accounting_reconciliation_matches',
    'accounting_reconciliation_suggestions',
    'accounting_reconciliation_journal_availability',
    'uq_accounting_active_statement_reconciliation',
    'uq_accounting_reconciliation_request',
    'excluded_reason',
    'auto_apply',
  ]) {
    assert.match(migration,new RegExp(marker),'Reconciliation migration must own '+marker+'.');
    assert.match(specialistDepth,new RegExp(marker),'Fresh Accounting installs must include '+marker+'.');
  }

  assert.match(
    migration,
    /LEGACY-[\s\S]*matched_journal_line_id/,
    'Existing generic matched statement lines must be preserved during migration.',
  );
  assert.match(
    migration,
    /bank_reconciliation_adjustment[\s\S]*bank_reconciliation_reversal/,
    'Reconciliation-created journals must not re-enter the ordinary candidate pool.',
  );

  for (const marker of [
    'generateReconciliationSuggestions',
    'reconcileStatementLine',
    'createReconciliationRule',
    'applyReconciliationRule',
    'excludeStatementLine',
    'dismissReconciliationSuggestion',
    'reverseReconciliation',
    'postBalancedLedgerJournal',
    'reversePostedLedgerJournal',
    'candidateConfidence',
    'requestHash',
  ]) {
    assert.match(reconciliation,new RegExp(marker));
  }

  assert.match(
    reconciliation,
    /Split allocations must add exactly to the signed statement amount/,
    'Split reconciliation must fully allocate the signed statement amount.',
  );
  assert.match(
    reconciliation,
    /allocation exceeds the remaining unreconciled journal amount/,
    'A split allocation must not consume more than the journal line has available.',
  );
  assert.match(
    reconciliation,
    /request key was already used with different content/,
    'Reconciliation creates must be retry-safe and payload-bound.',
  );
  assert.match(
    reconciliation,
    /sourceEventKey:"accounting:bank-reconciliation-rule:"\+key/,
    'Rule adjustment journals must use the reconciliation request key so retries replay but post-reversal reposts create a new journal.',
  );
  assert.match(
    reconciliation,
    /cannot target another bank, cash or mobile-money ledger[\s\S]*Use Internal Transfer instead/,
    'Reconciliation rules must not bypass the controlled internal-transfer workflow.',
  );
  assert.match(
    reconciliation,
    /status='accepted'[\s\S]*status='stale'/,
    'Accepted suggestion provenance must be retained while alternatives become stale.',
  );
  assert.match(
    domainHooks,
    /accounting_reconciliation_rules[\s\S]*accounting_reconciliations[\s\S]*validated Accounting reconciliation services/,
    'Generic CRUD must not bypass reconciliation controls.',
  );
  assert.match(catalog,/accounting_reconciliations/);
  assert.match(specialistCatalog,/accounting_reconciliation_suggestions/);
  assert.match(workspace,/Reconciliation[\s\S]*AccountingReconciliation/);
  assert.match(foundation,/"reconciliation"/);
});


test('Accounting 2.16 Tax Engine is migration-backed and fresh-install complete', async () => {
  const [manifest,runtime,migration,depth,schema,catalog,specialist,hooks,engine,taxes,workspace,foundation] = await Promise.all([
    source('lib/modules/first-party.ts'),source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.15.0-to-2.16.0.ts'),source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/tax-schema.ts'),source('lib/apps/enterprise/catalog.ts'),source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),source('lib/apps/accounting/tax-engine.ts'),
    source('lib/apps/accounting/taxes.ts'),source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
  ]);
  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(runtime,/ACCOUNTING_2_15_0_TO_2_16_0/);
  assert.match(migration,/fromVersion:\s*'2\.15\.0'[\s\S]*toVersion:\s*'2\.16\.0'/);
  assert.match(depth,/ACCOUNTING_TAX_SQL/);
  for (const marker of ['accounting_tax_codes','accounting_tax_groups','accounting_tax_group_lines','accounting_tax_ledger_entries']) {
    assert.match(schema,new RegExp(marker));assert.match(catalog,new RegExp(marker));assert.match(specialist,new RegExp(marker));
  }
  assert.match(hooks,/accounting_tax_codes[\s\S]*accounting_tax_ledger_entries/);
  assert.match(engine,/calculateAccountingTaxes/);assert.match(engine,/priceIncluded/);assert.match(engine,/recoverableAmount/);
  assert.match(taxes,/recordAccountingTaxLedgerEntries/);
  assert.match(workspace,/dedicatedSection === 'taxes'[\s\S]*AccountingTaxes/);
  assert.match(foundation,/"taxes"/);
});


test('Accounting 2.17 Kenya localization reuses shared eTIMS and is migration-backed', async () => {
  const [manifest,runtime,migration,depth,schema,catalog,specialist,hooks,service,workspace,foundation,payables] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.16.0-to-2.17.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/kenya-schema.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/accounting/kenya.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/accounting/payables.ts'),
  ]);
  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(runtime,/ACCOUNTING_2_16_0_TO_2_17_0/);
  assert.match(migration,/fromVersion:\s*'2\.16\.0'[\s\S]*toVersion:\s*'2\.17\.0'/);
  assert.match(depth,/ACCOUNTING_KENYA_SQL/);
  for (const marker of ['accounting_kenya_settings','accounting_kenya_tax_mappings','accounting_kenya_sync_runs']) {
    assert.match(schema,new RegExp(marker));
    assert.match(catalog,new RegExp(marker));
    assert.match(specialist,new RegExp(marker));
  }
  assert.match(hooks,/accounting_kenya_settings[\s\S]*accounting_kenya_sync_runs/);
  assert.match(service,/invoicing_etims_profiles/);
  assert.match(service,/invoicing_etims_submissions/);
  assert.doesNotMatch(service,/SAMI_ETIMS_[A-Z_]+_BASE_URL/);
  assert.match(workspace,/dedicatedSection === 'kenya'[\s\S]*AccountingKenya/);
  assert.match(foundation,/"kenya"/);
  assert.match(payables,/recoverable_tax_amount/);
  assert.match(payables,/accounting:vendor-tax:/);
});


test('Accounting 2.18 International Localization is migration-backed and shares Invoicing e-invoice evidence', async () => {
  const [manifest,runtime,migration,depth,schema,catalog,specialist,hooks,service,workspace,foundation] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.17.0-to-2.18.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/international-schema.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/accounting/international.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
  ]);
  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.18\.0'/);
  assert.match(runtime,/ACCOUNTING_2_17_0_TO_2_18_0/);
  assert.match(migration,/fromVersion:\s*'2\.17\.0'[\s\S]*toVersion:\s*'2\.18\.0'/);
  assert.match(depth,/ACCOUNTING_INTERNATIONAL_LOCALIZATION_SQL/);
  for (const marker of [
    'accounting_localization_settings',
    'accounting_localization_report_boxes',
    'accounting_localization_report_rules',
    'accounting_localization_report_runs',
    'accounting_localization_pack_history',
  ]) {
    assert.match(schema,new RegExp(marker));
    assert.match(catalog,new RegExp(marker));
    assert.match(specialist,new RegExp(marker));
  }
  assert.match(hooks,/accounting_localization_settings[\s\S]*accounting_localization_pack_history/);
  assert.match(service,/invoicing_einvoice_profiles/);
  assert.match(service,/invoicing_einvoice_documents/);
  assert.doesNotMatch(service,/credential_sealed/);
  assert.match(service,/generic_vat_reporting/);
  assert.match(workspace,/dedicatedSection === 'international'[\s\S]*AccountingInternational/);
  assert.match(foundation,/"international"/);
});


test('Accounting 2.19 Foreign Currency is migration-backed and subledger controlled', async () => {
  const [manifest,runtime,migration,depth,schema,catalog,specialist,hooks,fx,workspace,foundation,bankCash,payments,statements,reconciliation,ledger] = await Promise.all([
    source('lib/modules/first-party.ts'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/accounting/migrations/2.18.0-to-2.19.0.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/accounting/fx-schema.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/accounting/fx.ts'),
    source('app/apps/accounting/AccountingWorkspace.tsx'),
    source('app/apps/accounting/AccountingFoundationPanel.tsx'),
    source('lib/apps/accounting/bank-cash.ts'),
    source('lib/apps/accounting/payment-command.ts'),
    source('lib/apps/accounting/statements.ts'),
    source('lib/apps/accounting/reconciliation.ts'),
    source('lib/apps/accounting/ledger-engine.ts'),
  ]);
  assert.match(manifest,/key:\s*"accounting"[\s\S]*version:\s*'2\.19\.0'/);
  assert.match(runtime,/ACCOUNTING_2_18_0_TO_2_19_0/);
  assert.match(migration,/fromVersion:\s*'2\.18\.0'[\s\S]*toVersion:\s*'2\.19\.0'/);
  assert.match(depth,/ACCOUNTING_FX_SQL/);
  for (const marker of [
    'accounting_fx_settings',
    'accounting_fx_currencies',
    'accounting_exchange_rates',
    'accounting_fx_financial_movements',
    'accounting_fx_revaluation_runs',
    'accounting_fx_revaluation_lines',
  ]) {
    assert.match(schema,new RegExp(marker));
    assert.match(catalog,new RegExp(marker));
    assert.match(specialist,new RegExp(marker));
  }
  assert.match(hooks,/accounting_fx_settings[\s\S]*accounting_fx_revaluation_lines/);
  assert.match(fx,/postForeignVendorPayment[\s\S]*postCrossCurrencyTransfer/);
  assert.match(fx,/generateFxRevaluation[\s\S]*postFxRevaluation[\s\S]*reverseFxRevaluation/);
  assert.match(workspace,/dedicatedSection === 'fx'[\s\S]*AccountingFx/);
  assert.match(foundation,/"fx"/);
  assert.match(bankCash,/accounting_fx_currencies/);
  assert.match(payments,/fx_managed/);
  assert.match(statements,/convertForeignToBase[\s\S]*base_amount/);
  assert.match(reconciliation,/statementLedgerAmount[\s\S]*accounting_fx_financial_movements/);
  assert.match(ledger,/foreign_financial_account[\s\S]*Manual journals cannot post directly/);
});
