import test from 'node:test';
import assert from 'node:assert/strict';

import {
  readFile,
} from 'node:fs/promises';

import path from 'node:path';


const root =
  process.cwd();


async function source(
  file,
) {
  return (
    await readFile(
      path.join(
        root,
        file,
      ),
      'utf8',
    )
  ).replace(
    /\r\n/g,
    '\n',
  );
}


test('enterprise catalog covers every non-dedicated app schema exactly once', async () => {
  const catalog =
    await source(
      'lib/apps/enterprise/catalog.ts',
    );

  const keys =
    [
      ...catalog.matchAll(
        /^  ([a-z][a-z0-9_]*): \[/gm,
      ),
    ].map(
      match =>
        match[1],
    );

  assert.equal(
    keys.length,
    78,
  );

  assert.equal(
    new Set(
      keys,
    ).size,
    78,
  );

  assert.ok(
    !keys.includes(
      'invoicing',
    ),
  );

  assert.ok(
    !keys.includes(
      'sales',
    ),
  );

  for (
    const key
    of [
      'accounting',
      'crm',
      'inventory',
      'payments',
      'payroll',
      'projects',
      'warehouse',
      'helpdesk',
      'ecommerce',
      'marketing_automation',
    ]
  ) {
    assert.ok(
      keys.includes(
        key,
      ),
      key,
    );
  }
});


test('generic module contract upgrades thin manifests with enterprise permissions and extension hooks', async () => {
  const [
    contract,
    firstParty,
  ] = await Promise.all([
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/modules/first-party.ts',
    ),
  ]);

  assert.match(
    contract,
    /\.record\.view/,
  );

  assert.match(
    contract,
    /\.record\.create/,
  );

  assert.match(
    contract,
    /\.record\.edit/,
  );

  assert.match(
    contract,
    /\.record\.delete/,
  );

  assert.match(
    contract,
    /\.record\.report/,
  );

  assert.match(
    contract,
    /\.record\.settings/,
  );

  assert.match(
    contract,
    /scope:[\s\S]*'company'/,
  );

  assert.match(
    contract,
    /dashboard:[\s\S]*true/,
  );

  assert.match(
    contract,
    /search:[\s\S]*true/,
  );

  assert.match(
    contract,
    /activity:[\s\S]*true/,
  );

  assert.match(
    contract,
    /aiTools:[\s\S]*true/,
  );

  assert.match(
    contract,
    /apiEndpoints:[\s\S]*true/,
  );

  assert.match(
    firstParty,
    /BASE_FIRST_PARTY_SAMI_MODULES\.map\([\s\S]*withEnterpriseModuleDefaults/s,
  );
});


test('enterprise service derives workspace and company context server-side', async () => {
  const service =
    await source(
      'lib/apps/enterprise/service.ts',
    );

  assert.match(
    service,
    /getPermissionContext/,
  );

  assert.match(
    service,
    /requireCompanyContext/,
  );

  assert.match(
    service,
    /permissions\.tenantId !==[\s\S]*company\.tenantId/s,
  );

  assert.match(
    service,
    /getTenantPoolByTenantId\([\s\S]*permissions\.tenantId/s,
  );

  assert.doesNotMatch(
    service,
    /input\.tenantId|input\.companyId/,
  );

  assert.match(
    service,
    /tenant_modules/,
  );

  assert.match(
    service,
    /getWorkspaceSubscriptionAccessState/,
  );
});


test('enterprise database access is restricted to code-owned tables and safe identifiers', async () => {
  const [
    service,
    catalog,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/apps/enterprise/catalog.ts',
    ),
  ]);

  assert.match(
    service,
    /enterpriseModuleTables/,
  );

  assert.match(
    service,
    /TABLE_NOT_ALLOWED/,
  );

  assert.match(
    service,
    /IDENTIFIER/,
  );

  assert.match(
    service,
    /quoteIdentifier/,
  );

  assert.match(
    service,
    /information_schema\.columns/,
  );

  assert.match(
    catalog,
    /ENTERPRISE_MODULE_TABLES/,
  );

  assert.doesNotMatch(
    service,
    /DELETE\s+FROM/i,
    'The generic engine must never hard-delete business records.',
  );

  assert.match(
    service,
    /deleted_at = NOW\(\)/,
  );
});


