import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales revenue outlook aggregates only comparable base-currency amounts', async () => {
  const service = await source('lib/apps/sales/operations.ts');
  const queryStart = service.indexOf('WITH quote_pipeline AS (', service.indexOf('export async function getSalesOperationsData('));
  const queryEnd = service.indexOf('INSERT INTO sales_forecast_snapshots', queryStart);
  assert.ok(queryStart >= 0 && queryEnd > queryStart, 'currency-aware forecast query and normalization must exist');
  const forecast = service.slice(queryStart, queryEnd);

  assert.match(forecast, /base_total_amount/);
  assert.match(forecast, /base_currency AS currency/);
  assert.match(forecast, /GROUP BY base_currency/);
  assert.match(
    forecast,
    /AND \(\s*status = 'accepted'\s+OR valid_until IS NULL\s+OR valid_until >= CURRENT_DATE\s*\)/,
    'expired but accepted quotations remain forecastable, while other expired quotations are excluded',
  );
  assert.match(
    forecast,
    /COUNT\\(\\*\\) FILTER \\(\\s*WHERE status IN \\('draft'\\s*,\\s*'sent'\\s*,\\s*'viewed'\\)\\s*AND valid_until IS NOT NULL/ ,
    'accepted quotations must not be counted as expiring offers',
  );
  assert.match(forecast, /currencies AS \([\s\S]*?SELECT currency FROM quote_pipeline[\s\S]*?UNION[\s\S]*?SELECT currency FROM committed/);
  assert.match(forecast, /ORDER BY currencies\.currency/);
  assert.doesNotMatch(forecast, /SUM\(total_amount\)/);
  assert.doesNotMatch(forecast, /SUM\([\s\S]*?subtotal[\s\S]*?discount_total/);
  assert.match(forecast, /currencyBreakdown:\s*forecastCurrencies/);
  assert.match(forecast, /baseCurrencyForecast\?\.expectedRevenue/);
  assert.match(forecast, /baseCurrency:\s*companyBaseCurrency/);
});

test('Sales Revenue Outlook displays currency-specific totals instead of labeling a mixed sum as KES', async () => {
  const component = await source('app/apps/sales/SalesOperationsManager.tsx');
  const helperStart = component.indexOf('function forecastValue(');
  const helperEnd = component.indexOf('async function refresh(', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'currency-aware forecast formatter must exist');
  const helper = component.slice(helperStart, helperEnd);
  assert.match(helper, /item\[metric\], item\.currency/);
  assert.match(helper, /\.join\(' · '\)/);
  assert.match(component, /currencyBreakdown: Array<\{/);
  assert.match(component, /forecastValue\('expectedRevenue'\)/);
  assert.match(component, /forecastValue\('weightedPipeline'\)/);
  assert.match(component, /forecastValue\('committedOrders'\)/);
});

test('Sales forecast snapshots preserve full per-currency breakdown in metadata', async () => {
  const service = await source('lib/apps/sales/operations.ts');
  const snapshotStart = service.indexOf('INSERT INTO sales_forecast_snapshots');
  const snapshotEnd = service.indexOf('return {', snapshotStart);
  assert.ok(snapshotStart >= 0 && snapshotEnd > snapshotStart, 'forecast snapshot writer must exist');
  const snapshot = service.slice(snapshotStart, snapshotEnd);
  assert.match(snapshot, /baseCurrency:\s*companyBaseCurrency/);
  assert.match(snapshot, /currencyBreakdown:\s*forecastData\.currencyBreakdown/);
});

test('Sales forecast currency regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-forecast-currency-breakdown\.test\.mjs/);
});
