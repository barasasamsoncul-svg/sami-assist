import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales return credit retries derive credited quantities from persisted allocation rows', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function issueSalesReturnCredit(');
  const end = operations.indexOf('export async function refundSalesReturnCredit(', start);
  assert.ok(start >= 0 && end > start, 'return-credit issuance function must exist');

  const credit = operations.slice(start, end);
  const allocationInsert = credit.indexOf('INSERT INTO sales_return_credit_items');
  const quantityReconciliation = credit.indexOf('SET credited_quantity = LEAST(');

  assert.ok(allocationInsert >= 0, 'persist return-to-invoice-line allocation before reconciling quantities');
  assert.ok(quantityReconciliation > allocationInsert, 'reconcile after allocation rows are persisted');
  assert.match(credit, /SELECT SUM\(credit_item\.quantity\)/);
  assert.match(credit, /FROM sales_return_credit_items credit_item/);
  assert.match(credit, /INNER JOIN sales_return_items return_item/);
  assert.match(credit, /INNER JOIN sales_return_credits return_credit/);
  assert.match(credit, /return_credit\.return_id = return_item\.return_id/);
  assert.match(credit, /return_item\.sales_order_line_id = line\.id/);
  assert.doesNotMatch(
    credit,
    /credited_quantity\s*=\s*LEAST\([\s\S]*?credited_quantity\s*\+\s*\$4/,
    'retrying the same idempotent credit must not increment the stored quantity a second time',
  );
});

test('Sales return-credit idempotency regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-return-credit-idempotency\.test\.mjs/);
});
