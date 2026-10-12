import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales lead source effectiveness is company scoped and report-permission gated', async () => {
  const service = await source('lib/apps/sales/lead-source-effectiveness.ts');
  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return EMPTY_REPORT/);
  assert.match(service, /l\.company_id = \$1/);
  assert.match(service, /l\.deleted_at IS NULL/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /s\.company_id = o\.company_id/);
  assert.match(service, /s\.deleted_at IS NULL/);
});

test('Sales lead source conversion uses a recent lead cohort and accurate conversion timing', async () => {
  const service = await source('lib/apps/sales/lead-source-effectiveness.ts');
  assert.match(service, /l\.created_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /COALESCE\(NULLIF\(BTRIM\(l\.source\), ''\), 'Unspecified'\)/);
  assert.match(service, /status = 'new'/);
  assert.match(service, /status = 'contacted'/);
  assert.match(service, /status = 'qualified'/);
  assert.match(service, /status = 'converted'/);
  assert.match(service, /status = 'disqualified'/);
  assert.match(service, /AS conversion_rate/);
  assert.match(service, /o\.created_at - l\.created_at/);
  assert.match(service, /AS average_days_to_convert/);
});

test('Sales lead source value analysis keeps pipeline outcomes separated by currency', async () => {
  const service = await source('lib/apps/sales/lead-source-effectiveness.ts');
  const component = await source('app/apps/sales/SalesLeadSourceEffectiveness.tsx');
  assert.match(service, /GROUP BY l\.source, currency/);
  assert.match(service, /AS open_pipeline_value/);
  assert.match(service, /AS weighted_pipeline_value/);
  assert.match(service, /AS overdue_opportunity_count/);
  assert.match(service, /AS won_value/);
  assert.match(service, /AS lost_value/);
  assert.match(component, /Opportunity value by lead source/);
  assert.match(component, /kept separate by currency/);
});

test('Sales Reports loads and renders lead-source conversion and value attribution', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');
  assert.match(page, /getSalesLeadSourceEffectiveness/);
  assert.match(page, /leadSourceEffectiveness/);
  assert.match(page, /<SalesLeadSourceEffectiveness report=\{leadSourceEffectiveness\} \/>/);
  assert.match(packageJson, /tests\/sales-lead-source-effectiveness\.test\.mjs/);
});
