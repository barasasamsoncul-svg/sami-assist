import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales target attainment report requires both reporting and target permissions', async () => {
  const service = await source('lib/apps/sales/target-attainment-report.ts');
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.TARGET_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.TARGET_MANAGE/);
  assert.match(service, /if \(!canViewReports \|\| !canViewTargets\)/);
  assert.match(service, /target\.company_id = \$1/);
  assert.match(service, /target\.deleted_at IS NULL/);
  assert.match(service, /target\.is_active = TRUE/);
});

test('Sales targets use bounded periods and count only confirmed non-cancelled orders through today', async () => {
  const service = await source('lib/apps/sales/target-attainment-report.ts');
  assert.match(service, /target\.period_end >= CURRENT_DATE - INTERVAL '90 days'/);
  assert.match(service, /target\.period_start <= CURRENT_DATE \+ INTERVAL '90 days'/);
  assert.match(service, /sales_order\.status IN \('confirmed', 'closed'\)/);
  assert.match(service, /sales_order\.order_date\s+BETWEEN target\.period_start AND LEAST\(target\.period_end, CURRENT_DATE\)/);
  assert.match(service, /target\.target_scope = 'company'/);
  assert.match(service, /sales_order\.sales_team_id = target\.team_id/);
  assert.match(service, /sales_order\.salesperson_user_id = target\.user_id/);
});

test('Sales revenue and margin actuals are rounded per order and converted to company currency', async () => {
  const service = await source('lib/apps/sales/target-attainment-report.ts');
  assert.match(service, /sales_order\.subtotal - sales_order\.discount_total/);
  assert.match(service, /sales_order\.margin_amount/);
  assert.match(service, /COALESCE\(sales_order\.exchange_rate, 1\)/);
  assert.match(service, /ROUND\([\s\S]*?exchange_rate[\s\S]*?,\s*2\s*\)/);
  assert.match(service, /companyCurrency/);
});

test('Sales target report resolves only active internal tenant users and renders each metric independently', async () => {
  const service = await source('lib/apps/sales/target-attainment-report.ts');
  const component = await source('app/apps/sales/SalesTargetAttainmentReport.tsx');
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const pkg = await source('package.json');
  assert.match(service, /tu\.tenant_id = \$1/);
  assert.match(service, /tu\.status = 'active'/);
  assert.match(service, /tu\.member_type = 'internal'/);
  assert.match(component, /metrics\.map/);
  assert.match(component, /report\.companyCurrency/);
  assert.match(page, /getSalesTargetAttainmentReport/);
  assert.match(page, /<SalesTargetAttainmentReport report=\{targetAttainmentReport\} \/>/);
  assert.match(pkg, /tests\/sales-target-attainment-report\.test\.mjs/);
});
