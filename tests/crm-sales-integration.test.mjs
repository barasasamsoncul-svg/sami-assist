import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function source(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

test('CRM owns company-scoped account, contact and interaction records', async () => {
  const [schema, runtimeSchema, catalog, workspace] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/catalog.ts'),
    source('lib/apps/enterprise/specialist-workspace.ts'),
  ]);

  for (const table of ['crm_accounts', 'crm_contacts', 'crm_interactions']) {
    const createMarker = 'CREATE TABLE IF NOT EXISTS public.' + table + ' (';
    assert.ok(schema.includes(createMarker), table + ' baseline schema');
    assert.ok(runtimeSchema.includes(createMarker), table + ' runtime schema');
    assert.ok(catalog.includes("'" + table + "'"), table + ' generic workspace registration');

    const tableStart = runtimeSchema.indexOf(createMarker);
    const tableEnd = runtimeSchema.indexOf(');', tableStart);
    const tableSql = runtimeSchema.slice(tableStart, tableEnd);
    assert.match(tableSql, /company_id UUID NOT NULL/);
    assert.match(tableSql, /deleted_at TIMESTAMPTZ/);
  }

  assert.ok(workspace.includes('Sales remains the source of truth for leads, opportunities, quotations and order outcomes'));
});

test('CRM does not expose duplicate legacy lead and opportunity tables as CRM-owned records', async () => {
  const catalog = await source('lib/apps/enterprise/catalog.ts');
  const crmStart = catalog.indexOf('  crm: [');
  assert.notEqual(crmStart, -1, 'CRM table allowlist exists');
  const crmEnd = catalog.indexOf(']', crmStart);
  const crmEntry = catalog.slice(crmStart, crmEnd);

  for (const legacyTable of ['leads', 'opportunities', 'crm_activities', 'crm_stages', 'crm_scoring_rules', 'crm_forecasts', 'crm_forecast_lines']) {
    assert.ok(!crmEntry.includes("'" + legacyTable + "'"), legacyTable + ' must not be exposed to generic CRM CRUD');
  }
});

test('CRM overview consumes the validated Sales pipeline API read-only', async () => {
  const [panel, client, salesRoute, salesPipeline] = await Promise.all([
    source('app/apps/crm/CrmSalesIntegrationPanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/pipeline.ts'),
  ]);

  assert.ok(panel.includes("fetch('/api/apps/sales?pipeline=1'"));
  assert.ok(panel.includes("cache: 'no-store'"));
  assert.ok(panel.includes("payload.code === 'SALES_PERMISSION_REQUIRED'"));
  assert.ok(panel.includes('Live · read-only'));
  assert.ok(client.includes("initialView === 'overview'"));
  assert.ok(client.includes("accessibleModuleKeys.includes('sales')"));
  assert.ok(salesRoute.includes('getSalesPipelineData'));
  assert.ok(salesPipeline.includes('requireSalesContext(SALES_PERMISSIONS.PIPELINE_VIEW)'));
});
