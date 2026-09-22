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

test('Category 19: automation migration remains additive in the current tenant-core chain', async () => {
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
    /CURRENT_TENANT_CORE_VERSION\s*=\s*['"][0-9]+\.[0-9]+\.[0-9]+['"]/s,
    'The migration chain must continue to declare a current tenant-core version.',
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
    /lease_token/,
  );
  assert.match(
    migration,
    /run_as_user_id/,
  );
  assert.match(
    migration,
    /interval_seconds/,
  );
  assert.match(
    migration,
    /schedule_kind/,
  );
  assert.match(
    migration,
    /VALUES \('1\.6\.0'/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.automation_workflows/,
  );
  assert.match(
    core,
    /CREATE TABLE IF NOT EXISTS \{schema\}\.core_schema_version/,
    'The current tenant core must retain version tracking without freezing Category 19 to a later category version.',
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
  const [
    service,
    engine,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-automation.ts',
      ),
      source(
        'lib/automation/execution-engine.ts',
      ),
    ]).then(
      ([
        serviceSource,
        engineSource,
      ]) => [
        compact(
          serviceSource,
        ),
        compact(
          engineSource,
        ),
      ],
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
    engine,
    /v\.version = w\.active_version/,
    'Runs must load the explicitly active version, never the latest draft.',
  );
});

