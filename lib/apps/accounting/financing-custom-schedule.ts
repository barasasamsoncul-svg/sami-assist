import 'server-only';

import {
  createHash,
} from 'node:crypto';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from './validation';
import {
  financingDayCountDays,
  financingForeignDecimal,
} from './financing-rules';
import {
  financingBody,
  financingEffectiveRate,
  financingFacilityForUpdate,
  financingOutstandingPrincipalUnits,
  financingPositiveUnits,
} from './financing-helpers';

function zeroOrPositiveUnits(
  value:
    unknown,
  label:
    string,
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      '' ||
    value ===
      0 ||
    value ===
      '0' ||
    value ===
      '0.0' ||
    value ===
      '0.00' ||
    value ===
      '0.000' ||
    value ===
      '0.0000'
  ) {
    return BigInt(
      0,
    );
  }

  return financingPositiveUnits(
    value,
    label,
  );
}

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

export async function replaceFinancingCustomSchedule(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_financing_schedule_lines',
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
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const scheduleStartDate =
    accountingDate(
      body.scheduleStartDate,
    );
  const rawLines =
    Array.isArray(
      body.lines,
    )
      ? body.lines
      : [];

  if (
    rawLines.length <
      1 ||
    rawLines.length >
      600
  ) {
    throw new AccountingInputError(
      'Custom financing schedule must contain between 1 and 600 lines.',
    );
  }

  const normalizedLines =
    rawLines.map(
      (
        value,
        index,
      ) => {
        if (
          !value ||
          typeof value !==
            'object' ||
          Array.isArray(
            value,
          )
        ) {
          throw new AccountingInputError(
            'Custom schedule line ' +
            String(
              index +
              1,
            ) +
            ' is invalid.',
          );
        }

        const row =
          value as
            Record<
              string,
              unknown
            >;
        const dueDate =
          accountingDate(
            row.dueDate,
          );
        const principal =
          zeroOrPositiveUnits(
            row.principalAmount,
            'Custom principal',
          );
        const interest =
          zeroOrPositiveUnits(
            row.interestAmount,
            'Custom interest',
          );
        const fee =
          zeroOrPositiveUnits(
            row.feeAmount,
            'Custom fee',
          );

        if (
          principal ===
            BigInt(
              0,
            ) &&
          interest ===
            BigInt(
              0,
            ) &&
          fee ===
            BigInt(
              0,
            )
        ) {
          throw new AccountingInputError(
            'Each custom schedule line must contain principal, interest or a fee.',
          );
        }

        return {
          dueDate,
          principal,
          interest,
          fee,
        };
      },
    );

  for (
    let index =
      0;
    index <
      normalizedLines.length;
    index +=
      1
  ) {
    const previous =
      index ===
        0
        ? scheduleStartDate
        : normalizedLines[
            index -
            1
          ].dueDate;

    if (
      normalizedLines[
        index
      ].dueDate <=
      previous
    ) {
      throw new AccountingInputError(
        'Custom schedule due dates must be strictly increasing and after the schedule start date.',
      );
    }
  }

  const requestHash =
    hashPayload({
      facilityId,
      scheduleStartDate,
      lines:
        normalizedLines.map(
          row => ({
            dueDate:
              row.dueDate,
            principal:
              financingForeignDecimal(
                row.principal,
              ),
            interest:
              financingForeignDecimal(
                row.interest,
              ),
            fee:
              financingForeignDecimal(
                row.fee,
              ),
          }),
        ),
    });

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [
        context.companyId +
        ':financing-custom-schedule:' +
        facilityId +
        ':' +
        requestKey,
      ],
    );

    const facility =
      await financingFacilityForUpdate(
        client,
        context.companyId,
        facilityId,
      );

    if (
      facility.status !==
        'draft' &&
      facility.status !==
        'active'
    ) {
      throw new AccountingInputError(
        'Custom schedules can only be replaced on draft or active financing facilities.',
      );
    }

    if (
      facility
        .repayment_structure !==
        'custom' ||
      facility
        .payment_frequency !==
        'custom'
    ) {
      throw new AccountingInputError(
        'Switch this facility to a custom repayment structure and custom payment frequency before supplying a manual schedule.',
      );
    }

    if (
      scheduleStartDate <
        String(
          facility.start_date,
        ).slice(
          0,
          10,
        ) ||
      scheduleStartDate >=
        String(
          facility.maturity_date,
        ).slice(
          0,
          10,
        )
    ) {
      throw new AccountingInputError(
        'Custom schedule start date must fall within the facility term.',
      );
    }

    if (
      normalizedLines.at(
        -1,
      )!.dueDate >
      String(
        facility.maturity_date,
      ).slice(
        0,
        10,
      )
    ) {
      throw new AccountingInputError(
        'Custom schedule cannot extend beyond the facility maturity date.',
      );
    }

    const replay =
      await client.query(
        `
          SELECT
            revision,
            request_hash
          FROM accounting_financing_schedule_lines
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND request_key =
                $3
            AND deleted_at
                IS NULL
          ORDER BY
            sequence
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          facilityId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      if (
        String(
          replay.rows[0]
            .request_hash,
        ) !==
        requestHash
      ) {
        throw new AccountingInputError(
          'This custom-schedule request key was already used with different lines.',
        );
      }

      await client.query(
        'COMMIT',
      );

      return {
        revision:
          Number(
            replay.rows[0]
              .revision,
          ),
        lines:
          normalizedLines.length,
        replayed:
          true,
      };
    }

    const targetPrincipal =
      facility.status ===
        'active'
        ? await financingOutstandingPrincipalUnits(
            client,
            context.companyId,
            facilityId,
          )
        : financingPositiveUnits(
            facility.principal_limit,
            'Principal limit',
          );

    if (
      targetPrincipal <=
      BigInt(
        0,
      )
    ) {
      throw new AccountingInputError(
        'The active facility has no outstanding principal to schedule.',
      );
    }

    const scheduledPrincipal =
      normalizedLines.reduce(
        (
          total,
          row,
        ) =>
          total +
          row.principal,
        BigInt(
          0,
        ),
      );

    if (
      scheduledPrincipal !==
      targetPrincipal
    ) {
      throw new AccountingInputError(
        'Custom schedule principal must equal the facility principal being scheduled: ' +
        financingForeignDecimal(
          targetPrincipal,
        ) +
        '.',
      );
    }

    const currentRevision =
      Number(
        facility
          .schedule_revision ||
        1,
      );
    const existing =
      await client.query(
        `
          SELECT COUNT(*)::int
            AS count
          FROM accounting_financing_schedule_lines
          WHERE company_id =
                $1
            AND facility_id =
                $2
            AND revision =
                $3
            AND deleted_at
                IS NULL
        `,
        [
          context.companyId,
          facilityId,
          currentRevision,
        ],
      );
    const revision =
      Number(
        existing.rows[0]
          ?.count ||
        0,
      ) >
        0
        ? currentRevision +
          1
        : currentRevision;

    if (
      revision !==
      currentRevision
    ) {
      await client.query(
        `
          UPDATE accounting_financing_schedule_lines
          SET
            status =
              'superseded',
            updated_by =
              $4,
            updated_at =
              NOW()
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
        `,
        [
          context.companyId,
          facilityId,
          currentRevision,
          context.userId,
        ],
      );
    }

    await client.query(
      `
        UPDATE accounting_financing_facilities
        SET
          schedule_revision =
            $3,
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
        facilityId,
        revision,
        context.userId,
      ],
    );

    let opening =
      targetPrincipal;
    let periodStart =
      scheduleStartDate;

    for (
      let index =
        0;
      index <
        normalizedLines.length;
      index +=
        1
    ) {
      const row =
        normalizedLines[
          index
        ];
      const closing =
        opening -
        row.principal;
      const annualRate =
        await financingEffectiveRate(
          client,
          facility,
          periodStart,
        );
      const dayCountDays =
        financingDayCountDays(
          periodStart,
          row.dueDate,
          String(
            facility.day_count,
          ) as
            'actual_365' |
            'actual_360' |
            'thirty_360',
        );

      if (
        dayCountDays <=
        0
      ) {
        throw new AccountingInputError(
          'Custom schedule periods must contain at least one financing day.',
        );
      }

      await client.query(
        `
          INSERT INTO accounting_financing_schedule_lines (
            company_id,
            facility_id,
            revision,
            sequence,
            period_start,
            period_end,
            due_date,
            opening_principal,
            scheduled_principal,
            scheduled_interest,
            scheduled_fee,
            closing_principal,
            annual_rate,
            day_count_days,
            schedule_source,
            request_key,
            request_hash,
            status,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$6,$7,$8,$9,
            $10,$11,$12,$13,'custom',$14,$15,'projected',$16,$16
          )
        `,
        [
          context.companyId,
          facilityId,
          revision,
          index +
            1,
          periodStart,
          row.dueDate,
          financingForeignDecimal(
            opening,
          ),
          financingForeignDecimal(
            row.principal,
          ),
          financingForeignDecimal(
            row.interest,
          ),
          financingForeignDecimal(
            row.fee,
          ),
          financingForeignDecimal(
            closing,
          ),
          annualRate,
          dayCountDays,
          requestKey,
          requestHash,
          context.userId,
        ],
      );

      opening =
        closing;
      periodStart =
        row.dueDate;
    }

    if (
      opening !==
      BigInt(
        0,
      )
    ) {
      throw new AccountingInputError(
        'Custom financing schedule must reduce principal to zero by maturity.',
      );
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
        'accounting.financing.custom_schedule.replaced',
      module:
        'accounting',
      resourceType:
        'accounting_financing_schedule_lines',
      resourceId:
        facilityId,
      summary:
        'Custom financing schedule revision created',
      result:
        'success',
      metadata: {
        revision,
        lines:
          normalizedLines.length,
        scheduleStartDate,
        principal:
          financingForeignDecimal(
            targetPrincipal,
          ),
      },
    }).catch(
      () =>
        undefined,
    );

    return {
      revision,
      lines:
        normalizedLines.length,
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
