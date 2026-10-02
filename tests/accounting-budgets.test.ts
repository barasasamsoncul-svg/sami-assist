import assert from 'node:assert/strict';
import test from 'node:test';

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
  assert.equal(budgetMoneyCents('1234.56'), 123456n);
  assert.equal(budgetMoneyCents('-10.05'), -1005n);
  assert.equal(budgetMoneyDecimal(-1005n), '-10.05');
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
  assert.equal(tenPercent,100000n);
  assert.equal(applyBudgetGrowth(10000n,tenPercent),11000n);
  assert.equal(applyBudgetGrowth(-10000n,tenPercent),-11000n);
  assert.equal(
    applyBudgetGrowth(9999n,parseGrowthPercentScaled('2.5')),
    10249n,
  );
});

test('variance direction is favorable for more income and less expense', () => {
  assert.deepEqual(
    budgetVariance('income',10000n,12000n),
    {amount:2000n,favorable:true},
  );
  assert.deepEqual(
    budgetVariance('expense',10000n,12000n),
    {amount:2000n,favorable:false},
  );
  assert.deepEqual(
    budgetVariance('expense',10000n,8000n),
    {amount:-2000n,favorable:true},
  );
  assert.equal(variancePercent(10000n,2000n),20);
  assert.equal(variancePercent(0n,2000n),null);
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
