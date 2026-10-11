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
  maxDaysInStage: number | null;
};

export type SalesPipelineVelocityReport = {
  transitions: SalesPipelineVelocityRow[];
};

export async function getSalesPipelineVelocityReport(): Promise<SalesPipelineVelocityReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) return { transitions: [] };

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
        WHERE created_at >= NOW() - INTERVAL '90 days'
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
        MAX(t.days_in_source_stage) AS max_days_in_stage
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
        percentile_cont(0.5) WITHIN GROUP (ORDER BY t.days_in_source_stage) DESC,
        COUNT(*) DESC,
        from_stage.name ASC,
        to_stage.name ASC
      LIMIT 15
    `,
    [context.companyId],
  );

  return {
    transitions: result.rows.map(row => ({
      fromStageId: String(row.from_stage_id),
      fromStageName: String(row.from_stage_name),
      toStageId: String(row.to_stage_id),
      toStageName: String(row.to_stage_name),
      transitionCount: Number(row.transition_count || 0),
      opportunityCount: Number(row.opportunity_count || 0),
      averageDaysInStage: row.average_days_in_stage == null ? null : Number(row.average_days_in_stage),
      medianDaysInStage: row.median_days_in_stage == null ? null : Number(row.median_days_in_stage),
      maxDaysInStage: row.max_days_in_stage == null ? null : Number(row.max_days_in_stage),
    })),
  };
}
