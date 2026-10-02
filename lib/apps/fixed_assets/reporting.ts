import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';
import {
  assetCarryingValueCents,
  assetMoneyCents,
  assetMoneyDecimal,
  decliningBalanceDepreciationCents,
  straightLineDepreciationCents,
} from './accounting-rules';

type MoneyLine = {
  label:
    string;
  amount:
    string;
};

export type FixedAssetsReporting = {
  asOf:
    string;
  periodStart:
    string;
  rollForward: {
    openingCarrying:
      string;
    additions:
      string;
    capitalizationReversals:
      string;
    depreciation:
      string;
    depreciationReversals:
      string;
    impairments:
      string;
    impairmentReversals:
      string;
    revaluations:
      string;
    revaluationReversals:
      string;
    disposals:
      string;
    disposalReversals:
      string;
    closingCarrying:
      string;
    movementNet:
      string;
  };
  reconciliation: {
    lines:
      Array<{
        kind:
          'asset' |
          'accumulated_depreciation' |
          'accumulated_impairment';
        accountId:
          string | null;
        accountCode:
          string | null;
        accountName:
          string;
        registerValue:
          string;
        glValue:
          string;
        difference:
          string;
        assetCount:
          number;
      }>;
    registerValue:
      string;
    glValue:
      string;
    difference:
      string;
    unmappedAssetCount:
      number;
  };
  forecast: {
    horizonStart:
      string;
    horizonEnd:
      string;
    total:
      string;
    assets:
      Array<{
        assetId:
          string;
        assetCode:
          string;
        name:
          string;
        method:
          string;
        remainingPeriods:
          number;
        nextMonth:
          string;
        nextTwelveMonths:
          string;
      }>;
  };
  activity: MoneyLine[];
};

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function dateParts(
  value:
    string,
) {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      value,
    );

  if (
    !match
  ) {
    throw new Error(
      'Invalid report date.',
    );
  }

  return {
    year:
      Number(
        match[1],
      ),
    month:
      Number(
        match[2],
      ),
    day:
      Number(
        match[3],
      ),
  };
}

function isoDate(
  year:
    number,
  month:
    number,
  day:
    number,
) {
  const lastDay =
    new Date(
      Date.UTC(
        year,
        month,
        0,
      ),
    ).getUTCDate();
  const safeDay =
    Math.min(
      Math.max(
        1,
        day,
      ),
      lastDay,
    );

  return (
    String(
      year,
    ).padStart(
      4,
      '0',
    ) +
    '-' +
    String(
      month,
    ).padStart(
      2,
      '0',
    ) +
    '-' +
    String(
      safeDay,
    ).padStart(
      2,
      '0',
    )
  );
}

function fiscalStart(
  asOf:
    string,
  month:
    number,
  day:
    number,
) {
  const parts =
    dateParts(
      asOf,
    );
  const current =
    isoDate(
      parts.year,
      month,
      day,
    );

  return current <=
    asOf
    ? current
    : isoDate(
        parts.year -
          1,
        month,
        day,
      );
}

function addMonths(
  value:
    string,
  count:
    number,
) {
  const parts =
    dateParts(
      value,
    );
  const date =
    new Date(
      Date.UTC(
        parts.year,
        parts.month -
          1 +
          count,
        1,
      ),
    );

  return isoDate(
    date.getUTCFullYear(),
    date.getUTCMonth() +
      1,
    1,
  );
}

function endOfMonth(
  value:
    string,
) {
  const parts =
    dateParts(
      value,
    );
  const last =
    new Date(
      Date.UTC(
        parts.year,
        parts.month,
        0,
      ),
    ).getUTCDate();

  return isoDate(
    parts.year,
    parts.month,
    last,
  );
}

function cents(
  value:
    unknown,
) {
  return assetMoneyCents(
    String(
      value ||
      '0',
    ),
  );
}

