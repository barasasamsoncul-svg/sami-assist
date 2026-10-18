import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

function section(sourceText, startMarker, endMarker) {
  const start = sourceText.indexOf(startMarker);
  const end = sourceText.indexOf(endMarker, start);
  assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
  return sourceText.slice(start, end);
}

test('shipment status transitions emit fulfillment automation only after commit', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const fn = section(
    operations,
    'export async function updateSalesShipmentStatus(',
    'type SalesReturnCreateDependencies',
  );
  const commit = fn.indexOf("await client.query(\n      'COMMIT',\n    );");
  const event = fn.indexOf("triggerKey: 'sales.order.fulfillment.changed'");
  assert.ok(commit >= 0 && event > commit, 'shipment fulfillment automation must be post-commit');
  assert.match(fn, /fulfillment:'\s*\+\s*orderId\s*\+\s*':'\s*\+\s*fulfillmentSnapshot\.fulfillmentStatus\s*\+\s*':'\s*\+\s*fulfillmentSnapshot\.deliveredQuantity/);
  assert.match(fn, /orderedQuantity: fulfillmentSnapshot\.orderedQuantity/);
  assert.match(fn, /deliveredQuantity: fulfillmentSnapshot\.deliveredQuantity/);
});

test('receiving a sales return emits the recalculated fulfillment state after commit', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const fn = section(
    operations,
    'export async function receiveSalesReturnTransaction(',
    'export async function receiveSalesReturn(',
  );
  const commit = fn.indexOf("await client.query(\n      'COMMIT',\n    );");
  const event = fn.indexOf("triggerKey: 'sales.order.fulfillment.changed'");
  assert.match(fn, /const fulfillmentSnapshot = await recalculateOrderFulfillment/);
  assert.ok(commit >= 0 && event > commit, 'return fulfillment automation must be post-commit');
  assert.match(fn, /'fulfillment:'\s*\+\s*orderId\s*\+\s*':'\s*\+\s*fulfillmentSnapshot\.fulfillmentStatus/);
});

test('shipment creation documents that planned quantities do not dispatch fulfillment-changed', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const fn = section(
    operations,
    'export async function createSalesShipment(',
    'export async function updateSalesShipmentStatus(',
  );
  assert.match(fn, /Shipment creation changes planned quantities only/);
  assert.doesNotMatch(fn, /triggerKey:\s*'sales\.order\.fulfillment\.changed'/);
});

test('return credits prorate invoice line totals by credited quantity and reverse commissions by currency', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const fn = section(
    operations,
    'export async function issueSalesReturnCreditTransaction(',
    'export async function issueSalesReturnCredit(',
  );
  assert.match(fn, /invoice_item\.line_total/);
  assert.match(fn, /invoice\.currency/);
  assert.match(fn, /invoiceItemLineTotal:\s*number/);
  assert.match(fn, /line\.invoiceItemLineTotal\s*\*\s*\(line\.quantity\s*\/\s*line\.invoiceItemQuantity\)/);
  assert.match(fn, /returnedValueByCurrency:\s*Array\.from\(returnedAmountsByCurrency/);
  assert.match(fn, /reverseSalesOrderCommissionsForReturn\(/);
  assert.match(fn, /commissionReversals/);
  assert.match(fn, /commissionReversals,\s*$/);
});

test('deposit received and applied events are post-commit and use stable order/invoice idempotency seeds', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const received = section(
    operations,
    'export async function recordSalesOrderDeposit(',
    'export async function applySalesOrderDeposit(',
  );
  const receivedCommit = received.indexOf("await client.query('COMMIT')");
  const receivedEvent = received.indexOf("triggerKey: 'sales.deposit.received'");
  assert.ok(receivedCommit >= 0 && receivedEvent > receivedCommit);
  assert.match(received, /'deposit-received:'\s*\+\s*orderId/);

  const applied = section(
    operations,
    'export async function applySalesOrderDeposit(',
    'export async function createSalesShipment(',
  );
  assert.equal((applied.match(/triggerKey: 'sales\.deposit\.applied'/g) || []).length, 2);
  assert.match(applied, /'deposit-applied:'\s*\+\s*orderId\s*\+\s*':'\s*\+\s*invoiceId\s*\+\s*':'\s*\+\s*nextStatus/);
  assert.equal((applied.match(/await client\.query\('COMMIT'\);/g) || []).length, 2);
});

test('deposit-applied is a registered Sales automation event and the helper is shared', async () => {
  const automation = await source('lib/apps/sales/automation.ts');
  const commands = await source('lib/apps/sales/commands.ts');
  const operations = await source('lib/apps/sales/operations.ts');
  assert.match(automation, /key:\s*'sales\.deposit\.applied'/);
  assert.match(commands, /export async function emitSalesAutomationEvent\(/);
  assert.match(operations, /from '@\/lib\/apps\/sales\/commands'/);
});

test('F16 operations checks are included in the Sales CI suite', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-f16-operation-automation\.test\.mjs/);
});
