import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales Part 11 migration defines tenant-scoped quote approval policies and ordered steps', async () => {
  const [migration, schema] = await Promise.all([source('lib/apps/sales/migrations/3.4.1-to-3.4.2.ts'), source('lib/apps/sales/schema.sql')]);

  for (const table of [
    'sales_quote_approval_policies',
    'sales_quote_approval_policy_steps',
    'sales_quote_approval_requests',
    'sales_quote_approval_decisions',
  ]) {
    assert.ok(migration.includes('public.' + table), table + ' in migration');
    assert.ok(schema.includes('public.' + table), table + ' in canonical schema');
  }

  assert.match(migration, /UNIQUE\(policy_id, step_order\)/);
  assert.match(migration, /UNIQUE\(request_id, step_order, reviewer_user_id\)/);
  assert.match(migration, /CHECK \(step_order > 0\)/);
  assert.match(migration, /CHECK \(decision IN \('approved','rejected'\)\)/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_request_pending/);
  assert.match(migration, /quote_fingerprint TEXT NOT NULL/);
  assert.match(migration, /company_id UUID NOT NULL/);
});

test('Sales Part 11 migration is registered after Sales 3.4.1', async () => {
  const registry = await source('lib/apps/runtime-migrations.ts');
  assert.match(registry, /SALES_3_4_1_TO_3_4_2/);
  const salesRegistry = registry.slice(registry.indexOf('export const SALES_RUNTIME_MIGRATIONS'));
  assert.ok(
    salesRegistry.indexOf('SALES_3_4_0_TO_3_4_1,') < salesRegistry.indexOf('SALES_3_4_1_TO_3_4_2,'),
    'the new migration must run after 3.4.0 -> 3.4.1',
  );
});


test('Sales 3.4.3 migration preserves typed-signature consent evidence and is registered after approvals', async () => {
  const [migration, schema, registry, manifest] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.2-to-3.4.3.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
  ]);

  assert.match(migration, /sales-3\.4\.2-to-3\.4\.3/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS acceptance_signature_consent_text TEXT/);
  assert.match(schema, /acceptance_signature_consent_text TEXT/);
  assert.match(registry, /SALES_3_4_2_TO_3_4_3/);
  assert.ok(registry.indexOf('SALES_3_4_1_TO_3_4_2,') < registry.indexOf('SALES_3_4_2_TO_3_4_3,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.7'/s);
});

