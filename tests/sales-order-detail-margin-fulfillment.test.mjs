import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales order detail uses shippable quantity after shipped and planned shipment reservations', async () => {
  const [query, types, client] = await Promise.all([
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  assert.match(query, /AS planned_quantity/);
  assert.match(query, /shipment\.status NOT IN \('cancelled', 'failed'\)/);
  assert.match(query, /shipment\.inventory_posted_at IS NULL/);
  assert.match(query, /plannedQuantity:\s*Number\(line\.planned_quantity \|\| 0\)/);
  assert.match(client, /line\.quantity -\s*line\.shippedQuantity -\s*line\.plannedQuantity/);
  assert.match(client, /not yet shipped or assigned to a shipment/);
  assert.match(types, /plannedQuantity: number/);
});

test('Sales order detail returns margin values only for users with margin visibility', async () => {
  const [query, types, client] = await Promise.all([
    source('lib/apps/sales/queries.ts'),
    source('lib/apps/sales/types.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  assert.match(query, /const access = salesCapabilities\(/);
  assert.match(query, /canViewMargin:\s*can\([\s\S]*?SALES_PERMISSIONS\s*\.MARGIN_VIEW/);
  assert.match(query, /costTotal:\s*access\.canViewMargin\s*\? money\(row\.cost_total\)\s*:\s*null/);
  assert.match(query, /marginAmount:\s*access\.canViewMargin\s*\? money\(row\.margin_amount\)\s*:\s*null/);
  assert.match(query, /marginPercent:\s*access\.canViewMargin\s*\? money\(row\.margin_percent\)\s*:\s*null/);
  assert.match(query, /unitCost:\s*access\.canViewMargin\s*\? money\(line\.unit_cost\)\s*:\s*null/);
  assert.match(query, /costTotal:\s*access\.canViewMargin\s*\? money\(line\.cost_total\)\s*:\s*null/);
  assert.match(query, /marginAmount:\s*access\.canViewMargin\s*\? money\(line\.margin_amount\)\s*:\s*null/);
  assert.match(query, /marginPercent:\s*access\.canViewMargin\s*\? money\(line\.margin_percent\)\s*:\s*null/);

  const orderDetailType = types.slice(types.indexOf('export type SalesOrderDetail ='));
  assert.match(orderDetailType, /unitCost: number \| null/);
  assert.match(orderDetailType, /costTotal: number \| null/);
  assert.match(orderDetailType, /marginAmount: number \| null/);
  assert.match(orderDetailType, /marginPercent: number \| null/);
  assert.match(orderDetailType, /marginCommissionStale: boolean/);

  assert.match(client, /workspace\.capabilities\.canViewMargin &&/);
  assert.match(client, /Cost \/ Margin/);
  assert.match(client, /Cost \/ margin summary/);
});

test('Sales order detail flags received returns with still-accrued commissions and uses SaMi alerts', async () => {
  const [query, client] = await Promise.all([
    source('lib/apps/sales/queries.ts'),
    source('app/apps/sales/SalesOrderDetailClient.tsx'),
  ]);

  assert.match(query, /AS margin_commission_stale/);
  assert.match(query, /received_return\.status = 'received'/);
  assert.match(query, /commission_entry\.status = 'accrued'/);
  assert.match(query, /marginCommissionStale:\s*row\.margin_commission_stale === true/);

  assert.match(client, /order\.marginCommissionStale &&/);
  assert.match(client, /Received return with accrued commissions/);
  assert.match(client, /showWarning\(/);
  assert.match(client, /<SaMiOverlay/);
  assert.match(client, /useSaMiOverlay/);
});
