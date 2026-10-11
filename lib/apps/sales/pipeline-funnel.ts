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
  overdueOpportunityCount: number;
  overdueValue: number;
  staleOpportunityCount: number;
  staleValue: number;
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
        ) AS lost_value,
        COUNT(o.id) FILTER (
          WHERE s.stage_type = 'open'
            AND o.expected_close_date < CURRENT_DATE
        )::int AS overdue_opportunity_count,
        COALESCE(
          SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'open'
              AND o.expected_close_date < CURRENT_DATE
          ),
          0
        ) AS overdue_value,
        COUNT(o.id) FILTER (
          WHERE s.stage_type = 'open'
            AND COALESCE(stage_age.last_stage_at, o.created_at) < NOW() - INTERVAL '30 days'
        )::int AS stale_opportunity_count,
        COALESCE(
          SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'open'
              AND COALESCE(stage_age.last_stage_at, o.created_at) < NOW() - INTERVAL '30 days'
          ),
          0
        ) AS stale_value
      FROM sales_pipeline_stages s
      LEFT JOIN sales_opportunities o
        ON o.stage_id = s.id
        AND o.company_id = s.company_id
        AND o.company_id = $1
        AND o.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT MAX(h.created_at) AS last_stage_at
        FROM sales_opportunity_stage_history h
        WHERE h.company_id = o.company_id
          AND h.opportunity_id = o.id
          AND h.to_stage_id = o.stage_id
      ) stage_age ON TRUE
      WHERE s.company_id = $1
        AND s.deleted_at IS NULL
      GROUP BY s.id, s.name, s.sequence, s.stage_type, s.probability,
        UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), NULLIF(BTRIM($2::text), ''), 'KES'))
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
    overdueOpportunityCount: Number(row.overdue_opportunity_count || 0),
    overdueValue: Number(row.overdue_value || 0),
    staleOpportunityCount: Number(row.stale_opportunity_count || 0),
    staleValue: Number(row.stale_value || 0),
  }));
}


export type SalesOpportunityRiskRow = {
  opportunityId: string;
  opportunityNumber: string;
  opportunityName: string;
  customerName: string;
  stageName: string;
  currency: string;
  expectedValue: number;
  probability: number;
  expectedCloseDate: string | null;
  salespersonName: string;
  daysInStage: number;
  overdue: boolean;
  missingCloseDate: boolean;
  stale: boolean;
};

export async function getSalesOpportunityRiskQueue(): Promise<SalesOpportunityRiskRow[]> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) return [];

  const result = await context.pool.query(
    \`
      SELECT
        o.id AS opportunity_id,
        o.opportunity_number,
        o.name AS opportunity_name,
        COALESCE(NULLIF(BTRIM(o.customer_name), ''), NULLIF(BTRIM(o.contact_name), ''), 'Customer not set') AS customer_name,
        s.name AS stage_name,
        UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), 'KES')) AS currency,
        o.expected_value,
        o.probability,
        o.expected_close_date::text AS expected_close_date,
        COALESCE(owner.name, 'Unassigned') AS salesperson_name,
        GREATEST(
          0,
          FLOOR(EXTRACT(EPOCH FROM (NOW() - COALESCE(stage_age.last_stage_at, o.created_at))) / 86400)
        )::int AS days_in_stage,
        (o.expected_close_date < CURRENT_DATE) AS overdue,
        (o.expected_close_date IS NULL) AS missing_close_date,
        (COALESCE(stage_age.last_stage_at, o.created_at) < NOW() - INTERVAL '30 days') AS stale
      FROM sales_opportunities o
      INNER JOIN sales_pipeline_stages s
        ON s.id = o.stage_id
        AND s.company_id = o.company_id
      LEFT JOIN LATERAL (
        SELECT MAX(h.created_at) AS last_stage_at
        FROM sales_opportunity_stage_history h
        WHERE h.company_id = o.company_id
          AND h.opportunity_id = o.id
          AND h.to_stage_id = o.stage_id
      ) stage_age ON TRUE
      LEFT JOIN (
        SELECT
          tu.user_id,
          COALESCE(
            NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
            u.email
          ) AS name
        FROM tenant_users tu
        INNER JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $2
          AND tu.status = 'active'
          AND tu.member_type = 'internal'
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
      ) owner ON owner.user_id = o.salesperson_user_id
      WHERE o.company_id = $1
        AND o.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND s.stage_type = 'open'
        AND (
          o.expected_close_date < CURRENT_DATE
          OR o.expected_close_date IS NULL
          OR COALESCE(stage_age.last_stage_at, o.created_at) < NOW() - INTERVAL '30 days'
        )
      ORDER BY
        CASE
          WHEN o.expected_close_date < CURRENT_DATE THEN 0
          WHEN COALESCE(stage_age.last_stage_at, o.created_at) < NOW() - INTERVAL '30 days' THEN 1
          WHEN o.expected_close_date IS NULL THEN 2
          ELSE 3
        END,
        o.expected_close_date ASC NULLS LAST,
        days_in_stage DESC,
        o.expected_value DESC,
        o.id ASC
      LIMIT 50
    \`,
    [context.companyId, context.tenantId],
  );

  return result.rows.map(row => ({
    opportunityId: String(row.opportunity_id),
    opportunityNumber: String(row.opportunity_number),
    opportunityName: String(row.opportunity_name),
    customerName: String(row.customer_name || 'Customer not set'),
    stageName: String(row.stage_name),
    currency: String(row.currency || 'KES').toUpperCase(),
    expectedValue: Number(row.expected_value || 0),
    probability: Number(row.probability || 0),
    expectedCloseDate: row.expected_close_date ? String(row.expected_close_date).slice(0, 10) : null,
    salespersonName: String(row.salesperson_name || 'Unassigned'),
    daysInStage: Number(row.days_in_stage || 0),
    overdue: row.overdue === true,
    missingCloseDate: row.missing_close_date === true,
    stale: row.stale === true,
  }));
}
