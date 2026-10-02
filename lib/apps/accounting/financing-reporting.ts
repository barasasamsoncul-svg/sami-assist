import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export async function getAccountingFinancingReporting(
  asOfInput?:
    string,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'view',
    );
  const companyId =
    context.companyId;
  const baseCurrency =
    context.company
      .currentCompany
      .currency
      .toUpperCase();
  const asOf =
    asOfInput ||
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  const [
    reconciliation,
    forecast,
    maturity,
  ] =
    await Promise.all([
      context.pool.query(
        `
          WITH facility_balance AS (
            SELECT
              facility.id,
              facility.facility_number,
              facility.name,
              facility.direction,
              facility.currency,
              facility.principal_account_id,
              facility.current_principal_account_id,
              facility.accrued_interest_account_id,
              COALESCE(
                SUM(
                  CASE
                    WHEN transaction.transaction_type =
                         'drawdown'
                    THEN transaction.principal_foreign
                    WHEN transaction.transaction_type =
                         'principal_repayment'
                    THEN -transaction.principal_foreign
                    ELSE 0
                  END
                ),
                0
              )::numeric(19,4)
                AS outstanding_principal_foreign,
              (
                COALESCE(
                  (
                    SELECT SUM(
                      accrual.foreign_interest_amount
                    )
                    FROM accounting_financing_interest_accruals accrual
                    WHERE accrual.company_id =
                          facility.company_id
                      AND accrual.facility_id =
                          facility.id
                      AND accrual.deleted_at
                          IS NULL
                      AND accrual.status =
                          'posted'
                      AND accrual.period_end <=
                          $2::date
                  ),
                  0
                )
                -
                COALESCE(
                  (
                    SELECT SUM(
                      payment.interest_foreign
                    )
                    FROM accounting_financing_transactions payment
                    WHERE payment.company_id =
                          facility.company_id
                      AND payment.facility_id =
                          facility.id
                      AND payment.deleted_at
                          IS NULL
                      AND payment.status =
                          'posted'
                      AND payment.transaction_date <=
                          $2::date
                  ),
                  0
                )
              )::numeric(19,4)
                AS outstanding_interest_foreign,
              COALESCE(
                (
                  SELECT reclass.target_current_principal
                  FROM accounting_financing_reclassifications reclass
                  WHERE reclass.company_id =
                        facility.company_id
                    AND reclass.facility_id =
                        facility.id
                    AND reclass.deleted_at
                        IS NULL
                    AND reclass.status =
                        'posted'
                    AND reclass.as_of_date <=
                        $2::date
                  ORDER BY
                    reclass.as_of_date DESC,
                    reclass.created_at DESC,
                    reclass.id DESC
                  LIMIT 1
                ),
                0
              )::numeric(19,2)
                AS classified_current_base,
              CASE
                WHEN facility.currency =
                     $3
                THEN 1::numeric
                ELSE (
                  SELECT rate.rate_to_base
                  FROM accounting_exchange_rates rate
                  WHERE rate.company_id =
                        facility.company_id
                    AND rate.currency =
                        facility.currency
                    AND rate.base_currency =
                        $3
                    AND rate.is_active =
                        TRUE
                    AND rate.deleted_at
                        IS NULL
                    AND rate.effective_date <=
                        $2::date
                    AND rate.rate_type IN (
                      'closing',
                      'spot'
                    )
                  ORDER BY
                    CASE
                      WHEN rate.rate_type =
                           'closing'
                      THEN 0
                      ELSE 1
                    END,
                    rate.effective_date DESC,
                    rate.id DESC
                  LIMIT 1
                )
              END
                AS closing_rate
            FROM accounting_financing_facilities facility
            LEFT JOIN accounting_financing_transactions transaction
              ON transaction.company_id =
                 facility.company_id
             AND transaction.facility_id =
                 facility.id
             AND transaction.deleted_at
                 IS NULL
             AND transaction.status =
                 'posted'
             AND transaction.transaction_date <=
                 $2::date
            WHERE facility.company_id =
                  $1
              AND facility.deleted_at
                  IS NULL
              AND facility.status IN (
                'active',
                'closed'
              )
            GROUP BY
              facility.id
          ),
          expected_rows AS (
            SELECT
              principal_account_id
                AS account_id,
              direction,
              'principal_noncurrent'
                AS balance_kind,
              GREATEST(
                ROUND(
                  outstanding_principal_foreign *
                  closing_rate,
                  2
                ) -
                CASE
                  WHEN current_principal_account_id
                       IS NOT NULL
                   AND current_principal_account_id <>
                       principal_account_id
                  THEN classified_current_base
                  ELSE 0
                END,
                0
              )::numeric(19,2)
                AS expected_balance
            FROM facility_balance
            WHERE closing_rate
                  IS NOT NULL

            UNION ALL

            SELECT
              current_principal_account_id
                AS account_id,
              direction,
              'principal_current'
                AS balance_kind,
              LEAST(
                classified_current_base,
                ROUND(
                  outstanding_principal_foreign *
                  closing_rate,
                  2
                )
              )::numeric(19,2)
                AS expected_balance
            FROM facility_balance
            WHERE closing_rate
                  IS NOT NULL
              AND current_principal_account_id
                  IS NOT NULL
              AND current_principal_account_id <>
                  principal_account_id

            UNION ALL

            SELECT
              accrued_interest_account_id
                AS account_id,
              direction,
              'accrued_interest'
                AS balance_kind,
              GREATEST(
                ROUND(
                  outstanding_interest_foreign *
                  closing_rate,
                  2
                ),
                0
              )::numeric(19,2)
                AS expected_balance
            FROM facility_balance
            WHERE closing_rate
                  IS NOT NULL
          ),
          expected AS (
            SELECT
              account_id,
              direction,
              balance_kind,
              SUM(
                expected_balance
              )::numeric(19,2)
                AS expected_balance
            FROM expected_rows
            WHERE account_id
                  IS NOT NULL
            GROUP BY
              account_id,
              direction,
              balance_kind
          ),
          ledger AS (
            SELECT
              account.id
                AS account_id,
              CASE
                WHEN account.account_type =
                     'asset'
                  OR account.account_type LIKE
                     'asset_%'
                THEN COALESCE(
                  SUM(
                    line.debit -
                    line.credit
                  ),
                  0
                )
                ELSE COALESCE(
                  SUM(
                    line.credit -
                    line.debit
                  ),
                  0
                )
              END::numeric(19,2)
                AS ledger_balance
            FROM accounts account
            LEFT JOIN journal_lines line
              ON line.company_id =
                 account.company_id
             AND line.account_id =
                 account.id
             AND line.deleted_at
                 IS NULL
            LEFT JOIN journals journal
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
            WHERE account.company_id =
                  $1
              AND account.deleted_at
                  IS NULL
            GROUP BY
              account.id
          )
          SELECT
            expected.account_id::text,
            account.code
              AS account_code,
            account.name
              AS account_name,
            account.account_type,
            expected.direction,
            expected.balance_kind,
            expected.expected_balance::text,
            COALESCE(
              ledger.ledger_balance,
              0
            )::text
              AS ledger_balance,
            (
              expected.expected_balance -
              COALESCE(
                ledger.ledger_balance,
                0
              )
            )::numeric(19,2)::text
              AS difference
          FROM expected
          INNER JOIN accounts account
            ON account.id =
               expected.account_id
           AND account.company_id =
               $1
           AND account.deleted_at
               IS NULL
          LEFT JOIN ledger
            ON ledger.account_id =
               expected.account_id
          ORDER BY
            account.code,
            expected.balance_kind,
            expected.direction
        `,
        [
          companyId,
          asOf,
          baseCurrency,
        ],
      ),
      context.pool.query(
        `
          SELECT
            line.id::text,
            line.facility_id::text,
            facility.facility_number,
            facility.name
              AS facility_name,
            facility.direction,
            facility.currency,
            line.due_date::text,
            line.scheduled_principal::text,
            line.scheduled_interest::text,
            line.scheduled_fee::text,
            (
              line.scheduled_principal +
              line.scheduled_interest +
              line.scheduled_fee
            )::numeric(19,4)::text
              AS scheduled_total,
            line.status
          FROM accounting_financing_schedule_lines line
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               line.facility_id
           AND facility.company_id =
               line.company_id
           AND facility.deleted_at
               IS NULL
           AND facility.status =
               'active'
           AND line.revision =
               facility.schedule_revision
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
            AND line.status IN (
              'projected',
              'due'
            )
            AND line.due_date >
                $2::date
            AND line.due_date <=
                $2::date +
                INTERVAL '365 days'
          ORDER BY
            line.due_date,
            facility.facility_number,
            line.sequence
          LIMIT 1000
        `,
        [
          companyId,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            facility.direction,
            facility.currency,
            CASE
              WHEN line.due_date <=
                   $2::date +
                   INTERVAL '30 days'
              THEN '0_30'
              WHEN line.due_date <=
                   $2::date +
                   INTERVAL '90 days'
              THEN '31_90'
              WHEN line.due_date <=
                   $2::date +
                   INTERVAL '365 days'
              THEN '91_365'
              ELSE 'over_365'
            END
              AS bucket,
            COALESCE(
              SUM(
                line.scheduled_principal
              ),
              0
            )::numeric(19,4)::text
              AS principal,
            COALESCE(
              SUM(
                line.scheduled_interest
              ),
              0
            )::numeric(19,4)::text
              AS interest,
            COUNT(*)::int
              AS line_count
          FROM accounting_financing_schedule_lines line
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               line.facility_id
           AND facility.company_id =
               line.company_id
           AND facility.deleted_at
               IS NULL
           AND facility.status =
               'active'
           AND line.revision =
               facility.schedule_revision
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
            AND line.status IN (
              'projected',
              'due'
            )
            AND line.due_date >
                $2::date
          GROUP BY
            facility.direction,
            facility.currency,
            bucket
          ORDER BY
            facility.direction,
            facility.currency,
            CASE bucket
              WHEN '0_30'
                THEN 1
              WHEN '31_90'
                THEN 2
              WHEN '91_365'
                THEN 3
              ELSE 4
            END
        `,
        [
          companyId,
          asOf,
        ],
      ),
    ]);

  const missingRates =
    await context.pool.query(
      `
        SELECT
          facility.id::text,
          facility.facility_number,
          facility.name,
          facility.currency
        FROM accounting_financing_facilities facility
        WHERE facility.company_id =
              $1
          AND facility.deleted_at
              IS NULL
          AND facility.status =
              'active'
          AND facility.currency <>
              $3
          AND NOT EXISTS (
            SELECT 1
            FROM accounting_exchange_rates rate
            WHERE rate.company_id =
                  facility.company_id
              AND rate.currency =
                  facility.currency
              AND rate.base_currency =
                  $3
              AND rate.is_active =
                  TRUE
              AND rate.deleted_at
                  IS NULL
              AND rate.effective_date <=
                  $2::date
              AND rate.rate_type IN (
                'closing',
                'spot'
              )
          )
        ORDER BY
          facility.facility_number
      `,
      [
        companyId,
        asOf,
        baseCurrency,
      ],
    );

  return {
    asOf,
    baseCurrency,
    reconciliation:
      reconciliation.rows,
    forecast:
      forecast.rows,
    maturity:
      maturity.rows,
    missingRates:
      missingRates.rows,
  };
}

export type AccountingFinancingReporting =
  Awaited<
    ReturnType<
      typeof getAccountingFinancingReporting
    >
  >;
