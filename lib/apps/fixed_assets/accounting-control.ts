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
  reversePostedLedgerJournal,
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
  depreciationEntries:
    Array<
      Record<
        string,
        unknown
      >
    >;
  impairments:
    Array<
      Record<
        string,
        unknown
      >
    >;
  revaluations:
    Array<
      Record<
        string,
        unknown
      >
    >;
  disposals:
    Array<
      Record<
        string,
        unknown
      >
    >;
  sourceLinks:
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
    depreciationEntries,
    impairments,
    revaluations,
    disposals,
    sourceLinks,
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
            asset.capitalization_reversal_journal_id::text,
            asset.disposal_date::text,
            asset.disposal_journal_id::text,
            asset.disposal_reversal_journal_id::text,
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
            id::text,
            asset_id::text,
            period_date::text,
            period_start::text,
            period_end::text,
            depreciation_amount::text,
            accumulated_depreciation::text,
            book_value::text,
            method,
            journal_id::text,
            reversal_journal_id::text,
            run_id::text,
            status,
            posted_at::text,
            reversed_at::text
          FROM asset_depreciation_entries
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY period_date DESC, created_at DESC
          LIMIT 80
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            asset_id::text,
            request_key::text,
            impairment_date::text,
            previous_book_value::text,
            impairment_amount::text,
            new_book_value::text,
            reason,
            journal_reference::text,
            reversal_journal_id::text,
            status,
            posted_at::text,
            reversed_at::text
          FROM asset_impairments
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY impairment_date DESC, created_at DESC
          LIMIT 60
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            asset_id::text,
            request_key::text,
            revaluation_date::text,
            previous_carrying_value::text,
            fair_value::text,
            change_amount::text,
            reserve_effect::text,
            profit_loss_effect::text,
            journal_id::text,
            reversal_journal_id::text,
            reason,
            status,
            posted_at::text,
            reversed_at::text
          FROM asset_revaluations
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY revaluation_date DESC, created_at DESC
          LIMIT 60
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            asset_id::text,
            request_key::text,
            disposal_date::text,
            disposal_method,
            proceeds::text,
            carrying_value::text,
            gain_loss::text,
            journal_id::text,
            reversal_journal_id::text,
            notes,
            status,
            posted_at::text,
            reversed_at::text
          FROM asset_disposals
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY disposal_date DESC, created_at DESC
          LIMIT 60
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            id::text,
            asset_id::text,
            source_module,
            source_type,
            source_id,
            source_reference,
            source_amount::text,
            created_at::text
          FROM asset_source_links
          WHERE company_id = $1
            AND deleted_at IS NULL
          ORDER BY created_at DESC
          LIMIT 60
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
    depreciationEntries:
      depreciationEntries.rows,
    impairments:
      impairments.rows,
    revaluations:
      revaluations.rows,
    disposals:
      disposals.rows,
    sourceLinks:
      sourceLinks.rows,
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
        .capitalization_journal_id &&
      !asset
        .capitalization_reversal_journal_id
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
            assetId +
            ':' +
            (
              asset
                .capitalization_reversal_journal_id ||
              'initial'
            ),
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
          capitalization_reversal_journal_id =
            NULL,
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


