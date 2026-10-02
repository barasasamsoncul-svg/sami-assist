import 'server-only';

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
} from '@/lib/apps/accounting/ledger-engine';
import {
  accountingDate,
  accountingId,
} from '@/lib/apps/accounting/validation';
import {
  assetCarryingValueCents,
  assetMoneyCents,
  assetMoneyDecimal,
  decliningBalanceDepreciationCents,
  prorateDepreciationCents,
  straightLineDepreciationCents,
} from './accounting-rules';

type Context =
  Awaited<
    ReturnType<
      typeof requireEnterpriseModuleTableContext
    >
  >;

export class FixedAssetInputError
  extends Error {}

function bodyOf(
  value:
    unknown,
) {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    throw new FixedAssetInputError(
      'Enter valid Fixed Asset data.',
    );
  }

  return value as
    Record<
      string,
      unknown
    >;
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

  return (
    value === true ||
    value === 'true' ||
    value === 1 ||
    value === '1'
  );
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
    value != null &&
    typeof value !==
      'string'
  ) {
    throw new FixedAssetInputError(
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
    required &&
    !result
  ) {
    throw new FixedAssetInputError(
      label +
      ' is required.',
    );
  }

  if (
    result.length >
      max
  ) {
    throw new FixedAssetInputError(
      label +
      ' must be at most ' +
      max +
      ' characters.',
    );
  }

  return result;
}

function optionalId(
  value:
    unknown,
) {
  if (
    value ===
      undefined ||
    value ===
      null ||
    value ===
      ''
  ) {
    return null;
  }

  return accountingId(
    value,
  );
}

function positiveInteger(
  value:
    unknown,
  label:
    string,
) {
  const number =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      number,
    ) ||
    number <=
      0
  ) {
    throw new FixedAssetInputError(
      label +
      ' must be a positive whole number.',
    );
  }

  return number;
}

function date(
  value:
    unknown,
  label:
    string,
) {
  try {
    return accountingDate(
      value,
    );
  } catch {
    throw new FixedAssetInputError(
      label +
      ' must be a valid date.',
    );
  }
}

function methodOf(
  value:
    unknown,
) {
  const method =
    text(
      value,
      40,
      'Depreciation method',
      true,
    );

  if (
    ![
      'straight_line',
      'declining_balance',
      'no_depreciation',
    ].includes(
      method,
    )
  ) {
    throw new FixedAssetInputError(
      'Choose straight-line, declining-balance or no-depreciation.',
    );
  }

  return method;
}

function conventionOf(
  value:
    unknown,
) {
  const convention =
    text(
      value,
      30,
      'Prorata convention',
      true,
    );

  if (
    ![
      'daily',
      'full_month',
      'none',
    ].includes(
      convention,
    )
  ) {
    throw new FixedAssetInputError(
      'Choose daily, full-month or no proration.',
    );
  }

  return convention as
    'daily' |
    'full_month' |
    'none';
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
  await recordWorkspaceAuditEvent({
    tenantId:
      context.tenantId,
    companyId:
      context.companyId,
    userId:
      context.userId,
    action:
      'fixed_assets.' +
      action,
    module:
      'fixed_assets',
    resourceType,
    resourceId,
    summary,
    result:
      'success',
    metadata,
  }).catch(
    error =>
      console.error(
        '[Fixed Assets] audit failed',
        error,
      ),
  );
}

function assetAccount(
  type:
    string,
) {
  return (
    type ===
      'asset' ||
    type.startsWith(
      'asset_',
    )
  );
}

function expenseAccount(
  type:
    string,
) {
  return (
    type ===
      'expense' ||
    type.startsWith(
      'expense_',
    )
  );
}

function incomeAccount(
  type:
    string,
) {
  return (
    type ===
      'income' ||
    type.startsWith(
      'income_',
    )
  );
}

