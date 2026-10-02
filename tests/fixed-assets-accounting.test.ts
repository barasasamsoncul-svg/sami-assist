import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assetCarryingValueCents,
  assetMoneyCents,
  assetMoneyDecimal,
  decliningBalanceDepreciationCents,
  prorateDepreciationCents,
  straightLineDepreciationCents,
} from '../lib/apps/fixed_assets/accounting-rules';

test('fixed asset money math rounds exact 4-decimal source values to ledger cents', () => {
  assert.equal(assetMoneyCents('1250.0049'), BigInt(125000));
  assert.equal(assetMoneyCents('1250.0050'), BigInt(125001));
  assert.equal(assetMoneyCents('-1.0050'), BigInt(-101));
  assert.equal(assetMoneyDecimal(BigInt(-101)), '-1.01');
});

test('fixed asset carrying value includes revaluation and subtracts depreciation and impairment', () => {
  assert.equal(
    assetCarryingValueCents({
      acquisitionCost: '10000.00',
      accumulatedDepreciation: '2500.00',
      accumulatedImpairment: '500.00',
      revaluationAdjustment: '1000.00',
    }),
    BigInt(800000),
  );
});

test('straight-line depreciation uses the remaining depreciable amount and never breaches salvage', () => {
  assert.equal(
    straightLineDepreciationCents({
      carryingValue: BigInt(1000000),
      salvageValue: BigInt(100000),
      remainingPeriods: 36,
    }),
    BigInt(25000),
  );

  assert.equal(
    straightLineDepreciationCents({
      carryingValue: BigInt(10100),
      salvageValue: BigInt(10000),
      remainingPeriods: 12,
    }),
    BigInt(8),
  );
});

test('declining-balance depreciation uses an annual rate and caps at the salvage floor', () => {
  assert.equal(
    decliningBalanceDepreciationCents({
      carryingValue: BigInt(1200000),
      salvageValue: BigInt(0),
      annualRate: '20',
    }),
    BigInt(20000),
  );

  assert.equal(
    decliningBalanceDepreciationCents({
      carryingValue: BigInt(10100),
      salvageValue: BigInt(10000),
      annualRate: '100',
    }),
    BigInt(100),
  );
});

test('daily proration recognizes only days after an asset enters service', () => {
  assert.equal(
    prorateDepreciationCents(
      BigInt(31000),
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        inServiceDate: '2026-10-16',
        convention: 'daily',
      },
    ),
    BigInt(16000),
  );

  assert.equal(
    prorateDepreciationCents(
      BigInt(31000),
      {
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
        inServiceDate: '2026-11-01',
        convention: 'daily',
      },
    ),
    BigInt(0),
  );
});