test('enterprise engine hides secret-like fields and never accepts control-scope fields as writable values', async () => {
  const service =
    await source(
      'lib/apps/enterprise/service.ts',
    );

  assert.match(
    service,
    /SENSITIVE_COLUMN/,
  );

  for (
    const protectedField
    of [
      'id',
      'company_id',
      'tenant_id',
      'created_at',
      'updated_at',
      'deleted_at',
      'created_by',
      'updated_by',
    ]
  ) {
    assert.ok(
      service.includes(
        "'" +
        protectedField +
        "'",
      ),
      protectedField,
    );
  }

  assert.match(
    service,
    /field\.writable/,
  );

  assert.match(
    service,
    /company_id/,
  );
});


test('enterprise app API uses same-origin protection and bounded request bodies', async () => {
  const api =
    await source(
      'app/api/apps/[appKey]/records/route.ts',
    );

  assert.match(
    api,
    /sec-fetch-site/,
  );

  assert.match(
    api,
    /MAX_BODY_BYTES/,
  );

  assert.match(
    api,
    /createEnterpriseModuleRecord/,
  );

  assert.match(
    api,
    /updateEnterpriseModuleRecord/,
  );

  assert.match(
    api,
    /deleteEnterpriseModuleRecord/,
  );

  assert.match(
    api,
    /Cache-Control/,
  );
});


test('generic app workspace is operational instead of an installed-app placeholder', async () => {
  const [
    page,
    client,
  ] = await Promise.all([
    source(
      'app/apps/[appKey]/page.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  assert.match(
    page,
    /getEnterpriseModuleWorkspace/,
  );

  assert.match(
    page,
    /EnterpriseModuleWorkspaceClient/,
  );

  assert.doesNotMatch(
    page,
    /Additional features for this app will appear here as they become available/,
  );

  assert.match(
    client,
    /WorkspaceTutorial/,
  );

  assert.match(
    client,
    /SaMiOverlay/,
  );

  assert.match(
    client,
    /New record/,
  );

  assert.match(
    client,
    /Reports/,
  );

  assert.match(
    client,
    /Settings/,
  );

  assert.match(
    client,
    /overflow-x-auto/,
  );

  assert.match(
    client,
    /Export/,
  );
});


test('enterprise search providers cover the code-owned module catalog', async () => {
  const [
    enterpriseSearch,
    registry,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/search.ts',
    ),
    source(
      'lib/search/registry.ts',
    ),
  ]);

  assert.match(
    enterpriseSearch,
    /ENTERPRISE_MODULE_TABLES/,
  );

  assert.match(
    enterpriseSearch,
    /searchEnterpriseModuleRecords/,
  );

  assert.match(
    registry,
    /ENTERPRISE_MODULE_SEARCH_PROVIDERS/,
  );
});


test('SaMi AI has a bounded suite-wide read bridge instead of raw database access', async () => {
  const [
    enterpriseAi,
    registry,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/ai-tools.ts',
    ),
    source(
      'lib/ai/tool-registry.ts',
    ),
  ]);

  assert.match(
    enterpriseAi,
    /workspace_app_summary/,
  );

  assert.match(
    enterpriseAi,
    /workspace_app_search/,
  );

  assert.match(
    enterpriseAi,
    /accessibleModuleKeys/,
  );

  assert.match(
    enterpriseAi,
    /getEnterpriseModuleWorkspace/,
  );

  assert.match(
    enterpriseAi,
    /searchEnterpriseModuleRecords/,
  );

  assert.match(
    registry,
    /ENTERPRISE_SUITE_AI_TOOLS/,
  );

  assert.doesNotMatch(
    enterpriseAi,
    /queryControl|queryTenant|SELECT \*/,
    'AI must go through the permission-aware module service rather than raw SQL.',
  );
});


