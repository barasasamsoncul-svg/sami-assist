import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesPipelineVelocityRow = {
  fromStageId: string;
  fromStageName: string;
  toStageId: string;
  toStageName: string;
  transitionCount: number;
  opportunityCount: number;
  averageDaysInStage: number | null;
  medianDaysInStage: number | null;
  p90DaysInStage: number | null;
  maxDaysInStage: number | null;
  weightedDaysInStage: number | null;
};

export type SalesPipelineVelocityReport = {
  canViewReports: boolean;
  windowDays: number;
  limit: number;
  asOf: string;
  transitions: SalesPipelineVelocityRow[];
};

const REPORT_WINDOW_DAYS = 90;
const ROW_LIMIT = 15;

const EMPTY_REPORT: SalesPipelineVelocityReport = {
  canViewReports: false,
  windowDays: REPORT_WINDOW_DAYS,
  limit: ROW_LIMIT,
  asOf: '',
  transitions: [],
};

function roundTenths(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

export async function getSalesPipelineVelocityReport(): Promise<SalesPipelineVelocityReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const asOf = new Date().toISOString();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  if (!canViewReports) {
    return { ...EMPTY_REPORT, asOf };
  }

  const result = await context.pool.query(
    `
      WITH ordered_history AS (
        SELECT
          h.company_id,
          h.opportunity_id,
          h.from_stage_id,
          h.to_stage_id,
          h.created_at,
          o.created_at AS opportunity_created_at,
          LAG(h.created_at) OVER (
            PARTITION BY h.company_id, h.opportunity_id
            ORDER BY h.created_at, h.id
          ) AS previous_change_at,
          LAG(h.to_stage_id) OVER (
            PARTITION BY h.company_id, h.opportunity_id
            ORDER BY h.created_at, h.id
          ) AS previous_to_stage_id
        FROM sales_opportunity_stage_history h
        INNER JOIN sales_opportunities o
          ON o.id = h.opportunity_id
         AND o.company_id = h.company_id
         AND o.deleted_at IS NULL
        WHERE h.company_id = $1
      ),
      transitions AS (
        SELECT
          opportunity_id,
          from_stage_id,
          to_stage_id,
          GREATEST(
            0,
            EXTRACT(EPOCH FROM (
              created_at - COALESCE(
                CASE
                  WHEN previous_to_stage_id = from_stage_id THEN previous_change_at
                  ELSE NULL
                END,
                opportunity_created_at
              )
            )) / 86400.0
          ) AS days_in_source_stage
        FROM ordered_history
        WHERE created_at >= NOW() - ($2::int * INTERVAL '1 day')
          AND from_stage_id IS NOT NULL
          AND from_stage_id <> to_stage_id
      )
      SELECT
        from_stage.id AS from_stage_id,
        from_stage.name AS from_stage_name,
        to_stage.id AS to_stage_id,
        to_stage.name AS to_stage_name,
        COUNT(*)::int AS transition_count,
        COUNT(DISTINCT t.opportunity_id)::int AS opportunity_count,
        ROUND(AVG(t.days_in_source_stage)::numeric, 1) AS average_days_in_stage,
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY t.days_in_source_stage
        ) AS median_days_in_stage,
        percentile_cont(0.9) WITHIN GROUP (
          ORDER BY t.days_in_source_stage
        ) AS p90_days_in_stage,
        MAX(t.days_in_source_stage) AS max_days_in_stage,
        ROUND(
          (
            SUM(t.days_in_source_stage) /
            NULLIF(COUNT(DISTINCT t.opportunity_id), 0)
          )::numeric,
          1
        ) AS weighted_days_in_stage
      FROM transitions t
      INNER JOIN sales_pipeline_stages from_stage
        ON from_stage.id = t.from_stage_id
       AND from_stage.company_id = $1
       AND from_stage.deleted_at IS NULL
      INNER JOIN sales_pipeline_stages to_stage
        ON to_stage.id = t.to_stage_id
       AND to_stage.company_id = $1
       AND to_stage.deleted_at IS NULL
      GROUP BY from_stage.id, from_stage.name, to_stage.id, to_stage.name
      ORDER BY
        percentile_cont(0.5) WITHIN GROUP (
          ORDER BY t.days_in_source_stage
        ) DESC,
        COUNT(*) DESC,
        from_stage.name ASC,
        to_stage.name ASC
      LIMIT $3
    `,
    [context.companyId, REPORT_WINDOW_DAYS, ROW_LIMIT],
  );

  return {
    canViewReports: true,
    windowDays: REPORT_WINDOW_DAYS,
    limit: ROW_LIMIT,
    asOf,
    transitions: result.rows.map((row) => ({
      fromStageId: String(row.from_stage_id),
      fromStageName: String(row.from_stage_name),
      toStageId: String(row.to_stage_id),
      toStageName: String(row.to_stage_name),
      transitionCount: Number(row.transition_count || 0),
      opportunityCount: Number(row.opportunity_count || 0),
      averageDaysInStage: roundTenths(row.average_days_in_stage),
      medianDaysInStage: roundTenths(row.median_days_in_stage),
      p90DaysInStage: roundTenths(row.p90_days_in_stage),
      maxDaysInStage: roundTenths(row.max_days_in_stage),
      weightedDaysInStage: roundTenths(row.weighted_days_in_stage),
    })),
  };
}