test('Category 19: manual, scheduled, approval and retry paths share one durable execution engine', async () => {
  const [
    service,
    engine,
  ] =
    await Promise.all([
      source(
        'lib/services/workspace-automation.ts',
      ),
      source(
        'lib/automation/execution-engine.ts',
      ),
    ]);

  assert.match(
    service,
    /runWorkspaceAutomationManually/,
  );
  assert.match(
    service,
    /startAutomationRun/,
  );
  assert.match(
    service,
    /resolveWorkspaceAutomationApproval/,
  );
  assert.match(
    service,
    /resumeAutomationRun/,
  );

  assert.match(
    engine,
    /INSERT INTO automation_events/,
  );
  assert.match(
    engine,
    /INSERT INTO automation_runs/,
  );
  assert.match(
    engine,
    /INSERT INTO automation_run_steps/,
  );
  assert.match(
    engine,
    /INSERT INTO automation_approvals/,
  );
  assert.match(
    engine,
    /getAccessibleAutomationAction/,
  );
  assert.match(
    engine,
    /getAutomationActionHandler/,
  );
  assert.match(
    engine,
    /ACTION_UNAVAILABLE/,
  );
  assert.match(
    engine,
    /idempotencyKey/,
  );
  assert.match(
    engine,
    /correlationId/,
  );
  assert.match(
    engine,
    /next_retry_at/,
  );
  assert.match(
    engine,
    /lease_until/,
  );
  assert.match(
    engine,
    /resumeAutomationRun/,
  );

  assert.doesNotMatch(
    service +
      engine,
    /rawSql|executeSql|eval\(|new Function|puppeteer|playwright/i,
  );
});

test('Category 19: browser APIs are narrow, same-origin protected and no-cache', async () => {
  const [
    helper,
    collection,
    item,
    approval,
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
      source(
        'app/api/workspace/automation/approvals/[approvalId]/route.ts',
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
  assert.match(
    approval,
    /resolveWorkspaceAutomationApproval/,
  );
  assert.match(
    approval,
    /rejectAutomationCrossOrigin/,
  );

  assert.doesNotMatch(
    collection +
      item +
      approval,
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
    /Pending approvals/,
  );
  assert.match(
    client,
    /Repeat every \(minutes\)/,
  );
  assert.match(
    client,
    /approvalDecision/,
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

test('Category 19: scheduled and retry workers revalidate live authority and use leases', async () => {
  const [
    worker,
    workerContext,
    registry,
    internalRoute,
  ] =
    await Promise.all([
      source(
        'lib/automation/worker.ts',
      ),
      source(
        'lib/automation/worker-context.ts',
      ),
      source(
        'lib/automation/registry.ts',
      ),
      source(
        'app/api/internal/automation/tick/route.ts',
      ),
    ]);

  assert.match(
    workerContext,
    /resolvePermissionContext/,
  );
  assert.match(
    workerContext,
    /requireCompanyAccess/,
  );
  assert.match(
    workerContext,
    /AUTOMATION_MANAGE/,
  );
  assert.match(
    workerContext,
    /resolveWorkspaceShellAccess/,
  );
  assert.match(
    workerContext,
    /accessibleModuleKeys/,
  );

  assert.match(
    worker,
    /FOR UPDATE[\s\S]*SKIP LOCKED/,
  );
  assert.match(
    worker,
    /lease_token/,
  );
  assert.match(
    worker,
    /lease_until/,
  );
  assert.match(
    worker,
    /runDueSchedulesForTenant/,
  );
  assert.match(
    worker,
    /runDueRetriesForTenant/,
  );
  assert.match(
    worker,
    /resolveAutomationWorkerRuntime/,
  );
  assert.match(
    worker,
    /startAutomationRun/,
  );
  assert.match(
    worker,
    /resumeAutomationRun/,
  );
  assert.match(
    worker,
    /schedule:\$\{workflowId\}:\$\{scheduledFor\}/,
  );
  assert.match(
    worker,
    /windowNumber/,
    'Tenant batches must rotate instead of permanently favoring the first workspaces.',
  );
  assert.match(
    worker,
    /NOT EXISTS \([\s\S]*automation_runs/,
    'Scheduled workflows must not overlap an existing running, approval-waiting, or retry-waiting run.',
  );
  assert.match(
    worker,
    /expireApprovalsForTenant/,
  );
  assert.match(
    worker,
    /status =\s*'expired'/,
  );
  assert.match(
    worker,
    /status =\s*'cancelled'/,
  );

  assert.match(
    registry,
    /SAMI_AUTOMATION_WORKER_ENABLED/,
  );
  assert.match(
    registry,
    /core\.schedule/,
  );

  assert.match(
    internalRoute,
    /SAMI_AUTOMATION_WORKER_SECRET/,
  );
  assert.match(
    internalRoute,
    /CRON_SECRET/,
  );
  assert.match(
    internalRoute,
    /authorization/,
  );
  assert.match(
    internalRoute,
    /isAutomationWorkerEnabled/,
  );
  assert.doesNotMatch(
    internalRoute,
    /tenantId|workspaceId|companyId/,
    'The internal worker endpoint must never accept a browser-selected workspace/company target.',
  );
});

test('Category 19: schedule definitions are bounded and human approvals do not grant business authority', async () => {
  const [
    definition,
    registry,
    service,
  ] =
    await Promise.all([
      source(
        'lib/automation/definition.ts',
      ),
      source(
        'lib/automation/registry.ts',
      ),
      source(
        'lib/services/workspace-automation.ts',
      ),
    ]);

  assert.match(
    definition,
    /intervalMinutes/,
  );
  assert.match(
    definition,
    /43_200/,
  );
  assert.match(
    definition,
    /Intl\.DateTimeFormat/,
  );
  assert.doesNotMatch(
    definition,
    /cron-parser|eval\(|new Function/,
  );

  assert.match(
    registry,
    /approvalPolicy:\s*['"]optional['"]/,
  );

  assert.match(
    service,
    /AUTOMATION_APPROVAL_PERMISSION_REQUIRED/,
  );
  assert.match(
    service,
    /requiredPermissions\.every/,
  );
  assert.match(
    service,
    /resolveAutomationWorkerRuntime/,
    'Approval must resume under the original run-as user live authority.',
  );
  assert.match(
    service,
    /run_as_user_id/,
  );
  assert.match(
    service,
    /automation_schedules/,
  );
});

test('Category 19: internal worker configuration is documented without becoming workspace UI', async () => {
  const doc =
    await source(
      'docs/automation-runtime.md',
    );

  assert.match(
    doc,
    /SAMI_AUTOMATION_WORKER_ENABLED/,
  );
  assert.match(
    doc,
    /SAMI_AUTOMATION_WORKER_SECRET/,
  );
  assert.match(
    doc,
    /GET \/api\/internal\/automation\/tick/,
  );
  assert.match(
    doc,
    /accepts no tenant, workspace, company, user, action, SQL, or workflow selector/i,
  );
  assert.match(
    doc,
    /active_version/,
  );
  assert.match(
    doc,
    /latest_version/,
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