test('enterprise engine preserves dedicated Invoicing and Sales ownership boundaries', async () => {
  const [
    contract,
    catalog,
  ] = await Promise.all([
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/apps/enterprise/catalog.ts',
    ),
  ]);

  assert.match(
    contract,
    /manifest\.key ===[\s\S]*'invoicing'[\s\S]*manifest\.key ===[\s\S]*'sales'/s,
  );

  assert.doesNotMatch(
    catalog,
    /^  invoicing:/m,
  );

  assert.doesNotMatch(
    catalog,
    /^  sales:/m,
  );
});


test('enterprise v2 hardening adds company and audit boundaries to legacy app schemas and upgrade paths', async () => {
  const [
    hardening,
    contract,
    lifecycle,
    migrations,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/hardening.ts',
    ),
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/services/workspace-app-lifecycle.ts',
    ),
    source(
      'lib/modules/migrations.ts',
    ),
  ]);

  assert.match(
    hardening,
    /ADD COLUMN IF NOT EXISTS company_id UUID/,
  );

  assert.match(
    hardening,
    /ADD COLUMN IF NOT EXISTS created_by UUID/,
  );

  assert.match(
    hardening,
    /ADD COLUMN IF NOT EXISTS updated_by UUID/,
  );

  assert.match(
    hardening,
    /ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ/,
  );

  assert.match(
    hardening,
    /company_count = 1/,
  );

  assert.match(
    hardening,
    /WHERE company_id IS NULL/,
  );

  assert.match(
    contract,
    /manifest\.version ===[\s\S]*'1\.0\.0'[\s\S]*'2\.0\.0'/s,
  );

  assert.match(
    lifecycle,
    /appendEnterpriseSchemaHardening/,
  );

  assert.match(
    migrations,
    /ENTERPRISE_SUITE_MIGRATIONS/,
  );
});


