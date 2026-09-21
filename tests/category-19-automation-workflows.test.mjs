import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('Category 19: tenant core advances additively from 1.5.0 to 1.6.0', async () => {
  const [
    manifest,
    migration,
    core,
  ] =
    await Promise.all([
      source(
        'lib/schema/tenant-migrations/manifest.ts',
      ),
      source(
        'lib/schema/tenant-migrations/migrations/006-core-1.5.0-to-1.6.0.sql',
      ),
      source(
        'lib/schema/tenant-core.sql',
      ),
    ]);

  assert.match(
    manifest,
    /CURRENT_TENANT_CORE_VERSION\s*=\s*['"]1\.6\.0['"]/s,
  );
  assert.match(
    manifest,
    /core-1\.5\.0-to-1\.6\.0/,
  );
  assert.match(
    manifest,
    /006-core-1\.5\.0-to-1\.6\.0\.sql/,
  );

  assert.doesNotMatch(
    migration,
    /DROP\s+TABLE|DROP\s+DATABASE|TRUNCATE\s+TABLE|DELETE\s+FROM/i,
    'Category 19 tenant migration must remain additive.',
  );

  for (
    const table
    of [
      'automation_workflows',
      'automation_workflow_versions',
      'automation_events',
      'automation_runs',
      'automation_run_steps',
      'automation_approvals',
      'automation_schedules',
    ]
  ) {
    assert.match(
      migration,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS ${table}`,
      ),
    );

    assert.match(
      core,
      new RegExp(
        `CREATE TABLE IF NOT EXISTS \\{schema\\}\\.${table}`,
      ),
    );
  }

  assert.match(
    migration,
    /latest_version/,
  );
  assert.match(
    migration,
    /active_version/,
  );
  assert.match(
    migration,
    /idempotency_key/,
  );
  assert.match(
    migration,
    /correlation_id/,
  );
  assert.match(
    migration,
    /next_retry_at/,
  );
  assert.match(
    migration,
    /waiting_approval/,
  );
  assert.match(
    migration,
    /lease_until/,
  );
  assert.match(
    migration,
    /VALUES \('1\.6\.0'/,
  );
  assert.match(
    core,
    /VALUES \('1\.6\.0'\)/,
  );
});

test('Category 19: legacy state-machine workflows remain intact while automation runtime is separate', async () => {
  const core =
    await source(
      'lib/schema/tenant-core.sql',
    );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workflows/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workflow_states/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.workflow_transitions/,
  );

  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.automation_workflows/,
  );
});

test('Category 19: trigger and action execution is code-owned and module-runtime filtered', async () => {
  const [
    registry,
    moduleTypes,
  ] =
    await Promise.all([
      source(
        'lib/automation/registry.ts',
      ),
      source(
        'lib/modules/types.ts',
      ),
    ]);

  assert.match(
    moduleTypes,
    /automationTriggers:\s*boolean/,
  );
  assert.match(
    moduleTypes,
    /automationActions:\s*boolean/,
  );

  assert.match(
    registry,
    /CORE_AUTOMATION_TRIGGERS/,
  );
  assert.match(
    registry,
    /APP_AUTOMATION_TRIGGERS/,
  );
  assert.match(
    registry,
    /CORE_AUTOMATION_ACTIONS/,
  );
  assert.match(
    registry,
    /APP_AUTOMATION_ACTIONS/,
  );
  assert.match(
    registry,
    /APP_AUTOMATION_ACTION_HANDLERS/,
  );
  assert.match(
    registry,
    /getSamiModuleManifest/,
  );
  assert.match(
    registry,
    /automationTriggers/,
  );
  assert.match(
    registry,
    /automationActions/,
  );

  assert.doesNotMatch(
    registry,
    /queryControl|getTenantPool|eval\(|new Function|rawSql|executeSql/i,
    'Registry metadata must never become a database/code executor.',
  );
});

test('Category 19: workflow definitions use structured conditions instead of executable expressions', async () => {
  const definition =
    await source(
      'lib/automation/definition.ts',
    );

  assert.match(
    definition,
    /CONDITION_OPERATORS/,
  );
  assert.match(
    definition,
    /equals/,
  );
  assert.match(
    definition,
    /greater_than/,
  );
  assert.match(
    definition,
    /contains/,
  );
  assert.match(
    definition,
    /SAFE_PATH/,
  );
  assert.match(
    definition,
    /__proto__/,
  );
  assert.match(
    definition,
    /prototype/,
  );
  assert.match(
    definition,
    /constructor/,
  );

  assert.doesNotMatch(
    definition,
    /eval\(|new Function|vm\.|child_process|spawn\(|exec\(/,
  );
});

test('Category 19: automation authority derives from session, company, core permissions and accessible modules', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-automation.ts',
      ),
    );

  assert.match(
    service,
    /getPermissionContext/,
  );
  assert.match(
    service,
    /getSession/,
  );
  assert.match(
    service,
    /session\.sessionId !== permissions\.sessionId/,
  );
  assert.match(
    service,
    /session\.currentTenantId !== permissions\.tenantId/,
  );
  assert.match(
    service,
    /requireCompanyAccess/,
  );
  assert.match(
    service,
    /AUTOMATION_VIEW/,
  );
  assert.match(
    service,
    /AUTOMATION_MANAGE/,
  );
  assert.match(
    service,
    /resolveWorkspaceShellAccess/,
  );
  assert.match(
    service,
    /accessibleModuleKeys/,
  );
});

test('Category 19: saving a draft version never silently changes the active version', async () => {
  const service =
    compact(
      await source(
        'lib/services/workspace-automation.ts',
      ),
    );

  assert.match(
    service,
    /latest_version = \$3/,
  );

  const saveStart =
    service.indexOf(
      'saveWorkspaceAutomationVersion',
    );
  const activateStart =
    service.indexOf(
      'activateWorkspaceAutomation',
    );

  assert.ok(
    saveStart >=
      0 &&
    activateStart >
      saveStart,
  );

  const saveBlock =
    service.slice(
      saveStart,
      activateStart,
    );

  assert.doesNotMatch(
    saveBlock,
    /active_version\s*=/,
    'Saving a newer draft version must not change production behavior.',
  );

  assert.match(
    service,
    /active_version = \$3/,
  );
  assert.match(
    service,
    /v\.version = w\.active_version/,
    'Runs must load the explicitly active version, never the latest draft.',
  );
});

test('Category 19: manual runs are durable, idempotent, auditable and fail closed on unavailable actions', async () => {
  const service =
    await source(
      'lib/services/workspace-automation.ts',
    );

  assert.match(
    service,
    /runWorkspaceAutomationManually/,
  );
  assert.match(
    service,
    /INSERT INTO automation_events/,
  );
  assert.match(
    service,
    /INSERT INTO automation_runs/,
  );
  assert.match(
    service,
    /INSERT INTO automation_run_steps/,
  );
  assert.match(
    service,
    /INSERT INTO automation_approvals/,
  );
  assert.match(
    service,
    /getAccessibleAutomationAction/,
  );
  assert.match(
    service,
    /getAutomationActionHandler/,
  );
  assert.match(
    service,
    /AUTOMATION_ACTION_UNAVAILABLE/,
  );
  assert.match(
    service,
    /idempotencyKey/,
  );
  assert.match(
    service,
    /correlationId/,
  );
  assert.match(
    service,
    /next_retry_at/,
  );
  assert.match(
    service,
    /recordAutomationAudit/,
  );

  assert.doesNotMatch(
    service,
    /rawSql|executeSql|eval\(|new Function|puppeteer|playwright/i,
  );
});

test('Category 19: browser APIs are narrow, same-origin protected and no-cache', async () => {
  const [
    helper,
    collection,
    item,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-automation-api.ts',
      ),
      source(
        'app/api/workspace/automation/route.ts',
      ),
      source(
        'app/api/workspace/automation/[workflowId]/route.ts',
      ),
    ]);

  assert.match(
    helper,
    /sec-fetch-site/,
  );
  assert.match(
    helper,
    /INVALID_ORIGIN/,
  );
  assert.match(
    helper,
    /no-store/,
  );

  assert.match(
    collection,
    /getWorkspaceAutomationState/,
  );
  assert.match(
    collection,
    /createWorkspaceAutomationDraft/,
  );
  assert.match(
    collection,
    /rejectAutomationCrossOrigin/,
  );

  assert.match(
    item,
    /save_version/,
  );
  assert.match(
    item,
    /activate/,
  );
  assert.match(
    item,
    /pause/,
  );
  assert.match(
    item,
    /run_manual/,
  );
  assert.match(
    item,
    /rejectAutomationCrossOrigin/,
  );

  assert.doesNotMatch(
    collection +
      item,
    /queryControl|getTenantPool|rawSql|executeSql|toolName\s*:/i,
  );
});

test('Category 19: Automation UI is permission-aware, module-agnostic and mobile-first', async () => {
  const [
    page,
    client,
    navigation,
    sidebar,
    search,
  ] =
    await Promise.all([
      source(
        'app/automation/page.tsx',
      ),
      source(
        'app/automation/AutomationClient.tsx',
      ),
      source(
        'app/api/workspace/navigation/route.ts',
      ),
      source(
        'app/components/workspace/WorkspaceSidebar.tsx',
      ),
      source(
        'lib/search/workspace-search.ts',
      ),
    ]);

  assert.match(
    page,
    /AUTOMATION_VIEW/,
  );
  assert.match(
    page,
    /AUTOMATION_MANAGE/,
  );
  assert.match(
    page,
    /WorkspaceShell/,
  );
  assert.match(
    page,
    /getWorkspaceAutomationState/,
  );

  assert.match(
    client,
    /Save version/,
  );
  assert.match(
    client,
    /Activate/,
  );
  assert.match(
    client,
    /Run now/,
  );
  assert.match(
    client,
    /Recent runs/,
  );
  assert.match(
    client,
    /Structured comparisons only/,
  );
  assert.match(
    client,
    /xl:grid-cols-\[330px_minmax\(0,1fr\)\]/,
  );

  assert.doesNotMatch(
    client,
    /CRM|Invoice|Inventory|Sales Order|Purchase Order/,
    'Core Automation UI must not hardcode business-module semantics.',
  );

  assert.match(
    navigation,
    /automationView/,
  );
  assert.match(
    navigation,
    /automationManage/,
  );
  assert.match(
    sidebar,
    /href="\/automation"/,
  );
  assert.match(
    sidebar,
    /label="Automation"/,
  );
  assert.match(
    search,
    /href:\s*['"]\/automation['"]/,
  );
});

test('Category 19: full-suite gate includes Automation regression coverage', async () => {
  const pkg =
    JSON.parse(
      await source(
        'package.json',
      ),
    );

  assert.equal(
    pkg.scripts[
      'test:category19'
    ],
    'node --test tests/category-19-automation-workflows.test.mjs',
  );

  assert.match(
    pkg.scripts[
      'test:all'
    ],
    /test:category19/,
  );
});
