import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

import {
  recordWorkspaceAuditEvent,
} from '@/lib/services/workspace-activity';

import {
  AccountingInputError,
  validateAccountingSetup,
  type AccountingSetupInput,
} from './validation';


export type AccountingSetup = {
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  defaultReceivableAccountId: string | null;
  defaultPayableAccountId: string | null;
  retainedEarningsAccountId: string | null;
  outputTaxAccountId: string | null;
  inputTaxAccountId: string | null;
  defaultCashAccountId: string | null;
  fxGainAccountId: string | null;
  fxLossAccountId: string | null;
  writeOffAccountId: string | null;
  roundingAccountId: string | null;
  roundingMethod: 'half_up' | 'half_even';
  globalLockDate: string | null;
  lockPostedEntries: boolean;
  requireOpenPeriod: boolean;
};


const DEFAULT_SETUP:
  AccountingSetup = {
    fiscalYearStartMonth:
      1,
    fiscalYearStartDay:
      1,
    defaultReceivableAccountId:
      null,
    defaultPayableAccountId:
      null,
    retainedEarningsAccountId:
      null,
    outputTaxAccountId:
      null,
    inputTaxAccountId:
      null,
    defaultCashAccountId:
      null,
    fxGainAccountId:
      null,
    fxLossAccountId:
      null,
    writeOffAccountId:
      null,
    roundingAccountId:
      null,
    roundingMethod:
      'half_up',
    globalLockDate:
      null,
    lockPostedEntries:
      true,
    requireOpenPeriod:
      true,
  };


const ACCOUNT_RULES = [
  {
    field:
      'defaultReceivableAccountId',
    label:
      'Accounts receivable',
    accepts:
      (type: string) =>
        type ===
          'asset_receivable',
  },
  {
    field:
      'defaultPayableAccountId',
    label:
      'Accounts payable',
    accepts:
      (type: string) =>
        type ===
          'liability_payable',
  },
  {
    field:
      'retainedEarningsAccountId',
    label:
      'Retained earnings',
    accepts:
      (type: string) =>
        type ===
          'equity' ||
        type.startsWith(
          'equity_',
        ),
  },
  {
    field:
      'outputTaxAccountId',
    label:
      'Output tax',
    accepts:
      (type: string) =>
        type ===
          'liability_current' ||
        type ===
          'liability_tax',
  },
  {
    field:
      'inputTaxAccountId',
    label:
      'Input tax',
    accepts:
      (type: string) =>
        type ===
          'asset_current' ||
        type ===
          'asset_tax',
  },
  {
    field:
      'defaultCashAccountId',
    label:
      'Default cash / bank',
    accepts:
      (type: string) =>
        type ===
          'asset_cash' ||
        type ===
          'asset_bank',
  },
  {
    field:
      'fxGainAccountId',
    label:
      'Foreign-exchange gain',
    accepts:
      (type: string) =>
        type ===
          'income' ||
        type.startsWith(
          'income_',
        ),
  },
  {
    field:
      'fxLossAccountId',
    label:
      'Foreign-exchange loss',
    accepts:
      (type: string) =>
        type ===
          'expense' ||
        type.startsWith(
          'expense_',
        ),
  },
  {
    field:
      'writeOffAccountId',
    label:
      'Write-off expense',
    accepts:
      (type: string) =>
        type ===
          'expense' ||
        type.startsWith(
          'expense_',
        ),
  },
  {
    field:
      'roundingAccountId',
    label:
      'Rounding account',
    accepts:
      (type: string) =>
        type ===
          'expense' ||
        type.startsWith(
          'expense_',
        ) ||
        type ===
          'income' ||
        type.startsWith(
          'income_',
        ),
  },
] as const;