async function journalTotal(
  pool:
    {
      query:
        (
          sql:
            string,
          params?:
            unknown[],
        ) =>
          Promise<{
            rows:
              Array<
                Record<
                  string,
                  unknown
                >
              >;
          }>;
    },
  companyId:
    string,
  sourceType:
    string,
  start:
    string,
  end:
    string,
) {
  const result =
    await pool.query(
      `
        SELECT
          COALESCE(
            SUM(total_debit),
            0
          )::numeric(19,2)::text
            AS amount
        FROM (
          SELECT
            journal.id,
            SUM(line.debit)
              AS total_debit
          FROM journals journal
          INNER JOIN journal_lines line
            ON line.company_id =
               journal.company_id
           AND line.journal_id =
               journal.id
           AND line.deleted_at
               IS NULL
          WHERE journal.company_id =
                $1
            AND journal.source_module =
                'fixed_assets'
            AND journal.source_type =
                $2
            AND journal.status =
                'posted'
            AND journal.deleted_at
                IS NULL
            AND journal.journal_date
                BETWEEN $3::date
                    AND $4::date
          GROUP BY
            journal.id
        ) posted
      `,
      [
        companyId,
        sourceType,
        start,
        end,
      ],
    );

  return cents(
    result.rows[0]
      ?.amount ||
    '0',
  );
}

