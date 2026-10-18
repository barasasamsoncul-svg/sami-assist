import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const source = file => readFile(path.join(root, file), 'utf8');

test('return-based commission reversal queries accrued entries within the company, order, assignment, plan and currency', async () => {
  const organization = await source('lib/apps/sales/organization.ts');
  const start = organization.indexOf('export async function reverseSalesOrderCommissionShare(');
  const end = organization.indexOf('export async function reverseSalesOrderCommissionsForReturn(', start);
  assert.ok(start >= 0 && end > start, 'single-currency reversal helper must exist');
  const helper = organization.slice(start, end);

  assert.match(helper, /FROM sales_commission_entries entry/);
  assert.match(helper, /INNER JOIN sales_commission_assignments assignment/);
  assert.match(helper, /INNER JOIN sales_commission_plans plan/);
  assert.match(helper, /entry\.company_id = \$1/);
  assert.match(helper, /entry\.order_id = \$2/);
  assert.match(helper, /entry\.currency = \$3/);
  assert.match(helper, /entry\.status = 'accrued'/);
  assert.match(helper, /FOR UPDATE OF entry/);
});

test('return-based commission reversal prorates commission, guards zero basis, and inserts an idempotent negative reversal row', async () => {
  const organization = await source('lib/apps/sales/organization.ts');
  const start = organization.indexOf('export async function reverseSalesOrderCommissionShare(');
  const end = organization.indexOf('export async function reverseSalesOrderCommissionsForReturn(', start);
  const helper = organization.slice(start, end);

  assert.match(helper, /if \(basisAmount <= 0\) continue/);
  assert.match(helper, /Number\(entry\.commission_amount \|\| 0\) \* \(returnedAmount \/ basisAmount\)/);
  assert.match(helper, /-returnedAmount/);
  assert.match(helper, /-reversalAmount/);
  assert.match(helper, /status,\s*source_event_key/);
  assert.match(helper, /'reversed'/);
  assert.match(helper, /'sales-return:' \+ input\.returnId \+ ':commission:' \+ String\(entry\.id\)/);
  assert.match(helper, /ON CONFLICT \(company_id, source_event_key\)\s*DO NOTHING\s*RETURNING id/);
  assert.match(helper, /reversedCount \+= 1/);
  assert.match(helper, /reversedAmount = money\(reversedAmount \+ reversalAmount\)/);
});

test('return commission wrapper aggregates duplicate currency values and invokes one reversal per currency', async () => {
  const organization = await source('lib/apps/sales/organization.ts');
  const start = organization.indexOf('export async function reverseSalesOrderCommissionsForReturn(');
  const end = organization.indexOf('export async function reverseSalesOrderCommissions(', start);
  assert.ok(start >= 0 && end > start, 'return-level reversal wrapper must exist');
  const helper = organization.slice(start, end);

  assert.match(helper, /returnedValueByCurrency: Array<{ currency: string; amount: number }>/);
  assert.match(helper, /amountsByCurrency\.set\(/);
  assert.match(helper, /for \(const \[currency, amount\] of amountsByCurrency\)/);
  assert.match(helper, /await reverseSalesOrderCommissionShare\(client, \{/);
  assert.match(helper, /currency,\s*returnedAmount: amount/);
  assert.match(helper, /summaries\.push\(\{\s*currency,\s*reversedCount: result\.reversedCount,\s*reversedAmount: result\.reversedAmount/s);
});

test('return commission reversal regression is part of the Sales CI suite', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  assert.match(packageJson.scripts['test:sales'], /tests\/sales-f15-commission-reversals\.test\.mjs/);
});
