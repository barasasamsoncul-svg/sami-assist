import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales return credit counters change only when a new allocation is committed', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function issueSalesReturnCredit(');
  const end = operations.indexOf('export async function refundSalesReturnCredit(', start);
  assert.ok(start >= 0 && end > start, 'return-credit issuance function must exist');

  const credit = operations.slice(start, end);
  const saved = credit.indexOf('INSERT INTO sales_return_credits');
  const allocation = credit.indexOf('INSERT INTO sales_return_credit_items');
  const counterUpdate = credit.indexOf('UPDATE sales_order_items_v2');
  assert.ok(saved >= 0, 'persist the return-credit record');
  assert.ok(allocation > saved, 'persist the invoice-line allocation after the return-credit record');
  assert.ok(counterUpdate > allocation, 'update the order-line aggregate after persisting the allocation');

  assert.match(credit, /const client = await context\.pool\.connect\(\)/);
  assert.match(credit, /await client\.query\('BEGIN'\)/);
  assert.match(credit, /await client\.query\('COMMIT'\)/);
  assert.match(credit, /await client\.query\('ROLLBACK'\)/);
  assert.match(credit, /ON CONFLICT\s*\([\s\S]*?return_credit_id,[\s\S]*?return_item_id,[\s\S]*?invoice_item_id[\s\S]*?\)\s*DO NOTHING\s*RETURNING id/);
  assert.match(credit, /if \(allocation\.rows\.length > 0\)\s*\{[\s\S]*?UPDATE sales_order_items_v2[\s\S]*?credited_quantity\s*=\s*LEAST\([\s\S]*?credited_quantity\s*\+\s*\$4/);
  assert.doesNotMatch(
    credit,
    /credited_quantity\s*=\s*LEAST\([\s\S]*?SELECT SUM\(credit_item\.quantity\)/,
    'do not discard historical aggregate values by recomputing only from the current allocation table',
  );

});

test('Sales return-credit issuance serializes retries and preserves refund lifecycle states', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function issueSalesReturnCredit(');
  const end = operations.indexOf('export async function refundSalesReturnCredit(', start);
  const credit = operations.slice(start, end);

  const lock = credit.indexOf("pg_advisory_lock(hashtext($1), hashtext($2))");
  const returnRead = credit.indexOf('FROM sales_returns');
  const invoiceCredit = credit.indexOf('await issueInvoiceCreditNote(');
  const unlock = credit.indexOf("pg_advisory_unlock(hashtext($1), hashtext($2))");
  assert.ok(lock >= 0 && lock < returnRead, 'serialize before reading return-credit state');
  assert.ok(invoiceCredit > lock && unlock > invoiceCredit, 'hold the lock over cross-module credit creation and recovery');
  assert.ok(
    credit.includes("status = CASE\\n          WHEN status IN ('partially_refunded', 'refunded')\\n          THEN status\\n          WHEN $4::boolean\\n          THEN 'credited'\\n          ELSE status\\n        END"),
    'do not overwrite a refund state or mark an un-invoiced return as credited',
  );
});

test('Sales return-credit idempotency regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-return-credit-idempotency\.test\.mjs/);
});
