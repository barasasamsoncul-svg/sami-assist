import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesPipelineOutcomeSummary = {
  currency: string;
  closedCount: number;
  wonCount: number;
  lostCount: number;
  winRate: number | null;
  wonValue: number;
  lostValue: number;
  averageDaysToWin: number | null;
  medianDaysToWin: number | null;
  averageDaysToLose: number | null;
};

export type SalesPipelineLossReason = {
  currency: string;
  reason: string;
  opportunityCount: number;
  lostValue: number;
};

export type SalesPipelineOutcomeReport = {
  summaries: SalesPipelineOutcomeSummary[];
  lossReasons: SalesPipelineLossReason[];
};

export async function getSalesPipelineOutcomeReport(): Promise<SalesPipelineOutcomeReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) return { summaries: [], lossReasons: [] };

  const [summaryResult, lossReasonResult] = await Promise.all([
    context.pool.query(
      `
        SELECT
          UPPER(COALESCE(
            NULLIF(BTRIM(o.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
          COUNT(*) FILTER (WHERE s.stage_type IN ('won', 'lost'))::int AS closed_count,
          COUNT(*) FILTER (WHERE s.stage_type = 'won' AND o.won_at IS NOT NULL)::int AS won_count,
          COUNT(*) FILTER (WHERE s.stage_type = 'lost' AND o.lost_at IS NOT NULL)::int AS lost_count,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE s.stage_type = 'won' AND o.won_at IS NOT NULL)
            / NULLIF(COUNT(*) FILTER (
                WHERE (s.stage_type = 'won' AND o.won_at IS NOT NULL)
                   OR (s.stage_type = 'lost' AND o.lost_at IS NOT NULL)
              ), 0),
            1
          ) AS win_rate,
          COALESCE(SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'won' AND o.won_at IS NOT NULL
          ), 0) AS won_value,
          COALESCE(SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'lost' AND o.lost_at IS NOT NULL
          ), 0) AS lost_value,
          AVG(
            GREATEST(0, EXTRACT(EPOCH FROM (o.won_at - o.created_at)) / 86400.0)
          ) FILTER (
            WHERE s.stage_type = 'won' AND o.won_at IS NOT NULL
          ) AS average_days_to_win,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY GREATEST(0, EXTRACT(EPOCH FROM (o.won_at - o.created_at)) / 86400.0)
          ) FILTER (
            WHERE s.stage_type = 'won' AND o.won_at IS NOT NULL
          ) AS median_days_to_win,
          AVG(
            GREATEST(0, EXTRACT(EPOCH FROM (o.lost_at - o.created_at)) / 86400.0)
          ) FILTER (
            WHERE s.stage_type = 'lost' AND o.lost_at IS NOT NULL
          ) AS average_days_to_lose
        FROM sales_opportunities o
        INNER JOIN sales_pipeline_stages s
          ON s.id = o.stage_id
          AND s.company_id = o.company_id
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          AND s.deleted_at IS NULL
          AND (
            (s.stage_type = 'won' AND o.won_at >= NOW() - INTERVAL '90 days')
            OR (s.stage_type = 'lost' AND o.lost_at >= NOW() - INTERVAL '90 days')
          )
        GROUP BY 1
        ORDER BY currency
      `,
      [context.companyId, context.company.currentCompany.currency],
    ),
    context.pool.query(
      `
        WITH lost_opportunities AS (
          SELECT
            UPPER(COALESCE(
              NULLIF(BTRIM(o.currency), ''),
              NULLIF(BTRIM($2::text), ''),
              'KES'
            )) AS currency,
            COALESCE(NULLIF(BTRIM(o.lost_reason), ''), 'Reason not recorded') AS reason,
            o.expected_value
          FROM sales_opportunities o
          INNER JOIN sales_pipeline_stages s
            ON s.id = o.stage_id
            AND s.company_id = o.company_id
          WHERE o.company_id = $1
            AND o.deleted_at IS NULL
            AND s.deleted_at IS NULL
            AND s.stage_type = 'lost'
            AND o.lost_at >= NOW() - INTERVAL '90 days'
        ),
        ranked_reasons AS (
          SELECT
            currency,
            reason,
            COUNT(*)::int AS opportunity_count,
            COALESCE(SUM(expected_value), 0) AS lost_value,
            ROW_NUMBER() OVER (
              PARTITION BY currency
              ORDER BY COUNT(*) DESC, SUM(expected_value) DESC, reason ASC
            ) AS reason_rank
          FROM lost_opportunities
          GROUP BY currency, reason
        )
        SELECT currency, reason, opportunity_count, lost_value
        FROM ranked_reasons
        WHERE reason_rank <= 5
        ORDER BY currency, opportunity_count DESC, lost_value DESC, reason ASC
      `,
      [context.companyId, context.company.currentCompany.currency],
    ),
  ]);

  return {
    summaries: summaryResult.rows.map(row => ({
      currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
      closedCount: Number(row.closed_count || 0),
      wonCount: Number(row.won_count || 0),
      lostCount: Number(row.lost_count || 0),
      winRate: row.win_rate == null ? null : Number(row.win_rate),
      wonValue: Number(row.won_value || 0),
      lostValue: Number(row.lost_value || 0),
      averageDaysToWin: row.average_days_to_win == null ? null : Number(row.average_days_to_win),
      medianDaysToWin: row.median_days_to_win == null ? null : Number(row.median_days_to_win),
      averageDaysToLose: row.average_days_to_lose == null ? null : Number(row.average_days_to_lose),
    })),
    lossReasons: lossReasonResult.rows.map(row => ({
      currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
      reason: String(row.reason || 'Reason not recorded'),
      opportunityCount: Number(row.opportunity_count || 0),
      lostValue: Number(row.lost_value || 0),
    })),
  };
}
