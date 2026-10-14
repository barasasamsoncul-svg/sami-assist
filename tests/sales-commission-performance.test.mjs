import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales commission performance is report and commission permission gated', async () => {
  const service = await source('lib/apps/sales/commission-performance.ts');
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.COMMISSION_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.COMMISSION_MANAGE/);
  assert.match(service, /if \(!canViewReports \|\| !canViewCommissions\) return \{ rows: \[\] \}/);
});

test('Sales commission performance is company scoped and excludes deleted orders', async () => {
  const service = await source('lib/apps/sales/commission-performance.ts');
  assert.match(service, /e\.company_id = \$1/);
  assert.match(service, /e\.accrued_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /o\.id = e\.order_id/);
  assert.match(service, /o\.company_id = e\.company_id/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /t\.company_id = e\.company_id/);
  assert.match(service, /t\.deleted_at IS NULL/);
  assert.match(service, /e\.status = 'accrued'/);
  assert.match(service, /e\.status = 'paid'/);
  assert.match(service, /e\.status = 'reversed'/);
});

test('Sales commission performance resolves active tenant salespeople and keeps currencies separate', async () => {
  const service = await source('lib/apps/sales/commission-performance.ts');
  const ui = await source('app/apps/sales/SalesCommissionPerformance.tsx');
  assert.match(service, /tu\.tenant_id = \$1/);
  assert.match(service, /tu\.status = 'active'/);
  assert.match(service, /tu\.member_type = 'internal'/);
  assert.match(service, /tu\.deleted_at IS NULL/);
  assert.match(service, /u\.deleted_at IS NULL/);
  assert.match(service, /GROUP BY e\.user_id, e\.team_id, t\.name, currency/);
  assert.match(service, /PARTITION BY currency/);
  assert.match(service, /WHERE currency_rank <= 250/);
  assert.match(service, /ORDER BY currency ASC, accrued_amount DESC/);
  assert.match(ui, /new Set\(rows\.map\(row => row\.currency\)\)/);
  assert.match(ui, /currency totals are never combined/);
});

test('Sales Reports renders commission performance and organization card avoids mixed currency totals', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const orgUi = await source('app/apps/sales/SalesOrganizationManager.tsx');
  const pkg = await source('package.json');
  assert.match(page, /getSalesCommissionPerformance/);
  assert.match(page, /<SalesCommissionPerformance rows=\{commissionPerformance\.rows\} \/>/);
  assert.match(orgUi, /activeAccruedByCurrency/);
  assert.match(orgUi, /money\(item\.amount, item\.currency\)/);
  assert.match(pkg, /tests\/sales-commission-performance\.test\.mjs/);
});
