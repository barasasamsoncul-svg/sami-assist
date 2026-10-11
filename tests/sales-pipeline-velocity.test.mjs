import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales pipeline velocity is report-permission gated and scoped to the active company', async () => {
  const service = await source('lib/apps/sales/pipeline-velocity.ts');

  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return \{ transitions: \[\] \}/);
  assert.match(service, /h\.company_id = \$1/);
  assert.match(service, /o\.company_id = h\.company_id/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /from_stage\.company_id = \$1/);
  assert.match(service, /to_stage\.company_id = \$1/);
});

test('Sales pipeline velocity uses event history to calculate source-stage dwell time', async () => {
  const service = await source('lib/apps/sales/pipeline-velocity.ts');

  assert.match(service, /LAG\(h\.created_at\) OVER/);
  assert.match(service, /LAG\(h\.to_stage_id\) OVER/);
  assert.match(service, /PARTITION BY h\.company_id, h\.opportunity_id/);
  assert.match(service, /ORDER BY h\.created_at, h\.id/);
  assert.match(service, /previous_to_stage_id = from_stage_id/);
  assert.match(service, /opportunity_created_at/);
  assert.match(service, /created_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /from_stage_id IS NOT NULL/);
  assert.match(service, /from_stage_id <> to_stage_id/);
  assert.match(service, /percentile_cont\(0\.5\) WITHIN GROUP/);
  assert.match(service, /AS average_days_in_stage/);
  assert.match(service, /AS max_days_in_stage/);
});

test('Sales pipeline velocity ranks bottlenecks by median dwell time and caps the report size', async () => {
  const service = await source('lib/apps/sales/pipeline-velocity.ts');
  const component = await source('app/apps/sales/SalesPipelineVelocity.tsx');

  assert.match(service, /ORDER BY[\s\S]*percentile_cont\(0\.5\) WITHIN GROUP[\s\S]*COUNT\(\*\) DESC/);
  assert.match(service, /LIMIT 15/);
  assert.match(service, /COUNT\(DISTINCT t\.opportunity_id\)::int AS opportunity_count/);
  assert.match(component, /Pipeline stage velocity/);
  assert.match(component, /slowest median transitions appear first/i);
  assert.match(component, /Median time/);
  assert.match(component, /Average time/);
  assert.match(component, /Longest/);
});

test('Sales Reports loads the pipeline velocity report only on the Reports view', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');

  assert.match(page, /getSalesPipelineVelocityReport/);
  assert.match(page, /reportsAvailable = view === 'reports' && data\.capabilities\.canViewReports/);
  assert.match(page, /pipelineVelocityReport/);
  assert.match(page, /<SalesPipelineVelocity transitions=\{pipelineVelocityReport\.transitions\} \/>/);
  assert.match(packageJson, /tests\/sales-pipeline-velocity\.test\.mjs/);
});
