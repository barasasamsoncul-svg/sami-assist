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
    rootPage,
    sectionPage,
    serverPage,
    client,
  ] = await Promise.all([
    source(
      'app/apps/[appKey]/page.tsx',
    ),
    source(
      'app/apps/[appKey]/[section]/page.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModulePage.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  assert.match(
    rootPage,
    /EnterpriseModulePage/,
  );

  assert.match(
    sectionPage,
    /EnterpriseModulePage/,
  );

  assert.match(
    serverPage,
    /getEnterpriseModuleWorkspace/,
  );

  assert.match(
    serverPage,
    /EnterpriseModuleWorkspaceClient/,
  );

  assert.doesNotMatch(
    serverPage,
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
    /singularLabel/,
  );

  assert.match(
    client,
    /New \{/,
    'Generic app create actions should use the business register noun instead of a database-shaped "New record" label.',
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


test('enterprise manifests expose every owned register as a first-class resource', async () => {
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
    /enterpriseModuleTables/,
  );

  assert.match(
    contract,
    /resourceKeyForTable/,
  );

  assert.match(
    contract,
    /\.\.\.tables\.map/,
  );

  assert.match(
    contract,
    /\n\s*table,\n\s*companyScoped:/,
    'Every generated resource must bind to its concrete schema table.',
  );

  assert.match(
    contract,
    /\.list'/,
  );

  assert.match(
    contract,
    /\.form'/,
  );

  const moduleKeys =
    [
      ...catalog.matchAll(
        /^\s{2}([a-z][a-z0-9_]*): \[/gm,
      ),
    ].map(
      match =>
        match[1],
    );

  assert.equal(
    moduleKeys.length,
    78,
  );
});


test('enterprise completion layer provides scalable views reporting and personal activity', async () => {
  const [
    service,
    api,
    client,
    contract,
  ] = await Promise.all([
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
      'lib/modules/enterprise-contract.ts',
    ),
  ]);

  for (
    const marker
    of [
      'queryEnterpriseModuleTable',
      'pageSize',
      'hasMore',
      'numericMetrics',
      'listWorkspaceActivity',
    ]
  ) {
    assert.ok(
      service.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    api,
    /action ===[\s\S]*'list'[\s\S]*queryEnterpriseModuleTable/s,
  );

  for (
    const marker
    of [
      'Kanban',
      'Calendar',
      'Search all',
      'Load more records',
      'Numeric performance',
      'ModuleActivity',
      'My activity in',
    ]
  ) {
    assert.ok(
      client.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    contract,
    /\.\.\.tables\.map/,
  );

  assert.match(
    contract,
    /recordPolicies:[\s\S]*resourceKeyForTable/s,
  );

  assert.doesNotMatch(
    contract,
    /resourceKey:\s*'record'/,
    'Enterprise policies must not point back to the obsolete generic record resource.',
  );
});


test('enterprise sensitive business fields require module-administration access', async () => {
  const [
    security,
    service,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/field-security.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
  ]);

  for (
    const marker
    of [
      'employees:employees',
      'salary',
      'payroll:payroll_employees',
      'basic_salary',
      'marketplace:marketplace_sellers',
      'payout_account',
      '.record.settings',
    ]
  ) {
    assert.ok(
      security.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    security,
    /context\.isOwner[\s\S]*permissionSet\.has/s,
  );

  assert.match(
    service,
    /filterEnterpriseFieldsForAccess/,
  );

  assert.match(
    service,
    /rowOutput\([\s\S]*fields\?/s,
  );

  assert.match(
    service,
    /rowOutput\([\s\S]*context\.fields/s,
  );

  assert.match(
    service,
    /filterEnterpriseFieldsForAccess\([\s\S]*context\.permissions/s,
  );
});


test('enterprise search providers cover the code-owned module catalog', async () => {
  const [
    enterpriseSearch,
    registry,
    runtimeSearch,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/search.ts',
    ),
    source(
      'lib/search/registry.ts',
    ),
    source(
      'lib/apps/runtime-search.ts',
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
    /APP_RUNTIME_SEARCH_PROVIDERS/,
  );

  assert.match(
    runtimeSearch,
    /ENTERPRISE_MODULE_SEARCH_PROVIDERS/,
  );
});


test('SaMi AI has a bounded suite-wide read bridge instead of raw database access', async () => {
  const [
    enterpriseAi,
    registry,
    runtimeAi,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/ai-tools.ts',
    ),
    source(
      'lib/ai/tool-registry.ts',
    ),
    source(
      'lib/apps/runtime-ai.ts',
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
    /APP_RUNTIME_AI_TOOLS/,
  );

  assert.match(
    runtimeAi,
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
      'lib/apps/runtime-migrations.ts',
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


test('enterprise 2.1 completion gives every shared app collaboration, customization, saved views and bulk operations', async () => {
  const [
    hardening,
    completion,
    api,
    service,
    client,
    panel,
    controls,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/hardening.ts',
    ),
    source(
      'lib/apps/enterprise/completion.ts',
    ),
    source(
      'app/api/apps/[appKey]/records/route.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseRecordWorkspacePanel.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseRegisterControls.tsx',
    ),
  ]);

  for (
    const marker
    of [
      'sami_enterprise_record_notes',
      'sami_enterprise_record_tasks',
      'sami_enterprise_saved_views',
      'sami_enterprise_custom_fields',
      'sami_enterprise_record_extras',
      "fromVersion:\n        '2.0.0'",
      "toVersion:\n        '2.1.0'",
    ]
  ) {
    assert.ok(
      hardening.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'getEnterpriseRecordCompletion',
      'getEnterpriseTableCompletion',
      'addEnterpriseRecordNote',
      'saveEnterpriseRecordTask',
      'saveEnterpriseSavedView',
      'saveEnterpriseCustomField',
      'updateEnterpriseRecordExtras',
      'linkEnterpriseRecordFile',
      'unlinkEnterpriseRecordFile',
      'recordWorkspaceAuditEvent',
      'listWorkspaceRecordFilesForAuthorizedCaller',
    ]
  ) {
    assert.ok(
      completion.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    completion,
    /requireEnterpriseModuleTableContext/,
  );

  assert.match(
    completion,
    /company_id = \$2|company_id = \$1/,
    'Completion storage must retain a current-company SQL boundary.',
  );

  for (
    const action
    of [
      'record_completion',
      'table_completion',
      'add_note',
      'save_task',
      'save_view',
      'save_custom_field',
      'update_extras',
      'link_file',
      'unlink_file',
      'bulk_create',
      'bulk_delete',
      'bulk_transition',
    ]
  ) {
    assert.ok(
      api.includes(
        action,
      ),
      action,
    );
  }

  for (
    const marker
    of [
      'ENTERPRISE_BULK_LIMIT',
      'bulkCreateEnterpriseModuleRecords',
      'bulkDeleteEnterpriseModuleRecords',
      'bulkTransitionEnterpriseModuleRecords',
    ]
  ) {
    assert.ok(
      service.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    service,
    /ENTERPRISE_BULK_LIMIT\s*=\s*\n?\s*50/,
  );

  for (
    const marker
    of [
      'Import CSV',
      'Delete selected',
      'Bulk workflow',
      'EnterpriseRegisterControls',
      'EnterpriseRecordWorkspacePanel',
      'Select all visible records',
      'Kanban',
      'Calendar',
    ]
  ) {
    assert.ok(
      client.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'Record workspace',
      'Notes',
      'Activities',
      'Files',
      'Fields & tags',
      'Timeline',
      'Watch record',
      'Attach file',
      'Save fields & tags',
    ]
  ) {
    assert.ok(
      panel.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'Saved views',
      'Save view',
      'Kanban',
      'Calendar',
      'table_completion',
    ]
  ) {
    assert.ok(
      controls.includes(
        marker,
      ),
      marker,
    );
  }
});


test('enterprise completion reuses private workspace storage and never invents an attachment bucket', async () => {
  const [
    completion,
    panel,
    links,
    storage,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/completion.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseRecordWorkspacePanel.tsx',
    ),
    source(
      'lib/services/workspace-file-links.ts',
    ),
    source(
      'lib/storage/object-storage.ts',
    ),
  ]);

  assert.match(
    completion,
    /linkWorkspaceFileForAuthorizedCaller/,
  );

  assert.match(
    completion,
    /unlinkWorkspaceFileForAuthorizedCaller/,
  );

  assert.match(
    completion,
    /listWorkspaceRecordFilesForAuthorizedCaller/,
  );

  assert.match(
    panel,
    /\/api\/workspace\/files\/upload-intent/,
  );

  assert.match(
    panel,
    /\/complete/,
  );

  assert.match(
    links,
    /file_links/,
  );

  assert.match(
    storage,
    /createPrivateUploadUrl/,
  );

  assert.doesNotMatch(
    completion,
    /S3Client|PutObjectCommand|R2_ACCESS_KEY_ID|SAMI_STORAGE_BUCKET/,
    'Business modules must not bypass the Category 14 storage service.',
  );
});


test('specialist ERP 2.2 deepens finance inventory payroll CRM projects helpdesk warehouse and manufacturing', async () => {
  const [
    specialistCatalog,
    specialistDepth,
    catalog,
    hardening,
    migrations,
    contract,
    workflow,
    hooks,
    fieldSecurity,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/specialist-catalog.ts',
    ),
    source(
      'lib/apps/enterprise/specialist-depth.ts',
    ),
    source(
      'lib/apps/enterprise/catalog.ts',
    ),
    source(
      'lib/apps/enterprise/hardening.ts',
    ),
    source(
      'lib/apps/runtime-registry.ts',
    ),
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/apps/enterprise/workflow-policy.ts',
    ),
    source(
      'lib/apps/enterprise/domain-hooks.ts',
    ),
    source(
      'lib/apps/enterprise/field-security.ts',
    ),
  ]);

  const specialistModules = [
    'accounting',
    'inventory',
    'warehouse',
    'payroll',
    'crm',
    'projects',
    'helpdesk',
    'manufacturing',
  ];

  for (
    const moduleKey
    of specialistModules
  ) {
    assert.match(
      specialistCatalog,
      new RegExp(
        '^\\s{2}' +
        moduleKey +
        ': \\[',
        'm',
      ),
      moduleKey,
    );
  }

  for (
    const table
    of [
      'accounting_fiscal_periods',
      'accounting_bank_statement_lines',
      'inventory_lots',
      'stock_reservations',
      'inventory_reorder_rules',
      'warehouse_picking_batches',
      'warehouse_putaway_rules',
      'payroll_components',
      'payslips',
      'payslip_lines',
      'crm_stages',
      'crm_forecasts',
      'task_dependencies',
      'project_budgets',
      'helpdesk_sla_policies',
      'ticket_sla_tracking',
      'knowledge_articles',
      'work_centers',
      'manufacturing_routings',
      'manufacturing_material_reservations',
    ]
  ) {
    assert.ok(
      specialistDepth.includes(
        'public.' +
        table,
      ),
      table,
    );

    assert.ok(
      catalog.includes(
        "'" +
        table +
        "'",
      ),
      table +
      ' catalog registration',
    );
  }

  for (
    const marker
    of [
      "fromVersion:\n        '2.1.0'",
      "toVersion:\n        '2.2.0'",
      'ENTERPRISE_SPECIALIST_DEPTH_MIGRATIONS',
      'deepenSpecialistModule',
      'specialistDepthSql',
    ]
  ) {
    assert.ok(
      hardening.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    migrations,
    /ENTERPRISE_SPECIALIST_DEPTH_MIGRATIONS/,
  );

  assert.match(
    contract,
    /isSpecialistEnterpriseModuleKey[\s\S]*'2\.3\.0'/s,
  );

  for (
    const workflowKey
    of [
      'accounting:accounting_fiscal_periods',
      'inventory:inventory_adjustments',
      'warehouse:warehouse_picking_batches',
      'payroll:payslips',
      'crm:crm_forecasts',
      'projects:project_budgets',
      'helpdesk:ticket_sla_tracking',
      'helpdesk:knowledge_articles',
      'manufacturing:manufacturing_routings',
      'manufacturing:manufacturing_material_reservations',
    ]
  ) {
    assert.ok(
      workflow.includes(
        "'" +
        workflowKey +
        "'",
      ),
      workflowKey,
    );
  }

  for (
    const marker
    of [
      'Inventory adjustment difference must equal counted quantity minus system quantity.',
      'Posted inventory adjustments are immutable.',
      'Paid payslips are immutable.',
      'Closed fiscal periods must be reopened',
      'Payslip deductions cannot exceed gross pay.',
      'A task cannot depend on itself.',
      'SLA first-response time',
      'Reserved or consumed material cannot exceed the required quantity.',
    ]
  ) {
    assert.ok(
      hooks.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'payroll:payslips',
      'payroll:payslip_lines',
      'accounting:accounting_bank_statement_lines',
      'projects:project_budgets',
      'projects:project_resources',
    ]
  ) {
    assert.ok(
      fieldSecurity.includes(
        marker,
      ),
      marker,
    );
  }
});


test('finance and procurement specialist depth adds controlled settlement procurement and planning workflows', async () => {
  const [
    specialistCatalog,
    financeDepth,
    catalog,
    workflows,
    hooks,
    financeRules,
    financeTransitions,
    service,
    security,
  ] = await Promise.all([
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-finance-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/workflow-policy.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/specialist-finance-rules.ts'),
    source('lib/apps/enterprise/specialist-finance-transitions.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('lib/apps/enterprise/field-security.ts'),
  ]);

  for (
    const moduleKey
    of [
      'purchase',
      'expenses',
      'fixed_assets',
      'tax',
      'budgeting',
      'cash_flow',
      'billing',
      'subscriptions',
      'payments',
      'commissions',
    ]
  ) {
    assert.match(
      specialistCatalog,
      new RegExp(
        '^\\s{2}' +
        moduleKey +
        ': \\[',
        'm',
      ),
      moduleKey,
    );
  }

  for (
    const table
    of [
      'purchase_requisitions',
      'purchase_receipts',
      'expense_policies',
      'expense_reports',
      'asset_impairments',
      'tax_codes',
      'withholding_certificates',
      'budget_scenarios',
      'budget_approvals',
      'cash_flow_scenarios',
      'liquidity_alerts',
      'billing_cycles',
      'billing_dunning_cases',
      'subscription_changes',
      'subscription_usage_charges',
      'payment_batches',
      'payment_batch_items',
      'payment_refunds',
      'payment_disputes',
      'commission_tiers',
      'commission_payouts',
    ]
  ) {
    assert.ok(
      financeDepth.includes(
        'public.' +
        table,
      ),
      table,
    );

    assert.ok(
      catalog.includes(
        "'" +
        table +
        "'",
      ),
      table +
      ' registration',
    );
  }

  for (
    const workflowKey
    of [
      'purchase:purchase_requisitions',
      'purchase:purchase_receipts',
      'expenses:expense_reports',
      'fixed_assets:asset_impairments',
      'tax:withholding_certificates',
      'budgeting:budget_approvals',
      'cash_flow:liquidity_alerts',
      'billing:billing_cycles',
      'billing:billing_dunning_cases',
      'subscriptions:subscription_changes',
      'payments:payment_batches',
      'payments:payment_refunds',
      'payments:payment_disputes',
      'commissions:commission_payouts',
    ]
  ) {
    assert.ok(
      workflows.includes(
        "'" +
        workflowKey +
        "'",
      ),
      workflowKey,
    );
  }

  for (
    const marker
    of [
      'recalculateExpenseReport',
      'recalculatePaymentBatch',
      'recalculateCommissionPayout',
      'validateFinanceSpecialistRow',
      'assertFinanceSpecialistMutationAllowed',
    ]
  ) {
    assert.ok(
      hooks.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'Rejected quantity cannot exceed received quantity.',
      'New book value must equal previous book value minus impairment.',
      'Withheld amount cannot exceed gross amount.',
      'Overdue amount cannot exceed the outstanding balance.',
      'Commission tier upper threshold cannot be below its lower threshold.',
      'Posted purchase receipts are immutable.',
      'Completed refunds are immutable.',
      'Paid commission payouts are immutable.',
    ]
  ) {
    assert.ok(
      financeRules.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'postPurchaseReceiptToInventory',
      'reimburseExpenseReport',
      'applySubscriptionChange',
      'completeRefund',
      'closeCommissionEntries',
      'approveBudget',
      'stock_movements',
      'stock_levels',
    ]
  ) {
    assert.ok(
      financeTransitions.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    service,
    /applyFinanceSpecialistTransition/,
  );

  assert.match(
    service,
    /WORKFLOW_TRANSITION_INVALID/,
  );

  for (
    const marker
    of [
      'expenses:expense_reports',
      'fixed_assets:asset_impairments',
      'billing:billing_account_balances',
      'payments:payment_refunds',
      'commissions:commission_payouts',
    ]
  ) {
    assert.ok(
      security.includes(
        marker,
      ),
      marker,
    );
  }
});


test('specialist execution transitions post operational business effects transactionally', async () => {
  const [
    execution,
    service,
    hooks,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/specialist-execution.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
    source(
      'lib/apps/enterprise/domain-hooks.ts',
    ),
  ]);

  for (
    const marker
    of [
      'inventory_adjustment:',
      'adjustment_in',
      'adjustment_out',
      'stock_levels',
      'stock_movements',
      'Add payslip lines before computing the payslip.',
      'gross_amount',
      'deduction_amount',
      'employer_contribution_amount',
      'Complete or cancel every picking operation before completing the batch.',
      'Reserve all required manufacturing materials before starting production.',
      'Record consumption of all required materials before completing production.',
      'Approved project budget must be greater than zero and cannot exceed the budget amount.',
      'breached_at',
      'resolved_at',
      'helpdesk_sla_policies',
      'first_response_due_at',
      'resolution_due_at',
      'first_response_at',
    ]
  ) {
    assert.ok(
      execution.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    execution,
    /inventory_adjustment:[\s\S]*FROM stock_movements[\s\S]*reference = \$2[\s\S]*existing\.rows\.length[\s\S]*0/s,
    'Inventory adjustment posting must remain idempotent.',
  );

  assert.match(
    service,
    /applySpecialistExecutionTransition\([\s\S]*client/s,
  );

  assert.match(
    hooks,
    /applySpecialistExecutionRecordSideEffects\([\s\S]*userId/s,
  );

  assert.match(
    hooks,
    /crm[\s\S]*crm_forecast_lines[\s\S]*weighted_amount/s,
  );

  for (
    const marker
    of [
      'Posted inventory adjustments are immutable',
      'Completed warehouse picking batches are immutable',
      'Paid payslips are immutable',
      'Closed project budgets are immutable',
      'Consumed manufacturing reservations are immutable',
    ]
  ) {
    assert.ok(
      execution.includes(
        marker,
      ),
      marker,
    );
  }
});


test('enterprise hardening supports UUID company keys during migration', async () => {
  const hardening =
    await source(
      'lib/apps/enterprise/hardening.ts',
    );

  assert.doesNotMatch(
    hardening,
    /MIN\(id\)/i,
    'PostgreSQL does not provide a built-in min(uuid) aggregate for company UUID keys.',
  );

  assert.match(
    hardening,
    /SELECT[\s\S]*COUNT\(\*\)::int[\s\S]*FROM public\.companies/s,
  );

  assert.match(
    hardening,
    /IF company_count = 1 THEN[\s\S]*SELECT[\s\S]*id[\s\S]*INTO[\s\S]*only_company[\s\S]*FROM public\.companies[\s\S]*LIMIT 1/s,
  );
});


test('shared enterprise apps expose real routed operational workspaces', async () => {
  const [
    rootPage,
    sectionPage,
    serverPage,
    client,
    contract,
  ] = await Promise.all([
    source(
      'app/apps/[appKey]/page.tsx',
    ),
    source(
      'app/apps/[appKey]/[section]/page.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModulePage.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
    source(
      'lib/modules/enterprise-contract.ts',
    ),
  ]);

  assert.match(
    rootPage,
    /EnterpriseModulePage/,
  );

  assert.match(
    sectionPage,
    /section/,
  );

  assert.match(
    serverPage,
    /resolveWorkspaceSection/,
  );

  assert.match(
    serverPage,
    /canonicalKey ===[\s\S]*'sales'[\s\S]*'invoicing'/s,
    'Dedicated Sales and Invoicing route trees must not fall into the shared workspace.',
  );

  for (
    const marker
    of [
      'initialView',
      'initialTableKey',
      'moduleBasePath',
      'navigateView',
      'navigateTable',
      'router.push',
    ]
  ) {
    assert.ok(
      client.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    contract,
    /href:[\s\S]*'\/apps\/'[\s\S]*key[\s\S]*'\/'[\s\S]*table/s,
    'Generated business actions must point to table-specific module pages.',
  );

  assert.match(
    contract,
    /'\/reports'/,
  );

  assert.match(
    contract,
    /'\/settings'/,
  );

  assert.match(
    contract,
    /navigation:[\s\S]*recordTables\.map/s,
    'Every shared module manifest should expose child navigation for its business registers.',
  );
});


test('shared app lifecycle policy is explicit wherever the schema exposes business status', async () => {
  const workflow =
    await source(
      'lib/apps/enterprise/workflow-policy.ts',
    );

  for (
    const moduleKey
    of [
      'assets',
      'barcode',
      'chat',
      'cpq',
      'web_analytics',
    ]
  ) {
    assert.match(
      workflow,
      new RegExp(
        "'" +
          moduleKey +
          ":",
      ),
      moduleKey +
        ' must not rely only on the generic workflow graph.',
    );
  }

  assert.match(
    workflow,
    /'documents:document_approvals'/,
    'Documents must expose an explicit approval lifecycle once document approvals are installed.',
  );

  assert.doesNotMatch(
    workflow,
    /'spreadsheet:/,
    'Spreadsheet currently has no business status field to transition.',
  );
});


test('suite-wide product depth gives every shared app a domain workspace and connected-app experience', async () => {
  const [
    experience,
    serverPage,
    client,
    aiTools,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/suite-experience.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModulePage.tsx',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
    source(
      'lib/apps/enterprise/ai-tools.ts',
    ),
  ]);

  assert.match(
    experience,
    /RELATED_MODULES[\s\S]*satisfies[\s\S]*Record<[\s\S]*EnterpriseModuleKey/s,
    'Every shared enterprise app must participate in the connected-app map at compile time.',
  );

  assert.match(
    experience,
    /DOMAIN_PROCESS/,
  );

  assert.match(
    experience,
    /DOMAIN_ZONE_COPY/,
  );

  assert.match(
    experience,
    /getEnterpriseModuleExperience/,
  );

  assert.match(
    serverPage,
    /accessibleModuleKeys={[\s\S]*shell[\s\S]*accessibleModules/s,
    'Connected-app presentation must derive from the same permission-resolved app boundary as the workspace shell.',
  );

  for (
    const marker
    of [
      'getEnterpriseModuleExperience',
      'Operating journey',
      'Operational areas',
      'Connected apps',
      'accessibleModuleKeys',
    ]
  ) {
    assert.ok(
      client.includes(
        marker,
      ),
      marker,
    );
  }

  assert.match(
    client,
    /availableIntegrations[\s\S]*accessibleModuleKeys[\s\S]*includes/s,
    'The client must not expose cross-app links for inaccessible modules.',
  );

  assert.match(
    aiTools,
    /operatingExperience/,
    'SaMi AI should receive the same business operating model rather than raw register counts only.',
  );

  assert.match(
    aiTools,
    /connectedApps:[\s\S]*accessibleModuleKeys/s,
    'SaMi AI connected-app context must stay permission filtered.',
  );
});


test('enterprise runtime reconciles stale installed schemas before workspace reads', async () => {
  const [
    hardening,
    upgrades,
    service,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/hardening.ts',
    ),
    source(
      'lib/services/module-upgrades.ts',
    ),
    source(
      'lib/apps/enterprise/service.ts',
    ),
  ]);

  assert.match(
    hardening,
    /ensureEnterpriseModuleRuntimeSchema/,
  );

  assert.match(
    hardening,
    /pg_advisory_lock/,
  );

  assert.match(
    hardening,
    /hardenModule\([\s\S]*completeModule\([\s\S]*deepenSpecialistModule/s,
    'Runtime repair must restore company boundaries, completion tables and specialist depth under one guarded path.',
  );

  assert.match(
    upgrades,
    /upgradeInstalledModuleForTenant/,
  );

  assert.match(
    upgrades,
    /row\.version \|\|[\s\S]*'1\.0\.0'/s,
    'Legacy installed modules without a recorded version must have a safe migration baseline.',
  );

  assert.match(
    service,
    /reconciledTableMetadata/,
  );

  assert.match(
    service,
    /upgradeInstalledModuleForTenant\([\s\S]*context\.tenantId[\s\S]*context\.moduleKey/s,
  );

  assert.match(
    service,
    /error\.code ===[\s\S]*'TABLE_NOT_READY'[\s\S]*ensureEnterpriseModuleRuntimeSchema/s,
    'A stale schema should be repaired and retried instead of being rendered as App unavailable.',
  );

  assert.match(
    service,
    /missingTables[\s\S]*ensureEnterpriseModuleRuntimeSchema/s,
    'Missing specialist/runtime tables should trigger one schema reconciliation pass.',
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
      'Cash-flow probability',
      'Salvage value cannot exceed acquisition cost',
      'Booking weekday must be between 0 and 6',
      'Service material quantity',
      'Work-order material quantity',
      'Timesheet hours',
      'Learning progress',
      'Fleet service cost',
      'Rental total',
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
      'field_services:service_orders',
      'timesheets:time_entries',
      'appraisals:appraisals',
      'safety:safety_incidents',
      'rentals:rental_contracts',
      'fleet:vehicles',
      'subscriptions:subscriptions',
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


test('remaining enterprise lifecycles use explicit domain state machines', async () => {
  const policy =
    await source(
      'lib/apps/enterprise/workflow-policy.ts',
    );

  for (
    const key
    of [
      'ads:ad_campaigns',
      'calendar:calendar_events',
      'checkout:checkout_sessions',
      'commissions:commission_entries',
      'demand_planning:demand_forecasts',
      'events:events',
      'facilities:facility_requests',
      'gift_cards:gift_cards',
      'inspections:inspections',
      'marketing_automation:automation_workflows',
      'marketplace:marketplace_orders',
      'meetings:meetings',
      'plm:engineering_changes',
      'pos_restaurant:restaurant_orders',
      'pos_shop:shop_orders',
      'seo:seo_issues',
      'sign:signature_requests',
      'surveys:surveys',
      'warehouse:warehouse_operations',
    ]
  ) {
    assert.ok(
      policy.includes(
        "'" +
        key +
        "'",
      ),
      key,
    );
  }
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
    /!\/\(\^\|_\)\(status\|state\|stage\)\$\//,
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
    runtimeAutomation,
    automation,
  ] = await Promise.all([
    source(
      'lib/modules/enterprise-contract.ts',
    ),
    source(
      'lib/automation/registry.ts',
    ),
    source(
      'lib/apps/runtime-automation.ts',
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
    /APP_RUNTIME_AUTOMATION_TRIGGERS/,
  );

  assert.match(
    registry,
    /APP_RUNTIME_AUTOMATION_ACTIONS/,
  );

  assert.match(
    registry,
    /APP_RUNTIME_AUTOMATION_ACTION_HANDLERS/,
  );

  assert.match(
    runtimeAutomation,
    /ENTERPRISE_AUTOMATION_TRIGGERS/,
  );

  assert.match(
    runtimeAutomation,
    /ENTERPRISE_AUTOMATION_ACTIONS/,
  );

  assert.match(
    runtimeAutomation,
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
    /\(\^\|_\)\(status\|state\|stage\)\$/,
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

test('specialist ERP apps use domain-native operating layouts instead of one flat register experience', async () => {
  const [
    specialistWorkspace,
    client,
  ] = await Promise.all([
    source(
      'lib/apps/enterprise/specialist-workspace.ts',
    ),
    source(
      'app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx',
    ),
  ]);

  for (
    const marker
    of [
      "accounting: {",
      "crm: {",
      "inventory: {",
      "warehouse: {",
      "purchase: {",
      "manufacturing: {",
      "payroll: {",
      "employees: {",
      "projects: {",
      "helpdesk: {",
      "style: 'ledger'",
      "style: 'pipeline'",
      "style: 'logistics'",
      "style: 'procurement'",
      "style: 'manufacturing'",
      "style: 'people'",
      "style: 'project'",
      "style: 'support'",
      "preferredRecordView: 'kanban'",
    ]
  ) {
    assert.ok(
      specialistWorkspace.includes(
        marker,
      ),
      marker,
    );
  }

  for (
    const marker
    of [
      'getEnterpriseSpecialistLayout',
      'ERP chain',
      'Connected execution, not isolated records',
      'specialistLayout',
      'preferredRecordView',
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

test('enterprise backend contract remains presentation-independent so module UIs can be replaced safely', async () => {
  const [
    service,
    api,
    page,
    client,
    specialistWorkspace,
  ] = await Promise.all([
    source('lib/apps/enterprise/service.ts'),
    source('app/api/apps/[appKey]/records/route.ts'),
    source('app/apps/[appKey]/EnterpriseModulePage.tsx'),
    source('app/apps/[appKey]/EnterpriseModuleWorkspaceClient.tsx'),
    source('lib/apps/enterprise/specialist-workspace.ts'),
  ]);

  assert.match(
    service,
    /^import 'server-only';/m,
    'Business execution must remain server-only.',
  );

  for (const marker of [
    'createEnterpriseModuleRecord',
    'updateEnterpriseModuleRecord',
    'deleteEnterpriseModuleRecord',
    'transitionEnterpriseModuleRecord',
    'queryEnterpriseModuleTable',
  ]) {
    assert.ok(
      api.includes(marker),
      marker + ' API delegation',
    );
  }

  assert.match(
    page,
    /getEnterpriseModuleWorkspace/,
    'Pages should consume the backend workspace contract.',
  );

  assert.doesNotMatch(
    client,
    /getTenantPoolByTenantId|queryControl|from ['"]pg['"]|\.query\(/,
    'Client layouts must never own direct database access.',
  );

  assert.doesNotMatch(
    specialistWorkspace,
    /getTenantPoolByTenantId|queryControl|from ['"]pg['"]|\.query\(/,
    'Specialist layout definitions must remain presentation metadata only.',
  );

  assert.match(
    page,
    /Sales and Invoicing own dedicated route trees/,
    'Dedicated app UIs must be able to coexist with the shared backend suite.',
  );
});

test('all 78 shared apps are specialist-grade backend contracts with journeys permissions automation AI and replaceable UI', async () => {
  const [
    catalog,
    specialistCatalog,
    specialistDepth,
    breadthDepth,
    specialistWorkspace,
    workflow,
    contract,
    service,
    automation,
    aiTools,
    experience,
  ] = await Promise.all([
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/specialist-breadth-depth.ts'),
    source('lib/apps/enterprise/specialist-workspace.ts'),
    source('lib/apps/enterprise/workflow-policy.ts'),
    source('lib/modules/enterprise-contract.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('lib/apps/enterprise/automation.ts'),
    source('lib/apps/enterprise/ai-tools.ts'),
    source('lib/apps/enterprise/suite-experience.ts'),
  ]);

  const moduleKeys =
    [
      ...catalog.matchAll(
        /^\s{2}([a-z][a-z0-9_]*): \[/gm,
      ),
    ].map(
      match =>
        match[1],
    );

  const specialistKeys =
    [
      ...specialistCatalog.matchAll(
        /^\s{2}([a-z][a-z0-9_]*): \[/gm,
      ),
    ].map(
      match =>
        match[1],
    );

  assert.equal(
    moduleKeys.length,
    78,
  );

  assert.equal(
    specialistKeys.length,
    78,
  );

  assert.deepEqual(
    [
      ...specialistKeys,
    ].sort(),
    [
      ...moduleKeys,
    ].sort(),
    'Every shared app must be classified as a specialist app.',
  );

  for (
    const table
    of [
      'appointment_availability_blocks',
      'appointment_reminders',
      'document_versions',
      'document_approvals',
      'email_templates',
      'email_campaign_events',
      'event_sessions',
      'event_tickets',
      'service_checklists',
      'vehicle_fuel_logs',
      'preventive_maintenance_plans',
      'automation_segments',
      'planning_capacity',
      'engineering_change_approvals',
      'shop_returns',
      'quality_corrective_actions',
      'referral_conversions',
      'referral_rewards',
      'rental_reservations',
      'rental_charges',
      'signature_templates',
      'signature_audit_events',
      'sms_templates',
      'sms_delivery_events',
      'social_campaigns',
      'social_post_metrics',
    ]
  ) {
    assert.ok(
      catalog.includes(
        "'" +
        table +
        "'",
      ),
      table +
      ' catalog registration',
    );

    assert.ok(
      breadthDepth.includes(
        'public.' +
        table,
      ),
      table +
      ' specialist schema',
    );
  }

  assert.match(
    specialistDepth,
    /specialistBreadthDepthSql/,
  );

  assert.match(
    specialistWorkspace,
    /generatedSpecialistLayout/,
  );

  assert.match(
    specialistWorkspace,
    /getEnterpriseDomainProfile/,
  );

  assert.match(
    specialistWorkspace,
    /preferredRecordView/,
  );

  assert.match(
    specialistWorkspace,
    /insightTables/,
  );

  assert.match(
    contract,
    /'execute'/,
  );

  assert.match(
    contract,
    /'approve'/,
  );

  assert.match(
    contract,
    /'close'/,
  );

  assert.match(
    service,
    /specialistTransitionPermissionKey/,
  );

  assert.match(
    service,
    /applySpecialistBreadthTransition/,
  );

  assert.match(
    automation,
    /MODULE_KEYS\.flatMap/,
    'Automation must generate triggers/actions for the whole shared-app catalog.',
  );

  assert.match(
    automation,
    /specialistTransitionPermissionKey/,
  );

  assert.match(
    automation,
    /applySpecialistBreadthTransition/,
  );

  for (
    const tool
    of [
      'workspace_app_summary',
      'workspace_app_search',
      'workspace_app_create',
      'workspace_app_update',
      'workspace_app_transition',
    ]
  ) {
    assert.ok(
      aiTools.includes(
        "'" +
        tool +
        "'",
      ),
      tool,
    );
  }

  assert.match(
    experience,
    /satisfies[\s\S]*Record<[\s\S]*EnterpriseModuleKey/s,
    'Connected-app journeys must cover every shared app at compile time.',
  );

  assert.match(
    workflow,
    /GENERIC_GRAPH/,
    'Every status-aware app must retain a safe workflow fallback when no stricter domain graph is defined.',
  );
});

test('strict Odoo Zoho parity v2.3 adds domain depth and dependency execution instead of relying on generic CRUD', async () => {
  const [
    commerceDepth,
    peopleMarketingDepth,
    integrationExecution,
    specialistDepth,
    specialistCatalog,
    hardening,
    migrations,
    contract,
    domainHooks,
    service,
    automation,
  ] = await Promise.all([
    source('lib/apps/enterprise/strict-parity-commerce-depth.ts'),
    source('lib/apps/enterprise/strict-parity-people-marketing-depth.ts'),
    source('lib/apps/enterprise/specialist-integration-execution.ts'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/specialist-catalog.ts'),
    source('lib/apps/enterprise/hardening.ts'),
    source(
      'lib/apps/runtime-registry.ts',
    ),
    source('lib/modules/enterprise-contract.ts'),
    source('lib/apps/enterprise/domain-hooks.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('lib/apps/enterprise/automation.ts'),
  ]);

  for (const marker of [
    'appointment_questions',
    'appointment_calendar_links',
    'appointment_payment_requests',
    'crm_blueprints',
    'crm_blueprint_transitions',
    'crm_approval_requests',
    'inventory_price_lists',
    'inventory_transfer_orders',
    'inventory_cycle_counts',
    'pos_shop_sessions',
    'pos_shop_payments',
    'restaurant_preparation_tickets',
    'restaurant_self_order_sessions',
    'signature_documents',
    'signature_fields',
    'signature_auth_challenges',
    'signature_completion_certificates',
    'supplier_rfqs',
    'supplier_rfq_responses',
    'shipping_rate_quotes',
    'shipping_labels',
    'portal_requests',
    'vendor_portal_rfqs',
  ]) {
    assert.ok(
      commerceDepth.includes(marker),
      marker + ' strict commerce parity depth',
    );
    assert.ok(
      specialistCatalog.includes("'" + marker + "'"),
      marker + ' specialist catalog registration',
    );
  }

  for (const marker of [
    'employee_departments',
    'employee_certifications',
    'attendance_devices',
    'attendance_geofences',
    'payroll_salary_rules',
    'payroll_work_entries',
    'email_segments',
    'email_suppressions',
    'sms_segments',
    'sms_opt_outs',
    'social_inbox_items',
    'social_audiences',
    'document_shares',
    'document_access_events',
    'quality_control_points',
    'quality_alerts',
    'workbook_data_sources',
    'workbook_versions',
    'dashboard_widgets',
  ]) {
    assert.ok(
      peopleMarketingDepth.includes(marker),
      marker + ' strict people/marketing parity depth',
    );
    assert.ok(
      specialistCatalog.includes("'" + marker + "'"),
      marker + ' specialist catalog registration',
    );
  }

  for (const moduleKey of [
    'assets',
    'barcode',
    'chat',
    'customer_portal',
    'email_marketing',
    'employees',
    'landing_pages',
    'lead_capture',
    'mail',
    'quality',
    'sales_inbox',
    'sms_marketing',
    'social_marketing',
    'spreadsheet',
    'team_inbox',
    'vendor_portal',
  ]) {
    assert.ok(
      integrationExecution.includes(
        "moduleKey ===\n      '" + moduleKey + "'",
      ),
      moduleKey + ' must have module-specific dependency execution',
    );
  }

  for (const marker of [
    'createCrmLead',
    'inventory_adjustments',
    'support_tickets',
    'payroll_employees',
    'quality_issues',
    'last_message_at',
  ]) {
    assert.ok(
      integrationExecution.includes(marker),
      marker + ' cross-module consequence',
    );
  }

  assert.match(
    specialistDepth,
    /commerceParityDepthSql/,
  );
  assert.match(
    specialistDepth,
    /peopleMarketingParityDepthSql/,
  );
  assert.match(
    domainHooks,
    /applyIntegratedSpecialistRecordSideEffects/,
  );
  assert.match(
    service,
    /applyIntegratedSpecialistTransition/,
  );
  assert.match(
    automation,
    /applyIntegratedSpecialistTransition/,
  );

  assert.match(
    hardening,
    /fromVersion:\n        '2\.2\.0'[\s\S]*toVersion:\n        '2\.3\.0'/s,
  );
  assert.match(
    hardening,
    /ENTERPRISE_STRICT_PARITY_MIGRATIONS/,
  );
  assert.match(
    migrations,
    /ENTERPRISE_STRICT_PARITY_MIGRATIONS/,
  );
  assert.match(
    contract,
    /isSpecialistEnterpriseModuleKey[\s\S]*'2\.3\.0'/s,
  );
});

