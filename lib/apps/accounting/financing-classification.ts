import 'server-only';

import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';
import {
  postBalancedLedgerJournal,
} from './ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  decimalAmount,
} from './validation';
import {
  financingCentsDecimal,
  financingForeignDecimal,
} from './financing-rules';
import {
  financingBaseAmount,
  financingRateToBase,
  signedForeignUnits,
} from './financing-helpers';

function hashPayload(
  value:
    unknown,
) {
  return createHash(
    'sha256',
  )
    .update(
      JSON.stringify(
        value,
      ),
    )
    .digest(
      'hex',
    );
}

function classificationLines(
  input: {
    direction:
      'borrowing' |
      'lending';
    principalAccountId:
      string;
    currentPrincipalAccountId:
      string;
    deltaCents:
      bigint;
  },
) {
  const amount =
    decimalAmount(
      input.deltaCents >
        BigInt(
          0,
        )
        ? input.deltaCents
        : -input.deltaCents,
    );

  if (
    input.direction ===
      'borrowing'
  ) {
    return input.deltaCents >
        BigInt(
          0,
        )
      ? [
          {
            accountId:
              input.principalAccountId,
            description:
              'Reclassify borrowing to current liabilities',
            debit:
              amount,
            credit:
              '0.00',
          },
          {
            accountId:
              input.currentPrincipalAccountId,
            description:
              'Current portion of borrowing',
            debit:
              '0.00',
            credit:
              amount,
          },
        ]
      : [
          {
            accountId:
              input.currentPrincipalAccountId,
            description:
              'Release current borrowing classification',
            debit:
              amount,
            credit:
              '0.00',
          },
          {
            accountId:
              input.principalAccountId,
            description:
              'Return borrowing to non-current liabilities',
            debit:
              '0.00',
            credit:
              amount,
          },
        ];
  }

  return input.deltaCents >
      BigInt(
        0,
      )
    ? [
        {
          accountId:
            input.currentPrincipalAccountId,
          description:
            'Current portion of loan receivable',
          debit:
            amount,
          credit:
            '0.00',
        },
        {
          accountId:
            input.principalAccountId,
          description:
            'Reclassify lending to current assets',
          debit:
            '0.00',
          credit:
            amount,
        },
      ]
    : [
        {
          accountId:
            input.principalAccountId,
          description:
            'Return loan receivable to non-current assets',
          debit:
            amount,
          credit:
            '0.00',
        },
        {
          accountId:
            input.currentPrincipalAccountId,
          description:
            'Release current loan receivable classification',
          debit:
            '0.00',
          credit:
            amount,
        },
      ];
}

