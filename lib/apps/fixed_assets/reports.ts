import 'server-only';

import {
  requireEnterpriseModuleTableContext,
} from '@/lib/apps/enterprise/service';

export type FixedAssetsReportData = {
  period: {
    from:
      string;
    to:
      string;
  };
  rollforward: {
    opening:
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
    netMovement:
      string;
    closing:
      string;
  };
  movements:
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
  register:
    Array<
      Record<
        string,
        unknown
      >
    >;
  schedule:
    Array<
      Record<
        string,
        unknown
      >
    >;
};

function isoDate(
  value:
    unknown,
  fallback:
    string,
  label:
    string,
) {
  const raw =
    typeof value ===
      'string'
      ? value.trim()
      : '';

  const result =
    raw ||
    fallback;

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      result,
    )
  ) {
    throw new Error(
      label +
      ' must use YYYY-MM-DD.',
    );
  }

  const parsed =
    new Date(
      result +
      'T00:00:00.000Z',
    );

  if (
    Number.isNaN(
      parsed.getTime(),
    )
  ) {
    throw new Error(
      label +
      ' is invalid.',
    );
  }

  return result;
}

function today() {
  return new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
}

function yearStart(
  date:
    string,
) {
  return (
    date.slice(
      0,
      4,
    ) +
    '-01-01'
  );
}

function decimal(
  value:
    unknown,
) {
  const raw =
    String(
      value ??
      '0',
    );

  return /^-?\d+(?:\.\d+)?$/.test(
    raw,
  )
    ? raw
    : '0';
}

export async function getFixedAssetsReports(
  input: {
    from?:
      unknown;
    to?:
      unknown;
  } = {},
): Promise<
  FixedAssetsReportData
