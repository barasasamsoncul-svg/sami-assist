import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

export type SalesRepresentativePerformanceRow = {
  representativeId: string | null;
  representativeName: string;
  currency: string;
  openOpportunityCount: number;
  openPipelineValue: number;
  weightedPipelineValue: number;
  overdueOpportunityCount: number;
  wonCount90Days: number;
  wonValue90Days: number;
  lostCount90Days: number;
  lostValue90Days: number;
  closedCount90Days: number;
  winRate90Days: number | null;
  averageDaysToWin90Days: number | null;
};

export type SalesRepresentativePerformanceReport = {
  rows: SalesRepresentativePerformanceRow[];
  windowDays: number;
  asOf: string;
};

const REPORT_WINDOW_DAYS = 90;
const EMPTY_ROWS: SalesRepresentativePerformanceRow[] = [];

export async function getSalesRepresentativePerformance(): Promise<SalesRepresentativePerformanceReport> {
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
    return { rows: EMPTY_ROWS, windowDays: REPORT_WINDOW_DAYS, asOf };
  }

  const result = await context.pool.query(
    `
      SELECT
        o.salesperson_user_id::text AS representative_id,
        UPPER(COALESCE(
          NULLIF(BTRIM(o.currency), ''),
          NULLIF(BTRIM($2::text), ''),
          'KES'
        )) AS currency,
        COUNT(*) FILTER (WHERE s.stage_type = 'open')::int AS open_opportunity_count,
        COALESCE(
          SUM(o.expected_value) FILTER (WHERE s.stage_type = 'open'),
          0
        ) AS open_pipeline_value,
        COALESCE(
          SUM(
            o.expected_value *
            LEAST(100, GREATEST(0, COALESCE(o.probability, s.probability, 0))) / 100.0
          ) FILTER (WHERE s.stage_type = 'open'),
          0
        ) AS weighted_pipeline_value,
        COUNT(*) FILTER (
          WHERE s.stage_type = 'open'
            AND o.expected_close_date < CURRENT_DATE
        )::int AS overdue_opportunity_count,
        COUNT(*) FILTER (
          WHERE s.stage_type = 'won'
            AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day')
        )::int AS won_count_90_days,
        COALESCE(
          SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'won'
              AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day')
          ),
          0
        ) AS won_value_90_days,
        COUNT(*) FILTER (
          WHERE s.stage_type = 'lost'
            AND o.lost_at >= NOW() - ($3::int * INTERVAL '1 day')
        )::int AS lost_count_90_days,
        COALESCE(
          SUM(o.expected_value) FILTER (
            WHERE s.stage_type = 'lost'
              AND o.lost_at >= NOW() - ($3::int * INTERVAL '1 day')
          ),
          0
        ) AS lost_value_90_days,
        COUNT(*) FILTER (
          WHERE (s.stage_type = 'won'
                 AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day'))
             OR (s.stage_type = 'lost'
                 AND o.lost_at >= NOW() - ($3::int * INTERVAL '1 day'))
        )::int AS closed_count_90_days,
        ROUND(
          100.0 * COUNT(*) FILTER (
            WHERE s.stage_type = 'won'
              AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day')
          )
          / NULLIF(
            COUNT(*) FILTER (
              WHERE (s.stage_type = 'won'
                     AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day'))
                 OR (s.stage_type = 'lost'
                     AND o.lost_at >= NOW() - ($3::int * INTERVAL '1 day'))
            ),
            0
          ),
          1
        ) AS win_rate_90_days,
        AVG(
          GREATEST(0, EXTRACT(EPOCH FROM (o.won_at - o.created_at)) / 86400.0)
        ) FILTER (
          WHERE s.stage_type = 'won'
            AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day')
        ) AS average_days_to_win_90_days
      FROM sales_opportunities o
      INNER JOIN sales_pipeline_stages s
        ON s.id = o.stage_id AND s.company_id = o.company_id
      WHERE o.company_id = $1
        AND o.deleted_at IS NULL
        AND s.deleted_at IS NULL
        AND (
          s.stage_type = 'open'
          OR (s.stage_type = 'won'
              AND o.won_at >= NOW() - ($3::int * INTERVAL '1 day'))
          OR (s.stage_type = 'lost'
              AND o.lost_at >= NOW() - ($3::int * INTERVAL '1 day'))
        )
      GROUP BY o.salesperson_user_id, currency
      ORDER BY
        currency,
        weighted_pipeline_value DESC,
        open_pipeline_value DESC,
        representative_id NULLS LAST
    `,
    [context.companyId, context.company.currentCompany.currency, REPORT_WINDOW_DAYS],
  );

  const representativeIds = Array.from(
    new Set(
      result.rows
        .map((row) => (row.representative_id == null ? null : String(row.representative_id)))
        .filter((id): id is string => id !== null),
    ),
  );

  let userRows: Array<{ user_id: string; name: string }> = [];
  if (representativeIds.length > 0) {
    const users = await queryControl(
      `SELECT tu.user_id::text AS user_id,
              COALESCE(
                NULLIF(BTRIM(COALESCE(u.full_name,'')),''),
                NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)),''),
                u.email
              ) AS name
       FROM tenant_users tu
       INNER JOIN users u ON u.id = tu.user_id
       WHERE tu.tenant_id = $1
         AND tu.user_id = ANY($2::uuid[])
         AND tu.status = 'active'
         AND tu.member_type = 'internal'
         AND tu.deleted_at IS NULL
         AND u.deleted_at IS NULL`,
      [context.tenantId, representativeIds],
    );
    userRows = users.rows.map((row) => ({
      user_id: String(row.user_id),
      name: String(row.name || 'Sales representative'),
    }));
  }

  const names = new Map(userRows.map((row) => [row.user_id, row.name]));

  return {
    rows: result.rows.map((row) => {
      const id = row.representative_id == null ? null : String(row.representative_id);
      return {
        representativeId: id,
        representativeName:
          id === null ? 'Unassigned' : names.get(id) || 'Inactive or unavailable user',
        currency: String(row.currency || companyCurrency).toUpperCase(),
        openOpportunityCount: Number(row.open_opportunity_count || 0),
        openPipelineValue: Number(row.open_pipeline_value || 0),
        weightedPipelineValue: Number(row.weighted_pipeline_value || 0),
        overdueOpportunityCount: Number(row.overdue_opportunity_count || 0),
        wonCount90Days: Number(row.won_count_90_days || 0),
        wonValue90Days: Number(row.won_value_90_days || 0),
        lostCount90Days: Number(row.lost_count_90_days || 0),
        lostValue90Days: Number(row.lost_value_90_days || 0),
        closedCount90Days: Number(row.closed_count_90_days || 0),
        winRate90Days:
          row.win_rate_90_days == null ? null : Number(row.win_rate_90_days),
        averageDaysToWin90Days:
          row.average_days_to_win_90_days == null
            ? null
            : Number(row.average_days_to_win_90_days),
      };
    }),
    windowDays: REPORT_WINDOW_DAYS,
    asOf,
  };
}