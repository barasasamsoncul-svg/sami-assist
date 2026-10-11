import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales return and fulfillment report requires report access and scopes operational access separately', async () => {
  const service = await source('lib/apps/sales/return-fulfillment-quality.ts');
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /if \(!canViewReports\) return EMPTY_REPORT/);
  assert.match(service, /SALES_PERMISSIONS\.RETURN_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.RETURN_MANAGE/);
  assert.match(service, /SALES_PERMISSIONS\.SHIPPING_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.SHIPPING_MANAGE/);
  assert.match(service, /canViewReturns \? context\.pool\.query/);
  assert.match(service, /canViewShipping \? context\.pool\.query/);
});

test('Sales return report avoids item-credit join multiplication and keeps credit currencies separate', async () => {
  const service = await source('lib/apps/sales/return-fulfillment-quality.ts');
  assert.match(service, /WITH item_totals AS/);
  assert.match(service, /WITH credit_totals AS/);
  assert.match(service, /sales_returns r/);
  assert.match(service, /r\.company_id = \$1/);
  assert.match(service, /r\.requested_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /o\.status <> 'cancelled'/);
  assert.match(service, /GROUP BY status, currency/);
  assert.match(service, /GROUP BY reason, currency/);
});

test('Sales shipment quality reports only recorded durations and filters to recent active-company orders', async () => {
  const service = await source('lib/apps/sales/return-fulfillment-quality.ts');
  const component = await source('app/apps/sales/SalesReturnFulfillmentQuality.tsx');
  assert.match(service, /FROM sales_shipments s/);
  assert.match(service, /s\.company_id = \$1/);
  assert.match(service, /s\.created_at >= NOW\(\) - INTERVAL '90 days'/);
  assert.match(service, /s\.shipped_at IS NOT NULL/);
  assert.match(service, /s\.delivered_at IS NOT NULL/);
  assert.match(component, /not promised delivery dates/);
  assert.match(component, /Recorded reasons can be free-form/);
  assert.match(component, /credit, available credit, and refunds are kept separate by currency/i);
});

test('Sales return and fulfillment quality report is integrated with Sales Reports and regression suite', async () => {
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const packageJson = await source('package.json');
  assert.match(page, /getSalesReturnFulfillmentQualityReport/);
  assert.match(page, /returnFulfillmentQuality/);
  assert.match(page, /<SalesReturnFulfillmentQuality report=\{returnFulfillmentQuality\} \/>/);
  assert.match(packageJson, /tests\/sales-return-fulfillment-quality\.test\.mjs/);
});
