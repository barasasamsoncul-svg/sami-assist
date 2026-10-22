import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales representative performance is company scoped and report-permission gated', async () => {
  const service = await source('lib/apps/sales/representative-performance.ts');
  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) \{\s*return \{ rows: EMPTY_ROWS, windowDays: REPORT_WINDOW_DAYS, asOf \};\s*\}/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /s\.deleted_at IS NULL/);
  assert.match(service, /s\.company_id = o\.company_id/);
});

test('Sales representative performance measures open, weighted and overdue pipeline plus 90-day outcomes', async () => {
  const service = await source('lib/apps/sales/representative-performance.ts');
  const component = await source('app/apps/sales/SalesRepresentativePerformance.tsx');
  assert.match(service, /AS open_pipeline_value/);
  assert.match(service, /AS weighted_pipeline_value/);
  assert.match(service, /LEAST\(100, GREATEST\(0, COALESCE\(o\.probability, s\.probability, 0\)\)\)/);
  assert.match(service, /o\.expected_close_date < CURRENT_DATE/);
  assert.match(service, /const REPORT_WINDOW_DAYS = 90/);
  assert.match(service, /o\.won_at >= NOW\(\) - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /o\.lost_at >= NOW\(\) - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /AS win_rate_90_days/);
  assert.match(service, /GROUP BY o\.salesperson_user_id, currency/);
  assert.match(component, /new Set\(rows\.map\(row => row\.currency\)\)/);
  assert.match(component, /Win rate · 90d/);
});

test('Sales representative names resolve from active internal members and report appears in Sales Reports', async () => {
  const service = await source('lib/apps/sales/representative-performance.ts');
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const pkg = await source('package.json');
  assert.match(service, /tu\.tenant_id = \$1/);
  assert.match(service, /tu\.status = 'active'/);
  assert.match(service, /tu\.member_type = 'internal'/);
  assert.match(service, /tu\.deleted_at IS NULL/);
  assert.match(service, /u\.deleted_at IS NULL/);
  assert.match(page, /getSalesRepresentativePerformance/);
  assert.match(page, /<SalesRepresentativePerformance rows=\{representativePerformance\.rows\} \/>/);
  assert.match(pkg, /tests\/sales-representative-performance\.test\.mjs/);
});
