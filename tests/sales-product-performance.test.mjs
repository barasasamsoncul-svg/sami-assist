import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales product performance is company scoped and report-permission gated', async () => {
  const service = await source('lib/apps/sales/product-performance.ts');
  assert.match(service, /requireSalesContext\(SALES_PERMISSIONS\.QUOTE_VIEW\)/);
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return EMPTY_REPORT/);
  assert.match(service, /i\.company_id = \$1/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /o\.status IN \('confirmed', 'closed'\)/);
});

test('Sales product performance groups stable product identities and currency separately', async () => {
  const service = await source('lib/apps/sales/product-performance.ts');
  const component = await source('app/apps/sales/SalesProductPerformance.tsx');
  assert.match(service, /i\.catalog_item_id IS NOT NULL/);
  assert.match(service, /i\.external_product_id IS NOT NULL/);
  assert.match(service, /ELSE 'description:'/);
  assert.match(service, /GROUP BY product_key, currency/);
  assert.match(service, /PARTITION BY currency/);
  assert.match(service, /WHERE currency_rank <= 250/);
  assert.match(service, /ORDER BY currency ASC, net_sales DESC/);
  assert.match(service, /COUNT\(DISTINCT o\.id\)::int AS order_count/);
  assert.match(service, /SUM\(i\.quantity\)/);
  assert.match(service, /SUM\(i\.shipped_quantity\)/);
  assert.match(service, /SUM\(i\.delivered_quantity\)/);
  assert.match(service, /SUM\(i\.invoiced_quantity\)/);
  assert.match(service, /SUM\(i\.subtotal - i\.discount_amount\)/);
  assert.match(component, /Returns are not netted into these order-line totals/);
  assert.match(component, /row\.currency/);
});

test('Sales product performance uses a trailing 90-day order cohort and renders in Sales Reports', async () => {
  const service = await source('lib/apps/sales/product-performance.ts');
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');
  assert.match(service, /o\.order_date >= CURRENT_DATE - INTERVAL '90 days'/);
  assert.match(page, /getSalesProductPerformance/);
  assert.match(page, /<SalesProductPerformance rows=\{productPerformance\.rows\} \/>/);
  assert.match(packageJson, /tests\/sales-product-performance\.test\.mjs/);
});
