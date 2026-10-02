import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  accrualMoneyDecimal,
} from './accruals-rules';

function ledgerCents(
  value:
    unknown,
) {
  const text =
    String(
      value ?? '0',
    ).trim();

  if (
    !/^-?\d{1,13}(?:\.\d{1,2})?$/.test(
      text,
    )
  ) {
    throw new Error(
      'Accrual reporting encountered an invalid ledger amount.',
    );
  }

  const negative =
    text.startsWith(
      '-',
    );
  const unsigned =
    negative
      ? text.slice(
          1,
        )
      : text;
  const [
    whole,
    fraction =
      '',
  ] =
    unsigned.split(
      '.',
    );
  const cents =
    BigInt(
      whole,
    ) *
      BigInt(
        100,
      ) +
    BigInt(
      fraction.padEnd(
        2,
        '0',
      ),
    );

  return negative
    ? -cents
    : cents;
}

export async function getAccountingAccrualReporting() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedules',
      'view',
    );
  const asOf =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  const [
    reconciliation,
    forecastRows,
    coverage,
  ] =
    await Promise.all([
      context.pool.query(
        `
          WITH schedule_net AS (
            SELECT
              schedule.id,
              schedule.balance_account_id,
              schedule.schedule_type,
              schedule.total_amount,
              COALESCE(
                SUM(line.amount) FILTER (
                  WHERE line.status =
                        'posted'
                ),
                0
              )::numeric(19,2)
                AS posted_amount
            FROM accounting_accrual_schedules schedule
            LEFT JOIN accounting_accrual_schedule_lines line
              ON line.company_id =
                 schedule.company_id
             AND line.schedule_id =
                 schedule.id
             AND line.deleted_at
                 IS NULL
            WHERE schedule.company_id =
                  $1
              AND schedule.deleted_at
                  IS NULL
              AND schedule.status IN (
                'active',
                'completed'
              )
            GROUP BY
              schedule.id
          ),
          expected AS (
            SELECT
              balance_account_id,
              COUNT(*)::int
                AS schedule_count,
              COALESCE(
                SUM(
                  CASE
                    WHEN schedule_type IN (
                      'prepaid_expense',
                      'deferred_revenue'
                    )
                    THEN
                      total_amount -
                      posted_amount
                    ELSE
                      posted_amount
                  END
                ),
                0
              )::numeric(19,2)
                AS expected_balance
            FROM schedule_net
            GROUP BY
              balance_account_id
          )
          SELECT
            expected.balance_account_id::text
              AS account_id,
            account.code
              AS account_code,
            account.name
              AS account_name,
            account.account_type,
            expected.schedule_count,
            expected.expected_balance::text,
            COALESCE(
              managed.managed_balance,
              0
            )::numeric(19,2)::text
              AS managed_gl_balance,
            (
              expected.expected_balance -
              COALESCE(
                managed.managed_balance,
                0
              )
            )::numeric(19,2)::text
              AS difference
          FROM expected
          INNER JOIN accounts account
            ON account.id =
               expected.balance_account_id
           AND account.company_id =
               $1
           AND account.deleted_at
               IS NULL
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(
                SUM(
                  CASE
                    WHEN account.account_type =
                         'asset'
                      OR account.account_type LIKE
                         'asset_%'
                    THEN
                      line.debit -
                      line.credit
                    ELSE
                      line.credit -
                      line.debit
                  END
                ),
                0
              )::numeric(19,2)
                AS managed_balance
            FROM journal_lines line
            INNER JOIN journals journal
              ON journal.id =
                 line.journal_id
             AND journal.company_id =
                 line.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
             AND journal.journal_date <=
                 $2::date
            WHERE line.company_id =
                  $1
              AND line.account_id =
                  expected.balance_account_id
              AND line.deleted_at
                  IS NULL
              AND (
                COALESCE(
                  journal.source_type,
                  ''
                ) LIKE
                  'accrual_%'
                OR EXISTS (
                  SELECT 1
                  FROM accounting_accrual_schedules source_schedule
                  WHERE source_schedule.company_id =
                        $1
                    AND source_schedule.deleted_at
                        IS NULL
                    AND source_schedule.status IN (
                      'active',
                      'completed'
                    )
                    AND source_schedule.source_journal_id =
                        journal.id
                    AND source_schedule.balance_account_id =
                        expected.balance_account_id
                )
              )
          ) managed
            ON TRUE
          ORDER BY
            account.code,
            account.name
        `,
        [
          context.companyId,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            line.id::text,
            line.schedule_id::text,
            schedule.schedule_number,
            schedule.name
              AS schedule_name,
            schedule.schedule_type,
            line.posting_date::text,
            line.amount::text,
            line.status
          FROM accounting_accrual_schedule_lines line
          INNER JOIN accounting_accrual_schedules schedule
            ON schedule.id =
               line.schedule_id
           AND schedule.company_id =
               line.company_id
           AND schedule.deleted_at
               IS NULL
           AND schedule.status =
               'active'
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
            AND line.status IN (
              'pending',
              'failed'
            )
            AND line.posting_date >
                $2::date
            AND line.posting_date <=
                $2::date +
                INTERVAL '365 days'
          ORDER BY
            line.posting_date,
            schedule.schedule_number,
            line.sequence
          LIMIT 500
        `,
        [
          context.companyId,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status <>
                    'cancelled'
            )::int
              AS schedule_count,
            COUNT(*) FILTER (
              WHERE status <>
                    'cancelled'
                AND source_journal_id
                    IS NOT NULL
            )::int
              AS journal_linked_count,
            COUNT(*) FILTER (
              WHERE status <>
                    'cancelled'
                AND source_reference
                    IS NOT NULL
            )::int
              AS reference_linked_count,
            COUNT(*) FILTER (
              WHERE status <>
                    'cancelled'
                AND source_journal_id
                    IS NULL
                AND source_reference
                    IS NULL
            )::int
              AS unlinked_count
          FROM accounting_accrual_schedules
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
        ],
      ),
    ]);

  let expected =
    BigInt(
      0,
    );
  let managed =
    BigInt(
      0,
    );

  for (
    const row
    of reconciliation.rows
  ) {
    expected +=
      ledgerCents(
        String(
          row.expected_balance ||
          '0',
        ),
      );

    managed +=
      ledgerCents(
        row.managed_gl_balance,
      );
  }

  let next90 =
    BigInt(
      0,
    );
  let next365 =
    BigInt(
      0,
    );
  const cutoff90 =
    new Date(
      asOf +
      'T00:00:00.000Z',
    );

  cutoff90.setUTCDate(
    cutoff90.getUTCDate() +
      90,
  );
  const cutoff90Text =
    cutoff90
      .toISOString()
      .slice(
        0,
        10,
      );

  for (
    const row
    of forecastRows.rows
  ) {
    const amount =
      ledgerCents(
        String(
          row.amount,
        ),
      );

    next365 +=
      amount;

    if (
      String(
        row.posting_date,
      ) <=
      cutoff90Text
    ) {
      next90 +=
        amount;
    }
  }

  return {
    asOf,
    reconciliation: {
      lines:
        reconciliation.rows,
      expectedBalance:
        accrualMoneyDecimal(
          expected,
        ),
      managedGlBalance:
        accrualMoneyDecimal(
          managed,
        ),
      difference:
        accrualMoneyDecimal(
          expected -
          managed,
        ),
    },
    forecast: {
      next90Days:
        accrualMoneyDecimal(
          next90,
        ),
      next365Days:
        accrualMoneyDecimal(
          next365,
        ),
      lines:
        forecastRows.rows,
    },
    sourceCoverage:
      coverage.rows[0] ||
      {
        schedule_count:
          0,
        journal_linked_count:
          0,
        reference_linked_count:
          0,
        unlinked_count:
          0,
      },
  };
}

export type AccountingAccrualReporting =
  Awaited<
    ReturnType<
      typeof getAccountingAccrualReporting
    >
  >;
