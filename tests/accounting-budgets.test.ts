import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import {
  applyBudgetGrowth,
  budgetMoneyCents,
  budgetMoneyDecimal,
  budgetVariance,
  buildBudgetMonths,
  parseGrowthPercentScaled,
  variancePercent,
} from '../lib/apps/accounting/budgets-rules';
import { ACCOUNTING_BUDGETS_SQL } from '../lib/apps/accounting/budgets-schema';

test('budget money keeps exact signed cents', () => {
  assert.equal(budgetMoneyCents('1234.56'), BigInt(123456));
  assert.equal(budgetMoneyCents('-10.05'), -BigInt(1005));
  assert.equal(budgetMoneyDecimal(-BigInt(1005)), '-10.05');
  assert.throws(() => budgetMoneyCents('1.001'));
});

test('budget months require full calendar months and preserve horizon', () => {
  const months = buildBudgetMonths('2027-01-01','2027-12-31');
  assert.equal(months.length,12);
  assert.deepEqual(months[0],{
    periodStart:'2027-01-01',
    periodEnd:'2027-01-31',
  });
  assert.deepEqual(months[11],{
    periodStart:'2027-12-01',
    periodEnd:'2027-12-31',
  });
  assert.throws(() => buildBudgetMonths('2027-01-02','2027-12-31'));
  assert.throws(() => buildBudgetMonths('2027-01-01','2027-12-30'));
});

test('rolling forecast growth uses deterministic integer rounding', () => {
  const tenPercent = parseGrowthPercentScaled('10');
  assert.equal(tenPercent,BigInt(100000));
  assert.equal(applyBudgetGrowth(BigInt(10000),tenPercent),BigInt(11000));
  assert.equal(applyBudgetGrowth(-BigInt(10000),tenPercent),-BigInt(11000));
  assert.equal(
    applyBudgetGrowth(BigInt(9999),parseGrowthPercentScaled('2.5')),
    BigInt(10249),
  );
});

test('variance direction is favorable for more income and less expense', () => {
  assert.deepEqual(
    budgetVariance('income',BigInt(10000),BigInt(12000)),
    {amount:BigInt(2000),favorable:true},
  );
  assert.deepEqual(
    budgetVariance('expense',BigInt(10000),BigInt(12000)),
    {amount:BigInt(2000),favorable:false},
  );
  assert.deepEqual(
    budgetVariance('expense',BigInt(10000),BigInt(8000)),
    {amount:-BigInt(2000),favorable:true},
  );
  assert.equal(variancePercent(BigInt(10000),BigInt(2000)),20);
  assert.equal(variancePercent(BigInt(0),BigInt(2000)),null);
});

test('budgets schema is company scoped versioned and non-destructive', () => {
  for (const table of [
    'accounting_budget_settings',
    'accounting_budget_plans',
    'accounting_budget_versions',
    'accounting_budget_assumptions',
    'accounting_budget_lines',
    'accounting_budget_runs',
    'accounting_budget_variance_snapshots',
  ]) {
    assert.match(ACCOUNTING_BUDGETS_SQL,new RegExp('CREATE TABLE IF NOT EXISTS public\\.' + table));
  }

  assert.match(
    ACCOUNTING_BUDGETS_SQL,
    /version_type IN \('budget','forecast'\)/,
  );
  assert.match(
    ACCOUNTING_BUDGETS_SQL,
    /scenario IN \('base','upside','downside','custom'\)/,
  );
  assert.match(
    ACCOUNTING_BUDGETS_SQL,
    /status IN \('draft','approved','published','superseded'\)/,
  );
  assert.match(
    ACCOUNTING_BUDGETS_SQL,
    /status='published'/,
  );
  assert.doesNotMatch(
    ACCOUNTING_BUDGETS_SQL,
    /\b(?:DROP|TRUNCATE|DELETE\s+FROM)\b/i,
  );
});


test(
  'Accounting 2.23 budgets schema executes twice on PostgreSQL',
  {
    skip: !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS public.companies (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );

        CREATE TABLE IF NOT EXISTS public.accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid()
        );
      `);

      await client.query(ACCOUNTING_BUDGETS_SQL);
      await client.query(ACCOUNTING_BUDGETS_SQL);

      const tables = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name IN (
            'accounting_budget_settings',
            'accounting_budget_plans',
            'accounting_budget_versions',
            'accounting_budget_assumptions',
            'accounting_budget_lines',
            'accounting_budget_runs',
            'accounting_budget_variance_snapshots'
          )
        ORDER BY table_name
      `);

      assert.deepEqual(
        tables.rows.map(row => row.table_name),
        [
          'accounting_budget_assumptions',
          'accounting_budget_lines',
          'accounting_budget_plans',
          'accounting_budget_runs',
          'accounting_budget_settings',
          'accounting_budget_variance_snapshots',
          'accounting_budget_versions',
        ],
      );

      const publishedGuard = await client.query(`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname='public'
          AND indexname='uq_accounting_budget_published'
      `);

      assert.equal(publishedGuard.rows.length,1);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
      await pool.end();
    }
  },
);
