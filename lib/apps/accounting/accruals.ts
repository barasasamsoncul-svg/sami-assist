import 'server-only';

import {
  randomUUID,
} from 'node:crypto';
import type {
  PoolClient,
} from 'pg';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';
import {
  postBalancedLedgerJournal,
  reversePostedLedgerJournal,
} from '@/lib/apps/accounting/ledger-engine';
import {
  AccountingInputError,
  accountingDate,
  accountingId,
} from '@/lib/apps/accounting/validation';
import {
  accrualAutoReversalDate,
  accrualMoneyCents,
  accrualMoneyDecimal,
  buildAccrualPeriods,
  type AccrualAllocationMethod,
  type AccrualFrequency,
} from './accruals-rules';

type Context =
  Awaited<
    ReturnType<
      typeof requireEnterpriseModuleTableContext
    >
  >;

type ScheduleType =
  | 'prepaid_expense'
  | 'deferred_revenue'
  | 'accrued_expense'
  | 'accrued_revenue';

function bodyOf(
  input:
    unknown,
) {
  if (
    !input ||
    typeof input !==
      'object' ||
    Array.isArray(
      input,
    )
  ) {
    throw new AccountingInputError(
      'Enter valid accrual or deferral data.',
    );
  }

  return input as
    Record<
      string,
      unknown
    >;
}

function text(
  value:
    unknown,
  max:
    number,
  label:
    string,
  required =
    false,
) {
  if (
    value !==
      undefined &&
    value !==
      null &&
    typeof value !==
      'string'
  ) {
    throw new AccountingInputError(
      label +
      ' must contain text.',
    );
  }

  const result =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  if (
    (
      required &&
      !result
    ) ||
    result.length >
      max
  ) {
    throw new AccountingInputError(
      label +
      (
        required
          ? ' is required'
          : ''
      ) +
      ' and must not exceed ' +
      max +
      ' characters.',
    );
  }

  return result;
}

function bool(
  value:
    unknown,
  fallback =
    false,
) {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return fallback;
  }

  if (
    value ===
      true ||
    value ===
      false
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose a valid enabled or disabled value.',
  );
}

function optionalId(
  value:
    unknown,
) {
  return value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
    ? null
    : accountingId(
        value,
      );
}

function scheduleType(
  value:
    unknown,
):
  ScheduleType {
  if (
    value ===
      'prepaid_expense' ||
    value ===
      'deferred_revenue' ||
    value ===
      'accrued_expense' ||
    value ===
      'accrued_revenue'
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose prepaid expense, deferred revenue, accrued expense or accrued revenue.',
  );
}

function frequency(
  value:
    unknown,
):
  AccrualFrequency {
  if (
    value ===
      'monthly' ||
    value ===
      'quarterly' ||
    value ===
      'annual'
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose monthly, quarterly or annual recognition.',
  );
}

function allocationMethod(
  value:
    unknown,
):
  AccrualAllocationMethod {
  if (
    value ===
      'equal_periods' ||
    value ===
      'actual_days'
  ) {
    return value;
  }

  throw new AccountingInputError(
    'Choose equal-period or actual-day allocation.',
  );
}

function accountMatches(
  type:
    string,
  expected:
    'asset' |
    'liability' |
    'expense' |
    'income',
) {
  return (
    type ===
      expected ||
    type.startsWith(
      expected +
      '_',
    )
  );
}

async function activeAccount(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  companyId:
    string,
  accountId:
    string,
  label:
    string,
  expected?:
    'asset' |
    'liability' |
    'expense' |
    'income',
) {
  const result =
    await client.query(
      `
        SELECT
          id::text,
          code,
          name,
          account_type
        FROM accounts
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
          AND is_active =
              TRUE
        LIMIT 1
      `,
      [
        companyId,
        accountId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    throw new AccountingInputError(
      label +
      ' must be an active Accounting account.',
    );
  }

  if (
    expected &&
    !accountMatches(
      String(
        row.account_type,
      ),
      expected,
    )
  ) {
    throw new AccountingInputError(
      label +
      ' must use an ' +
      expected +
      ' account.',
    );
  }

  return row;
}

function balanceRole(
  type:
    ScheduleType,
) {
  return type ===
      'prepaid_expense' ||
    type ===
      'accrued_revenue'
    ? 'asset' as const
    : 'liability' as const;
}

function recognitionRole(
  type:
    ScheduleType,
) {
  return type ===
      'prepaid_expense' ||
    type ===
      'accrued_expense'
    ? 'expense' as const
    : 'income' as const;
}

function defaultBalanceKey(
  type:
    ScheduleType,
) {
  if (
    type ===
      'prepaid_expense'
  ) {
    return 'default_prepaid_asset_account_id';
  }

  if (
    type ===
      'deferred_revenue'
  ) {
    return 'default_deferred_revenue_account_id';
  }

  if (
    type ===
      'accrued_expense'
  ) {
    return 'default_accrued_expense_account_id';
  }

  return 'default_accrued_revenue_account_id';
}

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
  try {
    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.accrual.' +
        action,
      module:
        'accounting',
      resourceType,
      resourceId,
      summary,
      metadata,
    });
  } catch (
    error
  ) {
    console.error(
      '[Accounting] Accrual audit event failed',
      error,
    );
  }
}

