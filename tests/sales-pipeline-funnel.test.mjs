import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales opportunity funnel is report-permission gated and scoped to the active company', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');

  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /hasSalesPermission/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return \[\]/);
  assert.match(service, /WHERE s\.company_id = \$1/);
  assert.match(service, /o\.company_id = s\.company_id/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /s\.deleted_at IS NULL/);
});

test('Sales opportunity funnel reports counts and correct value by open, won and lost stages', async () => {
  const service = await source('lib/apps/sales/pipeline-funnel.ts');
  const component = await source('app/apps/sales/SalesOpportunityFunnel.tsx');

  assert.match(service, /COUNT\(o\.id\)::int AS opportunity_count/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'open'\)/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'won'\)/);
  assert.match(service, /FILTER \(WHERE s\.stage_type = 'lost'\)/);
  assert.match(service, /weighted_pipeline_value/);
  assert.match(service, /GROUP BY s\.id, s\.name, s\.sequence, s\.stage_type, s\.probability, currency/);
  assert.match(service, /ORDER BY s\.sequence ASC/);
  assert.match(component, /Open pipeline value/);
  assert.match(component, /Won value/);
  assert.match(component, /Lost value/);
  assert.match(component, /Weighted value/);
  assert.match(component, /new Set\(rows\.map\(row => row\.currency\)\)/);
  assert.match(component, /CURRENCIES ARE REPORTED SEPARATELY|Currencies are reported separately/);
});

test('Sales Reports render stage funnel data without changing other Sales route views', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');

  assert.match(page, /getSalesOpportunityFunnelData/);
  assert.match(page, /reportsAvailable/);
  assert.match(page, /<SalesOpportunityFunnel rows=\{opportunityFunnel\} \/>/);
  assert.match(page, /view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(packageJson, /tests\/sales-pipeline-funnel\.test\.mjs/);
});
