import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('CRM owns company-scoped account, contact and interaction records', async () => {
  const [schema, runtimeSchema, catalog, workspace] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-workspace.ts'),
  ]);

  for (const table of ['crm_accounts', 'crm_contacts', 'crm_interactions']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`), `${table} schema`);
    assert.match(runtimeSchema, new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${table}\\b`), `${table} runtime schema`);
    assert.ok(catalog.includes(`'${table}'`), `${table} must be allowed in the CRM workspace`);
    assert.match(runtimeSchema, new RegExp(`public\\.${table}[\\s\\S]*?company_id UUID NOT NULL`), `${table} must be company-scoped`);
    assert.match(runtimeSchema, new RegExp(`public\\.${table}[\\s\\S]*?deleted_at TIMESTAMPTZ`), `${table} must support soft deletion`);
  }

  assert.match(workspace, /Sales remains the source of truth for leads, opportunities, quotations and order outcomes/);
});

test('CRM does not expose duplicate legacy lead and opportunity tables as CRM-owned records', async () => {
  const catalog = await source('lib/apps/enterprise/catalog.ts');
  const crmEntry = catalog.match(/crm: \\[([^\\]]*)\\]/)?.[1] ?? '';

  for (const legacyTable of ['leads', 'opportunities', 'crm_activities', 'crm_stages', 'crm_scoring_rules', 'crm_forecasts', 'crm_forecast_lines']) {
    assert.doesNotMatch(crmEntry, new RegExp(`(?:^|,)\\s*'${legacyTable}'\\s*(?:,|$)`), `${legacyTable} should not be available to generic CRM CRUD`);
  }
});

test('CRM overview consumes the validated Sales pipeline API read-only', async () => {
  const [panel, client, salesRoute, salesPipeline] = await Promise.all([
    source('app/apps/crm/CrmSalesIntegrationPanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.match(panel, /fetch\\('\/api\/apps\/sales\\?pipeline=1'/);
  assert.match(panel, /cache: 'no-store'/);
  assert.match(panel, /enabled/);
  assert.match(panel, /payload\.code === 'SALES_PERMISSION_REQUIRED'/);
  assert.match(client, /initialView === 'overview'/);
  assert.match(client, /accessibleModuleKeys\.includes\('sales'\)/);
  assert.match(salesRoute, /getSalesPipelineData/);
  assert.match(salesPipeline, /requireSalesContext\(SALES_PERMISSIONS\.PIPELINE_VIEW\)/);
  assert.match(panel, /Live · read-only/);
});
