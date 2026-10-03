import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { ACCOUNTING_CONSOLIDATION_SQL } from '../lib/apps/accounting/consolidation-schema';

test('Accounting consolidation schema is additive, company-scoped and workflow protected', () => {
  for (const table of [
    'accounting_consolidation_settings',
    'accounting_consolidation_groups',
    'accounting_consolidation_members',
    'accounting_consolidation_account_mappings',
    'accounting_consolidation_rates',
    'accounting_consolidation_eliminations',
    'accounting_consolidation_runs',
    'accounting_consolidation_run_lines',
  ]) {
    assert.match(ACCOUNTING_CONSOLIDATION_SQL,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  }
  assert.match(ACCOUNTING_CONSOLIDATION_SQL,/consolidation_method IN \('full','proportional'\)/);
  assert.match(ACCOUNTING_CONSOLIDATION_SQL,/rate_type IN \('closing','average','historical'\)/);
  assert.match(ACCOUNTING_CONSOLIDATION_SQL,/line_kind IN \('source','elimination','translation_adjustment'\)/);
  assert.match(ACCOUNTING_CONSOLIDATION_SQL,/REFERENCES public\.companies\(id\)/);
  assert.match(ACCOUNTING_CONSOLIDATION_SQL,/REFERENCES public\.accounts\(id\)/);
  assert.doesNotMatch(ACCOUNTING_CONSOLIDATION_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test(
  'Accounting 2.26 consolidation schema executes twice on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          is_active BOOLEAN NOT NULL DEFAULT TRUE,
          archived_at TIMESTAMPTZ
        );
        CREATE TABLE IF NOT EXISTS public.accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID REFERENCES public.companies(id)
        );
      `);
      await client.query(ACCOUNTING_CONSOLIDATION_SQL);
      await client.query(ACCOUNTING_CONSOLIDATION_SQL);
      const tables=await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'accounting_consolidation_%'
        ORDER BY table_name
      `);
      assert.deepEqual(tables.rows.map(row=>row.table_name),[
        'accounting_consolidation_account_mappings',
        'accounting_consolidation_eliminations',
        'accounting_consolidation_groups',
        'accounting_consolidation_members',
        'accounting_consolidation_rates',
        'accounting_consolidation_run_lines',
        'accounting_consolidation_runs',
        'accounting_consolidation_settings',
      ]);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  },
);
