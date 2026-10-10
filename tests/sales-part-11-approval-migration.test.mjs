import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function source(file) {
  return (await readFile(path.join(root, file), 'utf8')).replace(/\r\n/g, '\n');
}

test('Sales Part 11 migration defines tenant-scoped quote approval policies and ordered steps', async () => {
  const [migration, schema] = await Promise.all([source('lib/apps/sales/migrations/3.4.1-to-3.4.2.ts'), source('lib/apps/sales/schema.sql')]);

  for (const table of [
    'sales_quote_approval_policies',
    'sales_quote_approval_policy_steps',
    'sales_quote_approval_requests',
    'sales_quote_approval_decisions',
  ]) {
    assert.ok(migration.includes('public.' + table), table + ' in migration');
    assert.ok(schema.includes('public.' + table), table + ' in canonical schema');
  }

  assert.match(migration, /UNIQUE\(policy_id, step_order\)/);
  assert.match(migration, /UNIQUE\(request_id, step_order, reviewer_user_id\)/);
  assert.match(migration, /CHECK \(step_order > 0\)/);
  assert.match(migration, /CHECK \(decision IN \('approved','rejected'\)\)/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS uq_sales_quote_approval_request_pending/);
  assert.match(migration, /quote_fingerprint TEXT NOT NULL/);
  assert.match(migration, /company_id UUID NOT NULL/);
});

test('Sales Part 11 migration is registered after Sales 3.4.1', async () => {
  const registry = await source('lib/apps/runtime-migrations.ts');
  assert.match(registry, /SALES_3_4_1_TO_3_4_2/);
  assert.ok(
    registry.indexOf('SALES_3_4_0_TO_3_4_1,') < registry.indexOf('SALES_3_4_1_TO_3_4_2,'),
    'the new migration must run after 3.4.0 -> 3.4.1',
  );
});
