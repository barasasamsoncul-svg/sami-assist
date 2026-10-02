import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accrualAutoReversalDate,
  accrualMoneyCents,
  buildAccrualPeriods,
} from '../lib/apps/accounting/accruals-rules';

test(
  'equal-period accrual allocation preserves the exact cent total',
  () => {
    const periods =
      buildAccrualPeriods({
        startDate:
          '2026-01-01',
        endDate:
          '2026-03-31',
        frequency:
          'monthly',
        allocationMethod:
          'equal_periods',
        totalAmount:
          '100.00',
      });

    assert.equal(
      periods.length,
      3,
    );
    assert.deepEqual(
      periods.map(
        row =>
          row.amount,
      ),
      [
        '33.34',
        '33.33',
        '33.33',
      ],
    );
    assert.equal(
      periods.reduce(
        (
          total,
          row,
        ) =>
          total +
          accrualMoneyCents(
            row.amount,
          ),
        BigInt(
          0,
        ),
      ),
      BigInt(
        10000,
      ),
    );
  },
);

test(
  'actual-day allocation preserves exact total and date coverage',
  () => {
    const periods =
      buildAccrualPeriods({
        startDate:
          '2026-01-15',
        endDate:
          '2026-04-14',
        frequency:
          'monthly',
        allocationMethod:
          'actual_days',
        totalAmount:
          '987.65',
      });

    assert.equal(
      periods.length,
      3,
    );
    assert.equal(
      periods.reduce(
        (
          total,
          row,
        ) =>
          total +
          accrualMoneyCents(
            row.amount,
          ),
        BigInt(
          0,
        ),
      ),
      BigInt(
        98765,
      ),
    );
    assert.equal(
      periods[0]
        .periodStart,
      '2026-01-15',
    );
    assert.equal(
      periods.at(
        -1,
      )
        ?.periodEnd,
      '2026-04-14',
    );
  },
);

test(
  'month-end and automatic reversal dates stay valid',
  () => {
    const periods =
      buildAccrualPeriods({
        startDate:
          '2026-01-31',
        endDate:
          '2026-03-31',
        frequency:
          'monthly',
        allocationMethod:
          'equal_periods',
        totalAmount:
          '300.00',
      });

    assert.equal(
      periods.length,
      3,
    );
    assert.equal(
      periods[0]
        .periodEnd,
      '2026-02-27',
    );
    assert.equal(
      periods[1]
        .periodStart,
      '2026-02-28',
    );
    assert.equal(
      accrualAutoReversalDate(
        '2026-10-31',
      ),
      '2026-11-01',
    );
  },
);

test(
  'quarterly and annual schedules use controlled boundaries',
  () => {
    assert.equal(
      buildAccrualPeriods({
        startDate:
          '2026-01-01',
        endDate:
          '2026-12-31',
        frequency:
          'quarterly',
        allocationMethod:
          'equal_periods',
        totalAmount:
          '1200.00',
      }).length,
      4,
    );

    assert.equal(
      buildAccrualPeriods({
        startDate:
          '2026-01-01',
        endDate:
          '2027-12-31',
        frequency:
          'annual',
        allocationMethod:
          'equal_periods',
        totalAmount:
          '2400.00',
      }).length,
      2,
    );
  },
);
