import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales target revenue and margin attainment are converted into company currency', async () => {
  const organization = await source('lib/apps/sales/organization.ts');
  assert.match(organization, /sales_order\.subtotal - sales_order\.discount_total[\s\S]*?COALESCE\(sales_order\.exchange_rate, 1\)/);
  assert.match(organization, /sales_order\.margin_amount \* COALESCE\(sales_order\.exchange_rate, 1\)/);
  assert.match(organization, /target\.metric =[\s\S]*?'orders'[\s\S]*?COUNT\(\*\)::numeric/);
  assert.match(organization, /companyCurrency: String\(context\.company\.currentCompany\.currency/);
});

test('Sales target actuals remain scoped to company, period and non-cancelled orders', async () => {
  const organization = await source('lib/apps/sales/organization.ts');
  assert.match(organization, /sales_order\.company_id =[\s\S]*?target\.company_id/);
  assert.match(organization, /sales_order\.deleted_at[\s\S]*?IS NULL/);
  assert.match(organization, /sales_order\.status[\s\S]*?<>\s*'cancelled'/);
  assert.match(organization, /sales_order\.order_date BETWEEN[\s\S]*?target\.period_start[\s\S]*?target\.period_end/);
  assert.match(organization, /target\.target_scope =[\s\S]*?'company'/);
  assert.match(organization, /sales_order\.sales_team_id =[\s\S]*?target\.team_id/);
  assert.match(organization, /sales_order\.salesperson_user_id =[\s\S]*?target\.user_id/);
});

test('Sales target UI formats monetary values in company currency and keeps order targets as counts', async () => {
  const ui = await source('app/apps/sales/SalesOrganizationManager.tsx');
  const pkg = await source('package.json');
  assert.match(ui, /companyCurrency: string/);
  assert.match(ui, /const isOrder = target\.metric === 'orders'/);
  assert.match(ui, /isOrder\s*\?\s*target\.actualValue\.toLocaleString\(\)\s*:\s*formatMoney\(target\.actualValue,\s*data\.companyCurrency\)/);
  assert.match(ui, /isOrder\s*\?\s*target\.targetValue\.toLocaleString\(\)\s*:\s*formatMoney\(\s*target\.targetValue,\s*data\.companyCurrency/);
  assert.match(ui, /Revenue and margin targets use company currency/);
  assert.match(pkg, /tests\/sales-target-attainment\.test\.mjs/);
});