export async function getFixedAssetsReporting(
  input: {
    asOf?: string;
  } = {},
):
  Promise<
    FixedAssetsReporting
  > {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'fixed_assets',
      'view',
    );
  const asOf =
    input.asOf ||
    today();

  dateParts(
    asOf,
  );

  const accountingSettings =
    await context.pool.query(
      `
        SELECT
          fiscal_year_start_month,
          fiscal_year_start_day
        FROM accounting_settings
        WHERE company_id = $1
          AND deleted_at IS NULL
        LIMIT 1
      `,
      [
        context.companyId,
      ],
    ).catch(
      () => ({
        rows:
          [] as Array<
            Record<
              string,
              unknown
            >
          >,
      }),
    );

  const start =
    fiscalStart(
      asOf,
      Number(
        accountingSettings
          .rows[0]
          ?.fiscal_year_start_month ||
        1,
      ),
      Number(
        accountingSettings
          .rows[0]
          ?.fiscal_year_start_day ||
        1,
      ),
    );

  const [
    settingsResult,
    assetsResult,
    additionsResult,
    depreciationResult,
    depreciationReversalResult,
    impairmentResult,
    impairmentReversalResult,
    revaluationResult,
    revaluationReversalResult,
    disposalResult,
    disposalReversalResult,
    capitalizationReversals,
  ] =
    await Promise.all([
      context.pool.query(
        `
          SELECT
            default_asset_account_id::text,
            default_accumulated_depreciation_account_id::text,
            default_accumulated_impairment_account_id::text
          FROM fixed_assets_settings
          WHERE company_id = $1
          LIMIT 1
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
            asset.acquisition_cost::text,
            asset.salvage_value::text,
            asset.useful_life_months,
            asset.depreciation_method,
            asset.accumulated_depreciation::text,
            asset.accumulated_impairment::text,
            asset.revaluation_adjustment::text,
            asset.capitalization_journal_id::text,
            asset.capitalization_reversal_journal_id::text,
            asset.status,
            category.asset_account_reference::text,
            category.depreciation_account_reference::text,
            category.accumulated_impairment_account_id::text,
            category.default_useful_life_months,
            category.default_depreciation_method,
            category.declining_balance_rate::text,
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
          WHERE asset.company_id = $1
            AND asset.deleted_at IS NULL
            AND asset.capitalization_journal_id
                IS NOT NULL
            AND asset.capitalization_reversal_journal_id
                IS NULL
            AND asset.status <>
                'disposed'
          ORDER BY
            asset.asset_code,
            asset.id
        `,
        [
          context.companyId,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(acquisition_cost),
              0
            )::numeric(19,2)::text
              AS amount
          FROM fixed_assets
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND capitalization_journal_id
                IS NOT NULL
            AND capitalization_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(depreciation_amount),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_depreciation_entries
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status IN (
              'active',
              'posted'
            )
            AND period_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      journalTotal(
        context.pool,
        context.companyId,
        'depreciation_reversal',
        start,
        asOf,
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(impairment_amount),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_impairments
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status = 'posted'
            AND impairment_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      journalTotal(
        context.pool,
        context.companyId,
        'impairment_reversal',
        start,
        asOf,
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(change_amount),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_revaluations
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status = 'posted'
            AND revaluation_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(-change_amount),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_revaluations revaluation
          INNER JOIN journals reversal
            ON reversal.id =
               revaluation.reversal_journal_id
           AND reversal.company_id =
               revaluation.company_id
           AND reversal.deleted_at
               IS NULL
           AND reversal.status =
               'posted'
          WHERE revaluation.company_id = $1
            AND revaluation.deleted_at IS NULL
            AND revaluation.status = 'reversed'
            AND reversal.journal_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(carrying_value),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_disposals
          WHERE company_id = $1
            AND deleted_at IS NULL
            AND status = 'posted'
            AND disposal_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      context.pool.query(
        `
          SELECT
            COALESCE(
              SUM(disposal.carrying_value),
              0
            )::numeric(19,2)::text
              AS amount
          FROM asset_disposals disposal
          INNER JOIN journals reversal
            ON reversal.id =
               disposal.reversal_journal_id
           AND reversal.company_id =
               disposal.company_id
           AND reversal.deleted_at
               IS NULL
           AND reversal.status =
               'posted'
          WHERE disposal.company_id = $1
            AND disposal.deleted_at IS NULL
            AND disposal.status = 'reversed'
            AND reversal.journal_date
                BETWEEN $2::date
                    AND $3::date
        `,
        [
          context.companyId,
          start,
          asOf,
        ],
      ),
      journalTotal(
        context.pool,
        context.companyId,
        'capitalization_reversal',
        start,
        asOf,
      ),
    ]);

  const settings =
    settingsResult.rows[0] ||
    {};

  let closing =
    BigInt(
      0,
    );

  type ReconciliationBucket = {
    kind:
      'asset' |
      'accumulated_depreciation' |
      'accumulated_impairment';
    accountId:
      string | null;
    register:
      bigint;
    assetIds:
      Set<string>;
  };

  const buckets =
    new Map<
      string,
      ReconciliationBucket
    >();

  function addBucket(
    kind:
      ReconciliationBucket[
        'kind'
      ],
    accountId:
      string | null,
    value:
      bigint,
    assetId:
      string,
  ) {
    const key =
      kind +
      ':' +
      (
        accountId ||
        'unmapped'
      );
    const existing =
      buckets.get(
        key,
      ) ||
      {
        kind,
        accountId,
        register:
          BigInt(
            0,
          ),
        assetIds:
          new Set<
            string
          >(),
      };

    existing.register +=
      value;
    existing.assetIds.add(
      assetId,
    );

    buckets.set(
      key,
      existing,
    );
  }

  const forecastRows:
    FixedAssetsReporting[
      'forecast'
    ][
      'assets'
    ] = [];
  let forecastTotal =
    BigInt(
      0,
    );

  const firstForecastMonth =
    addMonths(
      asOf,
      1,
    );
  const forecastEnd =
    endOfMonth(
      addMonths(
        firstForecastMonth,
        11,
      ),
    );

  let unmappedAssetCount =
    0;

  for (
    const asset
    of assetsResult.rows
  ) {
    const assetId =
      String(
        asset.id,
      );
    const acquisition =
      cents(
        asset
          .acquisition_cost,
      );
    const depreciation =
      cents(
        asset
          .accumulated_depreciation,
      );
    const impairment =
      cents(
        asset
          .accumulated_impairment,
      );
    const revaluation =
      cents(
        asset
          .revaluation_adjustment,
      );
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

    closing +=
      carrying;

    const assetAccountId =
      asset
        .asset_account_reference
        ? String(
            asset
              .asset_account_reference,
          )
        : settings
            .default_asset_account_id
          ? String(
              settings
                .default_asset_account_id,
            )
          : null;
    const depreciationAccountId =
      asset
        .depreciation_account_reference
        ? String(
            asset
              .depreciation_account_reference,
          )
        : settings
            .default_accumulated_depreciation_account_id
          ? String(
              settings
                .default_accumulated_depreciation_account_id,
            )
          : null;
    const impairmentAccountId =
      asset
        .accumulated_impairment_account_id
        ? String(
            asset
              .accumulated_impairment_account_id,
          )
        : settings
            .default_accumulated_impairment_account_id
          ? String(
              settings
                .default_accumulated_impairment_account_id,
            )
          : null;

    if (
      !assetAccountId ||
      (
        depreciation >
          BigInt(
            0,
          ) &&
        !depreciationAccountId
      ) ||
      (
        impairment >
          BigInt(
            0,
          ) &&
        !impairmentAccountId
      )
    ) {
      unmappedAssetCount +=
        1;
    }

    addBucket(
      'asset',
      assetAccountId,
      acquisition +
        revaluation,
      assetId,
    );

    if (
      depreciation >
      BigInt(
        0,
      )
    ) {
      addBucket(
        'accumulated_depreciation',
        depreciationAccountId,
        depreciation,
        assetId,
      );
    }

    if (
      impairment >
      BigInt(
        0,
      )
    ) {
      addBucket(
        'accumulated_impairment',
        impairmentAccountId,
        impairment,
        assetId,
      );
    }

    const method =
      String(
        asset
          .depreciation_method ||
        asset
          .default_depreciation_method ||
        'straight_line',
      );
    const usefulLife =
      Number(
        asset
          .useful_life_months ||
        asset
          .default_useful_life_months ||
        0,
      );
    const postedPeriods =
      Number(
        asset
          .posted_periods ||
        0,
      );
    let remainingPeriods =
      Math.max(
        0,
        usefulLife -
          postedPeriods,
      );
    let projectedCarrying =
      carrying;
    const salvage =
      cents(
        asset
          .salvage_value,
      );
    let nextMonth =
      BigInt(
        0,
      );
    let nextTwelve =
      BigInt(
        0,
      );

    for (
      let month =
        0;
      month <
        12 &&
      remainingPeriods >
        0;
      month +=
        1
    ) {
      let charge =
        BigInt(
          0,
        );

      if (
        method ===
          'declining_balance'
      ) {
        const rate =
          String(
            asset
              .declining_balance_rate ||
            '',
          );

        if (
          rate
        ) {
          charge =
            decliningBalanceDepreciationCents({
              carryingValue:
                projectedCarrying,
              salvageValue:
                salvage,
              annualRate:
                rate,
            });
        }
      } else if (
        method !==
          'no_depreciation'
      ) {
        charge =
          straightLineDepreciationCents({
            carryingValue:
              projectedCarrying,
            salvageValue:
              salvage,
            remainingPeriods,
          });
      }

      if (
        month ===
          0
      ) {
        nextMonth =
          charge;
      }

      nextTwelve +=
        charge;
      projectedCarrying -=
        charge;
      remainingPeriods -=
        1;

      if (
        charge <=
        BigInt(
          0,
        )
      ) {
        break;
      }
    }

    forecastTotal +=
      nextTwelve;

    forecastRows.push({
      assetId,
      assetCode:
        String(
          asset.asset_code ||
          '',
        ),
      name:
        String(
          asset.name ||
          '',
        ),
      method,
      remainingPeriods:
        Math.max(
          0,
          usefulLife -
            postedPeriods,
        ),
      nextMonth:
        assetMoneyDecimal(
          nextMonth,
        ),
      nextTwelveMonths:
        assetMoneyDecimal(
          nextTwelve,
        ),
    });
  }

  const reconciliationLines:
    FixedAssetsReporting[
      'reconciliation'
    ][
      'lines'
    ] = [];
  let reconciliationRegister =
    BigInt(
      0,
    );
  let reconciliationGl =
    BigInt(
      0,
    );

  for (
    const bucket
    of buckets.values()
  ) {
    let gl =
      BigInt(
        0,
      );
    let accountCode:
      string |
      null =
        null;
    let accountName =
      'Unmapped account';

    if (
      bucket.accountId
    ) {
      const result =
        await context.pool.query(
          `
            SELECT
              account.code,
              account.name,
              COALESCE(
                SUM(
                  CASE
                    WHEN journal.id IS NOT NULL
                    THEN
                      CASE
                        WHEN $3::text = 'asset'
                        THEN line.debit -
                             line.credit
                        ELSE line.credit -
                             line.debit
                      END
                    ELSE 0
                  END
                ),
                0
              )::numeric(19,2)::text
                AS balance
            FROM accounts account
            LEFT JOIN journal_lines line
              ON line.company_id =
                 account.company_id
             AND line.account_id =
                 account.id
             AND line.deleted_at
                 IS NULL
            LEFT JOIN journals journal
              ON journal.company_id =
                 line.company_id
             AND journal.id =
                 line.journal_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
             AND journal.journal_date <=
                 $4::date
            WHERE account.company_id =
                  $1
              AND account.id =
                  $2
              AND account.deleted_at
                  IS NULL
            GROUP BY
              account.id
          `,
          [
            context.companyId,
            bucket.accountId,
            bucket.kind ===
              'asset'
              ? 'asset'
              : 'contra',
            asOf,
          ],
        );

      gl =
        cents(
          result.rows[0]
            ?.balance ||
          '0',
        );
      accountCode =
        result.rows[0]
          ?.code
          ? String(
              result.rows[0]
                .code,
            )
          : null;
      accountName =
        result.rows[0]
          ?.name
          ? String(
              result.rows[0]
                .name,
            )
          : 'Mapped account';
    }

    reconciliationRegister +=
      bucket.register;
    reconciliationGl +=
      gl;

    reconciliationLines.push({
      kind:
        bucket.kind,
      accountId:
        bucket.accountId,
      accountCode,
      accountName,
      registerValue:
        assetMoneyDecimal(
          bucket.register,
        ),
      glValue:
        assetMoneyDecimal(
          gl,
        ),
      difference:
        assetMoneyDecimal(
          bucket.register -
          gl,
        ),
      assetCount:
        bucket.assetIds
          .size,
    });
  }

  const additions =
    cents(
      additionsResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const depreciation =
    cents(
      depreciationResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const depreciationReversals =
    depreciationReversalResult;
  const impairments =
    cents(
      impairmentResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const impairmentReversals =
    impairmentReversalResult;
  const revaluations =
    cents(
      revaluationResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const revaluationReversals =
    cents(
      revaluationReversalResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const disposals =
    cents(
      disposalResult
        .rows[0]
        ?.amount ||
      '0',
    );
  const disposalReversals =
    cents(
      disposalReversalResult
        .rows[0]
        ?.amount ||
      '0',
    );

  const movementNet =
    additions -
    capitalizationReversals -
    depreciation +
    depreciationReversals -
    impairments +
    impairmentReversals +
    revaluations +
    revaluationReversals -
    disposals +
    disposalReversals;
  const opening =
    closing -
    movementNet;

  return {
    asOf,
    periodStart:
      start,
    rollForward: {
      openingCarrying:
        assetMoneyDecimal(
          opening,
        ),
      additions:
        assetMoneyDecimal(
          additions,
        ),
      capitalizationReversals:
        assetMoneyDecimal(
          capitalizationReversals,
        ),
      depreciation:
        assetMoneyDecimal(
          depreciation,
        ),
      depreciationReversals:
        assetMoneyDecimal(
          depreciationReversals,
        ),
      impairments:
        assetMoneyDecimal(
          impairments,
        ),
      impairmentReversals:
        assetMoneyDecimal(
          impairmentReversals,
        ),
      revaluations:
        assetMoneyDecimal(
          revaluations,
        ),
      revaluationReversals:
        assetMoneyDecimal(
          revaluationReversals,
        ),
      disposals:
        assetMoneyDecimal(
          disposals,
        ),
      disposalReversals:
        assetMoneyDecimal(
          disposalReversals,
        ),
      closingCarrying:
        assetMoneyDecimal(
          closing,
        ),
      movementNet:
        assetMoneyDecimal(
          movementNet,
        ),
    },
    reconciliation: {
      lines:
        reconciliationLines.sort(
          (
            left,
            right,
          ) =>
            (
              left.kind +
              ':' +
              (
                left.accountCode ||
                ''
              )
            ).localeCompare(
              right.kind +
              ':' +
              (
                right.accountCode ||
                ''
              ),
            ),
        ),
      registerValue:
        assetMoneyDecimal(
          reconciliationRegister,
        ),
      glValue:
        assetMoneyDecimal(
          reconciliationGl,
        ),
      difference:
        assetMoneyDecimal(
          reconciliationRegister -
          reconciliationGl,
        ),
      unmappedAssetCount,
    },
    forecast: {
      horizonStart:
        firstForecastMonth,
      horizonEnd:
        forecastEnd,
      total:
        assetMoneyDecimal(
          forecastTotal,
        ),
      assets:
        forecastRows.sort(
          (
            left,
            right,
          ) =>
            Number(
              right.nextTwelveMonths,
            ) -
            Number(
              left.nextTwelveMonths,
            ),
        ),
    },
    activity: [
      {
        label:
          'Additions',
        amount:
          assetMoneyDecimal(
            additions,
          ),
      },
      {
        label:
          'Depreciation',
        amount:
          assetMoneyDecimal(
            depreciation,
          ),
      },
      {
        label:
          'Impairments',
        amount:
          assetMoneyDecimal(
            impairments,
          ),
      },
      {
        label:
          'Net revaluation',
        amount:
          assetMoneyDecimal(
            revaluations +
            revaluationReversals,
          ),
      },
      {
        label:
          'Disposals',
        amount:
          assetMoneyDecimal(
            disposals,
          ),
      },
    ],
  };
}