function setupFromRow(
  row:
    Record<
      string,
      unknown
    > |
    undefined,
): AccountingSetup {
  if (!row) {
    return {
      ...DEFAULT_SETUP,
    };
  }

  return {
    fiscalYearStartMonth:
      Number(
        row.fiscal_year_start_month ||
        1,
      ),
    fiscalYearStartDay:
      Number(
        row.fiscal_year_start_day ||
        1,
      ),
    defaultReceivableAccountId:
      row.default_receivable_account_id
        ? String(
            row.default_receivable_account_id,
          )
        : null,
    defaultPayableAccountId:
      row.default_payable_account_id
        ? String(
            row.default_payable_account_id,
          )
        : null,
    retainedEarningsAccountId:
      row.retained_earnings_account_id
        ? String(
            row.retained_earnings_account_id,
          )
        : null,
    outputTaxAccountId:
      row.output_tax_account_id
        ? String(
            row.output_tax_account_id,
          )
        : null,
    inputTaxAccountId:
      row.input_tax_account_id
        ? String(
            row.input_tax_account_id,
          )
        : null,
    defaultCashAccountId:
      row.default_cash_account_id
        ? String(
            row.default_cash_account_id,
          )
        : null,
    fxGainAccountId:
      row.fx_gain_account_id
        ? String(
            row.fx_gain_account_id,
          )
        : null,
    fxLossAccountId:
      row.fx_loss_account_id
        ? String(
            row.fx_loss_account_id,
          )
        : null,
    writeOffAccountId:
      row.write_off_account_id
        ? String(
            row.write_off_account_id,
          )
        : null,
    roundingAccountId:
      row.rounding_account_id
        ? String(
            row.rounding_account_id,
          )
        : null,
    roundingMethod:
      row.rounding_method ===
        'half_even'
        ? 'half_even'
        : 'half_up',
    globalLockDate:
      row.global_lock_date
        ? String(
            row.global_lock_date,
          ).slice(
            0,
            10,
          )
        : null,
    lockPostedEntries:
      row.lock_posted_entries !==
        false,
    requireOpenPeriod:
      row.require_open_period !==
        false,
  };
}


