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
