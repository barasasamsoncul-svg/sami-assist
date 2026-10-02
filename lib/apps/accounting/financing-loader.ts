import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  getAccountingFinancingReporting,
} from './financing-reporting';

export async function getAccountingFinancing() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'view',
    );
  const companyId =
    context.companyId;
  const currency =
    context.company
      .currentCompany
      .currency
      .toUpperCase();
  const today =
    new Date()
      .toISOString()
      .slice(
        0,
        10,
      );

  const [
    settings,
    accounts,
    financialAccounts,
    facilities,
    rates,
    schedules,
    transactions,
    accruals,
    classifications,
    runs,
    metrics,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            company_id::text,
            enabled,
            default_borrowing_principal_account_id::text,
            default_current_borrowing_account_id::text,
            default_lending_principal_account_id::text,
            default_current_lending_account_id::text,
            default_interest_expense_account_id::text,
            default_interest_income_account_id::text,
            default_accrued_interest_liability_account_id::text,
            default_accrued_interest_asset_account_id::text,
            default_financing_fee_expense_account_id::text,
            default_financing_fee_income_account_id::text,
            default_day_count,
            default_repayment_structure,
            current_classification_days
          FROM accounting_financing_settings
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            code,
            name,
            account_type
          FROM accounts
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND is_active =
                TRUE
            AND (
              account_type =
                'asset'
              OR account_type LIKE
                 'asset_%'
              OR account_type =
                'liability'
              OR account_type LIKE
                 'liability_%'
              OR account_type =
                'expense'
              OR account_type LIKE
                 'expense_%'
              OR account_type =
                'income'
              OR account_type LIKE
                 'income_%'
            )
          ORDER BY
            code,
            name
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            bank.id::text,
            bank.name,
            bank.account_type,
            bank.currency,
            bank.status,
            bank.ledger_account_id::text,
            ledger.code
              AS ledger_code,
            ledger.name
              AS ledger_name,
            COALESCE(
              balance.book_balance,
              0
            )::numeric(19,2)::text
              AS book_balance,
            COALESCE(
              balance.foreign_balance,
              0
            )::numeric(19,4)::text
              AS foreign_balance
          FROM accounting_bank_accounts bank
          INNER JOIN accounts ledger
            ON ledger.id =
               bank.ledger_account_id
           AND ledger.company_id =
               bank.company_id
           AND ledger.deleted_at
               IS NULL
          LEFT JOIN accounting_financial_account_balances balance
            ON balance.company_id =
               bank.company_id
           AND balance.bank_account_id =
               bank.id
          WHERE bank.company_id =
                $1
            AND bank.deleted_at
                IS NULL
            AND bank.status =
                'active'
          ORDER BY
            bank.name
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            facility.id::text,
            facility.facility_number,
            facility.name,
            facility.direction,
            facility.facility_type,
            facility.counterparty_name,
            facility.counterparty_reference,
            facility.currency,
            facility.principal_limit::text,
            facility.start_date::text,
            facility.maturity_date::text,
            facility.rate_type,
            facility.annual_rate::text,
            facility.reference_rate_name,
            facility.margin_rate::text,
            facility.day_count,
            facility.repayment_structure,
            facility.payment_frequency,
            facility.principal_account_id::text,
            facility.current_principal_account_id::text,
            facility.interest_account_id::text,
            facility.accrued_interest_account_id::text,
            facility.fee_account_id::text,
            facility.schedule_revision,
            facility.status,
            facility.notes,
            principal.code
              AS principal_account_code,
            principal.name
              AS principal_account_name,
            current_principal.code
              AS current_principal_account_code,
            current_principal.name
              AS current_principal_account_name,
            interest.code
              AS interest_account_code,
            interest.name
              AS interest_account_name,
            accrued.code
              AS accrued_interest_account_code,
            accrued.name
              AS accrued_interest_account_name,
            COALESCE(
              movement.outstanding_principal_foreign,
              0
            )::numeric(19,4)::text
              AS outstanding_principal_foreign,
            COALESCE(
              movement.outstanding_principal_base,
              0
            )::numeric(19,2)::text
              AS outstanding_principal_base,
            COALESCE(
              interest_balance.outstanding_interest_foreign,
              0
            )::numeric(19,4)::text
              AS outstanding_interest_foreign,
            COALESCE(
              interest_balance.outstanding_interest_base,
              0
            )::numeric(19,2)::text
              AS outstanding_interest_base,
            latest_rate.effective_annual_rate::text
              AS effective_annual_rate,
            next_due.next_due_date::text,
            next_due.scheduled_principal::text
              AS next_principal,
            next_due.scheduled_interest::text
              AS next_interest,
            latest_classification.target_current_principal::text
              AS current_principal_base,
            latest_classification.as_of_date::text
              AS classification_as_of,
            latest_accrual.period_end::text
              AS interest_accrued_through
          FROM accounting_financing_facilities facility
          INNER JOIN accounts principal
            ON principal.id =
               facility.principal_account_id
           AND principal.company_id =
               facility.company_id
          LEFT JOIN accounts current_principal
            ON current_principal.id =
               facility.current_principal_account_id
           AND current_principal.company_id =
               facility.company_id
          INNER JOIN accounts interest
            ON interest.id =
               facility.interest_account_id
           AND interest.company_id =
               facility.company_id
          INNER JOIN accounts accrued
            ON accrued.id =
               facility.accrued_interest_account_id
           AND accrued.company_id =
               facility.company_id
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(
                SUM(
                  CASE
                    WHEN transaction_type =
                         'drawdown'
                    THEN principal_foreign
                    WHEN transaction_type =
                         'principal_repayment'
                    THEN -principal_foreign
                    ELSE 0
                  END
                ),
                0
              ) AS outstanding_principal_foreign,
              COALESCE(
                SUM(
                  CASE
                    WHEN transaction_type =
                         'drawdown'
                    THEN principal_base
                    WHEN transaction_type =
                         'principal_repayment'
                    THEN -principal_base
                    ELSE 0
                  END
                ),
                0
              ) AS outstanding_principal_base
            FROM accounting_financing_transactions
            WHERE company_id =
                  facility.company_id
              AND facility_id =
                  facility.id
              AND deleted_at
                  IS NULL
              AND status =
                  'posted'
          ) movement
            ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              (
                COALESCE(
                  (
                    SELECT SUM(
                      foreign_interest_amount
                    )
                    FROM accounting_financing_interest_accruals
                    WHERE company_id =
                          facility.company_id
                      AND facility_id =
                          facility.id
                      AND deleted_at
                          IS NULL
                      AND status =
                          'posted'
                  ),
                  0
                )
                -
                COALESCE(
                  (
                    SELECT SUM(
                      interest_foreign
                    )
                    FROM accounting_financing_transactions
                    WHERE company_id =
                          facility.company_id
                      AND facility_id =
                          facility.id
                      AND deleted_at
                          IS NULL
                      AND status =
                          'posted'
                  ),
                  0
                )
              ) AS outstanding_interest_foreign,
              (
                COALESCE(
                  (
                    SELECT SUM(
                      base_interest_amount
                    )
                    FROM accounting_financing_interest_accruals
                    WHERE company_id =
                          facility.company_id
                      AND facility_id =
                          facility.id
                      AND deleted_at
                          IS NULL
                      AND status =
                          'posted'
                  ),
                  0
                )
                -
                COALESCE(
                  (
                    SELECT SUM(
                      interest_base
                    )
                    FROM accounting_financing_transactions
                    WHERE company_id =
                          facility.company_id
                      AND facility_id =
                          facility.id
                      AND deleted_at
                          IS NULL
                      AND status =
                          'posted'
                  ),
                  0
                )
              ) AS outstanding_interest_base
          ) interest_balance
            ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              effective_annual_rate
            FROM accounting_financing_rate_periods
            WHERE company_id =
                  facility.company_id
              AND facility_id =
                  facility.id
              AND deleted_at
                  IS NULL
              AND status =
                  'active'
              AND effective_date <=
                  $2::date
            ORDER BY
              effective_date DESC,
              created_at DESC,
              id DESC
            LIMIT 1
          ) latest_rate
            ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              due_date
                AS next_due_date,
              scheduled_principal,
              scheduled_interest
            FROM accounting_financing_schedule_lines
            WHERE company_id =
                  facility.company_id
              AND facility_id =
                  facility.id
              AND revision =
                  facility.schedule_revision
              AND deleted_at
                  IS NULL
              AND status IN (
                'projected',
                'due'
              )
              AND due_date >=
                  $2::date
            ORDER BY
              due_date,
              sequence
            LIMIT 1
          ) next_due
            ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              target_current_principal,
              as_of_date
            FROM accounting_financing_reclassifications
            WHERE company_id =
                  facility.company_id
              AND facility_id =
                  facility.id
              AND deleted_at
                  IS NULL
              AND status =
                  'posted'
              AND as_of_date <=
                  $2::date
            ORDER BY
              as_of_date DESC,
              created_at DESC,
              id DESC
            LIMIT 1
          ) latest_classification
            ON TRUE
          LEFT JOIN LATERAL (
            SELECT
              period_end
            FROM accounting_financing_interest_accruals
            WHERE company_id =
                  facility.company_id
              AND facility_id =
                  facility.id
              AND deleted_at
                  IS NULL
              AND status =
                  'posted'
            ORDER BY
              period_end DESC,
              created_at DESC,
              id DESC
            LIMIT 1
          ) latest_accrual
            ON TRUE
          WHERE facility.company_id =
                $1
            AND facility.deleted_at
                IS NULL
          ORDER BY
            CASE facility.status
              WHEN 'active'
                THEN 1
              WHEN 'draft'
                THEN 2
              WHEN 'closed'
                THEN 3
              ELSE 4
            END,
            facility.maturity_date,
            facility.facility_number
        `,
        [
          companyId,
          today,
        ],
      ),
      context.pool.query(
        `
          SELECT
            rate.id::text,
            rate.facility_id::text,
            facility.facility_number,
            rate.effective_date::text,
            rate.reference_rate::text,
            rate.margin_rate::text,
            rate.effective_annual_rate::text,
            rate.source,
            rate.external_reference,
            rate.status,
            rate.created_at::text
          FROM accounting_financing_rate_periods rate
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               rate.facility_id
           AND facility.company_id =
               rate.company_id
           AND facility.deleted_at
               IS NULL
          WHERE rate.company_id =
                $1
            AND rate.deleted_at
                IS NULL
          ORDER BY
            rate.effective_date DESC,
            rate.created_at DESC
          LIMIT 300
        `,
        [
          companyId,
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
            line.revision,
            line.sequence,
            line.period_start::text,
            line.period_end::text,
            line.due_date::text,
            line.opening_principal::text,
            line.scheduled_principal::text,
            line.scheduled_interest::text,
            line.scheduled_fee::text,
            line.closing_principal::text,
            line.annual_rate::text,
            line.day_count_days,
            line.status
          FROM accounting_financing_schedule_lines line
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               line.facility_id
           AND facility.company_id =
               line.company_id
           AND facility.deleted_at
               IS NULL
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
            AND line.revision =
                facility.schedule_revision
          ORDER BY
            line.due_date,
            facility.facility_number,
            line.sequence
          LIMIT 1000
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            transaction.id::text,
            transaction.facility_id::text,
            facility.facility_number,
            facility.name
              AS facility_name,
            facility.direction,
            transaction.transaction_type,
            transaction.transaction_date::text,
            transaction.currency,
            transaction.foreign_amount::text,
            transaction.base_amount::text,
            transaction.exchange_rate::text,
            transaction.principal_foreign::text,
            transaction.principal_base::text,
            transaction.interest_foreign::text,
            transaction.interest_base::text,
            transaction.fee_foreign::text,
            transaction.fee_base::text,
            transaction.financial_account_id::text,
            bank.name
              AS financial_account_name,
            transaction.journal_id::text,
            transaction.reversal_journal_id::text,
            transaction.status,
            transaction.reference,
            transaction.notes,
            transaction.posted_at::text,
            transaction.reversed_at::text
          FROM accounting_financing_transactions transaction
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               transaction.facility_id
           AND facility.company_id =
               transaction.company_id
           AND facility.deleted_at
               IS NULL
          LEFT JOIN accounting_bank_accounts bank
            ON bank.id =
               transaction.financial_account_id
           AND bank.company_id =
               transaction.company_id
           AND bank.deleted_at
               IS NULL
          WHERE transaction.company_id =
                $1
            AND transaction.deleted_at
                IS NULL
          ORDER BY
            transaction.transaction_date DESC,
            transaction.created_at DESC
          LIMIT 500
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            accrual.id::text,
            accrual.facility_id::text,
            facility.facility_number,
            facility.name
              AS facility_name,
            facility.direction,
            accrual.period_start::text,
            accrual.period_end::text,
            accrual.currency,
            accrual.principal_foreign::text,
            accrual.annual_rate::text,
            accrual.day_count,
            accrual.day_count_days,
            accrual.foreign_interest_amount::text,
            accrual.base_interest_amount::text,
            accrual.exchange_rate::text,
            accrual.journal_id::text,
            accrual.reversal_journal_id::text,
            accrual.status,
            accrual.posted_at::text,
            accrual.reversed_at::text
          FROM accounting_financing_interest_accruals accrual
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               accrual.facility_id
           AND facility.company_id =
               accrual.company_id
           AND facility.deleted_at
               IS NULL
          WHERE accrual.company_id =
                $1
            AND accrual.deleted_at
                IS NULL
          ORDER BY
            accrual.period_end DESC,
            accrual.created_at DESC
          LIMIT 300
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            reclass.id::text,
            reclass.facility_id::text,
            facility.facility_number,
            facility.name
              AS facility_name,
            facility.direction,
            reclass.as_of_date::text,
            reclass.classification_days,
            reclass.target_current_principal::text,
            reclass.prior_current_principal::text,
            reclass.adjustment_amount::text,
            reclass.journal_id::text,
            reclass.reversal_journal_id::text,
            reclass.status,
            reclass.posted_at::text
          FROM accounting_financing_reclassifications reclass
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               reclass.facility_id
           AND facility.company_id =
               reclass.company_id
           AND facility.deleted_at
               IS NULL
          WHERE reclass.company_id =
                $1
            AND reclass.deleted_at
                IS NULL
          ORDER BY
            reclass.as_of_date DESC,
            reclass.created_at DESC
          LIMIT 300
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            as_of_date::text,
            status,
            facility_count,
            accrued_count,
            skipped_count,
            failed_count,
            started_at::text,
            completed_at::text
          FROM accounting_financing_runs
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            started_at DESC
          LIMIT 50
        `,
        [
          companyId,
        ],
      ),
      context.pool.query(
        `
          WITH active_facilities AS (
            SELECT
              facility.id,
              facility.direction,
              facility.currency,
              COALESCE(
                SUM(
                  CASE
                    WHEN transaction.transaction_type =
                         'drawdown'
                    THEN transaction.principal_base
                    WHEN transaction.transaction_type =
                         'principal_repayment'
                    THEN -transaction.principal_base
                    ELSE 0
                  END
                ),
                0
              )::numeric(19,2)
                AS principal_base
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
            WHERE facility.company_id =
                  $1
              AND facility.deleted_at
                  IS NULL
              AND facility.status =
                  'active'
            GROUP BY
              facility.id
          )
          SELECT
            COUNT(*)::int
              AS active_facilities,
            COUNT(*) FILTER (
              WHERE direction =
                    'borrowing'
            )::int
              AS active_borrowings,
            COUNT(*) FILTER (
              WHERE direction =
                    'lending'
            )::int
              AS active_lending,
            COALESCE(
              SUM(
                CASE
                  WHEN direction =
                       'borrowing'
                  THEN principal_base
                  ELSE 0
                END
              ),
              0
            )::numeric(19,2)::text
              AS borrowing_principal_base,
            COALESCE(
              SUM(
                CASE
                  WHEN direction =
                       'lending'
                  THEN principal_base
                  ELSE 0
                END
              ),
              0
            )::numeric(19,2)::text
              AS lending_principal_base,
            (
              SELECT COUNT(*)::int
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
                AND line.due_date <=
                    $2::date +
                    INTERVAL '30 days'
            ) AS payments_next_30_days
          FROM active_facilities
        `,
        [
          companyId,
          today,
        ],
      ),
    ]);

  const reporting =
    await getAccountingFinancingReporting(
      today,
    );

  return {
    companyId,
    currency,
    today,
    settings:
      settings.rows[0] ||
      {
        company_id:
          companyId,
        enabled:
          true,
        default_borrowing_principal_account_id:
          null,
        default_current_borrowing_account_id:
          null,
        default_lending_principal_account_id:
          null,
        default_current_lending_account_id:
          null,
        default_interest_expense_account_id:
          null,
        default_interest_income_account_id:
          null,
        default_accrued_interest_liability_account_id:
          null,
        default_accrued_interest_asset_account_id:
          null,
        default_financing_fee_expense_account_id:
          null,
        default_financing_fee_income_account_id:
          null,
        default_day_count:
          'actual_365',
        default_repayment_structure:
          'annuity',
        current_classification_days:
          365,
      },
    accounts:
      accounts.rows,
    financialAccounts:
      financialAccounts.rows,
    facilities:
      facilities.rows,
    rates:
      rates.rows,
    schedules:
      schedules.rows,
    transactions:
      transactions.rows,
    accruals:
      accruals.rows,
    classifications:
      classifications.rows,
    runs:
      runs.rows,
    metrics:
      metrics.rows[0] ||
      {
        active_facilities:
          0,
        active_borrowings:
          0,
        active_lending:
          0,
        borrowing_principal_base:
          '0.00',
        lending_principal_base:
          '0.00',
        payments_next_30_days:
          0,
      },
    reporting,
  };
}

export type AccountingFinancingWorkspace =
  Awaited<
    ReturnType<
      typeof getAccountingFinancing
    >
  >;