test('Sales management insights are tenant-scoped, permission-gated and actionable', async () => {
  const [insights, page, ui] = await Promise.all([
    source('lib/apps/sales/management-insights.ts'),
    source('app/apps/sales/SalesSectionPage.tsx'),
    source('app/apps/sales/SalesManagementInsights.tsx'),
  ]);

  assert.match(insights, /hasSalesPermission/);
  assert.match(insights, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(insights, /WHERE company_id = \$1 AND deleted_at IS NULL/);
  assert.match(insights, /CURRENT_DATE - 7/);
  assert.match(insights, /LIMIT 10/);
  assert.match(page, /view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(page, /<SalesManagementInsights/);
  assert.match(ui, /Quote-to-order conversion/);
  assert.match(ui, /Quotes needing attention/);
  assert.match(ui, /data\.followUpQueue\.map/);
  assert.match(ui, /encodeURIComponent\(item\.id\)/);
});


test('Sales management insights include tenant-scoped booked order, product and team analytics', async () => {
  const [insights, ui] = await Promise.all([
    source('lib/apps/sales/management-insights.ts'),
    source('app/apps/sales/SalesManagementInsights.tsx'),
  ]);

  assert.match(insights, /FROM sales_orders_v2/);
  assert.match(insights, /WHERE company_id = \$1 AND deleted_at IS NULL/);
  assert.match(insights, /FROM sales_order_items_v2 i/);
  assert.match(insights, /WHERE i\.company_id = \$1/);
  assert.match(insights, /LEFT JOIN sales_teams t/);
  assert.match(insights, /status IN \('confirmed', 'closed'\)/);
  assert.match(insights, /GENERATE_SERIES/);
  assert.match(insights, /GROUP BY months\.month_start/);
  assert.match(ui, /function MonthlySalesChart/);
  assert.match(ui, /aria-label="Monthly booked sales chart"/);
  assert.match(ui, /Sales orders &amp; revenue/);
  assert.match(ui, /Monthly booked sales/);
  assert.match(ui, /Top products by sales/);
  assert.match(ui, /Sales team performance/);
  assert.match(ui, /min-w-0 break-words text-xs font-black capitalize/);
  assert.match(ui, /tabular-nums/);
});


test('Sales Priority 7 links CRM opportunities to quotations without crossing company boundaries', async () => {
  const [
    migration,
    schema,
    registry,
    manifest,
    navigation,
    opportunityUi,
    workspaceUi,
    quoteComposer,
    commands,
    pipeline,
    route,
    salesRoute,
    salesContext,
  ] = await Promise.all([
    source('lib/apps/sales/migrations/3.4.4-to-3.4.5.ts'),
    source('lib/apps/sales/schema.sql'),
    source('lib/apps/runtime-migrations.ts'),
    source('lib/modules/first-party.ts'),
    source('lib/apps/sales/navigation.ts'),
    source('app/apps/sales/SalesPipelineManager.tsx'),
    source('app/apps/sales/SalesWorkspaceClient.tsx'),
    source('app/apps/sales/SalesQuoteComposer.tsx'),
    source('lib/apps/sales/commands.ts'),
    source('lib/apps/sales/pipeline.ts'),
    source('app/apps/sales/opportunities/page.tsx'),
    source('app/api/apps/sales/route.ts'),
    source('lib/apps/sales/context.ts'),
  ]);

  assert.match(migration, /sales-3\.4\.4-to-3\.4\.5/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS opportunity_id UUID/);
  assert.match(migration, /FOREIGN KEY \(opportunity_id\)/);
  assert.match(schema, /opportunity_id UUID/);
  assert.match(schema, /opportunity_id UUID REFERENCES public\.sales_opportunities\(id\) ON DELETE SET NULL/);
  assert.match(registry, /SALES_3_4_4_TO_3_4_5/);
  assert.ok(registry.indexOf('SALES_3_4_3_TO_3_4_4,') < registry.indexOf('SALES_3_4_4_TO_3_4_5,'));
  assert.match(manifest, /key: "sales",[\s\S]*version: '3\.4\.7'/s);

  assert.match(navigation, /'opportunities'/);
  assert.match(navigation, /\/apps\/sales\/opportunities/);
  assert.match(route, /SalesSectionPage view="opportunities"/);
  assert.match(workspaceUi, /SalesPipelineManager/);
  assert.match(workspaceUi, /opportunityId/);
  assert.match(opportunityUi, /Create quotation/);
  assert.match(opportunityUi, /latest_quote_id/);
  assert.match(quoteComposer, /opportunityId:/);
  assert.match(quoteComposer, /linkedOpportunity\?\.id/);

  assert.match(pipeline, /o\.billing_customer_id/);
  assert.match(commands, /OPPORTUNITY_NOT_FOUND/);
  assert.match(commands, /requireUuid\(rawOpportunityId, 'Opportunity'\)/);
  assert.match(commands, /stage_type === 'lost'/);
  assert.match(commands, /opportunity_id = \$3/);
  assert.match(commands, /latest_quote_id = \$3/);
  assert.match(commands, /opportunity\.company_id = \$2/);
  assert.match(opportunityUi, /canManagePipeline/);
  assert.match(workspaceUi, /canManagePipeline=/);
  assert.match(salesContext, /'OPPORTUNITY_NOT_FOUND'/);
  assert.match(salesContext, /'INVALID_OPPORTUNITY_STAGE'/);
  assert.match(salesRoute, /OPPORTUNITY_NOT_FOUND/);
  assert.match(salesRoute, /INVALID_OPPORTUNITY_STAGE/);
});
