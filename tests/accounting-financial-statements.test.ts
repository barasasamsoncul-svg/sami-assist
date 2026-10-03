import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { ACCOUNTING_FINANCIAL_STATEMENTS_SQL } from '../lib/apps/accounting/financial-statements-schema';

test('financial statements schema is additive and snapshot based', () => {
  for (const table of [
    'accounting_financial_report_settings',
    'accounting_financial_statement_snapshots',
    'accounting_financial_statement_snapshot_lines',
  ]) {
    assert.match(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  }
  assert.match(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,/profit_loss/);
  assert.match(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,/balance_sheet/);
  assert.match(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,/cash_flow/);
  assert.match(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,/changes_equity/);
  assert.doesNotMatch(ACCOUNTING_FINANCIAL_STATEMENTS_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test(
  'Accounting 2.27 financial statement schema executes twice on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS public.companies (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
        CREATE TABLE IF NOT EXISTS public.accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),company_id UUID);
        CREATE TABLE IF NOT EXISTS public.accounting_consolidation_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      `);
      await client.query(ACCOUNTING_FINANCIAL_STATEMENTS_SQL);
      await client.query(ACCOUNTING_FINANCIAL_STATEMENTS_SQL);
      const tables=await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'accounting_financial_%'
        ORDER BY table_name
      `);
      assert.deepEqual(tables.rows.map(row=>row.table_name),[
        'accounting_financial_report_settings',
        'accounting_financial_statement_snapshot_lines',
        'accounting_financial_statement_snapshots',
      ]);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  },
);
