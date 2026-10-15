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
  const start = operations.indexOf('export async function issueSalesReturnCreditTransaction(');
  const end = operations.indexOf('export async function refundSalesReturnCreditTransaction(', start);
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
  const start = operations.indexOf('export async function issueSalesReturnCreditTransaction(');
  const end = operations.indexOf('export async function refundSalesReturnCreditTransaction(', start);
  const credit = operations.slice(start, end);
  const compact = credit.replace(/\s+/g, ' ');

  const lock = credit.indexOf("pg_advisory_lock(hashtext($1), hashtext($2))");
  const returnRead = credit.indexOf('FROM sales_returns');
  const invoiceCredit = credit.indexOf('await deps.issueInvoiceCreditNote(');
  const unlock = credit.indexOf("pg_advisory_unlock(hashtext($1), hashtext($2))");
  assert.ok(lock >= 0 && lock < returnRead, 'serialize before reading return-credit state');
  assert.match(credit, /!\[\s*'received',\s*'credited',\s*'partially_refunded',\s*'refunded',?\s*\]\.includes/, 'allow idempotent recovery of a return whose refund already completed');
  assert.ok(invoiceCredit > lock && unlock > invoiceCredit, 'hold the lock over cross-module credit creation and recovery');
  assert.ok(
    compact.includes("status = CASE WHEN status IN ('partially_refunded', 'refunded') THEN status WHEN $4::boolean THEN 'credited' ELSE status END"),
    'do not overwrite a refund state or mark an un-invoiced return as credited',
  );
  assert.ok(compact.includes("credited_at = CASE WHEN $4::boolean THEN COALESCE(credited_at, NOW()) ELSE credited_at END"));
  assert.match(credit, /RETURNING status/);
  assert.ok(compact.includes("status: String(returnState.rows[0]?.status || returnRow.status)"));
});

test('Sales return refunds serialize with credit issuance and reload the balance after locking', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function refundSalesReturnCreditTransaction(');
  const refund = operations.slice(start);
  const compact = refund.replace(/\s+/g, ' ');

  const firstCreditRead = refund.indexOf('FROM sales_return_credits');
  const lock = refund.indexOf("pg_advisory_lock(hashtext($1), hashtext($2))");
  const freshCreditRead = refund.indexOf('const freshResult = await serializationClient.query(');
  const refundCall = refund.indexOf('await deps.refundInvoiceCreditNote(');
  const unlock = refund.indexOf("pg_advisory_unlock(hashtext($1), hashtext($2))");

  assert.ok(firstCreditRead >= 0 && firstCreditRead < lock, 'identify the parent return before taking its lock');
  assert.ok(lock < freshCreditRead && freshCreditRead < refundCall, 're-read authoritative credit balance under the shared lock before refunding');
  assert.ok(refundCall < unlock, 'hold the same return lock through the cross-module refund and Sales state repair');
  assert.ok(compact.includes("'sales-return-credit:' + returnId"), 'refund and credit issuance use the same per-return lock identity');
  assert.ok(compact.includes('AND credit.return_id = $3'), 'the locked re-read must remain tied to the parent return');
});

test('Sales refund retries recover their posted amount before available-balance validation', async () => {
  const operations = await source('lib/apps/sales/operations.ts');
  const start = operations.indexOf('export async function refundSalesReturnCreditTransaction(');
  const refund = operations.slice(start);
  const compact = refund.replace(/\s+/g, ' ');

  const priorRefundLookup = refund.indexOf('FROM invoicing_credit_note_refunds');
  const amountValidation = refund.indexOf('if (', priorRefundLookup);
  const refundCall = refund.indexOf('await refundInvoiceCreditNote(');
  assert.ok(priorRefundLookup >= 0 && priorRefundLookup < refundCall, 'look up a caller-supplied idempotency key before retry amount validation');
  assert.ok(compact.includes("'credit-refund:' + suppliedRefundKey"), 'look up the exact key used by Invoicing');
  assert.ok(compact.includes('salesReturnRefundIdempotencyKey(returnCreditId, callerKey)'), 'use the full-key collision-safe helper');
  assert.ok(compact.includes('legacySalesReturnRefundIdempotencyKey(returnCreditId, callerKey)'), 'preserve lookup compatibility for old keys');
  assert.ok(compact.includes('idempotency_key IN ($3, $4)'), 'recover both new hashed keys and legacy truncated keys');
  assert.match(compact, /const refundOperationKey = priorRefund \? String\(priorRefund\.idempotency_key\)\.slice\('credit-refund:'\.length\) : suppliedRefundKey/);
  assert.ok(compact.includes('const amount = priorRefund ? money(priorRefund.amount) : requestedAmount ?? available'));
  assert.ok(compact.includes('(!priorRefund && amount > available + 0.0001)'), 'apply available-balance rejection only to new refunds');
  assert.ok(compact.includes("refundedAmount <= 0.0001 ? 'credited'"), 'keep a credited return credited when no posted refunds exist');
});

test('Sales return-credit idempotency regression is part of Sales CI', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-return-credit-idempotency\.test\.mjs/);
});