export async function runFinancingCurrentClassification(
  input:
    unknown = {},
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_reclassifications',
      'edit',
    );
  const body =
    input &&
    typeof input ===
      'object' &&
    !Array.isArray(
      input,
    )
      ? input as
          Record<
            string,
            unknown
          >
      : {};
  const asOf =
    accountingDate(
      body.asOf ||
      new Date()
        .toISOString()
        .slice(
          0,
          10,
        ),
    );
  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await client.query(
        `
          SELECT
            enabled,
            current_classification_days
          FROM accounting_financing_settings
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
        ],
      );
    const setting =
      settings.rows[0];

    if (
      setting &&
      setting.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Loans and Financing before running current-principal classification.',
      );
    }

    const classificationDays =
      Number(
        body.classificationDays ??
        setting
          ?.current_classification_days ??
        365,
      );

    if (
      !Number.isInteger(
        classificationDays,
      ) ||
      classificationDays <
        1 ||
      classificationDays >
        730
    ) {
      throw new AccountingInputError(
        'Current classification horizon must be between 1 and 730 days.',
      );
    }

    const facilities =
      await client.query(
        `
          SELECT *
          FROM accounting_financing_facilities
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
            AND status =
                'active'
            AND current_principal_account_id
                IS NOT NULL
            AND current_principal_account_id <>
                principal_account_id
          ORDER BY
            facility_number,
            id
          FOR UPDATE
          SKIP LOCKED
        `,
        [
          context.companyId,
        ],
      );

    const baseCurrency =
      String(
        context.company
          .currentCompany
          .currency,
      ).toUpperCase();
    let posted =
      0;
    let skipped =
      0;
    let failed =
      0;

    for (
      const facility
      of facilities.rows
    ) {
      const savepoint =
        'fin_class_' +
        String(
          facility.id,
        ).replace(
          /-/g,
          '',
        ).slice(
          0,
          12,
        );

      await client.query(
        'SAVEPOINT ' +
        savepoint,
      );

      try {
        const existing =
          await client.query(
            `
              SELECT
                id::text,
                journal_id::text
              FROM accounting_financing_reclassifications
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND as_of_date =
                    $3::date
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
              ORDER BY
                created_at DESC,
                id DESC
              LIMIT 1
            `,
            [
              context.companyId,
              facility.id,
              asOf,
            ],
          );

        if (
          existing.rows[0]
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const outstandingResult =
          await client.query(
            `
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
                )::numeric(19,4)::text
                  AS outstanding
              FROM accounting_financing_transactions
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
                AND transaction_date <=
                    $3::date
            `,
            [
              context.companyId,
              facility.id,
              asOf,
            ],
          );
        const outstanding =
          signedForeignUnits(
            outstandingResult
              .rows[0]
              ?.outstanding ||
            '0',
          );

        if (
          outstanding <=
          BigInt(
            0,
          )
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const targetResult =
          await client.query(
            `
              SELECT
                COALESCE(
                  SUM(
                    scheduled_principal
                  ),
                  0
                )::numeric(19,4)::text
                  AS current_due
              FROM accounting_financing_schedule_lines
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND revision =
                    $3
                AND deleted_at
                    IS NULL
                AND status IN (
                  'projected',
                  'due'
                )
                AND due_date >
                    $4::date
                AND due_date <=
                    $4::date +
                    ($5::text || ' days')::interval
            `,
            [
              context.companyId,
              facility.id,
              facility.schedule_revision,
              asOf,
              classificationDays,
            ],
          );
        let targetForeign =
          signedForeignUnits(
            targetResult
              .rows[0]
              ?.current_due ||
            '0',
          );

        if (
          targetForeign >
          outstanding
        ) {
          targetForeign =
            outstanding;
        }

        const facilityCurrency =
          String(
            facility.currency,
          ).toUpperCase();
        const fx =
          await financingRateToBase(
            client,
            {
              companyId:
                context.companyId,
              foreignCurrency:
                facilityCurrency,
              baseCurrency,
              date:
                asOf,
              rateType:
                'closing',
            },
          );
        const targetBase =
          targetForeign >
            BigInt(
              0,
            )
            ? financingBaseAmount(
                targetForeign,
                fx.rate,
              )
            : BigInt(
                0,
              );

        const prior =
          await client.query(
            `
              SELECT
                target_current_principal::text
              FROM accounting_financing_reclassifications
              WHERE company_id =
                    $1
                AND facility_id =
                    $2
                AND as_of_date <
                    $3::date
                AND deleted_at
                    IS NULL
                AND status =
                    'posted'
              ORDER BY
                as_of_date DESC,
                created_at DESC,
                id DESC
              LIMIT 1
            `,
            [
              context.companyId,
              facility.id,
              asOf,
            ],
          );
        const priorBase =
          prior.rows[0]
            ? BigInt(
                Math.round(
                  Number(
                    prior.rows[0]
                      .target_current_principal,
                  ) *
                  100,
                ),
              )
            : BigInt(
                0,
              );
        const delta =
          targetBase -
          priorBase;

        if (
          delta ===
          BigInt(
            0,
          )
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT ' +
            savepoint,
          );
          continue;
        }

        const requestKey =
          randomUUID();
        const requestHash =
          hashPayload({
            facilityId:
              facility.id,
            asOf,
            classificationDays,
            targetCurrentPrincipal:
              decimalAmount(
                targetBase,
              ),
            priorCurrentPrincipal:
              decimalAmount(
                priorBase,
              ),
            delta:
              financingCentsDecimal(
                delta,
              ),
            fxRate:
              fx.rate,
          });
        const journal =
          await postBalancedLedgerJournal(
            client,
            {
              companyId:
                context.companyId,
              userId:
                context.userId,
              journalDate:
                asOf,
              description:
                'Current principal classification · ' +
                String(
                  facility
                    .facility_number,
                ),
              reference:
                String(
                  facility
                    .facility_number,
                ),
              sourceModule:
                'accounting',
              sourceType:
                'financing_current_classification',
              sourceId:
                String(
                  facility.id,
                ),
              sourceEventKey:
                'accounting:financing:classification:' +
                String(
                  facility.id,
                ) +
                ':' +
                asOf,
              postingKind:
                'system',
              lines:
                classificationLines({
                  direction:
                    String(
                      facility.direction,
                    ) as
                      'borrowing' |
                      'lending',
                  principalAccountId:
                    String(
                      facility
                        .principal_account_id,
                    ),
                  currentPrincipalAccountId:
                    String(
                      facility
                        .current_principal_account_id,
                    ),
                  deltaCents:
                    delta,
                }),
            },
          );
        const id =
          randomUUID();

        await client.query(
          `
            INSERT INTO accounting_financing_reclassifications (
              id,
              company_id,
              facility_id,
              as_of_date,
              classification_days,
              target_current_principal,
              prior_current_principal,
              adjustment_amount,
              journal_id,
              request_key,
              request_hash,
              status,
              posted_at,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              $11,'posted',NOW(),$12,$12
            )
          `,
          [
            id,
            context.companyId,
            facility.id,
            asOf,
            classificationDays,
            decimalAmount(
              targetBase,
            ),
            decimalAmount(
              priorBase,
            ),
            financingCentsDecimal(
              delta,
            ),
            journal.journalId,
            requestKey,
            requestHash,
            context.userId,
          ],
        );

        posted +=
          1;

        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      } catch (
        error
      ) {
        await client.query(
          'ROLLBACK TO SAVEPOINT ' +
          savepoint,
        );
        failed +=
          1;
        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      }
    }

    await client.query(
      'COMMIT',
    );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.financing.classification.completed',
      module:
        'accounting',
      resourceType:
        'accounting_financing_reclassifications',
      resourceId:
        asOf,
      summary:
        'Current/non-current financing classification completed',
      result:
        failed >
          0
          ? 'partial'
          : 'success',
      metadata: {
        asOf,
        classificationDays,
        facilities:
          facilities.rows.length,
        posted,
        skipped,
        failed,
      },
    }).catch(
      () =>
        undefined,
    );

    return {
      asOf,
      classificationDays,
      facilities:
        facilities.rows.length,
      posted,
      skipped,
      failed,
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
