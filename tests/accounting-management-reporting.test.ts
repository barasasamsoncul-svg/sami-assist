import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { ACCOUNTING_MANAGEMENT_REPORTING_SQL } from '../lib/apps/accounting/management-reporting-schema';

test('management reporting schema is additive and snapshot based', () => {
  for (const table of [
    'accounting_management_report_settings',
    'accounting_management_report_runs',
    'accounting_management_report_exceptions',
  ]) {
    assert.match(ACCOUNTING_MANAGEMENT_REPORTING_SQL,new RegExp('CREATE TABLE IF NOT EXISTS public\\.'+table));
  }
  assert.match(ACCOUNTING_MANAGEMENT_REPORTING_SQL,/severity IN \('info','warning','critical'\)/);
  assert.match(ACCOUNTING_MANAGEMENT_REPORTING_SQL,/current_ratio_warning/);
  assert.match(ACCOUNTING_MANAGEMENT_REPORTING_SQL,/budget_variance_alerts_warning/);
  assert.doesNotMatch(ACCOUNTING_MANAGEMENT_REPORTING_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test(
  'Accounting 2.28 management reporting schema executes twice on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS public.companies (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      `);
      await client.query(ACCOUNTING_MANAGEMENT_REPORTING_SQL);
      await client.query(ACCOUNTING_MANAGEMENT_REPORTING_SQL);
      const tables=await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'accounting_management_report_%'
        ORDER BY table_name
      `);
      assert.deepEqual(tables.rows.map(row=>row.table_name),[
        'accounting_management_report_exceptions',
        'accounting_management_report_runs',
        'accounting_management_report_settings',
      ]);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  },
);
