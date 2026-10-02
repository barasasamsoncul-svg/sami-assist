import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';
import {
  reversePostedLedgerJournal,
} from './ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from './validation';
import {
  financingBody,
  financingFacilityForUpdate,
  financingFinancialAccountForUpdate,
  financingOutstandingInterestUnits,
  financingOutstandingPrincipalUnits,
  assertFinancingFunds,
  recordFinancingFxMovement,
  rebuildFinancingSchedule,
  signedForeignUnits,
  signedLedgerCents,
} from './financing-helpers';

type Context =
  Awaited<
    ReturnType<
      typeof requireEnterpriseModuleTableContext
    >
  >;

async function audit(
  context:
    Context,
  action:
    string,
  resourceType:
    string,
  resourceId:
    string,
  summary:
    string,
  metadata:
    Record<
      string,
      unknown
    > = {},
) {
  await recordWorkspaceAuditEvent({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      'accounting.financing.' +
      action,
    module:
      'accounting',
    resourceType,
    resourceId,
    summary,
    result:
      'success',
    metadata,
  }).catch(
    error =>
      console.error(
        '[Accounting] Financing lifecycle audit failed',
        error,
      ),
  );
}

export async function reverseFinancingTransaction(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_transactions',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const transactionId =
    accountingId(
      body.transactionId,
    );
  const reversalDate =
    accountingDate(
      body.reversalDate,
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const result =
      await client.query(
        `
          SELECT
            transaction.*,
            facility.facility_number,
            facility.name
              AS facility_name,
            facility.direction,
            facility.status
              AS facility_status,
            facility.maturity_date,
            facility.currency
              AS facility_currency,
            financial.currency
              AS financial_currency
          FROM accounting_financing_transactions transaction
          INNER JOIN accounting_financing_facilities facility
            ON facility.id =
               transaction.facility_id
           AND facility.company_id =
               transaction.company_id
           AND facility.deleted_at
               IS NULL
          LEFT JOIN accounting_bank_accounts financial
            ON financial.id =
               transaction.financial_account_id
           AND financial.company_id =
               transaction.company_id
           AND financial.deleted_at
               IS NULL
          WHERE transaction.company_id =
                $1
            AND transaction.id =
                $2
            AND transaction.deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE OF transaction, facility
        `,
        [
          context.companyId,
          transactionId,
        ],
      );
    const transaction =
      result.rows[0];

    if (
      !transaction ||
      !transaction.journal_id
    ) {
      throw new AccountingInputError(
        'Financing transaction not found.',
      );
    }

    if (
      transaction.status ===
        'reversed' &&
      transaction
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        journalId:
          String(
            transaction
              .reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    if (
      transaction.status !==
        'posted'
    ) {
      throw new AccountingInputError(
        'Only a posted financing transaction can be reversed.',
      );
    }

    if (
      reversalDate <
      String(
        transaction
          .transaction_date,
      ).slice(
        0,
        10,
      )
    ) {
      throw new AccountingInputError(
        'Transaction reversal date cannot be before the original financing transaction date.',
      );
    }

    if (
      transaction
        .facility_status ===
        'closed'
    ) {
      throw new AccountingInputError(
        'A closed financing facility must be reopened before one of its transactions can be reversed.',
      );
    }

    const laterTransaction =
      await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM accounting_financing_transactions
            WHERE company_id =
                  $1
              AND facility_id =
                  $2
              AND deleted_at
                  IS NULL
              AND status =
                  'posted'
              AND id <>
                  $3
              AND (
                transaction_date >
                  $4::date
                OR (
                  transaction_date =
                    $4::date
                  AND created_at >
                    $5
                )
              )
          ) AS present
        `,
        [
          context.companyId,
          transaction.facility_id,
          transactionId,
          transaction.transaction_date,
          transaction.created_at,
        ],
      );

    if (
      laterTransaction
        .rows[0]
        ?.present
    ) {
      throw new AccountingInputError(
        'Reverse later financing transactions for this facility first.',
      );
    }

    if (
      signedForeignUnits(
        transaction
          .principal_foreign ||
        '0',
      ) >
      BigInt(
        0,
      )
    ) {
      const laterAccrual =
        await client.query(
          `
            SELECT EXISTS (
              SELECT 1
              FROM accounting_financing_interest_accruals
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
                AND period_end >
                    $3::date
            ) AS present
          `,
          [
            context.companyId,
            transaction.facility_id,
            transaction.transaction_date,
          ],
        );

      if (
        laterAccrual.rows[0]
          ?.present
      ) {
        throw new AccountingInputError(
          'Reverse later interest accruals before reversing this principal transaction.',
        );
      }
    }

    const baseCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      ).toUpperCase();
    const facilityCurrency =
      String(
        transaction
          .facility_currency,
      ).toUpperCase();
    const financialAccountId =
      transaction
        .financial_account_id
        ? String(
            transaction
              .financial_account_id,
          )
        : null;

    let financial:
      Record<
        string,
        unknown
      > |
      null =
        null;

    if (
      financialAccountId
    ) {
      financial =
        await financingFinancialAccountForUpdate(
          client,
          context.companyId,
          financialAccountId,
        );

      const originalIncoming =
        (
          transaction
            .transaction_type ===
            'drawdown' &&
          transaction.direction ===
            'borrowing'
        ) ||
        (
          transaction
            .transaction_type !==
            'drawdown' &&
          transaction.direction ===
            'lending'
        );

      if (
        originalIncoming
      ) {
        assertFinancingFunds(
          financial as
            Record<
              string,
              unknown
            >,
          {
            foreignAmount:
              signedForeignUnits(
                transaction
                  .foreign_amount,
              ),
            baseAmount:
              signedLedgerCents(
                transaction
                  .base_amount,
              ),
            facilityCurrency,
            baseCurrency,
          },
        );
      }
    }

    const reversal =
      await reversePostedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          originalJournalId:
            String(
              transaction.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse financing transaction · ' +
            String(
              transaction
                .facility_number,
            ) +
            ' · ' +
            String(
              transaction
                .transaction_type,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'financing_transaction_reversal',
          sourceId:
            transactionId,
          sourceEventKey:
            'accounting:financing:transaction-reversal:' +
            transactionId,
        },
      );

    await client.query(
      `
        UPDATE accounting_financing_transactions
        SET
          status =
            'reversed',
          reversal_journal_id =
            $3,
          reversed_at =
            NOW(),
          updated_by =
            $4,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        transactionId,
        reversal.journalId,
        context.userId,
      ],
    );

    if (
      financial &&
      financialAccountId
    ) {
      const accountCurrency =
        String(
          financial.currency,
        ).toUpperCase();
      const originalIncoming =
        (
          transaction
            .transaction_type ===
            'drawdown' &&
          transaction.direction ===
            'borrowing'
        ) ||
        (
          transaction
            .transaction_type !==
            'drawdown' &&
          transaction.direction ===
            'lending'
        );
      const sign =
        originalIncoming
          ? -BigInt(
              1,
            )
          : BigInt(
              1,
            );
      const foreignUnits =
        accountCurrency ===
          baseCurrency
          ? BigInt(
              0,
            )
          : signedForeignUnits(
              transaction
                .foreign_amount,
            ) *
            sign;
      const baseCents =
        signedLedgerCents(
          transaction
            .base_amount,
        ) *
        sign;

      await recordFinancingFxMovement(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          bankAccountId:
            financialAccountId,
          baseCurrency,
          accountCurrency,
          sourceType:
            'financing_transaction_reversal',
          sourceId:
            transactionId,
          eventKey:
            'financing-transaction-reversal:' +
            transactionId,
          date:
            reversalDate,
          foreignAmountUnits:
            foreignUnits,
          baseAmountCents:
            baseCents,
          rate:
            String(
              transaction
                .exchange_rate,
            ),
          metadata: {
            originalTransactionId:
              transactionId,
            originalJournalId:
              transaction
                .journal_id,
            reversalJournalId:
              reversal.journalId,
          },
        },
      );
    }

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        String(
          transaction
            .facility_id,
        ),
      );
    const outstanding =
      await financingOutstandingPrincipalUnits(
        client,
        context.companyId,
        String(
          transaction
            .facility_id,
        ),
      );

    if (
      facility
        .repayment_structure !==
        'custom'
    ) {
      await rebuildFinancingSchedule(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          facility,
          principalUnits:
            outstanding,
          startDate:
            reversalDate,
        },
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'transaction.reversed',
      'accounting_financing_transactions',
      transactionId,
      'Financing transaction reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      journalId:
        reversal.journalId,
      replayed:
        reversal.reused,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function closeFinancingFacility(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status ===
        'closed'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          facilityId,
        replayed:
          true,
      };
    }

    if (
      facility.status !==
        'active'
    ) {
      throw new AccountingInputError(
        'Only an active financing facility can be closed.',
      );
    }

    const principal =
      await financingOutstandingPrincipalUnits(
        client,
        context.companyId,
        facilityId,
      );
    const interest =
      await financingOutstandingInterestUnits(
        client,
        context.companyId,
        facilityId,
      );

    if (
      principal !==
        BigInt(
          0,
        ) ||
      interest !==
        BigInt(
          0,
        )
    ) {
      throw new AccountingInputError(
        'Repay or collect all outstanding principal and accrued interest before closing this facility.',
      );
    }

    await client.query(
      `
        UPDATE accounting_financing_schedule_lines
        SET
          status =
            'settled',
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND facility_id =
              $2
          AND deleted_at
              IS NULL
          AND status IN (
            'projected',
            'due'
          )
      `,
      [
        context.companyId,
        facilityId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE accounting_financing_facilities
        SET
          status =
            'closed',
          closed_at =
            NOW(),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        facilityId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'facility.closed',
      'accounting_financing_facilities',
      facilityId,
      'Financing facility closed',
    );

    return {
      id:
        facilityId,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}

export async function cancelFinancingFacility(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_facilities',
      'edit',
    );
  const body =
    financingBody(
      input,
    );
  const facilityId =
    accountingId(
      body.facilityId,
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status ===
        'cancelled'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          facilityId,
        replayed:
          true,
      };
    }

    if (
      facility.status !==
        'draft'
    ) {
      throw new AccountingInputError(
        'Only a draft financing facility can be cancelled.',
      );
    }

    await client.query(
      `
        UPDATE accounting_financing_facilities
        SET
          status =
            'cancelled',
          cancelled_at =
            NOW(),
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        facilityId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'facility.cancelled',
      'accounting_financing_facilities',
      facilityId,
      'Draft financing facility cancelled',
    );

    return {
      id:
        facilityId,
      replayed:
        false,
    };
  } catch (
    error
  ) {
    await client.query(
      'ROLLBACK',
    ).catch(
      () =>
        undefined,
    );
    throw error;
  } finally {
    client.release();
  }
}
