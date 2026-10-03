import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { ACCOUNTING_PAYROLL_SQL } from '../lib/apps/accounting/payroll-schema';

test('payroll accounting schema is company scoped, additive and workflow protected', () => {
  for (const table of [
    'accounting_payroll_settings',
    'accounting_payroll_component_mappings',
    'accounting_payroll_employee_dimensions',
    'accounting_payroll_run_postings',
    'accounting_payroll_run_posting_allocations',
  ]) {
    assert.match(ACCOUNTING_PAYROLL_SQL,new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table));
  }
  assert.match(ACCOUNTING_PAYROLL_SQL,/component_type IN \('earning','deduction','statutory','employer_cost'\)/);
  assert.match(ACCOUNTING_PAYROLL_SQL,/REFERENCES public\.departments\(id\)/);
  assert.match(ACCOUNTING_PAYROLL_SQL,/REFERENCES public\.accounting_analytic_projects\(id\)/);
  assert.match(ACCOUNTING_PAYROLL_SQL,/REFERENCES public\.journals\(id\)/);
  assert.doesNotMatch(ACCOUNTING_PAYROLL_SQL,/\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i);
});

test(
  'Accounting 2.25 payroll integration schema executes twice on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS public.companies (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
        CREATE TABLE IF NOT EXISTS public.accounts (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID);
        CREATE TABLE IF NOT EXISTS public.departments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID);
        CREATE TABLE IF NOT EXISTS public.accounting_analytic_projects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), company_id UUID);
        CREATE TABLE IF NOT EXISTS public.journals (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
      `);
      await client.query(ACCOUNTING_PAYROLL_SQL);
      await client.query(ACCOUNTING_PAYROLL_SQL);
      const tables = await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_name LIKE 'accounting_payroll_%'
        ORDER BY table_name
      `);
      assert.deepEqual(tables.rows.map(row=>row.table_name),[
        'accounting_payroll_component_mappings',
        'accounting_payroll_employee_dimensions',
        'accounting_payroll_run_posting_allocations',
        'accounting_payroll_run_postings',
        'accounting_payroll_settings',
      ]);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  },
);