function equityAccount(
  type:
    string,
) {
  return (
    type ===
      'equity' ||
    type.startsWith(
      'equity_',
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
  id:
    string,
  label:
    string,
  accepts?:
    (
      type:
        string,
    ) =>
      boolean,
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
        id,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row ||
    (
      accepts &&
      !accepts(
        String(
          row.account_type ||
          '',
        ),
      )
    )
  ) {
    throw new FixedAssetInputError(
      label +
      ' must use a compatible active Accounting account.',
    );
  }

  return row;
}

async function settingsRow(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  companyId:
    string,
  forUpdate =
    false,
) {
  const result =
    await client.query(
      `
        SELECT
          company_id::text,
          capitalization_threshold::text,
          default_asset_account_id::text,
          default_accumulated_depreciation_account_id::text,
          default_depreciation_expense_account_id::text,
          default_capitalization_offset_account_id::text,
          default_disposal_gain_account_id::text,
          default_disposal_loss_account_id::text,
          default_impairment_loss_account_id::text,
          default_accumulated_impairment_account_id::text,
          default_revaluation_reserve_account_id::text,
          default_revaluation_loss_account_id::text,
          default_prorata_convention
        FROM fixed_assets_settings
        WHERE company_id =
              $1
        LIMIT 1
        ${forUpdate
          ? 'FOR UPDATE'
          : ''}
      `,
      [
        companyId,
      ],
    );

  return result.rows[0] ||
    {
      capitalization_threshold:
        '0',
      default_asset_account_id:
        null,
      default_accumulated_depreciation_account_id:
        null,
      default_depreciation_expense_account_id:
        null,
      default_capitalization_offset_account_id:
        null,
      default_disposal_gain_account_id:
        null,
      default_disposal_loss_account_id:
        null,
      default_impairment_loss_account_id:
        null,
      default_accumulated_impairment_account_id:
        null,
      default_revaluation_reserve_account_id:
        null,
      default_revaluation_loss_account_id:
        null,
      default_prorata_convention:
        'daily',
    };
}

export type FixedAssetsAccountingWorkspace = {
  settings:
    Record<
      string,
      unknown
    >;
  accounts:
    Array<
      Record<
        string,
        unknown
      >
    >;
  categories:
    Array<
      Record<
        string,
        unknown
      >
    >;
  assets:
    Array<
      Record<
        string,
        unknown
      >
    >;
  runs:
    Array<
      Record<
        string,
        unknown
      >
    >;
  summary: {
    assetCount:
      number;
    capitalizedCount:
      number;
    grossCost:
      string;
    accumulatedDepreciation:
      string;
    accumulatedImpairment:
      string;
    revaluationAdjustment:
      string;
    carryingValue:
      string;
  };
};

export async function getFixedAssetsAccountingControl():
  Promise<
    FixedAssetsAccountingWorkspace
  > {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'fixed_assets',
      'view',
    );

  const [
    settings,
    accounts,
    categories,
    assets,
    runs,
    summary,
  ] =
    await Promise.all([
      settingsRow(
        context.pool,
        context.companyId,
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
          ORDER BY
            account_type,
            code
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            name,
            default_useful_life_months,
            default_depreciation_method,
            asset_account_reference::text,
            depreciation_account_reference::text,
            expense_account_reference::text,
            capitalization_offset_account_id::text,
            disposal_gain_account_id::text,
            disposal_loss_account_id::text,
            impairment_loss_account_id::text,
            accumulated_impairment_account_id::text,
            revaluation_reserve_account_id::text,
            revaluation_loss_account_id::text,
            prorata_convention,
            declining_balance_rate::text,
            status
          FROM asset_categories
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            name
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.name,
            asset.category_id::text,
            category.name
              AS category_name,
            asset.acquisition_date::text,
            asset.in_service_date::text,
            asset.capitalization_date::text,
            asset.depreciation_start_date::text,
            asset.acquisition_cost::text,
            asset.salvage_value::text,
            asset.useful_life_months,
            asset.depreciation_method,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.last_depreciation_date::text,
            asset.capitalization_journal_id::text,
            asset.status,
            (
              asset.acquisition_cost +
              asset.revaluation_adjustment -
              asset.accumulated_depreciation -
              asset.accumulated_impairment
            )::text
              AS carrying_value
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id =
               asset.category_id
           AND category.company_id =
               asset.company_id
           AND category.deleted_at
               IS NULL
          WHERE asset.company_id =
                $1
            AND asset.deleted_at
                IS NULL
          ORDER BY
            asset.created_at DESC,
            asset.asset_code
          LIMIT 250
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            run_date::text,
            period_start::text,
            period_end::text,
            status,
            candidate_count,
            posted_count,
            skipped_count,
            failed_count,
            completed_at::text
          FROM asset_depreciation_runs
          WHERE company_id =
                $1
            AND deleted_at
                IS NULL
          ORDER BY
            created_at DESC
          LIMIT 30
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COUNT(*)::int
              AS asset_count,
            COUNT(*) FILTER (
              WHERE capitalization_journal_id
                    IS NOT NULL
            )::int
              AS capitalized_count,
            COALESCE(
              SUM(acquisition_cost),
              0
            )::text
              AS gross_cost,
            COALESCE(
              SUM(accumulated_depreciation),
              0
            )::text
              AS accumulated_depreciation,
            COALESCE(
              SUM(accumulated_impairment),
              0
            )::text
              AS accumulated_impairment,
            COALESCE(
              SUM(revaluation_adjustment),
              0
            )::text
              AS revaluation_adjustment,
            COALESCE(
              SUM(
                acquisition_cost +
                revaluation_adjustment -
                accumulated_depreciation -
                accumulated_impairment
              ),
              0
            )::text
              AS carrying_value
          FROM fixed_assets
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

  return {
    settings:
      settings as
        Record<
          string,
          unknown
        >,
    accounts:
      accounts.rows,
    categories:
      categories.rows,
    assets:
      assets.rows,
    runs:
      runs.rows,
    summary: {
      assetCount:
        Number(
          summary.rows[0]
            ?.asset_count ||
          0,
        ),
      capitalizedCount:
        Number(
          summary.rows[0]
            ?.capitalized_count ||
          0,
        ),
      grossCost:
        String(
          summary.rows[0]
            ?.gross_cost ||
          '0',
        ),
      accumulatedDepreciation:
        String(
          summary.rows[0]
            ?.accumulated_depreciation ||
          '0',
        ),
      accumulatedImpairment:
        String(
          summary.rows[0]
            ?.accumulated_impairment ||
          '0',
        ),
      revaluationAdjustment:
        String(
          summary.rows[0]
            ?.revaluation_adjustment ||
          '0',
        ),
      carryingValue:
        String(
          summary.rows[0]
            ?.carrying_value ||
          '0',
        ),
    },
  };
}

export async function saveFixedAssetsAccountingSettings(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'fixed_assets_settings',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );

  const threshold =
    assetMoneyDecimal(
      assetMoneyCents(
        String(
          body.capitalizationThreshold ??
          '0',
        ),
        'Capitalization threshold',
      ),
    );

  const mapping = {
    asset:
      optionalId(
        body.defaultAssetAccountId,
      ),
    accumulatedDepreciation:
      optionalId(
        body.defaultAccumulatedDepreciationAccountId,
      ),
    depreciationExpense:
      optionalId(
        body.defaultDepreciationExpenseAccountId,
      ),
    capitalizationOffset:
      optionalId(
        body.defaultCapitalizationOffsetAccountId,
      ),
    disposalGain:
      optionalId(
        body.defaultDisposalGainAccountId,
      ),
    disposalLoss:
      optionalId(
        body.defaultDisposalLossAccountId,
      ),
    impairmentLoss:
      optionalId(
        body.defaultImpairmentLossAccountId,
      ),
    accumulatedImpairment:
      optionalId(
        body.defaultAccumulatedImpairmentAccountId,
      ),
    revaluationReserve:
      optionalId(
        body.defaultRevaluationReserveAccountId,
      ),
    revaluationLoss:
      optionalId(
        body.defaultRevaluationLossAccountId,
      ),
  };

  const convention =
    conventionOf(
      body.defaultProrataConvention ||
      'daily',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const checks:
      Array<
        [
          string | null,
          string,
          (
            type:
              string,
          ) =>
            boolean,
        ]
      > = [
      [
        mapping.asset,
        'Default Asset account',
        assetAccount,
      ],
      [
        mapping.accumulatedDepreciation,
        'Accumulated Depreciation account',
        assetAccount,
      ],
      [
        mapping.depreciationExpense,
        'Depreciation Expense account',
        expenseAccount,
      ],
      [
        mapping.disposalGain,
        'Disposal Gain account',
        incomeAccount,
      ],
      [
        mapping.disposalLoss,
        'Disposal Loss account',
        expenseAccount,
      ],
      [
        mapping.impairmentLoss,
        'Impairment Loss account',
        expenseAccount,
      ],
      [
        mapping.accumulatedImpairment,
        'Accumulated Impairment account',
        assetAccount,
      ],
      [
        mapping.revaluationReserve,
        'Revaluation Reserve account',
        equityAccount,
      ],
      [
        mapping.revaluationLoss,
        'Revaluation Loss account',
        expenseAccount,
      ],
    ];

    for (
      const [
        accountId,
        label,
        accepts,
      ]
      of checks
    ) {
      if (
        accountId
      ) {
        await activeAccount(
          client,
          context.companyId,
          accountId,
          label,
          accepts,
        );
      }
    }

    if (
      mapping
        .capitalizationOffset
    ) {
      await activeAccount(
        client,
        context.companyId,
        mapping
          .capitalizationOffset,
        'Capitalization Offset account',
      );
    }

    await client.query(
      `
        INSERT INTO fixed_assets_settings (
          company_id,
          capitalization_threshold,
          default_asset_account_id,
          default_accumulated_depreciation_account_id,
          default_depreciation_expense_account_id,
          default_capitalization_offset_account_id,
          default_disposal_gain_account_id,
          default_disposal_loss_account_id,
          default_impairment_loss_account_id,
          default_accumulated_impairment_account_id,
          default_revaluation_reserve_account_id,
          default_revaluation_loss_account_id,
          default_prorata_convention,
          settings,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
          '{}'::jsonb,$14,$14
        )
        ON CONFLICT (company_id)
        DO UPDATE
        SET
          capitalization_threshold =
            EXCLUDED.capitalization_threshold,
          default_asset_account_id =
            EXCLUDED.default_asset_account_id,
          default_accumulated_depreciation_account_id =
            EXCLUDED.default_accumulated_depreciation_account_id,
          default_depreciation_expense_account_id =
            EXCLUDED.default_depreciation_expense_account_id,
          default_capitalization_offset_account_id =
            EXCLUDED.default_capitalization_offset_account_id,
          default_disposal_gain_account_id =
            EXCLUDED.default_disposal_gain_account_id,
          default_disposal_loss_account_id =
            EXCLUDED.default_disposal_loss_account_id,
          default_impairment_loss_account_id =
            EXCLUDED.default_impairment_loss_account_id,
          default_accumulated_impairment_account_id =
            EXCLUDED.default_accumulated_impairment_account_id,
          default_revaluation_reserve_account_id =
            EXCLUDED.default_revaluation_reserve_account_id,
          default_revaluation_loss_account_id =
            EXCLUDED.default_revaluation_loss_account_id,
          default_prorata_convention =
            EXCLUDED.default_prorata_convention,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `,
      [
        context.companyId,
        threshold,
        mapping.asset,
        mapping
          .accumulatedDepreciation,
        mapping
          .depreciationExpense,
        mapping
          .capitalizationOffset,
        mapping.disposalGain,
        mapping.disposalLoss,
        mapping.impairmentLoss,
        mapping
          .accumulatedImpairment,
        mapping
          .revaluationReserve,
        mapping.revaluationLoss,
        convention,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'settings.saved',
      'fixed_assets_settings',
      context.companyId,
      'Fixed Asset accounting settings updated',
      {
        capitalizationThreshold:
          threshold,
        convention,
      },
    );

    return {
      capitalizationThreshold:
        threshold,
      convention,
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

export async function saveFixedAssetCategoryAccounting(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_categories',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const categoryId =
    accountingId(
      body.categoryId,
    );
  const usefulLife =
    positiveInteger(
      body.defaultUsefulLifeMonths,
      'Default useful life',
    );
  const method =
    methodOf(
      body.defaultDepreciationMethod ||
      'straight_line',
    );
  const convention =
    conventionOf(
      body.prorataConvention ||
      'daily',
    );
  const decliningRate =
    body.decliningBalanceRate ===
        undefined ||
      body.decliningBalanceRate ===
        null ||
      body.decliningBalanceRate ===
        ''
      ? null
      : Number(
          body.decliningBalanceRate,
        );

  if (
    method ===
      'declining_balance' &&
    (
      !decliningRate ||
      !Number.isFinite(
        decliningRate,
      ) ||
      decliningRate <=
        0 ||
      decliningRate >
        100
    )
  ) {
    throw new FixedAssetInputError(
      'Declining-balance assets require an annual rate above 0 and at most 100 percent.',
    );
  }

  const ids = {
    asset:
      optionalId(
        body.assetAccountId,
      ),
    accumulatedDepreciation:
      optionalId(
        body.accumulatedDepreciationAccountId,
      ),
    depreciationExpense:
      optionalId(
        body.depreciationExpenseAccountId,
      ),
    capitalizationOffset:
      optionalId(
        body.capitalizationOffsetAccountId,
      ),
    disposalGain:
      optionalId(
        body.disposalGainAccountId,
      ),
    disposalLoss:
      optionalId(
        body.disposalLossAccountId,
      ),
    impairmentLoss:
      optionalId(
        body.impairmentLossAccountId,
      ),
    accumulatedImpairment:
      optionalId(
        body.accumulatedImpairmentAccountId,
      ),
    revaluationReserve:
      optionalId(
        body.revaluationReserveAccountId,
      ),
    revaluationLoss:
      optionalId(
        body.revaluationLossAccountId,
      ),
  };

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const category =
      await client.query(
        `
          SELECT id::text
          FROM asset_categories
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
          categoryId,
        ],
      );

    if (
      !category.rows[0]
    ) {
      throw new FixedAssetInputError(
        'Asset category not found.',
      );
    }

    for (
      const [
        accountId,
        label,
        accepts,
      ]
      of [
        [
          ids.asset,
          'Asset account',
          assetAccount,
        ],
        [
          ids.accumulatedDepreciation,
          'Accumulated Depreciation account',
          assetAccount,
        ],
        [
          ids.depreciationExpense,
          'Depreciation Expense account',
          expenseAccount,
        ],
        [
          ids.disposalGain,
          'Disposal Gain account',
          incomeAccount,
        ],
        [
          ids.disposalLoss,
          'Disposal Loss account',
          expenseAccount,
        ],
        [
          ids.impairmentLoss,
          'Impairment Loss account',
          expenseAccount,
        ],
        [
          ids.accumulatedImpairment,
          'Accumulated Impairment account',
          assetAccount,
        ],
        [
          ids.revaluationReserve,
          'Revaluation Reserve account',
          equityAccount,
        ],
        [
          ids.revaluationLoss,
          'Revaluation Loss account',
          expenseAccount,
        ],
      ] as Array<
        [
          string | null,
          string,
          (
            type:
              string,
          ) =>
            boolean,
        ]
      >
    ) {
      if (
        accountId
      ) {
        await activeAccount(
          client,
          context.companyId,
          accountId,
          label,
          accepts,
        );
      }
    }

    if (
      ids
        .capitalizationOffset
    ) {
      await activeAccount(
        client,
        context.companyId,
        ids
          .capitalizationOffset,
        'Capitalization Offset account',
      );
    }

    await client.query(
      `
        UPDATE asset_categories
        SET
          default_useful_life_months =
            $3,
          default_depreciation_method =
            $4,
          asset_account_reference =
            $5,
          depreciation_account_reference =
            $6,
          expense_account_reference =
            $7,
          capitalization_offset_account_id =
            $8,
          disposal_gain_account_id =
            $9,
          disposal_loss_account_id =
            $10,
          impairment_loss_account_id =
            $11,
          accumulated_impairment_account_id =
            $12,
          revaluation_reserve_account_id =
            $13,
          revaluation_loss_account_id =
            $14,
          prorata_convention =
            $15,
          declining_balance_rate =
            $16,
          updated_by =
            $17,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
      `,
      [
        context.companyId,
        categoryId,
        usefulLife,
        method,
        ids.asset,
        ids
          .accumulatedDepreciation,
        ids
          .depreciationExpense,
        ids
          .capitalizationOffset,
        ids.disposalGain,
        ids.disposalLoss,
        ids.impairmentLoss,
        ids
          .accumulatedImpairment,
        ids
          .revaluationReserve,
        ids.revaluationLoss,
        convention,
        decliningRate,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'category.accounting.saved',
      'asset_categories',
      categoryId,
      'Fixed Asset category accounting policy updated',
      {
        method,
        usefulLife,
        convention,
        decliningRate,
      },
    );

    return {
      categoryId,
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

export async function capitalizeFixedAsset(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'fixed_assets',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const assetId =
    accountingId(
      body.assetId,
    );
  const capitalizationDate =
    date(
      body.capitalizationDate,
      'Capitalization date',
    );
  const overrideOffset =
    optionalId(
      body.capitalizationOffsetAccountId,
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const settings =
      await settingsRow(
        client,
        context.companyId,
        true,
      );

    const result =
      await client.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.name,
            asset.acquisition_cost::text,
            asset.salvage_value::text,
            asset.acquisition_date::text,
            asset.in_service_date::text,
            asset.capitalization_journal_id::text,
            asset.status,
            category.asset_account_reference::text,
            category.depreciation_account_reference::text,
            category.expense_account_reference::text,
            category.capitalization_offset_account_id::text,
            category.default_useful_life_months,
            category.default_depreciation_method,
            category.prorata_convention
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id =
               asset.category_id
           AND category.company_id =
               asset.company_id
           AND category.deleted_at
               IS NULL
          WHERE asset.company_id =
                $1
            AND asset.id =
                $2
            AND asset.deleted_at
                IS NULL
          LIMIT 1
          FOR UPDATE OF asset
        `,
        [
          context.companyId,
          assetId,
        ],
      );

    const asset =
      result.rows[0];

    if (
      !asset
    ) {
      throw new FixedAssetInputError(
        'Fixed Asset not found.',
      );
    }

    if (
      asset
        .capitalization_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        assetId,
        journalId:
          String(
            asset
              .capitalization_journal_id,
          ),
        reused:
          true,
      };
    }

    if (
      String(
        asset.status,
      ) ===
        'disposed'
    ) {
      throw new FixedAssetInputError(
        'A disposed asset cannot be capitalized.',
      );
    }

    const cost =
      assetMoneyCents(
        String(
          asset
            .acquisition_cost ||
          '0',
        ),
        'Acquisition cost',
      );
    const threshold =
      assetMoneyCents(
        String(
          settings
            .capitalization_threshold ||
          '0',
        ),
        'Capitalization threshold',
      );

    if (
      cost <=
      BigInt(
        0,
      )
    ) {
      throw new FixedAssetInputError(
        'Acquisition cost must be above zero before capitalization.',
      );
    }

    if (
      cost <
      threshold &&
      !bool(
        body.overrideThreshold,
      )
    ) {
      throw new FixedAssetInputError(
        'This asset is below the capitalization threshold. Use an authorized threshold override to capitalize it.',
      );
    }

    const assetAccountId =
      String(
        asset
          .asset_account_reference ||
        settings
          .default_asset_account_id ||
        '',
      );
    const offsetAccountId =
      String(
        overrideOffset ||
        asset
          .capitalization_offset_account_id ||
        settings
          .default_capitalization_offset_account_id ||
        '',
      );

    if (
      !assetAccountId ||
      !offsetAccountId
    ) {
      throw new FixedAssetInputError(
        'Map the Asset and Capitalization Offset accounts before capitalization.',
      );
    }

    await activeAccount(
      client,
      context.companyId,
      assetAccountId,
      'Asset account',
      assetAccount,
    );
    await activeAccount(
      client,
      context.companyId,
      offsetAccountId,
      'Capitalization Offset account',
    );

    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            capitalizationDate,
          description:
            'Capitalize fixed asset ' +
            String(
              asset.asset_code,
            ) +
            ' · ' +
            String(
              asset.name,
            ),
          reference:
            String(
              asset.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'capitalization',
          sourceId:
            assetId,
          sourceEventKey:
            'fixed_assets:capitalization:' +
            assetId,
          postingKind:
            'system',
          lines: [
            {
              accountId:
                assetAccountId,
              description:
                'Fixed Asset capitalization',
              debit:
                assetMoneyDecimal(
                  cost,
                ),
              credit:
                '0.00',
            },
            {
              accountId:
                offsetAccountId,
              description:
                'Fixed Asset capitalization offset',
              debit:
                '0.00',
              credit:
                assetMoneyDecimal(
                  cost,
                ),
            },
          ],
        },
      );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          capitalization_date =
            $3,
          capitalization_journal_id =
            $4,
          in_service_date =
            COALESCE(
              in_service_date,
              $3
            ),
          depreciation_start_date =
            COALESCE(
              depreciation_start_date,
              $3
            ),
          useful_life_months =
            COALESCE(
              useful_life_months,
              $5
            ),
          depreciation_method =
            CASE
              WHEN depreciation_method
                   IS NULL
                OR depreciation_method =
                   ''
              THEN COALESCE(
                $6,
                'straight_line'
              )
              ELSE depreciation_method
            END,
          status =
            CASE
              WHEN status IN (
                'disposed',
                'fully_depreciated'
              )
              THEN status
              ELSE 'in_service'
            END,
          updated_by =
            $7,
          updated_at =
            NOW()
        WHERE company_id =
              $1
          AND id =
              $2
          AND deleted_at
              IS NULL
      `,
      [
        context.companyId,
        assetId,
        capitalizationDate,
        journal.journalId,
        asset
          .default_useful_life_months ||
        null,
        asset
          .default_depreciation_method ||
        'straight_line',
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'capitalized',
      'fixed_assets',
      assetId,
      'Fixed Asset capitalized to Accounting',
      {
        journalId:
          journal.journalId,
        cost:
          assetMoneyDecimal(
            cost,
          ),
        thresholdOverride:
          bool(
            body.overrideThreshold,
          ),
      },
    );

    return {
      assetId,
      journalId:
        journal.journalId,
      reused:
        journal.reused,
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

export async function runFixedAssetDepreciation(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_depreciation_runs',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const periodStart =
    date(
      body.periodStart,
      'Depreciation period start',
    );
  const periodEnd =
    date(
      body.periodEnd,
      'Depreciation period end',
    );
  const runDate =
    date(
      body.runDate ||
      periodEnd,
      'Depreciation run date',
    );

  if (
    periodEnd <
    periodStart
  ) {
    throw new FixedAssetInputError(
      'Depreciation period end cannot be before its start.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const previous =
      await client.query(
        `
          SELECT
            id::text,
            status,
            candidate_count,
            posted_count,
            skipped_count,
            failed_count
          FROM asset_depreciation_runs
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
      previous.rows[0]
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          String(
            previous.rows[0]
              .id,
          ),
        reused:
          true,
        ...previous.rows[0],
      };
    }

    const settings =
      await settingsRow(
        client,
        context.companyId,
        true,
      );

    const run =
      await client.query(
        `
          INSERT INTO asset_depreciation_runs (
            company_id,
            request_key,
            run_date,
            period_start,
            period_end,
            status,
            generated_by,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,
            'running',$6,$6,$6
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          requestKey,
          runDate,
          periodStart,
          periodEnd,
          context.userId,
        ],
      );

    const runId =
      String(
        run.rows[0].id,
      );

    const candidates =
      await client.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.name,
            asset.acquisition_cost::text,
            asset.salvage_value::text,
            asset.useful_life_months,
            asset.depreciation_method,
            asset.in_service_date::text,
            asset.depreciation_start_date::text,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.status,
            category.default_useful_life_months,
            category.default_depreciation_method,
            category.declining_balance_rate::text,
            category.prorata_convention,
            category.depreciation_account_reference::text,
            category.expense_account_reference::text,
            (
              SELECT COUNT(*)::int
              FROM asset_depreciation_entries entry
              WHERE entry.company_id =
                    asset.company_id
                AND entry.asset_id =
                    asset.id
                AND entry.deleted_at
                    IS NULL
                AND entry.status IN (
                  'active',
                  'posted'
                )
            ) AS posted_periods
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id =
               asset.category_id
           AND category.company_id =
               asset.company_id
           AND category.deleted_at
               IS NULL
          WHERE asset.company_id =
                $1
            AND asset.deleted_at
                IS NULL
            AND asset.capitalization_journal_id
                IS NOT NULL
            AND asset.status IN (
              'active',
              'in_service'
            )
            AND COALESCE(
                  asset.depreciation_start_date,
                  asset.in_service_date,
                  asset.capitalization_date,
                  asset.acquisition_date
                ) <=
                $2::date
          ORDER BY
            asset.asset_code,
            asset.id
          FOR UPDATE OF asset
        `,
        [
          context.companyId,
          periodEnd,
        ],
      );

    let posted =
      0;
    let skipped =
      0;
    let failed =
      0;

    for (
      const asset
      of candidates.rows
    ) {
      await client.query(
        'SAVEPOINT fixed_asset_depreciation',
      );

      try {
        const existing =
          await client.query(
            `
              SELECT id::text
              FROM asset_depreciation_entries
              WHERE company_id =
                    $1
                AND asset_id =
                    $2
                AND period_date =
                    $3
                AND deleted_at
                    IS NULL
                AND status <>
                    'reversed'
              LIMIT 1
            `,
            [
              context.companyId,
              asset.id,
              periodEnd,
            ],
          );

        if (
          existing.rows[0]
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT fixed_asset_depreciation',
          );
          continue;
        }

        const method =
          methodOf(
            asset
              .depreciation_method ||
            asset
              .default_depreciation_method ||
            'straight_line',
          );

        if (
          method ===
            'no_depreciation'
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT fixed_asset_depreciation',
          );
          continue;
        }

        const usefulLife =
          positiveInteger(
            asset
              .useful_life_months ||
            asset
              .default_useful_life_months,
            'Useful life',
          );
        const postedPeriods =
          Number(
            asset
              .posted_periods ||
            0,
          );
        const remainingPeriods =
          usefulLife -
          postedPeriods;

        if (
          remainingPeriods <=
          0
        ) {
          await client.query(
            `
              UPDATE fixed_assets
              SET
                status =
                  'fully_depreciated',
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
              asset.id,
              context.userId,
            ],
          );
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT fixed_asset_depreciation',
          );
          continue;
        }

        const carrying =
          assetCarryingValueCents({
            acquisitionCost:
              String(
                asset
                  .acquisition_cost ||
                '0',
              ),
            accumulatedDepreciation:
              String(
                asset
                  .accumulated_depreciation ||
                '0',
              ),
            accumulatedImpairment:
              String(
                asset
                  .accumulated_impairment ||
                '0',
              ),
            revaluationAdjustment:
              String(
                asset
                  .revaluation_adjustment ||
                '0',
              ),
          });
        const salvage =
          assetMoneyCents(
            String(
              asset
                .salvage_value ||
              '0',
            ),
            'Salvage value',
          );

        let amount =
          method ===
            'declining_balance'
            ? decliningBalanceDepreciationCents({
                carryingValue:
                  carrying,
                salvageValue:
                  salvage,
                annualRate:
                  String(
                    asset
                      .declining_balance_rate ||
                    '',
                  ),
              })
            : straightLineDepreciationCents({
                carryingValue:
                  carrying,
                salvageValue:
                  salvage,
                remainingPeriods,
              });

        const serviceDate =
          String(
            asset
              .depreciation_start_date ||
            asset
              .in_service_date ||
            periodStart,
          ).slice(
            0,
            10,
          );
        const convention =
          conventionOf(
            asset
              .prorata_convention ||
            settings
              .default_prorata_convention ||
            'daily',
          );

        amount =
          prorateDepreciationCents(
            amount,
            {
              periodStart,
              periodEnd,
              inServiceDate:
                serviceDate,
              convention,
            },
          );

        if (
          amount <=
          BigInt(
            0,
          )
        ) {
          skipped +=
            1;
          await client.query(
            'RELEASE SAVEPOINT fixed_asset_depreciation',
          );
          continue;
        }

        const accumulatedAccountId =
          String(
            asset
              .depreciation_account_reference ||
            settings
              .default_accumulated_depreciation_account_id ||
            '',
          );
        const expenseAccountId =
          String(
            asset
              .expense_account_reference ||
            settings
              .default_depreciation_expense_account_id ||
            '',
          );

        if (
          !accumulatedAccountId ||
          !expenseAccountId
        ) {
          throw new FixedAssetInputError(
            'Map Accumulated Depreciation and Depreciation Expense accounts before running depreciation.',
          );
        }

        await activeAccount(
          client,
          context.companyId,
          accumulatedAccountId,
          'Accumulated Depreciation account',
          assetAccount,
        );
        await activeAccount(
          client,
          context.companyId,
          expenseAccountId,
          'Depreciation Expense account',
          expenseAccount,
        );

        const amountDecimal =
          assetMoneyDecimal(
            amount,
          );
        const journal =
          await postBalancedLedgerJournal(
            client,
            {
              companyId:
                context.companyId,
              userId:
                context.userId,
              journalDate:
                runDate,
              description:
                'Depreciation · ' +
                String(
                  asset.asset_code,
                ) +
                ' · ' +
                periodEnd,
              reference:
                String(
                  asset.asset_code,
                ),
              sourceModule:
                'fixed_assets',
              sourceType:
                'depreciation',
              sourceId:
                String(
                  asset.id,
                ),
              sourceEventKey:
                'fixed_assets:depreciation:' +
                String(
                  asset.id,
                ) +
                ':' +
                periodEnd,
              postingKind:
                'system',
              lines: [
                {
                  accountId:
                    expenseAccountId,
                  description:
                    'Fixed Asset depreciation expense',
                  debit:
                    amountDecimal,
                  credit:
                    '0.00',
                },
                {
                  accountId:
                    accumulatedAccountId,
                  description:
                    'Accumulated depreciation',
                  debit:
                    '0.00',
                  credit:
                    amountDecimal,
                },
              ],
            },
          );

        const nextAccumulated =
          assetMoneyCents(
            String(
              asset
                .accumulated_depreciation ||
              '0',
            ),
          ) +
          amount;
        const nextBook =
          carrying -
          amount;

        await client.query(
          `
            INSERT INTO asset_depreciation_entries (
              company_id,
              asset_id,
              period_date,
              period_start,
              period_end,
              depreciation_amount,
              accumulated_depreciation,
              book_value,
              method,
              journal_id,
              run_id,
              posted_at,
              request_key,
              status,
              created_by,
              updated_by
            )
            VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
              NOW(),gen_random_uuid(),'posted',$12,$12
            )
          `,
          [
            context.companyId,
            asset.id,
            periodEnd,
            periodStart,
            periodEnd,
            amountDecimal,
            assetMoneyDecimal(
              nextAccumulated,
            ),
            assetMoneyDecimal(
              nextBook,
            ),
            method,
            journal.journalId,
            runId,
            context.userId,
          ],
        );

        await client.query(
          `
            UPDATE fixed_assets
            SET
              accumulated_depreciation =
                $3,
              last_depreciation_date =
                $4,
              status =
                CASE
                  WHEN $5::numeric <=
                       salvage_value::numeric
                  THEN 'fully_depreciated'
                  ELSE status
                END,
              updated_by =
                $6,
              updated_at =
                NOW()
            WHERE company_id =
                  $1
              AND id =
                  $2
          `,
          [
            context.companyId,
            asset.id,
            assetMoneyDecimal(
              nextAccumulated,
            ),
            periodEnd,
            assetMoneyDecimal(
              nextBook,
            ),
            context.userId,
          ],
        );

        posted +=
          1;

        await client.query(
          'RELEASE SAVEPOINT fixed_asset_depreciation',
        );
      } catch (
        error
      ) {
        await client.query(
          'ROLLBACK TO SAVEPOINT fixed_asset_depreciation',
        );
        await client.query(
          'RELEASE SAVEPOINT fixed_asset_depreciation',
        );
        failed +=
          1;

        console.error(
          '[Fixed Assets] depreciation candidate failed',
          {
            assetId:
              asset.id,
            error,
          },
        );
      }
    }

    await client.query(
      `
        UPDATE asset_depreciation_runs
        SET
          candidate_count =
            $3,
          posted_count =
            $4,
          skipped_count =
            $5,
          failed_count =
            $6,
          status =
            CASE
              WHEN $6 > 0
              THEN 'completed_with_errors'
              ELSE 'completed'
            END,
          completed_at =
            NOW(),
          updated_by =
            $7,
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
        candidates
          .rowCount ||
        0,
        posted,
        skipped,
        failed,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'depreciation.run',
      'asset_depreciation_runs',
      runId,
      'Fixed Asset depreciation run completed',
      {
        periodStart,
        periodEnd,
        posted,
        skipped,
        failed,
      },
    );

    return {
      id:
        runId,
      reused:
        false,
      candidateCount:
        candidates
          .rowCount ||
        0,
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
