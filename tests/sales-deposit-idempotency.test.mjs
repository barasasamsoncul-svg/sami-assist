import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales order deposit creation serializes the order and stabilizes cross-module retries', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function recordSalesOrderDeposit(');
  const end = operations.indexOf('export async function applySalesOrderDeposit(', start);
  assert.ok(start >= 0 && end > start, 'order deposit command must exist');

  const deposit = operations.slice(start, end);
  const begin = deposit.indexOf("await client.query('BEGIN')");
  const rowLock = deposit.indexOf('FOR UPDATE OF o');
  const retainer = deposit.indexOf('await recordCustomerRetainer(');
  const update = deposit.indexOf('UPDATE sales_orders_v2');
  const commit = deposit.indexOf("await client.query('COMMIT')");

  assert.ok(begin >= 0 && rowLock > begin, 'the order row must be locked within a transaction');
  assert.ok(rowLock < retainer, 'serialize requests before creating an Invoicing retainer');
  assert.ok(retainer < update && update < commit, 'link the retainer to the Sales order before committing');
  assert.match(deposit, /salesOrderDepositIdempotencyKey\(orderId\)/);
  assert.match(deposit, /if \(order\.deposit_payment_id\)/);
  assert.match(deposit, /Math\.abs\(money\(deposit\.amount\) - amount\) > 0\.0001/);
  assert.doesNotMatch(deposit, /cleanText\(input\.idempotencyKey/);
});

test('Sales order deposit concurrency and retry regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-deposit-idempotency\.test\.mjs/);
});