> {
  const context =
    await requireEnterpriseModuleTableContext(
      'fixed_assets',
      'fixed_assets',
      'report',
    );
  const defaultTo =
    today();
  const from =
    isoDate(
      input.from,
      yearStart(
        defaultTo,
      ),
      'Report start date',
    );
  const to =
    isoDate(
      input.to,
      defaultTo,
      'Report end date',
    );

  if (
    to <
    from
  ) {
    throw new Error(
      'Report end date cannot be before its start.',
    );
  }

  const client =
    await context.pool.connect();

  try {
    await client.query(
      'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY',
    );

    const movements =
      await client.query(
        `
          WITH lifecycle AS (
            SELECT
              asset.id::text
                AS asset_id,
              asset.asset_code,
              asset.name
                AS asset_name,
              COALESCE(
                category.name,
                'Uncategorized'
              ) AS category_name,
              journal.journal_date
                AS event_date,
              'addition'
                AS event_type,
              asset.acquisition_cost::numeric(19,2)
                AS amount,
              journal.id::text
                AS journal_id
            FROM fixed_assets asset
            INNER JOIN journals journal
              ON journal.id =
                 asset.capitalization_journal_id
             AND journal.company_id =
                 asset.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
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

            UNION ALL

            SELECT
              asset.id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'capitalization_reversal',
              -asset.acquisition_cost::numeric(19,2),
              journal.id::text
            FROM fixed_assets asset
            INNER JOIN journals journal
              ON journal.id =
                 asset.capitalization_reversal_journal_id
             AND journal.company_id =
                 asset.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
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

            UNION ALL

            SELECT
              entry.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'depreciation',
              -entry.depreciation_amount::numeric(19,2),
              journal.id::text
            FROM asset_depreciation_entries entry
            INNER JOIN fixed_assets asset
              ON asset.id =
                 entry.asset_id
             AND asset.company_id =
                 entry.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 entry.journal_id
             AND journal.company_id =
                 entry.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE entry.company_id =
                  $1
              AND entry.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              entry.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'depreciation_reversal',
              entry.depreciation_amount::numeric(19,2),
              journal.id::text
            FROM asset_depreciation_entries entry
            INNER JOIN fixed_assets asset
              ON asset.id =
                 entry.asset_id
             AND asset.company_id =
                 entry.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 entry.reversal_journal_id
             AND journal.company_id =
                 entry.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE entry.company_id =
                  $1
              AND entry.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              impairment.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'impairment',
              -impairment.impairment_amount::numeric(19,2),
              journal.id::text
            FROM asset_impairments impairment
            INNER JOIN fixed_assets asset
              ON asset.id =
                 impairment.asset_id
             AND asset.company_id =
                 impairment.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 impairment.journal_reference
             AND journal.company_id =
                 impairment.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE impairment.company_id =
                  $1
              AND impairment.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              impairment.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'impairment_reversal',
              impairment.impairment_amount::numeric(19,2),
              journal.id::text
            FROM asset_impairments impairment
            INNER JOIN fixed_assets asset
              ON asset.id =
                 impairment.asset_id
             AND asset.company_id =
                 impairment.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 impairment.reversal_journal_id
             AND journal.company_id =
                 impairment.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE impairment.company_id =
                  $1
              AND impairment.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              revaluation.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'revaluation',
              revaluation.change_amount::numeric(19,2),
              journal.id::text
            FROM asset_revaluations revaluation
            INNER JOIN fixed_assets asset
              ON asset.id =
                 revaluation.asset_id
             AND asset.company_id =
                 revaluation.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 revaluation.journal_id
             AND journal.company_id =
                 revaluation.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE revaluation.company_id =
                  $1
              AND revaluation.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              revaluation.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'revaluation_reversal',
              -revaluation.change_amount::numeric(19,2),
              journal.id::text
            FROM asset_revaluations revaluation
            INNER JOIN fixed_assets asset
              ON asset.id =
                 revaluation.asset_id
             AND asset.company_id =
                 revaluation.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 revaluation.reversal_journal_id
             AND journal.company_id =
                 revaluation.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE revaluation.company_id =
                  $1
              AND revaluation.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              disposal.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'disposal',
              -disposal.carrying_value::numeric(19,2),
              journal.id::text
            FROM asset_disposals disposal
            INNER JOIN fixed_assets asset
              ON asset.id =
                 disposal.asset_id
             AND asset.company_id =
                 disposal.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 disposal.journal_id
             AND journal.company_id =
                 disposal.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE disposal.company_id =
                  $1
              AND disposal.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              disposal.asset_id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ),
              journal.journal_date,
              'disposal_reversal',
              disposal.carrying_value::numeric(19,2),
              journal.id::text
            FROM asset_disposals disposal
            INNER JOIN fixed_assets asset
              ON asset.id =
                 disposal.asset_id
             AND asset.company_id =
                 disposal.company_id
             AND asset.deleted_at
                 IS NULL
            INNER JOIN journals journal
              ON journal.id =
                 disposal.reversal_journal_id
             AND journal.company_id =
                 disposal.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            WHERE disposal.company_id =
                  $1
              AND disposal.deleted_at
                  IS NULL
          )
          SELECT
            asset_id,
            asset_code,
            asset_name,
            category_name,
            event_date::text,
            event_type,
            amount::text,
            journal_id
          FROM lifecycle
          WHERE event_date <=
                $3::date
          ORDER BY
            event_date DESC,
            asset_code,
            event_type
          LIMIT 1500
        `,
        [
          context.companyId,
          from,
          to,
        ],
      );

    const rollforward =
      await client.query(
        `
          WITH lifecycle AS (
            SELECT
              journal.journal_date
                AS event_date,
              'addition'
                AS event_type,
              asset.acquisition_cost::numeric(19,2)
                AS amount
            FROM fixed_assets asset
            INNER JOIN journals journal
              ON journal.id =
                 asset.capitalization_journal_id
             AND journal.company_id =
                 asset.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE asset.company_id =
                  $1
              AND asset.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'capitalization_reversal',
              -asset.acquisition_cost::numeric(19,2)
            FROM fixed_assets asset
            INNER JOIN journals journal
              ON journal.id =
                 asset.capitalization_reversal_journal_id
             AND journal.company_id =
                 asset.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE asset.company_id =
                  $1
              AND asset.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'depreciation',
              -entry.depreciation_amount::numeric(19,2)
            FROM asset_depreciation_entries entry
            INNER JOIN journals journal
              ON journal.id =
                 entry.journal_id
             AND journal.company_id =
                 entry.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE entry.company_id =
                  $1
              AND entry.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'depreciation_reversal',
              entry.depreciation_amount::numeric(19,2)
            FROM asset_depreciation_entries entry
            INNER JOIN journals journal
              ON journal.id =
                 entry.reversal_journal_id
             AND journal.company_id =
                 entry.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE entry.company_id =
                  $1
              AND entry.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'impairment',
              -impairment.impairment_amount::numeric(19,2)
            FROM asset_impairments impairment
            INNER JOIN journals journal
              ON journal.id =
                 impairment.journal_reference
             AND journal.company_id =
                 impairment.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE impairment.company_id =
                  $1
              AND impairment.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'impairment_reversal',
              impairment.impairment_amount::numeric(19,2)
            FROM asset_impairments impairment
            INNER JOIN journals journal
              ON journal.id =
                 impairment.reversal_journal_id
             AND journal.company_id =
                 impairment.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE impairment.company_id =
                  $1
              AND impairment.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'revaluation',
              revaluation.change_amount::numeric(19,2)
            FROM asset_revaluations revaluation
            INNER JOIN journals journal
              ON journal.id =
                 revaluation.journal_id
             AND journal.company_id =
                 revaluation.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE revaluation.company_id =
                  $1
              AND revaluation.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'revaluation_reversal',
              -revaluation.change_amount::numeric(19,2)
            FROM asset_revaluations revaluation
            INNER JOIN journals journal
              ON journal.id =
                 revaluation.reversal_journal_id
             AND journal.company_id =
                 revaluation.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE revaluation.company_id =
                  $1
              AND revaluation.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'disposal',
              -disposal.carrying_value::numeric(19,2)
            FROM asset_disposals disposal
            INNER JOIN journals journal
              ON journal.id =
                 disposal.journal_id
             AND journal.company_id =
                 disposal.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE disposal.company_id =
                  $1
              AND disposal.deleted_at
                  IS NULL

            UNION ALL

            SELECT
              journal.journal_date,
              'disposal_reversal',
              disposal.carrying_value::numeric(19,2)
            FROM asset_disposals disposal
            INNER JOIN journals journal
              ON journal.id =
                 disposal.reversal_journal_id
             AND journal.company_id =
                 disposal.company_id
             AND journal.deleted_at
                 IS NULL
             AND journal.status =
                 'posted'
            WHERE disposal.company_id =
                  $1
              AND disposal.deleted_at
                  IS NULL
          )
          SELECT
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_date <
                        $2::date
                ),
              0
            )::text
              AS opening,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_type =
                        'addition'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS additions,
            COALESCE(
              -SUM(amount)
                FILTER (
                  WHERE event_type =
                        'capitalization_reversal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS capitalization_reversals,
            COALESCE(
              -SUM(amount)
                FILTER (
                  WHERE event_type =
                        'depreciation'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS depreciation,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_type =
                        'depreciation_reversal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS depreciation_reversals,
            COALESCE(
              -SUM(amount)
                FILTER (
                  WHERE event_type =
                        'impairment'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS impairments,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_type =
                        'impairment_reversal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS impairment_reversals,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_type =
                        'revaluation'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS revaluations,
            COALESCE(
              -SUM(amount)
                FILTER (
                  WHERE event_type =
                        'revaluation_reversal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS revaluation_reversals,
            COALESCE(
              -SUM(amount)
                FILTER (
                  WHERE event_type =
                        'disposal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS disposals,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_type =
                        'disposal_reversal'
                    AND event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS disposal_reversals,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_date
                        BETWEEN
                          $2::date
                          AND $3::date
                ),
              0
            )::text
              AS net_movement,
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE event_date <=
                        $3::date
                ),
              0
            )::text
              AS closing
          FROM lifecycle
        `,
        [
          context.companyId,
          from,
          to,
        ],
      );

    const [
      categories,
      register,
      schedule,
    ] =
      await Promise.all([
        client.query(
          `
            SELECT
              COALESCE(
                category.name,
                'Uncategorized'
              ) AS category_name,
              COUNT(*)::int
                AS asset_count,
              COALESCE(
                SUM(asset.acquisition_cost),
                0
              )::text
                AS gross_cost,
              COALESCE(
                SUM(asset.accumulated_depreciation),
                0
              )::text
                AS accumulated_depreciation,
              COALESCE(
                SUM(asset.accumulated_impairment),
                0
              )::text
                AS accumulated_impairment,
              COALESCE(
                SUM(asset.revaluation_adjustment),
                0
              )::text
                AS revaluation_adjustment,
              COALESCE(
                SUM(
                  asset.acquisition_cost +
                  asset.revaluation_adjustment -
                  asset.accumulated_depreciation -
                  asset.accumulated_impairment
                ),
                0
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
              AND NOT (
                asset.status =
                  'disposed'
                AND asset.disposal_reversal_journal_id
                    IS NULL
              )
            GROUP BY
              category.name
            ORDER BY
              category.name
                NULLS LAST
          `,
          [
            context.companyId,
          ],
        ),
        client.query(
          `
            SELECT
              asset.id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ) AS category_name,
              asset.acquisition_date::text,
              asset.capitalization_date::text,
              asset.in_service_date::text,
              asset.acquisition_cost::text,
              asset.salvage_value::text,
              asset.accumulated_depreciation::text,
              asset.accumulated_impairment::text,
              asset.revaluation_adjustment::text,
              (
                asset.acquisition_cost +
                asset.revaluation_adjustment -
                asset.accumulated_depreciation -
                asset.accumulated_impairment
              )::text AS carrying_value,
              asset.depreciation_method,
              asset.useful_life_months,
              asset.last_depreciation_date::text,
              asset.status,
              asset.source_module,
              asset.source_type,
              asset.source_reference
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
              asset.asset_code,
              asset.name
            LIMIT 3000
          `,
          [
            context.companyId,
          ],
        ),
        client.query(
          `
            SELECT
              asset.id::text,
              asset.asset_code,
              asset.name,
              COALESCE(
                category.name,
                'Uncategorized'
              ) AS category_name,
              asset.depreciation_start_date::text,
              asset.last_depreciation_date::text,
              asset.depreciation_method,
              COALESCE(
                asset.useful_life_months,
                category.default_useful_life_months
              ) AS useful_life_months,
              COUNT(entry.id)
                FILTER (
                  WHERE entry.status IN (
                    'active',
                    'posted'
                  )
                )::int
                  AS posted_periods,
              GREATEST(
                COALESCE(
                  asset.useful_life_months,
                  category.default_useful_life_months,
                  0
                ) -
                COUNT(entry.id)
                  FILTER (
                    WHERE entry.status IN (
                      'active',
                      'posted'
                    )
                  ),
                0
              )::int
                AS remaining_periods,
              asset.acquisition_cost::text,
              asset.salvage_value::text,
              asset.accumulated_depreciation::text,
              (
                asset.acquisition_cost +
                asset.revaluation_adjustment -
                asset.accumulated_depreciation -
                asset.accumulated_impairment
              )::text AS carrying_value,
              asset.status
            FROM fixed_assets asset
            LEFT JOIN asset_categories category
              ON category.id =
                 asset.category_id
             AND category.company_id =
                 asset.company_id
             AND category.deleted_at
                 IS NULL
            LEFT JOIN asset_depreciation_entries entry
              ON entry.asset_id =
                 asset.id
             AND entry.company_id =
                 asset.company_id
             AND entry.deleted_at
                 IS NULL
            WHERE asset.company_id =
                  $1
              AND asset.deleted_at
                  IS NULL
              AND asset.capitalization_journal_id
                  IS NOT NULL
              AND asset.capitalization_reversal_journal_id
                  IS NULL
              AND asset.status <>
                  'disposed'
            GROUP BY
              asset.id,
              category.name,
              category.default_useful_life_months
            ORDER BY
              asset.asset_code
          `,
          [
            context.companyId,
          ],
        ),
      ]);

    await client.query(
      'COMMIT',
    );

    const row =
      rollforward.rows[0] ||
      {};

    return {
      period: {
        from,
        to,
      },
      rollforward: {
        opening:
          decimal(
            row.opening,
          ),
        additions:
          decimal(
            row.additions,
          ),
        capitalizationReversals:
          decimal(
            row.capitalization_reversals,
          ),
        depreciation:
          decimal(
            row.depreciation,
          ),
        depreciationReversals:
          decimal(
            row.depreciation_reversals,
          ),
        impairments:
          decimal(
            row.impairments,
          ),
        impairmentReversals:
          decimal(
            row.impairment_reversals,
          ),
        revaluations:
          decimal(
            row.revaluations,
          ),
        revaluationReversals:
          decimal(
            row.revaluation_reversals,
          ),
        disposals:
          decimal(
            row.disposals,
          ),
        disposalReversals:
          decimal(
            row.disposal_reversals,
          ),
        netMovement:
          decimal(
            row.net_movement,
          ),
        closing:
          decimal(
            row.closing,
          ),
      },
      movements:
        movements.rows,
      categories:
        categories.rows,
      register:
        register.rows,
      schedule:
        schedule.rows,
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
