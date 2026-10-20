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


test('CRM links accounts to existing Invoicing customers without exposing raw links to generic CRUD', async () => {
  const [schema, runtimeSchema, service, route, panel, client] = await Promise.all([
    source('lib/apps/crm/schema.sql'),
    source('lib/apps/enterprise/specialist-depth.ts'),
    source('lib/apps/enterprise/service.ts'),
    source('app/api/apps/crm/customer-links/route.ts'),
    source('app/apps/crm/CrmCustomerLinkPanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
  ]);

  assert.match(schema, /invoicing_customer_id UUID/);
  assert.match(runtimeSchema, /ADD COLUMN IF NOT EXISTS invoicing_customer_id UUID/);
  assert.match(schema, /uq_crm_accounts_company_invoicing_customer/);
  assert.match(runtimeSchema, /uq_crm_accounts_company_invoicing_customer/);
  assert.match(service, /invoicing_customer_id/);
  assert.match(route, /requireEnterpriseModuleTableContext/);
  assert.match(route, /requireInvoicingContext/);
  assert.match(route, /INVOICING_PERMISSIONS\.CUSTOMER_VIEW/);
  assert.match(route, /company_id = \$1/);
  assert.match(route, /status = 'active'/);
  assert.match(route, /deleted_at IS NULL/);
  assert.match(route, /sec-fetch-site/);
  assert.match(panel, /\/api\/apps\/crm\/customer-links/);
  assert.match(panel, /does not create duplicate billing customers/i);
  assert.match(client, /CrmCustomerLinkPanel/);
});


test('CRM relationship timeline validates company-scoped records and keeps Sales activity read-only', async () => {
  const [route, panel, client, schema] = await Promise.all([
    source('app/api/apps/crm/interactions/route.ts'),
    source('app/apps/crm/CrmRelationshipTimelinePanel.tsx'),
    source('app/apps/crm/CrmWorkspaceClient.tsx'),
    source('lib/apps/crm/schema.sql'),
  ]);

  assert.match(schema, /CREATE TABLE IF NOT EXISTS public\.crm_interactions/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'view'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'create'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_interactions', 'edit'\)/);
  assert.match(route, /company_id = \$1/);
  assert.match(route, /CRM_RELATIONSHIP_MISMATCH/);
  assert.match(route, /status = 'planned'/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(panel, /\/api\/apps\/crm\/interactions/);
  assert.match(panel, /Sales · read-only/);
  assert.match(panel, /does not send a message or make a call/i);
  assert.match(client, /CrmRelationshipTimelinePanel/);
});


test('CRM Customer 360 uses a dedicated Sales-style module shell and stays permission scoped', async () => {
  const [shell, workspace, launcher, profile, page, route, links] = await Promise.all([
    source('app/apps/crm/CrmModuleShell.tsx'),
    source('app/apps/crm/CrmWorkspace.tsx'),
    source('app/apps/crm/CrmAccount360Launcher.tsx'),
    source('app/apps/crm/CrmAccount360Panel.tsx'),
    source('app/apps/crm/accounts/[accountId]/page.tsx'),
    source('app/api/apps/crm/accounts/[accountId]/route.ts'),
    source('app/api/apps/crm/customer-links/route.ts'),
  ]);

  assert.match(shell, /data-crm-shell="standalone"/);
  assert.match(shell, /fixed inset-y-0 left-0/);
  assert.match(shell, /WorkspaceAppSwitcher/);
  assert.match(shell, /WorkspaceTenantSwitcher/);
  assert.match(shell, /WorkspaceNotificationCenter/);
  assert.doesNotMatch(shell, /<AppSurfaceShell/);
  assert.match(workspace, /CrmModuleShell/);
  assert.match(launcher, /\/apps\/crm\/accounts\//);
  assert.match(page, /CrmWorkspace accountId=\{accountId\}/);

  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_accounts', 'view'\)/);
  assert.match(route, /requireEnterpriseModuleTableContext\('crm', 'crm_contacts', 'view'\)/);
  assert.ok(route.includes('company_id = $2'));
  assert.ok(route.includes('deleted_at IS NULL'));
  assert.match(route, /CRM_ACCOUNT_NOT_FOUND/);

  assert.match(profile, /\/api\/apps\/crm\/interactions\?accountId=/);
  assert.match(profile, /\/api\/apps\/sales\?pipeline=1/);
  assert.match(profile, /Sales relationship/);
  assert.match(profile, /Read-only/);
  assert.match(profile, /\/api\/apps\/crm\/customer-links\?accountId=/);
  assert.match(profile, /Invoicing connection/);
  assert.match(links, /requestedAccountId/);
  assert.ok(links.includes('($2::uuid IS NULL OR a.id = $2)'));
});
