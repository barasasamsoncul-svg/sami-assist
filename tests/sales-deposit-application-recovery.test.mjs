import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales deposit application serializes per order and recovers a committed Invoicing allocation', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function applySalesOrderDeposit(');
  const end = operations.indexOf('\nexport async function ', start + 1);
  assert.ok(start >= 0 && end > start, 'deposit application command must exist');

  const apply = operations.slice(start, end);
  const begin = apply.indexOf("await client.query('BEGIN')");
  const orderLock = apply.indexOf('FOR UPDATE OF o');
  const balances = apply.indexOf('const [paymentBalanceResult, agingResult]');
  const recoveryLookup = apply.indexOf('FROM invoicing_payment_allocations');
  const recoveryReturn = apply.indexOf('reused: true');
  const allocate = apply.indexOf('await allocateInvoicePayment(');
  const statusUpdate = apply.indexOf('UPDATE sales_orders_v2');
  const commit = apply.indexOf("await client.query('COMMIT')");

  assert.ok(begin >= 0 && orderLock > begin, 'order application must be serialized in a transaction');
  assert.ok(orderLock < balances, 'mutable balances must be read after acquiring the order lock');
  assert.ok(balances < recoveryLookup && recoveryLookup < allocate, 'check for a previously committed allocation before creating another');
  assert.ok(recoveryReturn > recoveryLookup && recoveryReturn < allocate, 'recover the previous allocation without creating a duplicate');
  assert.ok(statusUpdate > orderLock && commit > statusUpdate, 'persist the Sales status before releasing the order lock');
  assert.match(apply, /operation_key = \$4/);
  assert.match(apply, /Math\.abs\(requestedAmount - existingAmount\) > 0\.0001/);
  assert.match(apply, /await client\.query\('ROLLBACK'\)/);
});

test('Sales deposit-application recovery regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-deposit-application-recovery\.test\.mjs/);
});
