import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales quotation effectiveness is report-permission gated and company scoped', async () => {
  const service = await source('lib/apps/sales/quotation-effectiveness.ts');
  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return/);
  assert.match(service, /q\.company_id = \$1/);
  assert.match(service, /q\.deleted_at IS NULL/);
  assert.match(service, /const REPORT_WINDOW_DAYS = 90/);
  assert.match(service, /q\.quote_date >= CURRENT_DATE - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /q\.quote_date <= CURRENT_DATE/);
});

test('Sales quotation effectiveness uses recorded lifecycle timestamps and linked-order conversion', async () => {
  const service = await source('lib/apps/sales/quotation-effectiveness.ts');
  assert.match(service, /sent_at IS NOT NULL/);
  assert.match(service, /accepted_at IS NOT NULL/);
  assert.match(service, /sales_order_id IS NOT NULL OR status = 'converted'/);
  assert.match(service, /rejected_at IS NOT NULL OR status = 'rejected'/);
  assert.match(service, /expired_at IS NOT NULL OR status = 'expired'/);
  assert.match(service, /accepted_at - sent_at/);
  assert.match(service, /converted_at - accepted_at/);
  assert.match(service, /acceptedToOrderRate/);
});

test('Sales quotation effectiveness keeps transaction currencies separate and resolves only active tenant users', async () => {
  const service = await source('lib/apps/sales/quotation-effectiveness.ts');
  const component = await source('app/apps/sales/SalesQuotationEffectiveness.tsx');
  assert.match(service, /GROUP BY salesperson_user_id, currency/);
  assert.match(service, /GROUP BY template_id, template_name, currency/);
  assert.match(service, /PARTITION BY dimension_type,\s*currency/);
  assert.match(service, /tu\.tenant_id = \$1/);
  assert.match(service, /tu\.status = 'active'/);
  assert.match(service, /tu\.member_type = 'internal'/);
  assert.match(component, /new Set\(rows\.map\(\(row\) => row\.currency\)\)/);
  assert.match(component, /money\(row\.(quotedValue|convertedValue),\s*currency\)/);
  assert.match(component, /Salesperson quote effectiveness/);
  assert.match(component, /Quotation template effectiveness/);
});

test('Sales Reports loads and renders quotation effectiveness and its regression suite', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const pkg = await source('package.json');
  assert.match(page, /getSalesQuotationEffectivenessReport/);
  assert.match(page, /quotationEffectiveness/);
  assert.match(page, /<SalesQuotationEffectiveness report=\{quotationEffectiveness\} \/>/);
  assert.match(pkg, /tests\/sales-quotation-effectiveness\.test\.mjs/);
});
