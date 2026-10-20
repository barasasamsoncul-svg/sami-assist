import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales commercial quality report requires report and margin permissions', async () => {
  const service = await source('lib/apps/sales/commercial-margin-quality.ts');
  assert.match(service, /SALES_PERMISSIONS\.REPORT_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.MARGIN_VIEW/);
  assert.match(service, /SALES_PERMISSIONS\.MARGIN_MANAGE/);
  assert.match(service, /if \(!canViewReports \|\| !canViewMargins\) \{\s*return \{ \.\.\.EMPTY_REPORT, asOf \};\s*\}/);
});

test('Sales commercial quality is company scoped and uses recent non-deleted quotations and orders', async () => {
  const service = await source('lib/apps/sales/commercial-margin-quality.ts');
  assert.match(service, /q\.company_id = \$1/);
  assert.match(service, /q\.deleted_at IS NULL/);
  assert.match(service, /const REPORT_WINDOW_DAYS = 90/);
  assert.match(service, /q\.quote_date >= CURRENT_DATE - \(\$3::int \* INTERVAL '1 day'\)/);
  assert.match(service, /o\.company_id = \$1/);
  assert.match(service, /o\.deleted_at IS NULL/);
  assert.match(service, /o\.status IN \('confirmed','closed'\)/);
  assert.match(service, /o\.order_date >= CURRENT_DATE - \(\$3::int \* INTERVAL '1 day'\)/);
});

test('Sales commercial quality keeps transaction currencies separate and avoids invalid margin aggregation', async () => {
  const service = await source('lib/apps/sales/commercial-margin-quality.ts');
  const component = await source('app/apps/sales/SalesCommercialMarginQuality.tsx');
  assert.match(service, /GROUP BY document_type, currency/);
  assert.match(service, /SUM\(margin_amount\) \/ SUM\(net_value\)/);
  assert.match(service, /discount_amount \/ subtotal/);
  assert.match(service, /MARGIN_THRESHOLD_PERCENT = 10/);
  assert.match(service, /DISCOUNT_THRESHOLD_PERCENT = 20/);
  assert.match(component, /formatMoney\([^\n]*row\.currency/);
  assert.match(component, /currency/);
  assert.match(component, /returns and later credit notes are not netted into order margin/);
});

test('Sales commercial review queue is limited to open commercial documents and is wired to Sales Reports', async () => {
  const service = await source('lib/apps/sales/commercial-margin-quality.ts');
  const component = await source('app/apps/sales/SalesCommercialMarginQuality.tsx');
  const page = await source('app/apps/sales/SalesSectionPage.tsx');
  const pkg = await source('package.json');
  assert.match(service, /status IN \('draft','sent','viewed','accepted'\)/);
  assert.match(service, /status = 'confirmed'/);
  assert.match(service, /WHERE r\.margin_percent < \$4 OR r\.discount_percent >= \$5/);
  assert.match(service, /PARTITION BY row_type, currency/);
  assert.match(service, /const PER_CURRENCY_RISK_CAP = 350/);
  assert.match(service, /WHERE row_type = 'summary' OR currency_rank <= \$6/);
  assert.match(service, /ORDER BY row_type DESC, currency ASC/);
  assert.match(component, /Commercial review queue/);
  assert.match(page, /getSalesCommercialMarginQualityReport/);
  assert.match(page, /<SalesCommercialMarginQuality report=\{commercialMarginQuality\} \/>/);
  assert.match(pkg, /tests\/sales-commercial-margin-quality\.test\.mjs/);
});
