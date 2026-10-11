import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesOpportunityFunnelRow = {
  stageId: string;
  stageName: string;
  sequence: number;
  stageType: 'open' | 'won' | 'lost';
  stageProbability: number;
  currency: string;
  opportunityCount: number;
  pipelineValue: number;
  weightedPipelineValue: number;
  wonValue: number;
  lostValue: number;
};

export async function getSalesOpportunityFunnelData(): Promise<SalesOpportunityFunnelRow[]> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) return [];

  const result = await context.pool.query(
    `
      SELECT
        s.id AS stage_id,
        s.name AS stage_name,
        s.sequence,
        s.stage_type,
        s.probability AS stage_probability,
        UPPER(COALESCE(
          NULLIF(BTRIM(o.currency), ''),
          NULLIF(BTRIM($2::text), ''),
          'KES'
        )) AS currency,
        COUNT(o.id)::int AS opportunity_count,
        COALESCE(
          SUM(o.expected_value) FILTER (WHERE s.stage_type = 'open'),
          0
        ) AS pipeline_value,
        COALESCE(
          SUM(
            o.expected_value
            * LEAST(100, GREATEST(0, COALESCE(o.probability, s.probability, 0)))
            / 100.0
          ) FILTER (WHERE s.stage_type = 'open'),
          0
        ) AS weighted_pipeline_value,
        COALESCE(
          SUM(o.expected_value) FILTER (WHERE s.stage_type = 'won'),
          0
        ) AS won_value,
        COALESCE(
          SUM(o.expected_value) FILTER (WHERE s.stage_type = 'lost'),
          0
        ) AS lost_value
      FROM sales_pipeline_stages s
      INNER JOIN sales_opportunities o
        ON o.stage_id = s.id
        AND o.company_id = s.company_id
        AND o.company_id = $1
        AND o.deleted_at IS NULL
      WHERE s.company_id = $1
        AND s.deleted_at IS NULL
      GROUP BY s.id, s.name, s.sequence, s.stage_type, s.probability, currency
      ORDER BY s.sequence ASC, s.name ASC, currency ASC
    `,
    [context.companyId, context.company.currentCompany.currency],
  );

  return result.rows.map(row => ({
    stageId: String(row.stage_id),
    stageName: String(row.stage_name),
    sequence: Number(row.sequence || 0),
    stageType: String(row.stage_type) as 'open' | 'won' | 'lost',
    stageProbability: Number(row.stage_probability || 0),
    currency: String(row.currency || 'KES').toUpperCase(),
    opportunityCount: Number(row.opportunity_count || 0),
    pipelineValue: Number(row.pipeline_value || 0),
    weightedPipelineValue: Number(row.weighted_pipeline_value || 0),
    wonValue: Number(row.won_value || 0),
    lostValue: Number(row.lost_value || 0),
  }));
}