test('enterprise runtime fails closed until every business table has completed boundary hardening', async () => {
  const service =
    await source(
      'lib/apps/enterprise/service.ts',
    );

  assert.match(
    service,
    /function assertEnterpriseTableBoundaryReady/,
  );

  assert.match(
    service,
    /missingBoundaryColumns/,
  );

  assert.match(
    service,
    /'company_id'[\s\S]*'deleted_at'/s,
  );

  const readTableStart =
    service.indexOf(
      'async function readTable',
    );

  const workspaceStart =
    service.indexOf(
      'export async function getEnterpriseModuleWorkspace',
      readTableStart,
    );

  const readTable =
    service.slice(
      readTableStart,
      workspaceStart,
    );

  assert.match(
    readTable,
    /assertEnterpriseTableBoundaryReady\([\s\S]*table[\s\S]*fields/s,
    'Workspace reads must stop before querying an unhardened business table.',
  );

  const assertTableStart =
    service.indexOf(
      'async function assertTable',
    );

  const writableStart =
    service.indexOf(
      'function writableValues',
      assertTableStart,
    );

  const assertTable =
    service.slice(
      assertTableStart,
      writableStart,
    );

  assert.match(
    assertTable,
    /assertEnterpriseTableBoundaryReady\([\s\S]*table[\s\S]*fields/s,
    'CRUD must reject stale schemas before accepting a business mutation.',
  );

  const searchStart =
    service.indexOf(
      'export async function searchEnterpriseModuleRecords',
    );

  const search =
    service.slice(
      searchStart,
    );

  assert.match(
    search,
    /assertEnterpriseTableBoundaryReady\([\s\S]*table[\s\S]*fields/s,
    'Global Search and SaMi AI search bridges must not read an unhardened table.',
  );

  assert.match(
    service,
    /!relation\.companyScoped[\s\S]*!relation\.softDelete/s,
    'Cross-app relation targets must have the same company and soft-delete boundary before selectors or validation can use them.',
  );
});


test('enterprise domain profiles give every shared app an operating model and live workflow KPIs', async () => {
  const [
    catalog,
    profiles,
    service,
    client,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/catalog.ts',
    ),
    source(
      'lib/apps/enterprise/domain-profiles.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  const keys =
    [
      ...catalog.matchAll(
        /^\s{2}([a-z][a-z0-9_]*): \[/gm,
      ),
    ].map(
      match =>
        match[1],
    );

  assert.equal(
    keys.length,
    78,
  );

  for (
    const key
    of keys
  ) {
    assert.match(
      profiles,
      new RegExp(
        '"' +
        key +
        '"\\s*:',
      ),
      key,
    );
  }

  assert.match(
    profiles,
    /satisfies[\s\S]*Record<[\s\S]*EnterpriseModuleKey/s,
  );

  assert.match(
    service,
    /getEnterpriseDomainProfile/,
  );

  assert.match(
    service,
    /workflowTrackedRecords/,
  );

  assert.match(
    service,
    /GROUP BY[\s\S]*field\.key/s,
  );

  for (
    const marker
    of [
      'Needs attention',
      'Operating focus',
      'Operating health',
      'Workflow distribution',
      'primary operating register',
    ]
  ) {
    assert.ok(
      client.includes(
        marker,
      ),
      marker,
    );
  }
});


test('enterprise lifecycle stages and core business invariants are governed transactionally', async () => {
  const [
    service,
    automation,
    policy,
    hooks,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/apps/enterprise/automation.ts',
    ),
    source(
      'lib/apps/enterprise/workflow-policy.ts',
    ),
    source(
      'lib/apps/enterprise/domain-hooks.ts',
    ),
  ]);

  assert.match(
    service,
    /\(status\|state\|stage\)/,
  );

  assert.match(
    automation,
    /\(status\|state\|stage\)/,
  );

  assert.match(
    policy,
    /'recruitment:applicants'[\s\S]*applied:[\s\S]*screening/s,
  );

  for (
    const marker
    of [
      'Posted journals are immutable',
      'Lines on a posted journal are immutable',
      'Purchase-order lines cannot change after the order leaves draft',
      'Expense amount',
      'Payment amount',
      'Payroll deductions',
      'Leave end date cannot be before the start date',
      'Project due date cannot be before the start date',
    ]
  ) {
    assert.ok(
      hooks.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    hooks,
    /validateDomainLifecycleMutation\([\s\S]*validateDomainRow\(/s,
    'Domain validation must execute inside the same transaction as the business mutation.',
  );
});


test('enterprise suite uses one audited workflow engine across business modules', async () => {
  const [
    service,
    policy,
    api,
    client,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/apps/enterprise/workflow-policy.ts',
    ),
    source(
      'app/api/apps/[appKey]/records/route.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  assert.match(
    service,
    /transitionEnterpriseModuleRecord/,
  );

  assert.match(
    service,
    /getDatabaseWorkflowValues/,
  );

  assert.match(
    service,
    /recordEnterpriseAudit/,
  );

  assert.match(
    service,
    /workflow\.transitioned/,
  );

  for (
    const domain
    of [
      'accounting:journals',
      'expenses:expenses',
      'time_off:leave_requests',
      'helpdesk:support_tickets',
      'purchase:purchase_orders',
      'manufacturing:manufacturing_orders',
      'recruitment:applicants',
      'shipping:shipments',
      'ecommerce:storefront_orders',
    ]
  ) {
    assert.ok(
      policy.includes(
        "'" +
        domain +
        "'",
      ),
      domain,
    );
  }

  assert.match(
    service,
    /balanced debit and credit lines/,
  );

  assert.match(
    service,
    /Record produced quantity before completing a manufacturing order/,
  );

  assert.match(
    api,
    /'transition'/,
  );

  assert.match(
    client,
    /WorkflowActions/,
  );

  assert.match(
    client,
    /Change workflow state\?/,
  );
});


test('enterprise record mutations are audited without turning audit failure into duplicate business writes', async () => {
  const service =
    await source(
      'lib/apps/enterprise/service.ts',
    );

  assert.match(
    service,
    /async function recordEnterpriseAudit/,
  );

  assert.match(
    service,
    /audit write failed/,
  );

  assert.match(
    service,
    /\.record\.created/,
  );

  assert.match(
    service,
    /\.record\.updated/,
  );

  assert.match(
    service,
    /\.record\.deleted/,
  );

  assert.doesNotMatch(
    service,
    /await recordWorkspaceAuditEvent\(\{/,
    'CRUD should use the non-fatal enterprise audit wrapper so a logging fault does not make a successful write look failed.',
  );
});


test('enterprise domain hooks keep inventory and commercial aggregates consistent', async () => {
  const [
    service,
    hooks,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/apps/enterprise/domain-hooks.ts',
    ),
  ]);

  assert.match(
    service,
    /COMPUTED_COLUMNS/,
  );

  assert.match(
    service,
    /!\/\(\^\|_\)\(status\|state\)\$\//,
  );

  assert.match(
    service,
    /applyDomainValueRules/,
  );

  assert.match(
    service,
    /runDomainSideEffects/,
  );

  assert.match(
    hooks,
    /stock_movements/,
  );

  assert.match(
    hooks,
    /Insufficient stock for this movement/,
  );

  assert.match(
    hooks,
    /purchase_order_items/,
  );

  assert.match(
    hooks,
    /cpq_quote_lines/,
  );

  assert.match(
    hooks,
    /storefront_order_lines/,
  );

  assert.match(
    hooks,
    /shop_order_items/,
  );

  assert.match(
    hooks,
    /restaurant_order_items/,
  );

  assert.match(
    hooks,
    /payroll_run_lines/,
  );

  assert.match(
    hooks,
    /Posted stock movements are immutable/,
  );
});


test('enterprise domain side effects execute inside the same transaction as record writes', async () => {
  const service =
    await source(
      'lib/apps/enterprise/service.ts',
    );

  assert.match(
    service,
    /operation:\s*'create'/,
    'create',
  );

  assert.match(
    service,
    /operation:\s*'update'/,
    'update',
  );

  assert.match(
    service,
    /operation:\s*'delete'/,
    'delete',
  );

  assert.match(
    service,
    /await client\.query\([\s\S]*'BEGIN'[\s\S]*runDomainSideEffects[\s\S]*'COMMIT'/s,
  );

  assert.match(
    service,
    /'ROLLBACK'/,
  );
});


test('enterprise suite registers company-scoped business automation triggers and approved write actions', async () => {
  const [
    contract,
    registry,
    automation,
  ] = await Promise.all([
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/automation/registry.ts',
    ),
    source(
      'lib/apps/enterprise/automation.ts',
    ),
  ]);

  assert.match(
    contract,
    /automationTriggers:[\s\S]*true/,
  );

  assert.match(
    contract,
    /automationActions:[\s\S]*true/,
  );

  assert.match(
    registry,
    /ENTERPRISE_AUTOMATION_TRIGGERS/,
  );

  assert.match(
    registry,
    /ENTERPRISE_AUTOMATION_ACTIONS/,
  );

  assert.match(
    registry,
    /ENTERPRISE_AUTOMATION_ACTION_HANDLERS/,
  );

  for (
    const suffix
    of [
      '.record.created',
      '.record.updated',
      '.record.deleted',
      '.workflow.transitioned',
      '.record.create',
      '.record.update',
    ]
  ) {
    assert.ok(
      automation.includes(
        suffix,
      ),
      suffix,
    );
  }

  assert.match(
    automation,
    /approvalPolicy:[\s\S]*'always'/,
  );

  assert.match(
    automation,
    /context\.companyId|runtime\.companyId/,
  );

  assert.match(
    automation,
    /assertEnterpriseDomainMutationAllowed/,
  );

  assert.match(
    automation,
    /normalizeEnterpriseDomainValues/,
  );

  assert.match(
    automation,
    /applyEnterpriseDomainSideEffects/,
  );

  assert.match(
    automation,
    /COMPUTED_COLUMNS/,
  );

  assert.match(
    automation,
    /\(\^\|_\)\(status\|state\)\$/,
  );
});


test('enterprise business events enter Automation only after successful business writes and never make saves look failed', async () => {
  const [
    service,
    events,
    engine,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/automation/business-events.ts',
    ),
    source(
      'lib/automation/execution-engine.ts',
    ),
  ]);

  assert.match(
    service,
    /dispatchBusinessAutomationEventSafely/,
  );

  assert.match(
    service,
    /\.record\.created/,
  );

  assert.match(
    service,
    /\.record\.updated/,
  );

  assert.match(
    service,
    /\.record\.deleted/,
  );

  assert.match(
    service,
    /\.workflow\.transitioned/,
  );

  assert.match(
    service,
    /await client\.query\([\s\S]*'COMMIT'[\s\S]*emitEnterpriseAutomationEvent/s,
  );

  assert.match(
    events,
    /w\.status =[\s\S]*'active'/s,
  );

  assert.match(
    events,
    /v\.trigger_key/,
  );

  assert.match(
    events,
    /v\.trigger_module/,
  );

  assert.match(
    events,
    /LIMIT 100/,
  );

  assert.match(
    events,
    /dispatchBusinessAutomationEventSafely/,
  );

  assert.match(
    engine,
    /source_module/,
  );

  assert.match(
    engine,
    /source_record_type/,
  );

  assert.match(
    engine,
    /source_record_id/,
  );
});


test('tutorial preference is durable across the full workspace suite', async () => {
  const [
    migrationManifest,
    migration,
    account,
    preferencesApi,
    tutorial,
    shell,
    genericWorkspace,
    invoicingWorkspace,
    salesWorkspace,
    settings,
  ] = await Promise.all([
    source(
      'lib/schema/control-migrations/manifest.ts',
    ),
    source(
      'lib/schema/control-migrations/008-user-tutorial-preferences.sql',
    ),
    source(
      'lib/account/user-account.ts',
    ),
    source(
      'app/api/account/preferences/route.ts',
    ),
    source(
      'app/components/workspace/WorkspaceTutorial.tsx',
    ),
    source(
      'app/components/workspace/WorkspaceShell.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
    source(
      'app/apps/invoicing/InvoicingWorkspaceClient.tsx',
    ),
    source(
      'app/apps/sales/SalesWorkspaceClient.tsx',
    ),
    source(
      'app/settings/components/MyAccountSettings.tsx',
    ),
  ]);

  assert.match(
    migrationManifest,
    /008-user-tutorial-preferences\.sql/,
  );

  assert.match(
    migration,
    /ADD COLUMN IF NOT EXISTS tutorials_enabled BOOLEAN NOT NULL DEFAULT TRUE/,
  );

  assert.match(
    account,
    /tutorialsEnabled:\s*boolean/,
  );

  assert.match(
    account,
    /p\.tutorials_enabled/,
  );

  assert.match(
    account,
    /tutorials_enabled =/,
  );

  assert.match(
    preferencesApi,
    /tutorialsEnabled/,
  );

  assert.match(
    tutorial,
    /\/api\/account\/preferences/,
  );

  assert.match(
    tutorial,
    /method:\s*'PATCH'/,
  );

  assert.match(
    tutorial,
    /syncWorkspaceTutorialPreference/,
  );

  assert.match(
    shell,
    /WorkspaceTutorialToggle/,
  );

  assert.match(
    genericWorkspace,
    /WorkspaceTutorial/,
  );

  assert.match(
    invoicingWorkspace,
    /moduleKey="invoicing"/,
  );

  assert.match(
    salesWorkspace,
    /moduleKey="sales"/,
  );

  assert.match(
    settings,
    /Workspace tutorials/,
  );
});


test('enterprise relationships use searchable company-scoped selectors instead of raw UUID entry', async () => {
  const [
    relations,
    service,
    route,
    client,
    automation,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/relations.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'app/api/apps/[appKey]/records/route.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
    source(
      'lib/apps/enterprise/automation.ts',
    ),
  ]);

  assert.match(
    relations,
    /information_schema\.table_constraints/,
  );

  assert.match(
    relations,
    /constraint_type[\s\S]*FOREIGN KEY/s,
  );

  assert.match(
    relations,
    /SAFE_RELATION_TABLES/,
  );

  assert.match(
    relations,
    /companyScoped/,
  );

  assert.ok(
    relations.includes(
      "'company_id = $' +",
    ),
    'Relation choices must be scoped to the current company when the referenced table has company_id.',
  );

  assert.match(
    relations,
    /deleted_at IS NULL/,
  );

  assert.match(
    relations,
    /validateEnterpriseRelationValues/,
  );

  assert.match(
    service,
    /relation:[\s\S]*label/s,
  );

  assert.match(
    service,
    /getEnterpriseModuleRelationOptions/,
  );

  assert.match(
    service,
    /await assertRelationValues\(/,
  );

  assert.match(
    route,
    /mode[\s\S]*relation/s,
  );

  assert.match(
    client,
    /function RelationField/,
  );

  assert.match(
    client,
    /Search [^]*current company/i,
  );

  assert.match(
    client,
    /URLSearchParams/,
  );

  assert.match(
    automation,
    /validateEnterpriseRelationValues/,
    'Automation must not bypass current-company relationship validation.',
  );
});


test('enterprise create retries are durably idempotent across generic apps', async () => {
  const [
    hardening,
    idempotency,
    service,
    client,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/hardening.ts',
    ),
    source(
      'lib/apps/enterprise/idempotency.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  for (
    const marker
    of [
      'sami_enterprise_idempotency',
      'idempotency_key UUID NOT NULL',
      'request_hash CHAR(64) NOT NULL',
      'response_json JSONB',
      'PRIMARY KEY',
    ]
  ) {
    assert.ok(
      hardening.includes(
        marker,
      ),
      marker,
    );
  }

  assert.ok(
    idempotency.includes(
      'ON CONFLICT ('
    ),
    'Create request reservation must use a durable unique conflict boundary.',
  );

  assert.ok(
    idempotency.includes(
      'hashEnterpriseCreateRequest'
    ),
  );

  assert.ok(
    idempotency.includes(
      'This create request key was already used for different data.'
    ),
  );

  assert.ok(
    idempotency.includes(
      "INTERVAL '14 days'"
    ),
    'Old idempotency receipts should be pruned by bounded retention.',
  );

  assert.ok(
    service.includes(
      'normalizeEnterpriseIdempotencyKey'
    ),
  );

  assert.ok(
    service.includes(
      'reserveEnterpriseCreateRequest'
    ),
  );

  assert.ok(
    service.includes(
      'completeEnterpriseCreateRequest'
    ),
  );

  assert.ok(
    service.includes(
      'if (\n    replayed\n  ) {\n    return created;'
    ),
    'A replay must return the prior response without duplicating audit or automation events.',
  );

  assert.ok(
    client.includes(
      'randomUUID()'
    ),
  );

  assert.ok(
    client.includes(
      'idempotencyKey:'
    ),
  );
});
