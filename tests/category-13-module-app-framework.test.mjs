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
  const rawService =
    await source(
      'lib/services/workspace-app-lifecycle.ts',
    );

  const deactivateStart =
    rawService.indexOf(
      'async function deactivateWorkspaceApp(',
    );

  const deactivateEnd =
    rawService.indexOf(
      'export async function installWorkspaceApp',
      deactivateStart,
    );

  assert.notEqual(
    deactivateStart,
    -1,
    'deactivateWorkspaceApp must exist.',
  );

  assert.notEqual(
    deactivateEnd,
    -1,
    'deactivateWorkspaceApp must have a stable function boundary.',
  );

  const service =
    compact(
      rawService.slice(
        deactivateStart,
        deactivateEnd,
      ),
    );

  assert.match(
    service,
    /status = \$3::varchar/,
  );

  assert.match(
    service,
    /WHEN \$4::boolean THEN NOW\(\)/,
    'Uninstall timestamp selection must not reuse the varchar status parameter as a boolean condition.',
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
    'Disable/uninstall must never mutate tenant business data.',
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
    /getSamiModuleManifest/,
  );

  assert.match(
    service,
    /manifest\s*\?\.depends|manifest\s*\.depends/,
    'Dependency protection must include code-owned manifest dependencies.',
  );

  assert.match(
    service,
    /row\.dependencies/,
    'Persisted dependency metadata remains a compatibility input.',
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
    /pg_try_advisory_lock/,
  );

  assert.doesNotMatch(
    service,
    /\bpg_advisory_lock\(/,
    'Lifecycle requests must never wait indefinitely for a workspace app lock.',
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

test('Category 13: concurrent app lifecycle requests fail fast instead of timing out', async () => {
  const [
    service,
    route,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
      source(
        'app/api/workspace/apps/[appKey]/route.ts',
      ),
    ]);

  const compactService =
    compact(
      service,
    );

  assert.match(
    compactService,
    /pg_try_advisory_lock/,
  );

  assert.match(
    compactService,
    /APP_CHANGE_IN_PROGRESS/,
  );

  assert.match(
    route,
    /'APP_CHANGE_IN_PROGRESS'/,
  );

  assert.doesNotMatch(
    compactService,
    /\bpg_advisory_lock\(/,
    'A serverless lifecycle request must never block on a session advisory lock.',
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
    /pendingAction/,
  );

  assert.match(
    client,
    /confirmPendingAction/,
  );

  assert.match(
    client,
    /action\.appKey,\s*'DELETE'/s,
    'Confirmed uninstall must call the lifecycle DELETE endpoint directly.',
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

test('Category 13: lifecycle audit writes satisfy the live compatibility columns', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    );

  assert.match(
    service,
    /actor_type, action, resource_type, resource_id, module, result/,
  );

  assert.match(
    service,
    /event_type, entity_type, entity_id/,
  );

  assert.match(
    service,
    /'human'.*?'module'.*?'success'/,
  );
});


test('Category 13: Invoicing trigger uses TG_OP only inside trigger functions', async () => {
  const schema =
    await source(
      'lib/apps/invoicing/schema.sql',
    );

  assert.doesNotMatch(
    schema,
    /CREATE TRIGGER[\s\S]*?WHEN\s*\(\s*TG_OP/gi,
    'CREATE TRIGGER WHEN cannot reference TG_OP.',
  );

  assert.match(
    schema,
    /CREATE OR REPLACE FUNCTION public\.validate_invoice_status_transition\(\)[\s\S]*?IF TG_OP = 'INSERT'/,
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

test('Category 13: every installable first-party manifest has a schema payload and unsafe replacement SQL is guarded', async () => {
  const [
    manifests,
    lifecycle,
  ] =
    await Promise.all([
      source(
        'lib/modules/first-party.ts',
      ),
      source(
        'lib/services/workspace-app-lifecycle.ts',
      ),
    ]);

  const keys = [
    ...manifests.matchAll(
      /defineSamiModule\(\{\s*key:\s*"([^"]+)"/g,
    ),
  ].map(
    match =>
      match[1],
  );

  assert.equal(
    keys.length,
    36,
    'All currently installable first-party business apps must remain schema-backed.',
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
    /manifest\.schemaPath/,
    'Install schema resolution must come from the module manifest.',
  );

  assert.match(
    lifecycle,
    /expectedPrefix/,
    'Manifest-owned schema files must remain inside their registered module directory.',
  );

  assert.match(
    lifecycle,
    /path\.join\(\s*process\.cwd\(\),\s*'lib',\s*'apps',\s*manifest\.key,/s,
    'Filesystem tracing must stay statically scoped to lib/apps instead of tracing the whole project.',
  );

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


test('Category 13: SaMi exposes an 80-app catalog without pretending planned modules are installable', async () => {
  const [
    canonical,
    planned,
    compatibility,
    onboarding,
    settings,
  ] = await Promise.all([
    source(
      'lib/modules/first-party.ts',
    ),
    source(
      'lib/modules/planned-first-party.ts',
    ),
    source(
      'lib/sami-apps.ts',
    ),
    source(
      'app/select-apps/page.tsx',
    ),
    source(
      'app/settings/components/AppsSettings.tsx',
    ),
  ]);

  const readyKeys = [
    ...canonical.matchAll(
      /defineSamiModule\(\{\s*key:\s*"([^"]+)"/g,
    ),
  ].map(
    match =>
      match[1],
  );

  const plannedKeys = [
    ...planned.matchAll(
      /key:\s*\n?\s*'([^']+)'/g,
    ),
  ]
    .map(
      match =>
        match[1],
    )
    .filter(
      key =>
        key !==
        'ready' &&
        key !==
        'planned',
    );

  assert.equal(
    readyKeys.length,
    36,
    'SaMi must preserve the 36 schema-backed apps already implemented.',
  );

  assert.equal(
    plannedKeys.length,
    44,
    'The expansion must add 44 roadmap apps for an 80-app first-party catalog.',
  );

  assert.match(
    canonical,
    /\.\.\.PLANNED_FIRST_PARTY_SAMI_MODULES/,
  );

  assert.match(
    planned,
    /installable:\s*false/,
  );

  assert.match(
    planned,
    /schemaPath:\s*null/,
  );

  assert.doesNotMatch(
    planned,
    /installable:\s*true/,
    'Roadmap-only modules must never silently become installable.',
  );

  assert.match(
    compatibility,
    /INSTALLABLE_SAMI_APPS/,
  );

  assert.match(
    compatibility,
    /availability:[\s\S]*planned/s,
  );

  assert.match(
    onboarding,
    /INSTALLABLE_SAMI_APPS as SAMI_APPS/,
    'Registration must expose only real schema-backed apps.',
  );

  assert.match(
    settings,
    /coming_soon/,
  );

  assert.match(
    settings,
    /Coming soon/,
  );

  assert.match(
    settings,
    /app\.installable/,
    'Settings must gate lifecycle actions on manifest installability.',
  );
});


test('Category 13: Odoo-class module manifests own dependencies, actions, views, resources, security and extension hooks', async () => {
  const [
    types,
    manifests,
    registry,
    compatibility,
  ] = await Promise.all([
    source('lib/modules/types.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/modules/registry.ts'),
    source('lib/sami-apps.ts'),
  ]);

  for (
    const contract
    of [
      'depends',
      'optionalDepends',
      'navigation',
      'actions',
      'views',
      'resources',
      'recordPolicies',
      'fieldPolicies',
      'schemaPath',
      'migrationNamespace',
      'automationTriggers',
      'automationActions',
      'aiTools',
      'integrationProviders',
    ]
  ) {
    assert.match(
      types,
      new RegExp(contract),
      `Module contract must expose ${contract}.`,
    );
  }

  assert.match(
    manifests,
    /FIRST_PARTY_SAMI_MODULES/,
  );

  assert.match(
    registry,
    /getSamiModuleManifest/,
  );

  assert.match(
    registry,
    /getSamiModuleDependencyPlan/,
  );

  assert.match(
    registry,
    /getAccessibleSamiModuleRuntime/,
  );

  assert.match(
    registry,
    /getSamiModuleAction/,
  );

  assert.match(
    registry,
    /getSamiModuleView/,
  );

  assert.match(
    registry,
    /getSamiModuleResource/,
  );

  assert.match(
    registry,
    /getAccessibleSamiModuleAction/,
  );

  assert.match(
    compatibility,
    /FIRST_PARTY_SAMI_MODULES/,
    'Legacy app catalog must be a projection from manifests, not an independent source of truth.',
  );
});

test('Category 13: module resource security fails closed and separates CRUD, record and field policy decisions', async () => {
  const security =
    await source(
      'lib/modules/security.ts',
    );

  assert.match(
    security,
    /resolveSamiResourceAccess/,
  );

  assert.match(
    security,
    /permission_denied/,
  );

  assert.match(
    security,
    /record_policy_denied/,
  );

  assert.match(
    security,
    /company_context_required/,
  );

  assert.match(
    security,
    /resource\.companyScoped/,
  );

  assert.match(
    security,
    /filterReadableSamiFields/,
  );

  assert.match(
    security,
    /filterWritableSamiFields/,
  );

  assert.match(
    security,
    /manifest\.security\s*\.fieldPolicies/s,
    'Declared field policies must be enforced, not just described in the manifest.',
  );

  assert.match(
    security,
    /policiesForField/,
  );

  assert.doesNotMatch(
    security,
    /query\(|SELECT |INSERT |UPDATE |DELETE FROM/i,
    'The policy engine describes authority; it must never become a generic SQL executor.',
  );
});

test('Category 13: dashboard, search and AI app extensions share one module-runtime access filter', async () => {
  const [
    dashboard,
    search,
    ai,
  ] = await Promise.all([
    source('lib/dashboard/providers/index.ts'),
    source('lib/search/registry.ts'),
    source('lib/ai/tool-registry.ts'),
  ]);

  for (
    const runtime
    of [
      dashboard,
      search,
      ai,
    ]
  ) {
    assert.match(
      runtime,
      /filterAccessibleModuleExtensions/,
    );
  }
});


test('Category 13: module registry validates dependency, action, view, resource and policy references at load time', async () => {
  const [
    validation,
    registry,
  ] = await Promise.all([
    source('lib/modules/validation.ts'),
    source('lib/modules/registry.ts'),
  ]);

  assert.match(
    validation,
    /assertValidSamiModuleManifests/,
  );

  assert.match(
    validation,
    /cannot depend on itself/,
  );

  assert.match(
    validation,
    /depends on unknown module/,
  );

  assert.match(
    validation,
    /references unknown action/,
  );

  assert.match(
    validation,
    /references unknown view/,
  );

  assert.match(
    validation,
    /references unknown resource/,
  );

  assert.match(
    validation,
    /references unknown field/,
  );

  assert.match(
    registry,
    /assertValidSamiModuleManifests\(\s*FIRST_PARTY_SAMI_MODULES/s,
    'Invalid first-party manifests must fail when the canonical registry loads.',
  );
});
