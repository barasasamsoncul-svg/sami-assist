import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesLeadSourceSummaryRow = {
  source: string;
  leadCount: number;
  newCount: number;
  contactedCount: number;
  qualifiedCount: number;
  convertedCount: number;
  disqualifiedCount: number;
  conversionRate: number;
  averageDaysToConvert: number | null;
};

export type SalesLeadSourceValueRow = {
  source: string;
  currency: string;
  opportunityCount: number;
  openOpportunityCount: number;
  openPipelineValue: number;
  weightedPipelineValue: number;
  overdueOpportunityCount: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
};

export type SalesLeadSourceEffectivenessReport = {
  canViewReports: boolean;
  windowDays: number;
  sourceLimit: number;
  asOf: string;
  sources: SalesLeadSourceSummaryRow[];
  values: SalesLeadSourceValueRow[];
};

const REPORT_WINDOW_DAYS = 90;
const SOURCE_LIMIT = 30;

const EMPTY_REPORT: SalesLeadSourceEffectivenessReport = {
  canViewReports: false,
  windowDays: REPORT_WINDOW_DAYS,
  sourceLimit: SOURCE_LIMIT,
  asOf: '',
  sources: [],
  values: [],
};

function roundTenths(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
}

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getSalesLeadSourceEffectiveness(): Promise<SalesLeadSourceEffectivenessReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const asOf = new Date().toISOString();
  const companyCurrency = String(
    context.company.currentCompany.currency || 'KES',
  ).toUpperCase();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) {
    return { ...EMPTY_REPORT, asOf };
  }

  const [sourceResult, valueResult] = await Promise.all([
    context.pool.query(
      `
        WITH lead_cohort AS (
          SELECT
            l.id,
            COALESCE(NULLIF(BTRIM(l.source), ''), 'Unspecified') AS source,
            l.status,
            l.created_at,
            l.converted_opportunity_id
          FROM sales_leads l
          WHERE l.company_id = $1
            AND l.deleted_at IS NULL
            AND l.created_at >= NOW() - ($2::int * INTERVAL '1 day')
        )
        SELECT
          l.source,
          COUNT(*)::int AS lead_count,
          COUNT(*) FILTER (WHERE l.status = 'new')::int AS new_count,
          COUNT(*) FILTER (WHERE l.status = 'contacted')::int AS contacted_count,
          COUNT(*) FILTER (WHERE l.status = 'qualified')::int AS qualified_count,
          COUNT(*) FILTER (WHERE l.status = 'converted')::int AS converted_count,
          COUNT(*) FILTER (WHERE l.status = 'disqualified')::int AS disqualified_count,
          ROUND(
            100.0 * COUNT(*) FILTER (WHERE l.status = 'converted')
              / NULLIF(COUNT(*), 0),
            1
          ) AS conversion_rate,
          ROUND(
            AVG(
              GREATEST(0, EXTRACT(EPOCH FROM (o.created_at - l.created_at)) / 86400.0)
            ) FILTER (
              WHERE l.status = 'converted' AND o.created_at IS NOT NULL
            )::numeric,
            1
          ) AS average_days_to_convert
        FROM lead_cohort l
        LEFT JOIN sales_opportunities o
          ON o.id = l.converted_opportunity_id
         AND o.company_id = $1
         AND o.deleted_at IS NULL
        GROUP BY l.source
        ORDER BY lead_count DESC, conversion_rate DESC, l.source ASC
        LIMIT $3
      `,
      [context.companyId, REPORT_WINDOW_DAYS, SOURCE_LIMIT],
    ),
    context.pool.query(
      `
        WITH lead_cohort AS (
          SELECT
            l.id,
            COALESCE(NULLIF(BTRIM(l.source), ''), 'Unspecified') AS source,
            l.converted_opportunity_id
          FROM sales_leads l
          WHERE l.company_id = $1
            AND l.deleted_at IS NULL
            AND l.created_at >= NOW() - ($2::int * INTERVAL '1 day')
        )
        SELECT
          l.source,
          UPPER(COALESCE(
            NULLIF(BTRIM(o.currency), ''),
            NULLIF(BTRIM($3::text), ''),
            'KES'
          )) AS currency,
          COUNT(o.id)::int AS opportunity_count,
          COUNT(o.id) FILTER (WHERE s.stage_type = 'open')::int AS open_opportunity_count,
          COALESCE(SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'open'
          ), 0) AS open_pipeline_value,
          COALESCE(SUM(
            o.expected_value
            * LEAST(100, GREATEST(0, COALESCE(o.probability, s.probability, 0)))
            / 100.0
          ) FILTER (WHERE s.stage_type = 'open'), 0) AS weighted_pipeline_value,
          COUNT(o.id) FILTER (
            WHERE s.stage_type = 'open'
              AND o.expected_close_date < CURRENT_DATE
          )::int AS overdue_opportunity_count,
          COUNT(o.id) FILTER (WHERE s.stage_type = 'won')::int AS won_count,
          COALESCE(SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'won'
          ), 0) AS won_value,
          COUNT(o.id) FILTER (WHERE s.stage_type = 'lost')::int AS lost_count,
          COALESCE(SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'lost'
          ), 0) AS lost_value
        FROM lead_cohort l
        LEFT JOIN sales_opportunities o
          ON o.id = l.converted_opportunity_id
         AND o.company_id = $1
         AND o.deleted_at IS NULL
        LEFT JOIN sales_pipeline_stages s
          ON s.id = o.stage_id
         AND s.company_id = o.company_id
         AND s.deleted_at IS NULL
        GROUP BY l.source, currency
        ORDER BY l.source ASC, currency ASC
      `,
      [
        context.companyId,
        REPORT_WINDOW_DAYS,
        context.company.currentCompany.currency,
      ],
    ),
  ]);

  return {
    canViewReports: true,
    windowDays: REPORT_WINDOW_DAYS,
    sourceLimit: SOURCE_LIMIT,
    asOf,
    sources: sourceResult.rows.map((row) => ({
      source: String(row.source || 'Unspecified'),
      leadCount: toNum(row.lead_count),
      newCount: toNum(row.new_count),
      contactedCount: toNum(row.contacted_count),
      qualifiedCount: toNum(row.qualified_count),
      convertedCount: toNum(row.converted_count),
      disqualifiedCount: toNum(row.disqualified_count),
      conversionRate: toNum(row.conversion_rate),
      averageDaysToConvert: roundTenths(row.average_days_to_convert),
    })),
    values: valueResult.rows.map((row) => ({
      source: String(row.source || 'Unspecified'),
      currency: String(row.currency || companyCurrency).toUpperCase(),
      opportunityCount: toNum(row.opportunity_count),
      openOpportunityCount: toNum(row.open_opportunity_count),
      openPipelineValue: toNum(row.open_pipeline_value),
      weightedPipelineValue: toNum(row.weighted_pipeline_value),
      overdueOpportunityCount: toNum(row.overdue_opportunity_count),
      wonCount: toNum(row.won_count),
      wonValue: toNum(row.won_value),
      lostCount: toNum(row.lost_count),
      lostValue: toNum(row.lost_value),
    })),
  };
}