export async function getAccountingSetup():
  Promise<AccountingSetup> {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_settings',
      'view',
    );

  const result =
    await context.pool.query(
      `
        SELECT
          fiscal_year_start_month,
          fiscal_year_start_day,
          default_receivable_account_id,
          default_payable_account_id,
          retained_earnings_account_id,
          output_tax_account_id,
          input_tax_account_id,
          default_cash_account_id,
          fx_gain_account_id,
          fx_loss_account_id,
          write_off_account_id,
          rounding_account_id,
          rounding_method,
          global_lock_date::text,
          lock_posted_entries,
          require_open_period
        FROM accounting_settings
        WHERE company_id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        context.companyId,
      ],
    );

  return setupFromRow(
    result.rows[0],
  );
}


async function validateAccountMappings(
  client:
    import('pg').PoolClient,
  companyId:
    string,
  payload:
    AccountingSetupInput,
) {
  const requested =
    ACCOUNT_RULES
      .map(
        rule => ({
          ...rule,
          id:
            payload[
              rule.field
            ],
        }),
      )
      .filter(
        (
          item,
        ): item is
          typeof item & {
            id: string;
          } =>
          Boolean(
            item.id,
          ),
      );

  if (
    requested.length ===
      0
  ) {
    return;
  }

  const ids =
    [
      ...new Set(
        requested.map(
          item =>
            item.id,
        ),
      ),
    ];

  const result =
    await client.query(
      `
        SELECT
          id::text,
          account_type,
          is_active
        FROM accounts
        WHERE company_id = $1
          AND id = ANY(
            $2::uuid[]
          )
          AND deleted_at IS NULL
        FOR SHARE
      `,
      [
        companyId,
        ids,
      ],
    );

  const accounts =
    new Map(
      result.rows.map(
        row => [
          String(
            row.id,
          ),
          {
            type:
              String(
                row.account_type ||
                '',
              ),
            active:
              row.is_active ===
              true,
          },
        ],
      ),
    );

  for (
    const item
    of requested
  ) {
    const account =
      accounts.get(
        item.id,
      );

    if (
      !account ||
      !account.active
    ) {
      throw new AccountingInputError(
        `${item.label} must use an active account belonging to this company.`,
      );
    }

    if (
      !item.accepts(
        account.type,
      )
    ) {
      throw new AccountingInputError(
        `${item.label} is mapped to an incompatible account type.`,
      );
    }
  }
}


export async function saveAccountingSetup(
  input:
    unknown,
): Promise<AccountingSetup> {
  const context =
    await requireEnterpriseModuleTableContext(
      'accounting',
      'accounting_settings',
      'settings',
    );

  const payload =
    validateAccountingSetup(
      input,
    );

  if (
    payload.expectedCompanyId !==
      context.companyId
  ) {
    throw new AccountingInputError(
      'Your company changed. Reload Accounting Setup before saving.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    await validateAccountMappings(
      client,
      context.companyId,
      payload,
    );

    const result =
      await client.query(
        `
          INSERT INTO accounting_settings (
            company_id,
            fiscal_year_start_month,
            fiscal_year_start_day,
            default_receivable_account_id,
            default_payable_account_id,
            retained_earnings_account_id,
            output_tax_account_id,
            input_tax_account_id,
            default_cash_account_id,
            fx_gain_account_id,
            fx_loss_account_id,
            write_off_account_id,
            rounding_account_id,
            rounding_method,
            global_lock_date,
            lock_posted_entries,
            require_open_period,
            created_by,
            updated_by,
            created_at,
            updated_at,
            deleted_at
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
            $18,$18,NOW(),NOW(),NULL
          )
          ON CONFLICT (
            company_id
          )
          DO UPDATE
          SET
            fiscal_year_start_month =
              EXCLUDED.fiscal_year_start_month,
            fiscal_year_start_day =
              EXCLUDED.fiscal_year_start_day,
            default_receivable_account_id =
              EXCLUDED.default_receivable_account_id,
            default_payable_account_id =
              EXCLUDED.default_payable_account_id,
            retained_earnings_account_id =
              EXCLUDED.retained_earnings_account_id,
            output_tax_account_id =
              EXCLUDED.output_tax_account_id,
            input_tax_account_id =
              EXCLUDED.input_tax_account_id,
            default_cash_account_id =
              EXCLUDED.default_cash_account_id,
            fx_gain_account_id =
              EXCLUDED.fx_gain_account_id,
            fx_loss_account_id =
              EXCLUDED.fx_loss_account_id,
            write_off_account_id =
              EXCLUDED.write_off_account_id,
            rounding_account_id =
              EXCLUDED.rounding_account_id,
            rounding_method =
              EXCLUDED.rounding_method,
            global_lock_date =
              EXCLUDED.global_lock_date,
            lock_posted_entries =
              EXCLUDED.lock_posted_entries,
            require_open_period =
              EXCLUDED.require_open_period,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW(),
            deleted_at =
              NULL
          RETURNING
            fiscal_year_start_month,
            fiscal_year_start_day,
            default_receivable_account_id,
            default_payable_account_id,
            retained_earnings_account_id,
            output_tax_account_id,
            input_tax_account_id,
            default_cash_account_id,
            fx_gain_account_id,
            fx_loss_account_id,
            write_off_account_id,
            rounding_account_id,
            rounding_method,
            global_lock_date::text,
            lock_posted_entries,
            require_open_period
        `,
        [
          context.companyId,
          payload.fiscalYearStartMonth,
          payload.fiscalYearStartDay,
          payload.defaultReceivableAccountId,
          payload.defaultPayableAccountId,
          payload.retainedEarningsAccountId,
          payload.outputTaxAccountId,
          payload.inputTaxAccountId,
          payload.defaultCashAccountId,
          payload.fxGainAccountId,
          payload.fxLossAccountId,
          payload.writeOffAccountId,
          payload.roundingAccountId,
          payload.roundingMethod,
          payload.globalLockDate,
          payload.lockPostedEntries,
          payload.requireOpenPeriod,
          context.userId,
        ],
      );

    await client.query(
      'COMMIT',
    );

    const saved =
      setupFromRow(
        result.rows[0],
      );

    await recordWorkspaceAuditEvent({
      tenantId:
        context.tenantId,
      companyId:
        context.companyId,
      userId:
        context.userId,
      action:
        'accounting.settings.updated',
      module:
        'accounting',
      resourceType:
        'accounting_settings',
      resourceId:
        context.companyId,
      summary:
        'Accounting setup updated',
      result:
        'success',
      metadata: {
        fiscalYearStartMonth:
          saved.fiscalYearStartMonth,
        fiscalYearStartDay:
          saved.fiscalYearStartDay,
        globalLockDate:
          saved.globalLockDate,
        mappedAccounts:
          ACCOUNT_RULES.filter(
            rule =>
              Boolean(
                saved[
                  rule.field
                ],
              ),
          ).length,
      },
    }).catch(
      error =>
        console.error(
          '[Accounting] Setup audit delivery failed',
          error,
        ),
    );

    return saved;
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {}

    throw error;
  } finally {
    client.release();
  }
}