async function settingsForUpdate(
  client:
    PoolClient,
  companyId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT *
        FROM accounting_accrual_settings
        WHERE company_id =
              $1
          AND deleted_at
              IS NULL
        LIMIT 1
        FOR UPDATE
      `,
      [
        companyId,
      ],
    );

  return result.rows[0] ||
    null;
}

export async function saveAccrualSettings(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_settings',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );

  if (
    accountingId(
      body.expectedCompanyId,
    ) !==
    context.companyId
  ) {
    throw new AccountingInputError(
      'The active company changed. Reload Accounting before saving accrual settings.',
    );
  }

  const defaults = {
    prepaid:
      optionalId(
        body.defaultPrepaidAssetAccountId,
      ),
    deferred:
      optionalId(
        body.defaultDeferredRevenueAccountId,
      ),
    accruedExpense:
      optionalId(
        body.defaultAccruedExpenseAccountId,
      ),
    accruedRevenue:
      optionalId(
        body.defaultAccruedRevenueAccountId,
      ),
  };
  const method =
    allocationMethod(
      body.defaultAllocationMethod ||
      'equal_periods',
    );
  const defaultFrequency =
    frequency(
      body.defaultFrequency ||
      'monthly',
    );
  const autoReverse =
    bool(
      body.defaultAutoReverseAccruals,
      true,
    );
  const enabled =
    bool(
      body.enabled,
      true,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    if (
      defaults.prepaid
    ) {
      await activeAccount(
        client,
        context.companyId,
        defaults.prepaid,
        'Default Prepaid Asset account',
        'asset',
      );
    }

    if (
      defaults.deferred
    ) {
      await activeAccount(
        client,
        context.companyId,
        defaults.deferred,
        'Default Deferred Revenue account',
        'liability',
      );
    }

    if (
      defaults.accruedExpense
    ) {
      await activeAccount(
        client,
        context.companyId,
        defaults.accruedExpense,
        'Default Accrued Expense account',
        'liability',
      );
    }

    if (
      defaults.accruedRevenue
    ) {
      await activeAccount(
        client,
        context.companyId,
        defaults.accruedRevenue,
        'Default Accrued Revenue account',
        'asset',
      );
    }

    await client.query(
      `
        INSERT INTO accounting_accrual_settings (
          company_id,
          enabled,
          default_prepaid_asset_account_id,
          default_deferred_revenue_account_id,
          default_accrued_expense_account_id,
          default_accrued_revenue_account_id,
          default_allocation_method,
          default_frequency,
          default_auto_reverse_accruals,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10
        )
        ON CONFLICT (company_id)
        DO UPDATE
        SET
          enabled =
            EXCLUDED.enabled,
          default_prepaid_asset_account_id =
            EXCLUDED.default_prepaid_asset_account_id,
          default_deferred_revenue_account_id =
            EXCLUDED.default_deferred_revenue_account_id,
          default_accrued_expense_account_id =
            EXCLUDED.default_accrued_expense_account_id,
          default_accrued_revenue_account_id =
            EXCLUDED.default_accrued_revenue_account_id,
          default_allocation_method =
            EXCLUDED.default_allocation_method,
          default_frequency =
            EXCLUDED.default_frequency,
          default_auto_reverse_accruals =
            EXCLUDED.default_auto_reverse_accruals,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW(),
          deleted_at =
            NULL
      `,
      [
        context.companyId,
        enabled,
        defaults.prepaid,
        defaults.deferred,
        defaults.accruedExpense,
        defaults.accruedRevenue,
        method,
        defaultFrequency,
        autoReverse,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'settings.saved',
      'accounting_accrual_settings',
      context.companyId,
      'Accrual and deferral settings saved',
    );

    return {
      saved:
        true,
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

export async function createAccrualSchedule(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedules',
      'create',
    );
  const body =
    bodyOf(
      input,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const type =
    scheduleType(
      body.scheduleType,
    );
  const name =
    text(
      body.name,
      255,
      'Schedule name',
      true,
    );
  const startDate =
    accountingDate(
      body.startDate,
    );
  const endDate =
    accountingDate(
      body.endDate,
    );
  const amount =
    accrualMoneyCents(
      body.totalAmount,
      'Schedule total',
    );
  const requestedFrequency =
    frequency(
      body.frequency ||
      'monthly',
    );
  const requestedAllocation =
    allocationMethod(
      body.allocationMethod ||
      'equal_periods',
    );
  const initialReclassification =
    bool(
      body.initialReclassification,
      false,
    );
  const autoReverseAccrual =
    bool(
      body.autoReverseAccrual,
      type ===
        'accrued_expense' ||
      type ===
        'accrued_revenue',
    );
  const recognitionAccountId =
    accountingId(
      body.recognitionAccountId,
    );
  const requestedBalanceAccountId =
    optionalId(
      body.balanceAccountId,
    );
  const sourceJournalId =
    optionalId(
      body.sourceJournalId,
    );
  const sourceModule =
    text(
      body.sourceModule,
      80,
      'Source module',
    );
  const sourceType =
    text(
      body.sourceType,
      120,
      'Source type',
    );
  const sourceId =
    text(
      body.sourceId,
      160,
      'Source ID',
    );
  const sourceReference =
    text(
      body.sourceReference,
      255,
      'Source reference',
    );
  const notes =
    text(
      body.notes,
      4000,
      'Notes',
    );

  if (
    endDate <
    startDate
  ) {
    throw new AccountingInputError(
      'Schedule end date cannot be before its start date.',
    );
  }

  if (
    initialReclassification &&
    ![
      'prepaid_expense',
      'deferred_revenue',
    ].includes(
      type,
    )
  ) {
    throw new AccountingInputError(
      'Initial reclassification is only used for prepaid expenses and deferred revenue.',
    );
  }

  if (
    autoReverseAccrual &&
    ![
      'accrued_expense',
      'accrued_revenue',
    ].includes(
      type,
    )
  ) {
    throw new AccountingInputError(
      'Automatic reversal is only available for accrued expense and accrued revenue schedules.',
    );
  }

  const periods =
    buildAccrualPeriods({
      startDate,
      endDate,
      frequency:
        requestedFrequency,
      allocationMethod:
        requestedAllocation,
      totalAmount:
        accrualMoneyDecimal(
          amount,
        ),
    });

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const replay =
      await client.query(
        `
          SELECT
            id::text,
            schedule_number
          FROM accounting_accrual_schedules
          WHERE company_id =
                $1
            AND request_key =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR SHARE
        `,
        [
          context.companyId,
          requestKey,
        ],
      );

    if (
      replay.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            replay.rows[0].id,
          ),
        scheduleNumber:
          String(
            replay.rows[0]
              .schedule_number,
          ),
        replayed:
          true,
      };
    }

    const settings =
      await settingsForUpdate(
        client,
        context.companyId,
      );

    if (
      settings &&
      settings.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Accruals and Deferrals before creating a schedule.',
      );
    }

    const balanceAccountId =
      requestedBalanceAccountId ||
      (
        settings
          ? optionalId(
              settings[
                defaultBalanceKey(
                  type,
                )
              ],
            )
          : null
      );

    if (
      !balanceAccountId
    ) {
      throw new AccountingInputError(
        'Choose the balance-sheet account for this schedule or configure a company default.',
      );
    }

    await activeAccount(
      client,
      context.companyId,
      balanceAccountId,
      'Balance account',
      balanceRole(
        type,
      ),
    );
    await activeAccount(
      client,
      context.companyId,
      recognitionAccountId,
      'Recognition account',
      recognitionRole(
        type,
      ),
    );

    if (
      balanceAccountId ===
      recognitionAccountId
    ) {
      throw new AccountingInputError(
        'Balance and recognition accounts must be different.',
      );
    }

    if (
      sourceJournalId
    ) {
      const source =
        await client.query(
          `
            SELECT
              journal.id::text,
              journal.journal_number,
              journal.status,
              COALESCE(
                SUM(line.debit),
                0
              )::numeric(19,2)::text
                AS total_debit
            FROM journals journal
            LEFT JOIN journal_lines line
              ON line.company_id =
                 journal.company_id
             AND line.journal_id =
                 journal.id
             AND line.deleted_at
                 IS NULL
            WHERE journal.company_id =
                  $1
              AND journal.id =
                  $2
              AND journal.deleted_at
                  IS NULL
            GROUP BY
              journal.id
            LIMIT 1
            FOR SHARE OF journal
          `,
          [
            context.companyId,
            sourceJournalId,
          ],
        );

      if (
        !source.rows[0] ||
        source.rows[0]
          .status !==
          'posted'
      ) {
        throw new AccountingInputError(
          'The source journal must be a posted journal in this company.',
        );
      }

      if (
        accrualMoneyCents(
          String(
            source.rows[0]
              .total_debit ||
            '0',
          ),
          'Source journal total',
        ) <
        amount
      ) {
        throw new AccountingInputError(
          'Schedule total cannot exceed the source journal total.',
        );
      }
    }

    const id =
      randomUUID();
    const scheduleNumber =
      'AD-' +
      startDate.slice(
        0,
        4,
      ) +
      '-' +
      id.slice(
        0,
        8,
      ).toUpperCase();

    await client.query(
      `
        INSERT INTO accounting_accrual_schedules (
          id,
          company_id,
          schedule_number,
          name,
          schedule_type,
          frequency,
          allocation_method,
          start_date,
          end_date,
          total_amount,
          balance_account_id,
          recognition_account_id,
          initial_reclassification,
          auto_reverse_accrual,
          source_module,
          source_type,
          source_id,
          source_reference,
          source_journal_id,
          request_key,
          notes,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          $21,$22,$22
        )
      `,
      [
        id,
        context.companyId,
        scheduleNumber,
        name,
        type,
        requestedFrequency,
        requestedAllocation,
        startDate,
        endDate,
        accrualMoneyDecimal(
          amount,
        ),
        balanceAccountId,
        recognitionAccountId,
        initialReclassification,
        autoReverseAccrual,
        sourceModule ||
          null,
        sourceType ||
          null,
        sourceId ||
          null,
        sourceReference ||
          null,
        sourceJournalId,
        requestKey,
        notes ||
          null,
        context.userId,
      ],
    );

    for (
      const period
      of periods
    ) {
      await client.query(
        `
          INSERT INTO accounting_accrual_schedule_lines (
            company_id,
            schedule_id,
            sequence,
            period_start,
            period_end,
            posting_date,
            amount,
            auto_reversal_date,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$9
          )
        `,
        [
          context.companyId,
          id,
          period.sequence,
          period.periodStart,
          period.periodEnd,
          period.postingDate,
          period.amount,
          autoReverseAccrual
            ? accrualAutoReversalDate(
                period.periodEnd,
              )
            : null,
          context.userId,
        ],
      );
    }

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'schedule.created',
      'accounting_accrual_schedules',
      id,
      'Accrual or deferral schedule created',
      {
        scheduleNumber,
        type,
        periods:
          periods.length,
        amount:
          accrualMoneyDecimal(
            amount,
          ),
      },
    );

    return {
      id,
      scheduleNumber,
      periods:
        periods.length,
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

function initialReclassificationLines(
  schedule:
    Record<
      string,
      unknown
    >,
) {
  const amount =
    String(
      schedule.total_amount,
    );
  const balanceAccountId =
    String(
      schedule.balance_account_id,
    );
  const recognitionAccountId =
    String(
      schedule.recognition_account_id,
    );

  if (
    schedule.schedule_type ===
      'prepaid_expense'
  ) {
    return [
      {
        accountId:
          balanceAccountId,
        description:
          'Move cost to prepaid asset',
        debit:
          amount,
        credit:
          '0.00',
      },
      {
        accountId:
          recognitionAccountId,
        description:
          'Reverse immediate expense recognition',
        debit:
          '0.00',
        credit:
          amount,
      },
    ];
  }

  return [
    {
      accountId:
        recognitionAccountId,
      description:
        'Reverse immediate revenue recognition',
      debit:
        amount,
      credit:
        '0.00',
    },
    {
      accountId:
        balanceAccountId,
      description:
        'Move revenue to deferred liability',
      debit:
        '0.00',
      credit:
        amount,
    },
  ];
}

function recognitionLines(
  schedule:
    Record<
      string,
      unknown
    >,
  amount:
    string,
) {
  const balanceAccountId =
    String(
      schedule.balance_account_id,
    );
  const recognitionAccountId =
    String(
      schedule.recognition_account_id,
    );

  if (
    schedule.schedule_type ===
      'prepaid_expense' ||
    schedule.schedule_type ===
      'accrued_expense'
  ) {
    return [
      {
        accountId:
          recognitionAccountId,
        description:
          'Accrual/deferral expense recognition',
        debit:
          amount,
        credit:
          '0.00',
      },
      {
        accountId:
          balanceAccountId,
        description:
          'Accrual/deferral balance movement',
        debit:
          '0.00',
        credit:
          amount,
      },
    ];
  }

  return [
    {
      accountId:
        balanceAccountId,
      description:
        'Accrual/deferral balance movement',
      debit:
        amount,
      credit:
        '0.00',
    },
    {
      accountId:
        recognitionAccountId,
      description:
        'Accrual/deferral revenue recognition',
      debit:
        '0.00',
      credit:
        amount,
    },
  ];
}

export async function activateAccrualSchedule(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedules',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const scheduleId =
    accountingId(
      body.scheduleId,
    );
  const activationDate =
    accountingDate(
      body.activationDate ||
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

    const result =
      await client.query(
        `
          SELECT *
          FROM accounting_accrual_schedules
          WHERE company_id =
                $1
            AND id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          scheduleId,
        ],
      );
    const schedule =
      result.rows[0];

    if (
      !schedule
    ) {
      throw new AccountingInputError(
        'Accrual or deferral schedule not found.',
      );
    }

    if (
      schedule.status ===
        'active' ||
      schedule.status ===
        'completed'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          scheduleId,
        journalId:
          schedule.initial_journal_id
            ? String(
                schedule.initial_journal_id,
              )
            : null,
        replayed:
          true,
      };
    }

    if (
      schedule.status !==
        'draft'
    ) {
      throw new AccountingInputError(
        'Only a draft schedule can be activated.',
      );
    }

    let journalId:
      string |
      null =
        null;

    if (
      schedule
        .initial_reclassification
    ) {
      const posting =
        await postBalancedLedgerJournal(
          client,
          {
            companyId:
              context.companyId,
            userId:
              context.userId,
            journalDate:
              activationDate,
            description:
              'Activate ' +
              String(
                schedule.schedule_number,
              ) +
              ' · ' +
              String(
                schedule.name,
              ),
            reference:
              schedule.source_reference
                ? String(
                    schedule.source_reference,
                  )
                : String(
                    schedule.schedule_number,
                  ),
            sourceModule:
              'accounting',
            sourceType:
              'accrual_initial_reclassification',
            sourceId:
              scheduleId,
            sourceEventKey:
              'accounting:accrual:initial:' +
              scheduleId,
            lines:
              initialReclassificationLines(
                schedule,
              ),
          },
        );

      journalId =
        posting.journalId;
    }

    await client.query(
      `
        UPDATE accounting_accrual_schedules
        SET
          status =
            'active',
          initial_journal_id =
            COALESCE(
              $3,
              initial_journal_id
            ),
          activated_at =
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
        scheduleId,
        journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'schedule.activated',
      'accounting_accrual_schedules',
      scheduleId,
      'Accrual or deferral schedule activated',
      {
        journalId,
      },
    );

    return {
      id:
        scheduleId,
      journalId,
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

export async function runAccrualRecognition(
  input:
    unknown = {},
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_runs',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
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

  let runId =
    '';

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await settingsForUpdate(
        client,
        context.companyId,
      );

    if (
      settings &&
      settings.enabled ===
        false
    ) {
      throw new AccountingInputError(
        'Enable Accruals and Deferrals before running recognition.',
      );
    }

    const run =
      await client.query(
        `
          INSERT INTO accounting_accrual_runs (
            company_id,
            as_of_date,
            generated_by,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$3,$3
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          asOf,
          context.userId,
        ],
      );

    runId =
      String(
        run.rows[0].id,
      );

    const due =
      await client.query(
        `
          SELECT
            line.id::text,
            line.schedule_id::text,
            line.sequence,
            line.period_start::text,
            line.period_end::text,
            line.posting_date::text,
            line.amount::text,
            schedule.schedule_number,
            schedule.name,
            schedule.schedule_type,
            schedule.balance_account_id::text,
            schedule.recognition_account_id::text,
            schedule.auto_reverse_accrual
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
            AND line.status =
                'pending'
            AND line.posting_date <=
                $2::date
          ORDER BY
            line.posting_date,
            schedule.schedule_number,
            line.sequence
          FOR UPDATE OF line
          SKIP LOCKED
        `,
        [
          context.companyId,
          asOf,
        ],
      );

    let posted =
      0;
    let reversed =
      0;
    let failed =
      0;

    for (
      const line
      of due.rows
    ) {
      const savepoint =
        'accrual_line_' +
        String(
          line.sequence,
        ).replace(
          /\D/g,
          '',
        ) +
        '_' +
        String(
          line.id,
        ).replace(
          /-/g,
          '',
        ).slice(
          0,
          8,
        );

      await client.query(
        'SAVEPOINT ' +
        savepoint,
      );

      try {
        const posting =
          await postBalancedLedgerJournal(
            client,
            {
              companyId:
                context.companyId,
              userId:
                context.userId,
              journalDate:
                String(
                  line.posting_date,
                ),
              description:
                String(
                  line.schedule_number,
                ) +
                ' · ' +
                String(
                  line.name,
                ) +
                ' · period ' +
                String(
                  line.sequence,
                ),
              reference:
                String(
                  line.schedule_number,
                ),
              sourceModule:
                'accounting',
              sourceType:
                'accrual_recognition',
              sourceId:
                String(
                  line.id,
                ),
              sourceEventKey:
                'accounting:accrual:recognition:' +
                String(
                  line.id,
                ),
              lines:
                recognitionLines(
                  line,
                  String(
                    line.amount,
                  ),
                ),
            },
          );

        await client.query(
          `
            UPDATE accounting_accrual_schedule_lines
            SET
              status =
                'posted',
              journal_id =
                $3,
              posted_at =
                NOW(),
              failure_message =
                NULL,
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
            line.id,
            posting.journalId,
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

        await client.query(
          `
            UPDATE accounting_accrual_schedule_lines
            SET
              status =
                'failed',
              failure_message =
                LEFT(
                  $3,
                  1000
                ),
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
            line.id,
            error instanceof
              Error
              ? error.message
              : 'Recognition posting failed.',
            context.userId,
          ],
        );

        failed +=
          1;

        await client.query(
          'RELEASE SAVEPOINT ' +
          savepoint,
        );
      }
    }

    const reversalDue =
      await client.query(
        `
          SELECT
            line.id::text,
            line.journal_id::text,
            line.auto_reversal_date::text,
            line.sequence,
            schedule.schedule_number,
            schedule.name
          FROM accounting_accrual_schedule_lines line
          INNER JOIN accounting_accrual_schedules schedule
            ON schedule.id =
               line.schedule_id
           AND schedule.company_id =
               line.company_id
           AND schedule.deleted_at
               IS NULL
           AND schedule.auto_reverse_accrual =
               TRUE
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
            AND line.status =
                'posted'
            AND line.journal_id
                IS NOT NULL
            AND line.reversal_journal_id
                IS NULL
            AND line.auto_reversal_date
                IS NOT NULL
            AND line.auto_reversal_date <=
                $2::date
          ORDER BY
            line.auto_reversal_date,
            schedule.schedule_number,
            line.sequence
          FOR UPDATE OF line
          SKIP LOCKED
        `,
        [
          context.companyId,
          asOf,
        ],
      );

    for (
      const line
      of reversalDue.rows
    ) {
      const savepoint =
        'accrual_reverse_' +
        String(
          line.sequence,
        ).replace(
          /\D/g,
          '',
        ) +
        '_' +
        String(
          line.id,
        ).replace(
          /-/g,
          '',
        ).slice(
          0,
          8,
        );

      await client.query(
        'SAVEPOINT ' +
        savepoint,
      );

      try {
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
                  line.journal_id,
                ),
              journalDate:
                String(
                  line.auto_reversal_date,
                ),
              description:
                'Automatic accrual reversal · ' +
                String(
                  line.schedule_number,
                ) +
                ' · period ' +
                String(
                  line.sequence,
                ),
              sourceModule:
                'accounting',
              sourceType:
                'accrual_auto_reversal',
              sourceId:
                String(
                  line.id,
                ),
              sourceEventKey:
                'accounting:accrual:auto-reversal:' +
                String(
                  line.id,
                ),
            },
          );

        await client.query(
          `
            UPDATE accounting_accrual_schedule_lines
            SET
              status =
                'reversed',
              reversal_journal_id =
                $3,
              reversed_at =
                NOW(),
              failure_message =
                NULL,
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
            line.id,
            reversal.journalId,
            context.userId,
          ],
        );

        reversed +=
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

        await client.query(
          `
            UPDATE accounting_accrual_schedule_lines
            SET
              failure_message =
                LEFT(
                  $3,
                  1000
                ),
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
            line.id,
            error instanceof
              Error
              ? error.message
              : 'Automatic reversal failed.',
            context.userId,
          ],
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
      `
        UPDATE accounting_accrual_schedules schedule
        SET
          status =
            'completed',
          completed_at =
            COALESCE(
              completed_at,
              NOW()
            ),
          updated_by =
            $2,
          updated_at =
            NOW()
        WHERE schedule.company_id =
              $1
          AND schedule.status =
              'active'
          AND schedule.deleted_at
              IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM accounting_accrual_schedule_lines line
            WHERE line.company_id =
                  schedule.company_id
              AND line.schedule_id =
                  schedule.id
              AND line.deleted_at
                  IS NULL
              AND line.status IN (
                'pending',
                'failed'
              )
          )
      `,
      [
        context.companyId,
        context.userId,
      ],
    );

    const runStatus =
      failed >
        0
        ? 'completed_with_errors'
        : 'completed';

    await client.query(
      `
        UPDATE accounting_accrual_runs
        SET
          status =
            $3,
          due_count =
            $4,
          posted_count =
            $5,
          reversed_count =
            $6,
          failed_count =
            $7,
          completed_at =
            NOW(),
          updated_by =
            $8,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
      `,
      [
        context.companyId,
        runId,
        runStatus,
        due.rows.length +
          reversalDue.rows.length,
        posted,
        reversed,
        failed,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'run.completed',
      'accounting_accrual_runs',
      runId,
      'Accrual and deferral recognition run completed',
      {
        asOf,
        posted,
        reversed,
        failed,
      },
    );

    return {
      id:
        runId,
      asOf,
      posted,
      reversed,
      failed,
      status:
        runStatus,
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

    if (
      runId
    ) {
      await context.pool.query(
        `
          UPDATE accounting_accrual_runs
          SET
            status =
              'failed',
            completed_at =
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
          runId,
          context.userId,
        ],
      ).catch(
        () =>
          undefined,
      );
    }

    throw error;
  } finally {
    client.release();
  }
}

export async function reverseAccrualRecognition(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedule_lines',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const lineId =
    accountingId(
      body.lineId,
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
            line.id::text,
            line.schedule_id::text,
            line.sequence,
            line.journal_id::text,
            line.reversal_journal_id::text,
            line.status,
            schedule.schedule_number,
            schedule.status
              AS schedule_status
          FROM accounting_accrual_schedule_lines line
          INNER JOIN accounting_accrual_schedules schedule
            ON schedule.id =
               line.schedule_id
           AND schedule.company_id =
               line.company_id
           AND schedule.deleted_at
               IS NULL
          WHERE line.company_id =
                $1
            AND line.id =
                $2
            AND line.deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE OF line, schedule
        `,
        [
          context.companyId,
          lineId,
        ],
      );
    const line =
      result.rows[0];

    if (
      !line ||
      line.status !==
        'posted' ||
      !line.journal_id
    ) {
      throw new AccountingInputError(
        'Only a posted recognition line can be reversed.',
      );
    }

    if (
      line.reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          lineId,
        journalId:
          String(
            line.reversal_journal_id,
          ),
        replayed:
          true,
      };
    }

    const later =
      await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM accounting_accrual_schedule_lines
            WHERE company_id =
                  $1
              AND schedule_id =
                  $2
              AND deleted_at
                  IS NULL
              AND sequence >
                  $3
              AND status =
                  'posted'
          ) AS later_posted
        `,
        [
          context.companyId,
          line.schedule_id,
          line.sequence,
        ],
      );

    if (
      later.rows[0]
        ?.later_posted
    ) {
      throw new AccountingInputError(
        'Reverse later recognition lines before reversing this period.',
      );
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
              line.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse recognition · ' +
            String(
              line.schedule_number,
            ) +
            ' · period ' +
            String(
              line.sequence,
            ),
          sourceModule:
            'accounting',
          sourceType:
            'accrual_recognition_reversal',
          sourceId:
            lineId,
          sourceEventKey:
            'accounting:accrual:recognition-reversal:' +
            lineId,
        },
      );

    await client.query(
      `
        UPDATE accounting_accrual_schedule_lines
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
        lineId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE accounting_accrual_schedules
        SET
          status =
            CASE
              WHEN status =
                   'completed'
              THEN 'active'
              ELSE status
            END,
          completed_at =
            CASE
              WHEN status =
                   'completed'
              THEN NULL
              ELSE completed_at
            END,
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
        line.schedule_id,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'recognition.reversed',
      'accounting_accrual_schedule_lines',
      lineId,
      'Accrual or deferral recognition reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      id:
        lineId,
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

export async function cancelAccrualSchedule(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedules',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const scheduleId =
    accountingId(
      body.scheduleId,
    );
  const cancellationDate =
    accountingDate(
      body.cancellationDate ||
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

    const result =
      await client.query(
        `
          SELECT *
          FROM accounting_accrual_schedules
          WHERE company_id =
                $1
            AND id =
                $2
            AND deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          scheduleId,
        ],
      );
    const schedule =
      result.rows[0];

    if (
      !schedule
    ) {
      throw new AccountingInputError(
        'Accrual or deferral schedule not found.',
      );
    }

    if (
      schedule.status ===
        'cancelled'
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          scheduleId,
        replayed:
          true,
      };
    }

    if (
      schedule.status ===
        'completed'
    ) {
      throw new AccountingInputError(
        'A completed schedule cannot be cancelled. Reverse recognition lines first if a correction is required.',
      );
    }

    const posted =
      await client.query(
        `
          SELECT COUNT(*)::int
            AS count
          FROM accounting_accrual_schedule_lines
          WHERE company_id =
                $1
            AND schedule_id =
                $2
            AND deleted_at
                IS NULL
            AND status =
                'posted'
        `,
        [
          context.companyId,
          scheduleId,
        ],
      );

    if (
      Number(
        posted.rows[0]
          ?.count ||
        0,
      ) >
      0
    ) {
      throw new AccountingInputError(
        'Reverse posted recognition lines before cancelling this schedule.',
      );
    }

    let reversalId:
      string |
      null =
        null;

    if (
      schedule
        .initial_journal_id &&
      !schedule
        .initial_reversal_journal_id
    ) {
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
                schedule.initial_journal_id,
              ),
            journalDate:
              cancellationDate,
            description:
              'Cancel accrual/deferral schedule · ' +
              String(
                schedule.schedule_number,
              ),
            sourceModule:
              'accounting',
            sourceType:
              'accrual_initial_reversal',
            sourceId:
              scheduleId,
            sourceEventKey:
              'accounting:accrual:initial-reversal:' +
              scheduleId,
          },
        );

      reversalId =
        reversal.journalId;
    }

    await client.query(
      `
        UPDATE accounting_accrual_schedule_lines
        SET
          status =
            'skipped',
          updated_by =
            $3,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND schedule_id =
              $2
          AND deleted_at
              IS NULL
          AND status IN (
            'pending',
            'failed',
            'reversed'
          )
      `,
      [
        context.companyId,
        scheduleId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE accounting_accrual_schedules
        SET
          status =
            'cancelled',
          initial_reversal_journal_id =
            COALESCE(
              $3,
              initial_reversal_journal_id
            ),
          cancelled_at =
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
        scheduleId,
        reversalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'schedule.cancelled',
      'accounting_accrual_schedules',
      scheduleId,
      'Accrual or deferral schedule cancelled',
      {
        initialReversalJournalId:
          reversalId,
      },
    );

    return {
      id:
        scheduleId,
      initialReversalJournalId:
        reversalId,
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

export async function getAccountingAccruals() {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_accrual_schedules',
      'view',
    );
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
    schedules,
    lines,
    runs,
    metrics,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            company_id::text,
            enabled,
            default_prepaid_asset_account_id::text,
            default_deferred_revenue_account_id::text,
            default_accrued_expense_account_id::text,
            default_accrued_revenue_account_id::text,
            default_allocation_method,
            default_frequency,
            default_auto_reverse_accruals
          FROM accounting_accrual_settings
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          context.companyId,
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
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            schedule.id::text,
            schedule.schedule_number,
            schedule.name,
            schedule.schedule_type,
            schedule.frequency,
            schedule.allocation_method,
            schedule.start_date::text,
            schedule.end_date::text,
            schedule.total_amount::text,
            schedule.balance_account_id::text,
            balance.code
              AS balance_account_code,
            balance.name
              AS balance_account_name,
            schedule.recognition_account_id::text,
            recognition.code
              AS recognition_account_code,
            recognition.name
              AS recognition_account_name,
            schedule.initial_reclassification,
            schedule.auto_reverse_accrual,
            schedule.source_module,
            schedule.source_type,
            schedule.source_id,
            schedule.source_reference,
            schedule.source_journal_id::text,
            schedule.initial_journal_id::text,
            schedule.initial_reversal_journal_id::text,
            schedule.status,
            schedule.notes,
            COALESCE(
              SUM(line.amount) FILTER (
                WHERE line.status =
                      'posted'
              ),
              0
            )::numeric(19,2)::text
              AS active_posted_amount,
            COUNT(*) FILTER (
              WHERE line.status =
                    'pending'
            )::int
              AS pending_count,
            COUNT(*) FILTER (
              WHERE line.status =
                    'failed'
            )::int
              AS failed_count,
            MIN(line.posting_date) FILTER (
              WHERE line.status =
                    'pending'
            )::text
              AS next_posting_date
          FROM accounting_accrual_schedules schedule
          INNER JOIN accounts balance
            ON balance.id =
               schedule.balance_account_id
           AND balance.company_id =
               schedule.company_id
          INNER JOIN accounts recognition
            ON recognition.id =
               schedule.recognition_account_id
           AND recognition.company_id =
               schedule.company_id
          LEFT JOIN accounting_accrual_schedule_lines line
            ON line.schedule_id =
               schedule.id
           AND line.company_id =
               schedule.company_id
           AND line.deleted_at
               IS NULL
          WHERE schedule.company_id =
                $1
            AND schedule.deleted_at
                IS NULL
          GROUP BY
            schedule.id,
            balance.code,
            balance.name,
            recognition.code,
            recognition.name
          ORDER BY
            CASE schedule.status
              WHEN 'active'
                THEN 1
              WHEN 'draft'
                THEN 2
              WHEN 'completed'
                THEN 3
              ELSE 4
            END,
            schedule.created_at DESC
          LIMIT 250
        `,
        [
          context.companyId,
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
            line.sequence,
            line.period_start::text,
            line.period_end::text,
            line.posting_date::text,
            line.amount::text,
            line.status,
            line.journal_id::text,
            line.reversal_journal_id::text,
            line.auto_reversal_date::text,
            line.failure_message
          FROM accounting_accrual_schedule_lines line
          INNER JOIN accounting_accrual_schedules schedule
            ON schedule.id =
               line.schedule_id
           AND schedule.company_id =
               line.company_id
           AND schedule.deleted_at
               IS NULL
          WHERE line.company_id =
                $1
            AND line.deleted_at
                IS NULL
          ORDER BY
            line.posting_date DESC,
            schedule.schedule_number,
            line.sequence DESC
          LIMIT 500
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            as_of_date::text,
            status,
            due_count,
            posted_count,
            reversed_count,
            failed_count,
            started_at::text,
            completed_at::text
          FROM accounting_accrual_runs
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            started_at DESC
          LIMIT 30
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE schedule.status =
                    'active'
            )::int
              AS active_schedules,
            COUNT(*) FILTER (
              WHERE schedule.status =
                    'draft'
            )::int
              AS draft_schedules,
            COALESCE(
              SUM(
                CASE
                  WHEN schedule.schedule_type IN (
                    'prepaid_expense',
                    'deferred_revenue'
                  )
                   AND schedule.status IN (
                    'active',
                    'completed'
                  )
                  THEN
                    schedule.total_amount -
                    COALESCE(
                      (
                        SELECT SUM(line.amount)
                        FROM accounting_accrual_schedule_lines line
                        WHERE line.company_id =
                              schedule.company_id
                          AND line.schedule_id =
                              schedule.id
                          AND line.deleted_at
                              IS NULL
                          AND line.status =
                              'posted'
                      ),
                      0
                    )
                  ELSE 0
                END
              ),
              0
            )::numeric(19,2)::text
              AS deferred_balance,
            COALESCE(
              SUM(
                CASE
                  WHEN schedule.schedule_type IN (
                    'accrued_expense',
                    'accrued_revenue'
                  )
                   AND schedule.status IN (
                    'active',
                    'completed'
                  )
                  THEN
                    COALESCE(
                      (
                        SELECT SUM(line.amount)
                        FROM accounting_accrual_schedule_lines line
                        WHERE line.company_id =
                              schedule.company_id
                          AND line.schedule_id =
                              schedule.id
                          AND line.deleted_at
                              IS NULL
                          AND line.status =
                              'posted'
                      ),
                      0
                    )
                  ELSE 0
                END
              ),
              0
            )::numeric(19,2)::text
              AS accrued_balance,
            (
              SELECT COUNT(*)::int
              FROM accounting_accrual_schedule_lines line
              INNER JOIN accounting_accrual_schedules active
                ON active.id =
                   line.schedule_id
               AND active.company_id =
                   line.company_id
               AND active.deleted_at
                   IS NULL
               AND active.status =
                   'active'
              WHERE line.company_id =
                    $1
                AND line.deleted_at
                    IS NULL
                AND line.status =
                    'pending'
                AND line.posting_date <=
                    $2::date
            ) AS due_count
          FROM accounting_accrual_schedules schedule
          WHERE schedule.company_id =
                $1
            AND schedule.deleted_at
                IS NULL
        `,
        [
          context.companyId,
          today,
        ],
      ),
    ]);

  const defaultSettings = {
    company_id:
      context.companyId,
    enabled:
      true,
    default_prepaid_asset_account_id:
      null,
    default_deferred_revenue_account_id:
      null,
    default_accrued_expense_account_id:
      null,
    default_accrued_revenue_account_id:
      null,
    default_allocation_method:
      'equal_periods',
    default_frequency:
      'monthly',
    default_auto_reverse_accruals:
      true,
  };

  return {
    companyId:
      context.companyId,
    currency,
    today,
    settings:
      settings.rows[0] ||
      defaultSettings,
    accounts:
      accounts.rows,
    schedules:
      schedules.rows,
    lines:
      lines.rows,
    runs:
      runs.rows,
    metrics:
      metrics.rows[0] ||
      {
        active_schedules:
          0,
        draft_schedules:
          0,
        deferred_balance:
          '0.00',
        accrued_balance:
          '0.00',
        due_count:
          0,
      },
  };
}

export type AccountingAccrualsWorkspace =
  Awaited<
    ReturnType<
      typeof getAccountingAccruals
    >
  >;
