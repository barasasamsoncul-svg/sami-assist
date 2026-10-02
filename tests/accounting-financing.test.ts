import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Pool,
} from 'pg';

import {
  ACCOUNTING_FINANCING_SQL,
} from '../lib/apps/accounting/financing-schema';
import {
  buildFinancingSchedule,
  financingBaseCents,
  financingDayCountDays,
  financingForeignUnits,
  financingInterestUnits,
  financingRateDecimal,
  financingSignedRateScaled,
} from '../lib/apps/accounting/financing-rules';

test(
  'financing day-count conventions do not accrue phantom same-day interest',
  () => {
    assert.equal(
      financingDayCountDays(
        '2026-10-02',
        '2026-10-02',
        'actual_365',
      ),
      0,
    );

    assert.equal(
      financingInterestUnits({
        principalUnits:
          financingForeignUnits(
            '1000000.0000',
          ),
        annualRate:
          '12.00000000',
        startDate:
          '2026-10-02',
        endDate:
          '2026-10-02',
        dayCount:
          'actual_365',
      }),
      BigInt(
        0,
      ),
    );
  },
);

test(
  'signed variable-rate margins format correctly',
  () => {
    assert.equal(
      financingRateDecimal(
        financingSignedRateScaled(
          '-0.50000000',
        ),
      ),
      '-0.50000000',
    );

    assert.equal(
      financingRateDecimal(
        financingSignedRateScaled(
          '2.25000000',
        ),
      ),
      '2.25000000',
    );
  },
);

test(
  'foreign financing amounts convert to base cents at exact stored FX rate',
  () => {
    assert.equal(
      financingBaseCents(
        financingForeignUnits(
          '100.1234',
        ),
        '129.5000000000',
      ),
      BigInt(
        1296598,
      ),
    );
  },
);

test(
  'equal-principal schedule preserves exact principal on final maturity line',
  () => {
    const schedule =
      buildFinancingSchedule({
        principal:
          '1000000.0000',
        startDate:
          '2026-01-01',
        maturityDate:
          '2027-01-01',
        annualRate:
          '12.00000000',
        dayCount:
          'actual_365',
        frequency:
          'quarterly',
        structure:
          'equal_principal',
      });

    assert.equal(
      schedule.length,
      4,
    );
    assert.equal(
      schedule.at(
        -1,
      )
        ?.closingPrincipal,
      '0.0000',
    );

    const principal =
      schedule.reduce(
        (
          total,
          row,
        ) =>
          total +
          financingForeignUnits(
            row.scheduledPrincipal,
          ),
        BigInt(
          0,
        ),
      );

    assert.equal(
      principal,
      financingForeignUnits(
        '1000000.0000',
      ),
    );
  },
);

test(
  'annuity schedule remains precision safe for enterprise-size principal',
  () => {
    const schedule =
      buildFinancingSchedule({
        principal:
          '999999999999999.9999',
        startDate:
          '2026-01-01',
        maturityDate:
          '2031-01-01',
        annualRate:
          '9.87500000',
        dayCount:
          'actual_365',
        frequency:
          'monthly',
        structure:
          'annuity',
      });

    assert.equal(
      schedule.length,
      60,
    );
    assert.equal(
      schedule.at(
        -1,
      )
        ?.closingPrincipal,
      '0.0000',
    );
  },
);

test(
  'Accounting 2.22 financing schema executes twice on PostgreSQL',
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

          CREATE TABLE IF NOT EXISTS public.accounting_bank_accounts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid()
          );
        `,
      );

      await client.query(
        ACCOUNTING_FINANCING_SQL,
      );
      await client.query(
        ACCOUNTING_FINANCING_SQL,
      );

      const tables =
        await client.query(
          `
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema='public'
              AND table_name IN (
                'accounting_financing_settings',
                'accounting_financing_facilities',
                'accounting_financing_rate_periods',
                'accounting_financing_schedule_lines',
                'accounting_financing_transactions',
                'accounting_financing_interest_accruals',
                'accounting_financing_reclassifications',
                'accounting_financing_runs'
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
          'accounting_financing_facilities',
          'accounting_financing_interest_accruals',
          'accounting_financing_rate_periods',
          'accounting_financing_reclassifications',
          'accounting_financing_runs',
          'accounting_financing_schedule_lines',
          'accounting_financing_settings',
          'accounting_financing_transactions',
        ],
      );

      const duplicateGuard =
        await client.query(
          `
            SELECT indexname
            FROM pg_indexes
            WHERE schemaname='public'
              AND indexname='uq_accounting_financing_accrual_period'
          `,
        );

      assert.equal(
        duplicateGuard.rows.length,
        1,
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
