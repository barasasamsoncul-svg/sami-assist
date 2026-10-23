import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function source(file) { return (await readFile(file, 'utf8')).replace(/\r\n/g, '\n'); }

test('Demand Planning manifest and migration register version 1.1.0 against required Inventory', async () => {
  const [manifest, registry, schema, migration] = await Promise.all([
    source('lib/modules/additional-first-party.ts'), source('lib/apps/runtime-migrations.ts'),
    source('lib/apps/demand_planning/schema.sql'), source('lib/apps/demand_planning/migrations/1.0.0-to-1.1.0.ts'),
  ]);
  const at = manifest.indexOf('key: "demand_planning"');
  assert.notEqual(at, -1);
  const entry = manifest.slice(at, at + 500);
  assert.match(entry, /version:\s*'1\.1\.0'/);
  assert.match(entry, /depends:\s*\["inventory"\]/);
  assert.match(entry, /optionalDepends:\s*\["purchase","sales"\]/);
  assert.match(registry, /DEMAND_PLANNING_1_0_0_TO_1_1_0/);
  assert.match(migration, /fromVersion:\s*'1\.0\.0'/);
  assert.match(migration, /toVersion:\s*'1\.1\.0'/);
  for (const index of ['uq_demand_forecasts_company_request_key','idx_demand_forecast_lines_company_forecast_product','idx_replenishment_recommendations_company_status_due','idx_stock_movements_company_demand_history']) {
    assert.ok(schema.includes(index), 'fresh schema index missing: ' + index);
    assert.ok(migration.includes(index), 'upgrade migration index missing: ' + index);
  }
  assert.doesNotMatch(schema, /module remains non-installable/i);
});

test('Demand Planning service uses company-scoped access, idempotent forecast runs and reserved-adjusted inventory', async () => {
  const service = await source('lib/apps/demand_planning/service.ts');
  assert.match(service, /requireEnterpriseModuleTableContext/);
  assert.match(service, /item\.companyId !== first\.companyId/);
  assert.match(service, /item\.tenantId !== first\.tenantId/);
  assert.match(service, /item\.userId !== first\.userId/);
  assert.match(service, /request_key=\$2/);
  assert.match(service, /request_hash/);
  assert.match(service, /ON CONFLICT \(company_id,request_key\)/);
  assert.match(service, /status IN .*allocated/);
  assert.match(service, /movement_type=ANY\(\$3::text\[\]\)/);
  assert.match(service, /WHERE p\.company_id=\$1/);
  assert.match(service, /no purchase order was created/i);
  assert.match(service, /Only suggested recommendations can be accepted or rejected/);
  assert.doesNotMatch(service, /INSERT INTO public\.purchase_orders/);
});

test('Demand Planning API is same-origin protected, bounded, and explicit about supported actions', async () => {
  const route = await source('app/api/apps/demand_planning/operations/route.ts');
  assert.match(route, /MAX_BODY_BYTES/);
  assert.match(route, /sameOrigin/);
  assert.match(route, /Cross-origin Demand Planning requests are not allowed/);
  assert.match(route, /runDemandForecast/);
  assert.match(route, /decideDemandRecommendation/);
  assert.match(route, /TenantContextError/);
  assert.match(route, /CompanyContextError/);
  assert.match(route, /Cache-Control/);
});

test('Demand Planning owns its Sales-style layout and prevents generic mutation bypasses', async () => {
  const [workspace, shell, client, panel, hooks] = await Promise.all([
    source('app/apps/demand_planning/DemandPlanningWorkspace.tsx'),
    source('app/apps/demand_planning/DemandPlanningModuleShell.tsx'),
    source('app/apps/demand_planning/DemandPlanningWorkspaceClient.tsx'),
    source('app/apps/demand_planning/DemandPlanningOperationsPanel.tsx'),
    source('lib/apps/enterprise/domain-hooks.ts'),
  ]);
  assert.match(workspace, /DemandPlanningModuleShell/);
  assert.doesNotMatch(workspace, /<AppSurfaceShell/);
  assert.match(shell, /data-sami-app="demand_planning"/);
  assert.match(shell, /data-demand-planning-shell="standalone"/);
  assert.match(client, /DemandPlanningOperationsPanel/);
  assert.match(panel, /Generate forecast/);
  assert.match(panel, /Accept/);
  assert.match(panel, /Reject/);
  assert.match(panel, /Purchase orders are never created automatically/);
  assert.match(hooks, /Demand forecasts and replenishment decisions must be changed through the validated Demand Planning workflow/);
});

test('full CI scripts invoke the specialist Demand Planning test gate', async () => {
  const pkg = JSON.parse(await source('package.json'));
  assert.match(pkg.scripts['test:all'], /test:demand-planning/);
  assert.match(pkg.scripts['test:ci'], /test:demand-planning/);
});
