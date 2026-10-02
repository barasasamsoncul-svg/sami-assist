import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Pool,
} from 'pg';

import {
  ACCOUNTING_ACCRUALS_SQL,
} from '../lib/apps/accounting/accruals-schema';

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


test(
  'Accounting 2.21 accrual schema executes twice on PostgreSQL',
  {
    skip:
      !process.env.TEST_DATABASE_URL,
  },
  async () => {
    const pool =
      new Pool({
        connectionString:
          process.env.TEST_DATABASE_URL,
      });
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      await client.query(
        `
          CREATE EXTENSION IF NOT EXISTS pgcrypto;

          CREATE TABLE IF NOT EXISTS public.companies (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid()
          );

          CREATE TABLE IF NOT EXISTS public.accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid()
          );

          CREATE TABLE IF NOT EXISTS public.journals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid()
          );
        `,
      );

      await client.query(
        ACCOUNTING_ACCRUALS_SQL,
      );
      await client.query(
        ACCOUNTING_ACCRUALS_SQL,
      );

      const tables =
        await client.query(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
              AND table_name IN (
                'accounting_accrual_settings',
                'accounting_accrual_schedules',
                'accounting_accrual_schedule_lines',
                'accounting_accrual_runs'
              )
            ORDER BY table_name
          `,
        );

      assert.deepEqual(
        tables.rows.map(
          row =>
            row.table_name,
        ),
        [
          'accounting_accrual_runs',
          'accounting_accrual_schedule_lines',
          'accounting_accrual_schedules',
          'accounting_accrual_settings',
        ],
      );
    } finally {
      await client.query(
        'ROLLBACK',
      ).catch(
        () =>
          undefined,
      );
      client.release();
      await pool.end();
    }
  },
);