export async function reverseFixedAssetDepreciation(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_depreciation_entries',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const entryId =
    accountingId(
      body.entryId,
    );
  const reversalDate =
    date(
      body.reversalDate,
      'Depreciation reversal date',
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
            entry.id::text,
            entry.asset_id::text,
            entry.period_date::text,
            entry.depreciation_amount::text,
            entry.journal_id::text,
            entry.reversal_journal_id::text,
            entry.status,
            asset.asset_code
          FROM asset_depreciation_entries entry
          INNER JOIN fixed_assets asset
            ON asset.id = entry.asset_id
           AND asset.company_id = entry.company_id
           AND asset.deleted_at IS NULL
          WHERE entry.company_id = $1
            AND entry.id = $2
            AND entry.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF entry, asset
        `,
        [
          context.companyId,
          entryId,
        ],
      );
    const entry =
      result.rows[0];

    if (
      !entry ||
      ![
        'active',
        'posted',
      ].includes(
        String(
          entry.status,
        ),
      ) ||
      !entry
        .journal_id
    ) {
      throw new FixedAssetInputError(
        'Only a posted depreciation entry can be reversed.',
      );
    }

    if (
      entry
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          entryId,
        journalId:
          String(
            entry
              .reversal_journal_id,
          ),
        reused:
          true,
      };
    }

    const later =
      await client.query(
        `
          SELECT (
            EXISTS (
              SELECT 1
              FROM asset_depreciation_entries
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status IN ('active','posted')
                AND period_date > $3::date
            )
            OR EXISTS (
              SELECT 1
              FROM asset_impairments
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND impairment_date > $3::date
            )
            OR EXISTS (
              SELECT 1
              FROM asset_revaluations
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND revaluation_date > $3::date
            )
            OR EXISTS (
              SELECT 1
              FROM asset_disposals
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND disposal_date >= $3::date
            )
          ) AS later_event
        `,
        [
          context.companyId,
          entry.asset_id,
          entry.period_date,
        ],
      );

    if (
      later.rows[0]
        ?.later_event
    ) {
      throw new FixedAssetInputError(
        'Reverse later depreciation, impairment, revaluation or disposal events before reversing this depreciation.',
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
              entry.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse depreciation · ' +
            String(
              entry.asset_code,
            ) +
            ' · ' +
            String(
              entry.period_date,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'depreciation_reversal',
          sourceId:
            entryId,
          sourceEventKey:
            'fixed_assets:depreciation-reversal:' +
            entryId,
        },
      );

    await client.query(
      `
        UPDATE asset_depreciation_entries
        SET
          status = 'reversed',
          reversal_journal_id = $3,
          reversed_at = NOW(),
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        entryId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          accumulated_depreciation =
            GREATEST(
              accumulated_depreciation -
              $3::numeric,
              0
            ),
          last_depreciation_date = (
            SELECT MAX(period_date)
            FROM asset_depreciation_entries
            WHERE company_id = $1
              AND asset_id = $2
              AND deleted_at IS NULL
              AND status IN ('active','posted')
          ),
          status =
            CASE
              WHEN status = 'fully_depreciated'
              THEN 'in_service'
              ELSE status
            END,
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        entry.asset_id,
        entry.depreciation_amount,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'depreciation.reversed',
      'asset_depreciation_entries',
      entryId,
      'Fixed Asset depreciation reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      id:
        entryId,
      journalId:
        reversal.journalId,
      reused:
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


export async function reverseFixedAssetCapitalization(
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
  const reversalDate =
    date(
      body.reversalDate,
      'Capitalization reversal date',
    );

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN',
    );

    const assetResult =
      await client.query(
        `
          SELECT
            id::text,
            asset_code,
            capitalization_journal_id::text,
            capitalization_reversal_journal_id::text,
            status
          FROM fixed_assets
          WHERE company_id = $1
            AND id = $2
            AND deleted_at IS NULL
          LIMIT 1
          FOR UPDATE
        `,
        [
          context.companyId,
          assetId,
        ],
      );
    const asset =
      assetResult.rows[0];

    if (
      !asset ||
      !asset
        .capitalization_journal_id
    ) {
      throw new FixedAssetInputError(
        'Only a capitalized asset can be reversed.',
      );
    }

    if (
      asset
        .capitalization_reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        assetId,
        journalId:
          String(
            asset
              .capitalization_reversal_journal_id,
          ),
        reused:
          true,
      };
    }

    const downstream =
      await client.query(
        `
          SELECT EXISTS (
            SELECT 1
            FROM asset_depreciation_entries
            WHERE company_id = $1
              AND asset_id = $2
              AND deleted_at IS NULL
              AND status IN ('active','posted')
          ) OR EXISTS (
            SELECT 1
            FROM asset_impairments
            WHERE company_id = $1
              AND asset_id = $2
              AND deleted_at IS NULL
              AND status = 'posted'
          ) OR EXISTS (
            SELECT 1
            FROM asset_revaluations
            WHERE company_id = $1
              AND asset_id = $2
              AND deleted_at IS NULL
              AND status = 'posted'
          ) OR EXISTS (
            SELECT 1
            FROM asset_disposals
            WHERE company_id = $1
              AND asset_id = $2
              AND deleted_at IS NULL
              AND status = 'posted'
          ) AS has_downstream
        `,
        [
          context.companyId,
          assetId,
        ],
      );

    if (
      downstream.rows[0]
        ?.has_downstream
    ) {
      throw new FixedAssetInputError(
        'Reverse later depreciation, impairment, revaluation or disposal events before reversing capitalization.',
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
              asset
                .capitalization_journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse capitalization · ' +
            String(
              asset.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'capitalization_reversal',
          sourceId:
            assetId,
          sourceEventKey:
            'fixed_assets:capitalization-reversal:' +
            assetId,
        },
      );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          capitalization_reversal_journal_id = $3,
          status = 'active',
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        assetId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'capitalization.reversed',
      'fixed_assets',
      assetId,
      'Fixed Asset capitalization reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      assetId,
      journalId:
        reversal.journalId,
      reused:
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

export async function postFixedAssetImpairment(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_impairments',
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
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const impairmentDate =
    date(
      body.impairmentDate,
      'Impairment date',
    );
  const reason =
    text(
      body.reason,
      2000,
      'Impairment reason',
      true,
    );
  const impairment =
    assetMoneyCents(
      String(
        body.impairmentAmount ||
        '0',
      ),
      'Impairment amount',
    );

  if (
    impairment <=
    BigInt(
      0,
    )
  ) {
    throw new FixedAssetInputError(
      'Impairment amount must be above zero.',
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
            journal_reference::text
          FROM asset_impairments
          WHERE company_id = $1
            AND request_key = $2
            AND deleted_at IS NULL
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
        journalId:
          String(
            previous.rows[0]
              .journal_reference ||
            '',
          ),
        reused:
          true,
      };
    }

    const settings =
      await settingsRow(
        client,
        context.companyId,
        true,
      );
    const assetResult =
      await client.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.name,
            asset.acquisition_cost::text,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.capitalization_journal_id::text,
            asset.capitalization_reversal_journal_id::text,
            asset.status,
            category.impairment_loss_account_id::text,
            category.accumulated_impairment_account_id::text
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id = asset.category_id
           AND category.company_id = asset.company_id
           AND category.deleted_at IS NULL
          WHERE asset.company_id = $1
            AND asset.id = $2
            AND asset.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF asset
        `,
        [
          context.companyId,
          assetId,
        ],
      );
    const asset =
      assetResult.rows[0];

    if (
      !asset ||
      !asset
        .capitalization_journal_id ||
      asset
        .capitalization_reversal_journal_id ||
      String(
        asset.status,
      ) ===
        'disposed'
    ) {
      throw new FixedAssetInputError(
        'Only an active capitalized asset can be impaired.',
      );
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

    if (
      impairment >
      carrying
    ) {
      throw new FixedAssetInputError(
        'Impairment cannot exceed the current carrying value.',
      );
    }

    const lossAccountId =
      String(
        asset
          .impairment_loss_account_id ||
        settings
          .default_impairment_loss_account_id ||
        '',
      );
    const accumulatedAccountId =
      String(
        asset
          .accumulated_impairment_account_id ||
        settings
          .default_accumulated_impairment_account_id ||
        '',
      );

    if (
      !lossAccountId ||
      !accumulatedAccountId
    ) {
      throw new FixedAssetInputError(
        'Map Impairment Loss and Accumulated Impairment accounts before posting impairment.',
      );
    }

    await activeAccount(
      client,
      context.companyId,
      lossAccountId,
      'Impairment Loss account',
      expenseAccount,
    );
    await activeAccount(
      client,
      context.companyId,
      accumulatedAccountId,
      'Accumulated Impairment account',
      assetAccount,
    );

    const amountDecimal =
      assetMoneyDecimal(
        impairment,
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
            impairmentDate,
          description:
            'Asset impairment · ' +
            String(
              asset.asset_code,
            ),
          reference:
            String(
              asset.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'impairment',
          sourceId:
            assetId,
          sourceEventKey:
            'fixed_assets:impairment:' +
            requestKey,
          postingKind:
            'system',
          lines: [
            {
              accountId:
                lossAccountId,
              description:
                'Fixed Asset impairment loss',
              debit:
                amountDecimal,
              credit:
                '0.00',
            },
            {
              accountId:
                accumulatedAccountId,
              description:
                'Accumulated impairment',
              debit:
                '0.00',
              credit:
                amountDecimal,
            },
          ],
        },
      );

    const nextImpairment =
      assetMoneyCents(
        String(
          asset
            .accumulated_impairment ||
          '0',
        ),
      ) +
      impairment;
    const newBook =
      carrying -
      impairment;

    const created =
      await client.query(
        `
          INSERT INTO asset_impairments (
            company_id,
            asset_id,
            request_key,
            impairment_date,
            previous_book_value,
            impairment_amount,
            new_book_value,
            reason,
            loss_account_id,
            accumulated_impairment_account_id,
            journal_reference,
            status,
            posted_at,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
            'posted',NOW(),$12,$12
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          assetId,
          requestKey,
          impairmentDate,
          assetMoneyDecimal(
            carrying,
          ),
          amountDecimal,
          assetMoneyDecimal(
            newBook,
          ),
          reason,
          lossAccountId,
          accumulatedAccountId,
          journal.journalId,
          context.userId,
        ],
      );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          accumulated_impairment = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        assetId,
        assetMoneyDecimal(
          nextImpairment,
        ),
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    const id =
      String(
        created.rows[0].id,
      );

    await audit(
      context,
      'impairment.posted',
      'asset_impairments',
      id,
      'Fixed Asset impairment posted',
      {
        assetId,
        amount:
          amountDecimal,
        journalId:
          journal.journalId,
      },
    );

    return {
      id,
      journalId:
        journal.journalId,
      carryingValue:
        assetMoneyDecimal(
          newBook,
        ),
      reused:
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

export async function reverseFixedAssetImpairment(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_impairments',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const impairmentId =
    accountingId(
      body.impairmentId,
    );
  const reversalDate =
    date(
      body.reversalDate,
      'Impairment reversal date',
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
            impairment.id::text,
            impairment.asset_id::text,
            impairment.impairment_amount::text,
            impairment.journal_reference::text,
            impairment.reversal_journal_id::text,
            impairment.status,
            asset.asset_code
          FROM asset_impairments impairment
          INNER JOIN fixed_assets asset
            ON asset.id = impairment.asset_id
           AND asset.company_id = impairment.company_id
           AND asset.deleted_at IS NULL
          WHERE impairment.company_id = $1
            AND impairment.id = $2
            AND impairment.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF impairment, asset
        `,
        [
          context.companyId,
          impairmentId,
        ],
      );
    const impairment =
      result.rows[0];

    if (
      !impairment ||
      String(
        impairment.status,
      ) !==
        'posted' ||
      !impairment
        .journal_reference
    ) {
      throw new FixedAssetInputError(
        'Only a posted impairment can be reversed.',
      );
    }

    if (
      impairment
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          impairmentId,
        journalId:
          String(
            impairment
              .reversal_journal_id,
          ),
        reused:
          true,
      };
    }

    const laterValueEvent =
      await client.query(
        `
          SELECT (
            EXISTS (
              SELECT 1
              FROM asset_depreciation_entries
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status IN ('active','posted')
                AND period_date > (
                  SELECT impairment_date
                  FROM asset_impairments
                  WHERE company_id = $1
                    AND id = $3
                )
            )
            OR EXISTS (
              SELECT 1
              FROM asset_revaluations
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND revaluation_date > (
                  SELECT impairment_date
                  FROM asset_impairments
                  WHERE company_id = $1
                    AND id = $3
                )
            )
            OR EXISTS (
              SELECT 1
              FROM asset_disposals
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND disposal_date >= (
                  SELECT impairment_date
                  FROM asset_impairments
                  WHERE company_id = $1
                    AND id = $3
                )
            )
          ) AS later_value_event
        `,
        [
          context.companyId,
          impairment.asset_id,
          impairmentId,
        ],
      );

    if (
      laterValueEvent.rows[0]
        ?.later_value_event
    ) {
      throw new FixedAssetInputError(
        'Reverse later depreciation, revaluation or disposal events before reversing this impairment.',
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
              impairment
                .journal_reference,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse asset impairment · ' +
            String(
              impairment.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'impairment_reversal',
          sourceId:
            impairmentId,
          sourceEventKey:
            'fixed_assets:impairment-reversal:' +
            impairmentId,
        },
      );

    await client.query(
      `
        UPDATE asset_impairments
        SET
          status = 'reversed',
          reversal_journal_id = $3,
          reversed_at = NOW(),
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        impairmentId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          accumulated_impairment =
            GREATEST(
              accumulated_impairment -
              $3::numeric,
              0
            ),
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        impairment.asset_id,
        impairment.impairment_amount,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'impairment.reversed',
      'asset_impairments',
      impairmentId,
      'Fixed Asset impairment reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      id:
        impairmentId,
      journalId:
        reversal.journalId,
      reused:
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

export async function postFixedAssetRevaluation(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_revaluations',
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
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const revaluationDate =
    date(
      body.revaluationDate,
      'Revaluation date',
    );
  const fairValue =
    assetMoneyCents(
      String(
        body.fairValue ||
        '0',
      ),
      'Fair value',
    );
  const reason =
    text(
      body.reason,
      2000,
      'Revaluation reason',
      true,
    );

  if (
    fairValue <
    BigInt(
      0,
    )
  ) {
    throw new FixedAssetInputError(
      'Fair value cannot be negative.',
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
            journal_id::text
          FROM asset_revaluations
          WHERE company_id = $1
            AND request_key = $2
            AND deleted_at IS NULL
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
        journalId:
          String(
            previous.rows[0]
              .journal_id ||
            '',
          ),
        reused:
          true,
      };
    }

    const settings =
      await settingsRow(
        client,
        context.companyId,
        true,
      );
    const assetResult =
      await client.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.acquisition_cost::text,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.capitalization_journal_id::text,
            asset.capitalization_reversal_journal_id::text,
            asset.status,
            category.asset_account_reference::text,
            category.revaluation_reserve_account_id::text,
            category.revaluation_loss_account_id::text
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id = asset.category_id
           AND category.company_id = asset.company_id
           AND category.deleted_at IS NULL
          WHERE asset.company_id = $1
            AND asset.id = $2
            AND asset.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF asset
        `,
        [
          context.companyId,
          assetId,
        ],
      );
    const asset =
      assetResult.rows[0];

    if (
      !asset ||
      !asset
        .capitalization_journal_id ||
      asset
        .capitalization_reversal_journal_id ||
      String(
        asset.status,
      ) ===
        'disposed'
    ) {
      throw new FixedAssetInputError(
        'Only an active capitalized asset can be revalued.',
      );
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
    const change =
      fairValue -
      carrying;

    if (
      change ===
      BigInt(
        0,
      )
    ) {
      throw new FixedAssetInputError(
        'Fair value already equals the current carrying value.',
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
    const reserveAccountId =
      String(
        asset
          .revaluation_reserve_account_id ||
        settings
          .default_revaluation_reserve_account_id ||
        '',
      );
    const lossAccountId =
      String(
        asset
          .revaluation_loss_account_id ||
        settings
          .default_revaluation_loss_account_id ||
        '',
      );

    if (
      !assetAccountId
    ) {
      throw new FixedAssetInputError(
        'Map the Asset account before revaluation.',
      );
    }

    await activeAccount(
      client,
      context.companyId,
      assetAccountId,
      'Asset account',
      assetAccount,
    );

    const reserveResult =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(reserve_effect),
              0
            )::text AS reserve_balance
          FROM asset_revaluations
          WHERE company_id = $1
            AND asset_id = $2
            AND status = 'posted'
            AND deleted_at IS NULL
        `,
        [
          context.companyId,
          assetId,
        ],
      );
    const reserveBalance =
      assetMoneyCents(
        String(
          reserveResult.rows[0]
            ?.reserve_balance ||
          '0',
        ),
        'Revaluation reserve balance',
      );

    let reserveEffect =
      BigInt(
        0,
      );
    let profitLossEffect =
      BigInt(
        0,
      );
    const lines:
      Array<{
        accountId:
          string;
        description:
          string;
        debit:
          string;
        credit:
          string;
      }> = [];

    if (
      change >
      BigInt(
        0,
      )
    ) {
      if (
        !reserveAccountId
      ) {
        throw new FixedAssetInputError(
          'Map the Revaluation Reserve account before posting an upward revaluation.',
        );
      }

      await activeAccount(
        client,
        context.companyId,
        reserveAccountId,
        'Revaluation Reserve account',
        equityAccount,
      );

      reserveEffect =
        change;

      lines.push(
        {
          accountId:
            assetAccountId,
          description:
            'Fixed Asset revaluation increase',
          debit:
            assetMoneyDecimal(
              change,
            ),
          credit:
            '0.00',
        },
        {
          accountId:
            reserveAccountId,
          description:
            'Revaluation reserve',
          debit:
            '0.00',
          credit:
            assetMoneyDecimal(
              change,
            ),
        },
      );
    } else {
      const reduction =
        -change;
      const reserveUse =
        reserveBalance >
          BigInt(
            0,
          )
          ? (
              reserveBalance >
                reduction
                ? reduction
                : reserveBalance
            )
          : BigInt(
              0,
            );
      const loss =
        reduction -
        reserveUse;

      if (
        reserveUse >
        BigInt(
          0,
        )
      ) {
        if (
          !reserveAccountId
        ) {
          throw new FixedAssetInputError(
            'Map the Revaluation Reserve account before reducing an existing reserve.',
          );
        }

        await activeAccount(
          client,
          context.companyId,
          reserveAccountId,
          'Revaluation Reserve account',
          equityAccount,
        );

        lines.push({
          accountId:
            reserveAccountId,
          description:
            'Use Fixed Asset revaluation reserve',
          debit:
            assetMoneyDecimal(
              reserveUse,
            ),
          credit:
            '0.00',
        });
      }

      if (
        loss >
        BigInt(
          0,
        )
      ) {
        if (
          !lossAccountId
        ) {
          throw new FixedAssetInputError(
            'Map the Revaluation Loss account before posting a downward revaluation beyond the available reserve.',
          );
        }

        await activeAccount(
          client,
          context.companyId,
          lossAccountId,
          'Revaluation Loss account',
          expenseAccount,
        );

        lines.push({
          accountId:
            lossAccountId,
          description:
            'Fixed Asset revaluation loss',
          debit:
            assetMoneyDecimal(
              loss,
            ),
          credit:
            '0.00',
        });
      }

      lines.push({
        accountId:
          assetAccountId,
        description:
          'Fixed Asset revaluation decrease',
        debit:
          '0.00',
        credit:
          assetMoneyDecimal(
            reduction,
          ),
      });

      reserveEffect =
        -reserveUse;
      profitLossEffect =
        loss;
    }

    const journal =
      await postBalancedLedgerJournal(
        client,
        {
          companyId:
            context.companyId,
          userId:
            context.userId,
          journalDate:
            revaluationDate,
          description:
            'Asset revaluation · ' +
            String(
              asset.asset_code,
            ),
          reference:
            String(
              asset.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'revaluation',
          sourceId:
            assetId,
          sourceEventKey:
            'fixed_assets:revaluation:' +
            requestKey,
          postingKind:
            'system',
          lines,
        },
      );

    const created =
      await client.query(
        `
          INSERT INTO asset_revaluations (
            company_id,
            asset_id,
            request_key,
            revaluation_date,
            previous_carrying_value,
            fair_value,
            change_amount,
            reserve_effect,
            profit_loss_effect,
            reserve_account_id,
            loss_account_id,
            journal_id,
            reason,
            status,
            posted_at,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,
            'posted',NOW(),$14,$14
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          assetId,
          requestKey,
          revaluationDate,
          assetMoneyDecimal(
            carrying,
          ),
          assetMoneyDecimal(
            fairValue,
          ),
          assetMoneyDecimal(
            change,
          ),
          assetMoneyDecimal(
            reserveEffect,
          ),
          assetMoneyDecimal(
            profitLossEffect,
          ),
          reserveAccountId ||
          null,
          lossAccountId ||
          null,
          journal.journalId,
          reason,
          context.userId,
        ],
      );

    const nextAdjustment =
      assetMoneyCents(
        String(
          asset
            .revaluation_adjustment ||
          '0',
        ),
      ) +
      change;

    await client.query(
      `
        UPDATE fixed_assets
        SET
          revaluation_adjustment = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        assetId,
        assetMoneyDecimal(
          nextAdjustment,
        ),
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    const id =
      String(
        created.rows[0].id,
      );

    await audit(
      context,
      'revaluation.posted',
      'asset_revaluations',
      id,
      'Fixed Asset revaluation posted',
      {
        assetId,
        change:
          assetMoneyDecimal(
            change,
          ),
        journalId:
          journal.journalId,
      },
    );

    return {
      id,
      journalId:
        journal.journalId,
      change:
        assetMoneyDecimal(
          change,
        ),
      carryingValue:
        assetMoneyDecimal(
          fairValue,
        ),
      reused:
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

export async function reverseFixedAssetRevaluation(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_revaluations',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const revaluationId =
    accountingId(
      body.revaluationId,
    );
  const reversalDate =
    date(
      body.reversalDate,
      'Revaluation reversal date',
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
            revaluation.id::text,
            revaluation.asset_id::text,
            revaluation.change_amount::text,
            revaluation.journal_id::text,
            revaluation.reversal_journal_id::text,
            revaluation.revaluation_date::text,
            revaluation.created_at,
            revaluation.status,
            asset.asset_code
          FROM asset_revaluations revaluation
          INNER JOIN fixed_assets asset
            ON asset.id = revaluation.asset_id
           AND asset.company_id = revaluation.company_id
           AND asset.deleted_at IS NULL
          WHERE revaluation.company_id = $1
            AND revaluation.id = $2
            AND revaluation.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF revaluation, asset
        `,
        [
          context.companyId,
          revaluationId,
        ],
      );
    const row =
      result.rows[0];

    if (
      !row ||
      String(
        row.status,
      ) !==
        'posted' ||
      !row
        .journal_id
    ) {
      throw new FixedAssetInputError(
        'Only a posted revaluation can be reversed.',
      );
    }

    if (
      row
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          revaluationId,
        journalId:
          String(
            row
              .reversal_journal_id,
          ),
        reused:
          true,
      };
    }

    const later =
      await client.query(
        `
          SELECT 1
          FROM asset_revaluations
          WHERE company_id = $1
            AND asset_id = $2
            AND status = 'posted'
            AND deleted_at IS NULL
            AND id <> $3
            AND (
              revaluation_date > $4::date
              OR (
                revaluation_date = $4::date
                AND created_at > $5
              )
            )
          LIMIT 1
        `,
        [
          context.companyId,
          row.asset_id,
          revaluationId,
          row.revaluation_date,
          row.created_at,
        ],
      );

    if (
      later.rows[0]
    ) {
      throw new FixedAssetInputError(
        'Reverse later revaluations before reversing this one.',
      );
    }

    const laterLifecycle =
      await client.query(
        `
          SELECT (
            EXISTS (
              SELECT 1
              FROM asset_depreciation_entries
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status IN ('active','posted')
                AND period_date > $3::date
            )
            OR EXISTS (
              SELECT 1
              FROM asset_impairments
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND impairment_date > $3::date
            )
            OR EXISTS (
              SELECT 1
              FROM asset_disposals
              WHERE company_id = $1
                AND asset_id = $2
                AND deleted_at IS NULL
                AND status = 'posted'
                AND disposal_date >= $3::date
            )
          ) AS later_lifecycle
        `,
        [
          context.companyId,
          row.asset_id,
          row.revaluation_date,
        ],
      );

    if (
      laterLifecycle.rows[0]
        ?.later_lifecycle
    ) {
      throw new FixedAssetInputError(
        'Reverse later depreciation, impairment or disposal events before reversing this revaluation.',
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
              row.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse asset revaluation · ' +
            String(
              row.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'revaluation_reversal',
          sourceId:
            revaluationId,
          sourceEventKey:
            'fixed_assets:revaluation-reversal:' +
            revaluationId,
        },
      );

    await client.query(
      `
        UPDATE asset_revaluations
        SET
          status = 'reversed',
          reversal_journal_id = $3,
          reversed_at = NOW(),
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        revaluationId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          revaluation_adjustment =
            revaluation_adjustment -
            $3::numeric,
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        row.asset_id,
        row.change_amount,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'revaluation.reversed',
      'asset_revaluations',
      revaluationId,
      'Fixed Asset revaluation reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      id:
        revaluationId,
      journalId:
        reversal.journalId,
      reused:
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

export async function disposeFixedAsset(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_disposals',
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
  const requestKey =
    accountingId(
      body.requestKey,
    );
  const disposalDate =
    date(
      body.disposalDate,
      'Disposal date',
    );
  const disposalMethod =
    text(
      body.disposalMethod,
      50,
      'Disposal method',
      true,
    );
  const notes =
    text(
      body.notes,
      2000,
      'Disposal notes',
    );
  const proceeds =
    assetMoneyCents(
      String(
        body.proceeds ||
        '0',
      ),
      'Disposal proceeds',
    );

  if (
    proceeds <
    BigInt(
      0,
    )
  ) {
    throw new FixedAssetInputError(
      'Disposal proceeds cannot be negative.',
    );
  }

  const proceedsAccountId =
    proceeds >
      BigInt(
        0,
      )
      ? accountingId(
          body.proceedsAccountId,
        )
      : null;

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
            journal_id::text
          FROM asset_disposals
          WHERE company_id = $1
            AND request_key = $2
            AND deleted_at IS NULL
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
        journalId:
          String(
            previous.rows[0]
              .journal_id ||
            '',
          ),
        reused:
          true,
      };
    }

    const settings =
      await settingsRow(
        client,
        context.companyId,
        true,
      );
    const assetResult =
      await client.query(
        `
          SELECT
            asset.id::text,
            asset.asset_code,
            asset.name,
            asset.acquisition_cost::text,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.capitalization_journal_id::text,
            asset.capitalization_reversal_journal_id::text,
            asset.status,
            category.asset_account_reference::text,
            category.depreciation_account_reference::text,
            category.accumulated_impairment_account_id::text,
            category.disposal_gain_account_id::text,
            category.disposal_loss_account_id::text
          FROM fixed_assets asset
          LEFT JOIN asset_categories category
            ON category.id = asset.category_id
           AND category.company_id = asset.company_id
           AND category.deleted_at IS NULL
          WHERE asset.company_id = $1
            AND asset.id = $2
            AND asset.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF asset
        `,
        [
          context.companyId,
          assetId,
        ],
      );
    const asset =
      assetResult.rows[0];

    if (
      !asset ||
      !asset
        .capitalization_journal_id ||
      asset
        .capitalization_reversal_journal_id
    ) {
      throw new FixedAssetInputError(
        'Only a currently capitalized asset can be disposed.',
      );
    }

    if (
      String(
        asset.status,
      ) ===
        'disposed'
    ) {
      throw new FixedAssetInputError(
        'This asset is already disposed.',
      );
    }

    const cost =
      assetMoneyCents(
        String(
          asset
            .acquisition_cost ||
          '0',
        ),
      );
    const depreciation =
      assetMoneyCents(
        String(
          asset
            .accumulated_depreciation ||
          '0',
        ),
      );
    const impairment =
      assetMoneyCents(
        String(
          asset
            .accumulated_impairment ||
          '0',
        ),
      );
    const revaluation =
      assetMoneyCents(
        String(
          asset
            .revaluation_adjustment ||
          '0',
        ),
      );
    const grossAsset =
      cost +
      revaluation;
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
    const gainLoss =
      proceeds -
      carrying;

    if (
      grossAsset <=
      BigInt(
        0,
      )
    ) {
      throw new FixedAssetInputError(
        'The asset gross carrying amount is not valid for disposal.',
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
    const accumulatedDepreciationAccountId =
      String(
        asset
          .depreciation_account_reference ||
        settings
          .default_accumulated_depreciation_account_id ||
        '',
      );
    const accumulatedImpairmentAccountId =
      String(
        asset
          .accumulated_impairment_account_id ||
        settings
          .default_accumulated_impairment_account_id ||
        '',
      );
    const gainAccountId =
      String(
        asset
          .disposal_gain_account_id ||
        settings
          .default_disposal_gain_account_id ||
        '',
      );
    const lossAccountId =
      String(
        asset
          .disposal_loss_account_id ||
        settings
          .default_disposal_loss_account_id ||
        '',
      );

    if (
      !assetAccountId
    ) {
      throw new FixedAssetInputError(
        'Map the Asset account before disposal.',
      );
    }

    await activeAccount(
      client,
      context.companyId,
      assetAccountId,
      'Asset account',
      assetAccount,
    );

    const lines:
      Array<{
        accountId:
          string;
        description:
          string;
        debit:
          string;
        credit:
          string;
      }> = [];

    if (
      depreciation >
      BigInt(
        0,
      )
    ) {
      if (
        !accumulatedDepreciationAccountId
      ) {
        throw new FixedAssetInputError(
          'Map the Accumulated Depreciation account before disposal.',
        );
      }

      await activeAccount(
        client,
        context.companyId,
        accumulatedDepreciationAccountId,
        'Accumulated Depreciation account',
        assetAccount,
      );

      lines.push({
        accountId:
          accumulatedDepreciationAccountId,
        description:
          'Clear accumulated depreciation',
        debit:
          assetMoneyDecimal(
            depreciation,
          ),
        credit:
          '0.00',
      });
    }

    if (
      impairment >
      BigInt(
        0,
      )
    ) {
      if (
        !accumulatedImpairmentAccountId
      ) {
        throw new FixedAssetInputError(
          'Map the Accumulated Impairment account before disposal.',
        );
      }

      await activeAccount(
        client,
        context.companyId,
        accumulatedImpairmentAccountId,
        'Accumulated Impairment account',
        assetAccount,
      );

      lines.push({
        accountId:
          accumulatedImpairmentAccountId,
        description:
          'Clear accumulated impairment',
        debit:
          assetMoneyDecimal(
            impairment,
          ),
        credit:
          '0.00',
      });
    }

    if (
      proceeds >
      BigInt(
        0,
      ) &&
      proceedsAccountId
    ) {
      await activeAccount(
        client,
        context.companyId,
        proceedsAccountId,
        'Disposal Proceeds account',
      );

      lines.push({
        accountId:
          proceedsAccountId,
        description:
          'Fixed Asset disposal proceeds',
        debit:
          assetMoneyDecimal(
            proceeds,
          ),
        credit:
          '0.00',
      });
    }

    if (
      gainLoss >
      BigInt(
        0,
      )
    ) {
      if (
        !gainAccountId
      ) {
        throw new FixedAssetInputError(
          'Map the Disposal Gain account before posting a gain.',
        );
      }

      await activeAccount(
        client,
        context.companyId,
        gainAccountId,
        'Disposal Gain account',
        incomeAccount,
      );

      lines.push({
        accountId:
          gainAccountId,
        description:
          'Gain on Fixed Asset disposal',
        debit:
          '0.00',
        credit:
          assetMoneyDecimal(
            gainLoss,
          ),
      });
    } else if (
      gainLoss <
      BigInt(
        0,
      )
    ) {
      if (
        !lossAccountId
      ) {
        throw new FixedAssetInputError(
          'Map the Disposal Loss account before posting a loss.',
        );
      }

      await activeAccount(
        client,
        context.companyId,
        lossAccountId,
        'Disposal Loss account',
        expenseAccount,
      );

      lines.push({
        accountId:
          lossAccountId,
        description:
          'Loss on Fixed Asset disposal',
        debit:
          assetMoneyDecimal(
            -gainLoss,
          ),
        credit:
          '0.00',
      });
    }

    lines.push({
      accountId:
        assetAccountId,
      description:
        'Derecognize Fixed Asset',
      debit:
        '0.00',
      credit:
        assetMoneyDecimal(
          grossAsset,
        ),
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
            disposalDate,
          description:
            'Dispose fixed asset · ' +
            String(
              asset.asset_code,
            ),
          reference:
            String(
              asset.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'disposal',
          sourceId:
            assetId,
          sourceEventKey:
            'fixed_assets:disposal:' +
            requestKey,
          postingKind:
            'system',
          lines,
        },
      );

    const created =
      await client.query(
        `
          INSERT INTO asset_disposals (
            company_id,
            asset_id,
            request_key,
            disposal_date,
            disposal_method,
            proceeds,
            notes,
            carrying_value,
            accumulated_depreciation,
            accumulated_impairment,
            revaluation_adjustment,
            gain_loss,
            proceeds_account_id,
            journal_id,
            status,
            posted_at,
            created_by,
            updated_by
          )
          VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            'posted',NOW(),$15,$15
          )
          RETURNING id::text
        `,
        [
          context.companyId,
          assetId,
          requestKey,
          disposalDate,
          disposalMethod,
          assetMoneyDecimal(
            proceeds,
          ),
          notes ||
          null,
          assetMoneyDecimal(
            carrying,
          ),
          assetMoneyDecimal(
            depreciation,
          ),
          assetMoneyDecimal(
            impairment,
          ),
          assetMoneyDecimal(
            revaluation,
          ),
          assetMoneyDecimal(
            gainLoss,
          ),
          proceedsAccountId,
          journal.journalId,
          context.userId,
        ],
      );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          status = 'disposed',
          disposal_date = $3,
          disposal_journal_id = $4,
          disposal_reversal_journal_id = NULL,
          updated_by = $5,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        assetId,
        disposalDate,
        journal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    const id =
      String(
        created.rows[0].id,
      );

    await audit(
      context,
      'disposal.posted',
      'asset_disposals',
      id,
      'Fixed Asset disposal posted',
      {
        assetId,
        proceeds:
          assetMoneyDecimal(
            proceeds,
          ),
        gainLoss:
          assetMoneyDecimal(
            gainLoss,
          ),
        journalId:
          journal.journalId,
      },
    );

    return {
      id,
      journalId:
        journal.journalId,
      gainLoss:
        assetMoneyDecimal(
          gainLoss,
        ),
      reused:
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

export async function reverseFixedAssetDisposal(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_disposals',
      'edit',
    );
  const body =
    bodyOf(
      input,
    );
  const disposalId =
    accountingId(
      body.disposalId,
    );
  const reversalDate =
    date(
      body.reversalDate,
      'Disposal reversal date',
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
            disposal.id::text,
            disposal.asset_id::text,
            disposal.journal_id::text,
            disposal.reversal_journal_id::text,
            disposal.status,
            asset.asset_code
          FROM asset_disposals disposal
          INNER JOIN fixed_assets asset
            ON asset.id = disposal.asset_id
           AND asset.company_id = disposal.company_id
           AND asset.deleted_at IS NULL
          WHERE disposal.company_id = $1
            AND disposal.id = $2
            AND disposal.deleted_at IS NULL
          LIMIT 1
          FOR UPDATE OF disposal, asset
        `,
        [
          context.companyId,
          disposalId,
        ],
      );
    const disposal =
      result.rows[0];

    if (
      !disposal ||
      String(
        disposal.status,
      ) !==
        'posted' ||
      !disposal
        .journal_id
    ) {
      throw new FixedAssetInputError(
        'Only a posted disposal can be reversed.',
      );
    }

    if (
      disposal
        .reversal_journal_id
    ) {
      await client.query(
        'COMMIT',
      );

      return {
        id:
          disposalId,
        journalId:
          String(
            disposal
              .reversal_journal_id,
          ),
        reused:
          true,
      };
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
              disposal.journal_id,
            ),
          journalDate:
            reversalDate,
          description:
            'Reverse asset disposal · ' +
            String(
              disposal.asset_code,
            ),
          sourceModule:
            'fixed_assets',
          sourceType:
            'disposal_reversal',
          sourceId:
            disposalId,
          sourceEventKey:
            'fixed_assets:disposal-reversal:' +
            disposalId,
        },
      );

    await client.query(
      `
        UPDATE asset_disposals
        SET
          status = 'reversed',
          reversal_journal_id = $3,
          reversed_at = NOW(),
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        disposalId,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      `
        UPDATE fixed_assets
        SET
          status = 'in_service',
          disposal_reversal_journal_id = $3,
          updated_by = $4,
          updated_at = NOW()
        WHERE company_id = $1
          AND id = $2
      `,
      [
        context.companyId,
        disposal.asset_id,
        reversal.journalId,
        context.userId,
      ],
    );

    await client.query(
      'COMMIT',
    );

    await audit(
      context,
      'disposal.reversed',
      'asset_disposals',
      disposalId,
      'Fixed Asset disposal reversed',
      {
        journalId:
          reversal.journalId,
      },
    );

    return {
      id:
        disposalId,
      journalId:
        reversal.journalId,
      reused:
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

export async function linkFixedAssetSource(
  input:
    unknown,
) {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'asset_source_links',
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
  const sourceModule =
    text(
      body.sourceModule,
      80,
      'Source module',
      true,
    );
  const sourceType =
    text(
      body.sourceType,
      120,
      'Source type',
      true,
    );
  const sourceId =
    text(
      body.sourceId,
      160,
      'Source ID',
      true,
    );
  const sourceReference =
    text(
      body.sourceReference,
      255,
      'Source reference',
    );
  const sourceAmountCents =
    body.sourceAmount ===
        undefined ||
      body.sourceAmount ===
        null ||
      body.sourceAmount ===
        ''
      ? null
      : assetMoneyCents(
          String(
            body.sourceAmount,
          ),
          'Source amount',
        );

  if (
    sourceAmountCents !==
      null &&
    sourceAmountCents <
      BigInt(
        0,
      )
  ) {
    throw new FixedAssetInputError(
      'Source amount cannot be negative.',
    );
  }

  const sourceAmount =
    sourceAmountCents ===
      null
      ? null
      : assetMoneyDecimal(
          sourceAmountCents,
        );

  const asset =
    await context.pool.query(
      `
        SELECT id::text
        FROM fixed_assets
        WHERE company_id = $1
          AND id = $2
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        context.companyId,
        assetId,
      ],
    );

  if (
    !asset.rows[0]
  ) {
    throw new FixedAssetInputError(
      'Fixed Asset not found.',
    );
  }

  const result =
    await context.pool.query(
      `
        INSERT INTO asset_source_links (
          company_id,
          asset_id,
          source_module,
          source_type,
          source_id,
          source_reference,
          source_amount,
          created_by,
          updated_by
        )
        VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$8
        )
        ON CONFLICT (
          company_id,
          source_module,
          source_type,
          source_id
        )
        WHERE deleted_at IS NULL
        DO UPDATE
        SET
          asset_id =
            EXCLUDED.asset_id,
          source_reference =
            EXCLUDED.source_reference,
          source_amount =
            EXCLUDED.source_amount,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
        RETURNING id::text
      `,
      [
        context.companyId,
        assetId,
        sourceModule,
        sourceType,
        sourceId,
        sourceReference ||
        null,
        sourceAmount,
        context.userId,
      ],
    );

  const id =
    String(
      result.rows[0].id,
    );

  await audit(
    context,
    'source.linked',
    'asset_source_links',
    id,
    'Fixed Asset source document linked',
    {
      assetId,
      sourceModule,
      sourceType,
      sourceId,
    },
  );

  return {
    id,
    assetId,
  };
}
