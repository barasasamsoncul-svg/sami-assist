import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { ACCOUNTING_DIMENSIONS_SQL } from '../lib/apps/accounting/dimensions-schema';

test('project and department schema is company scoped and non-destructive', () => {
  for (const table of [
    'accounting_dimension_settings',
    'accounting_analytic_projects',
    'accounting_dimension_rules',
    'accounting_journal_line_dimensions',
    'accounting_dimension_budget_lines',
  ]) {
    assert.match(
      ACCOUNTING_DIMENSIONS_SQL,
      new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table),
    );
  }
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/basis_points BETWEEN 1 AND 10000/);
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/origin IN \('manual','rule','reversal','import'\)/);
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/source_project_id UUID/);
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/REFERENCES public\.departments\(id\)/);
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/REFERENCES public\.journal_lines\(id\)/);
  assert.match(ACCOUNTING_DIMENSIONS_SQL,/REFERENCES public\.accounting_budget_versions\(id\)/);
  assert.doesNotMatch(
    ACCOUNTING_DIMENSIONS_SQL,
    /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i,
  );
});

test(
  'Accounting 2.24 analytic dimension schema executes twice on PostgreSQL',
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );
        CREATE TABLE IF NOT EXISTS public.accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID
        );
        CREATE TABLE IF NOT EXISTS public.departments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          company_id UUID,
          is_active BOOLEAN NOT NULL DEFAULT TRUE
        );
        CREATE TABLE IF NOT EXISTS public.journals (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );
        CREATE TABLE IF NOT EXISTS public.journal_lines (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          journal_id UUID REFERENCES public.journals(id)
        );
        CREATE TABLE IF NOT EXISTS public.accounting_budget_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );
      `);
      await client.query(ACCOUNTING_DIMENSIONS_SQL);
      await client.query(ACCOUNTING_DIMENSIONS_SQL);

      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN (
            'accounting_dimension_settings',
            'accounting_analytic_projects',
            'accounting_dimension_rules',
            'accounting_journal_line_dimensions',
            'accounting_dimension_budget_lines'
          )
        ORDER BY table_name
      `);
      assert.deepEqual(
        tables.rows.map(row => row.table_name),
        [
          'accounting_analytic_projects',
          'accounting_dimension_budget_lines',
          'accounting_dimension_rules',
          'accounting_dimension_settings',
          'accounting_journal_line_dimensions',
        ],
      );

      const activeIndex = await client.query(`
        SELECT indexname FROM pg_indexes
        WHERE schemaname='public'
          AND indexname='idx_accounting_line_dimensions_active'
      `);
      assert.equal(activeIndex.rows.length,1);
    } finally {
      await client.query('ROLLBACK').catch(()=>undefined);
      client.release();
      await pool.end();
    }
  },
);
