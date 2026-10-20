import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales management insights group historical quote and order amounts by recorded base currency', async () => {
  const service = await source('lib/apps/sales/management-insights.ts');
  assert.match(service, /base_currency AS currency/);
  assert.match(service, /GROUP BY status, base_currency/);
  assert.match(queries, /GROUP BY status,\s*base_currency/);
  assert.match(queries, /GROUP BY customer_name,\s*base_currency/);
  assert.match(queries, /GROUP BY base_currency\s+ORDER BY base_currency/);
  assert.match(service, /GROUP BY customer_name, base_currency/);
  assert.match(service, /GROUP BY base_currency\s+ORDER BY base_currency/);
  assert.match(service, /GROUP BY months\.month_start, currencies\.currency/);
  assert.match(service, /o\.base_currency AS currency/);
  assert.match(service, /ROW_NUMBER\(\) OVER/);
  assert.match(service, /PARTITION BY currency/);
  assert.match(service, /COALESCE\(viewed_at::date, sent_at::date, quote_date\) ASC/);
  assert.match(service, /openQuoteValueByCurrency/);
  assert.match(service, /bookedOrderValueByCurrency/);
});

test('Sales management insights render each currency in KPIs, follow-up items, and breakdown rows', async () => {
  const component = await source('app/apps/sales/SalesManagementInsights.tsx');
  assert.match(component, /formatCurrencyBreakdown\(summary\.openQuoteValueByCurrency, currency\)/);
  assert.match(component, /formatCurrencyBreakdown\(\s*data\.orderSummary\.bookedOrderValueByCurrency,\s*currency\s*\)/);
  assert.match(component, /formatMoney\(item\.amount, item\.currency\)/);
  assert.match(component, /row\.month \+ '-' \+ row\.currency/);
  assert.match(component, /grouped by recorded base currency/);
  assert.doesNotMatch(component, /summary\.openQuoteValue\b/);
  assert.doesNotMatch(component, /orderSummary\.bookedOrderValue\b/);
});

test('Sales management insights currency regression is in the Sales validation suite', async () => {
  const packageJson = JSON.parse(await source('package.json',));
  assert.match(packageJson.scripts['test:sales'], /sales-management-insights-currency\.test\.mjs/);
});
