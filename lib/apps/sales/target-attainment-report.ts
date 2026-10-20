import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

export type SalesTargetAttainmentStatus =
  | 'scheduled'
  | 'on_track'
  | 'at_risk'
  | 'achieved'
  | 'missed';

export type SalesTargetAttainmentRow = {
  id: string;
  targetScope: 'company' | 'team' | 'user';
  teamId: string | null;
  teamName: string | null;
  userId: string | null;
  salespersonName: string | null;
  metric: 'revenue' | 'margin' | 'orders';
  periodStart: string;
  periodEnd: string;
  targetValue: number;
  actualValue: number;
  attainmentPercent: number;
  elapsedPercent: number;
  status: SalesTargetAttainmentStatus;
  notes: string | null;
};

export type SalesTargetAttainmentReport = {
  companyCurrency: string;
  canViewTargets: boolean;
  rows: SalesTargetAttainmentRow[];
};

const EMPTY_REPORT: SalesTargetAttainmentReport = {
  companyCurrency: 'KES',
  canViewTargets: false,
  rows: [],
};

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function dateOnly(value: unknown): string {
  return value == null ? '' : String(value).slice(0, 10);
}

function roundTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function percent(actual: number, target: number): number {
  if (target <= 0) return actual > 0 ? 100 : 0;
  return roundTenths((actual / target) * 100);
}

function attainmentStatus(
  actual: number,
  target: number,
  start: string,
  end: string,
  today: string,
): {
  status: SalesTargetAttainmentStatus;
  elapsedPercent: number;
  attainmentPercent: number;
} {
  const startMs = Date.parse(start + 'T00:00:00Z');
  const endMs = Date.parse(end + 'T00:00:00Z');
  const todayMs = Date.parse(today + 'T00:00:00Z');
  const periodDays = Math.max(1, Math.floor((endMs - startMs) / 86_400_000) + 1);
  const elapsedDays = Math.max(
    0,
    Math.min(periodDays, Math.floor((todayMs - startMs) / 86_400_000) + 1),
  );
  const elapsedPercent = roundTenths((elapsedDays / periodDays) * 100);
  const attainmentPercent = percent(actual, target);

  if (todayMs < startMs) {
    return { status: 'scheduled', elapsedPercent: 0, attainmentPercent };
  }
  if (todayMs > endMs) {
    return {
      status: actual >= target ? 'achieved' : 'missed',
      elapsedPercent: 100,
      attainmentPercent,
    };
  }
  if (target <= 0 || attainmentPercent >= elapsedPercent) {
    return { status: 'on_track', elapsedPercent, attainmentPercent };
  }
  return { status: 'at_risk', elapsedPercent, attainmentPercent };
}

/* -------------------------------------------------------------------------- */
/*  Report                                                                    */
/* -------------------------------------------------------------------------- */

export async function getSalesTargetAttainmentReport(): Promise<SalesTargetAttainmentReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const companyCurrency = String(
    context.company.currentCompany.currency || 'KES',
  ).toUpperCase();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  const canViewTargets =
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.TARGET_VIEW,
    ) ||
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.TARGET_MANAGE,
    );

  if (!canViewReports || !canViewTargets) {
    return { ...EMPTY_REPORT, companyCurrency, canViewTargets: false };
  }

  const result = await context.pool.query(
    `
      SELECT
        target.id::text AS id,
        target.target_scope,
        target.team_id::text AS team_id,
        CASE
          WHEN target.target_scope = 'team'
            THEN COALESCE(NULLIF(BTRIM(team.name), ''), 'Inactive or unavailable team')
          ELSE NULL
        END AS team_name,
        target.user_id::text AS user_id,
        target.metric,
        target.period_start,
        target.period_end,
        CURRENT_DATE AS today,
        target.target_value,
        target.notes,
        COALESCE(actuals.order_count, 0)::numeric AS order_count,
        COALESCE(actuals.revenue_actual, 0)::numeric AS revenue_actual,
        COALESCE(actuals.margin_actual, 0)::numeric AS margin_actual
      FROM sales_targets target
      LEFT JOIN sales_teams team
        ON team.id = target.team_id
       AND team.company_id = target.company_id
       AND team.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::numeric AS order_count,
          COALESCE(SUM(ROUND(
            (sales_order.subtotal - sales_order.discount_total)
            * COALESCE(sales_order.exchange_rate, 1),
            2
          )), 0) AS revenue_actual,
          COALESCE(SUM(ROUND(
            COALESCE(sales_order.margin_amount, 0)
            * COALESCE(sales_order.exchange_rate, 1),
            2
          )), 0) AS margin_actual
        FROM sales_orders_v2 sales_order
        WHERE sales_order.company_id = target.company_id
          AND sales_order.deleted_at IS NULL
          AND sales_order.status IN ('confirmed', 'closed')
          AND sales_order.order_date
              BETWEEN target.period_start AND LEAST(target.period_end, CURRENT_DATE)
          AND (
            target.target_scope = 'company'
            OR (target.target_scope = 'team' AND sales_order.sales_team_id = target.team_id)
            OR (target.target_scope = 'user' AND sales_order.salesperson_user_id = target.user_id)
          )
      ) actuals ON TRUE
      WHERE target.company_id = $1
        AND target.deleted_at IS NULL
        AND target.is_active = TRUE
        AND target.period_end >= CURRENT_DATE - INTERVAL '90 days'
        AND target.period_start <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY target.period_start DESC,
               target.period_end DESC,
               target.target_scope ASC,
               target.metric ASC
      LIMIT 250
    `,
    [context.companyId],
  );

  const userIds = Array.from(
    new Set(
      result.rows
        .map((row) => (row.user_id == null ? null : String(row.user_id)))
        .filter((id): id is string => id !== null),
    ),
  );

  let activeUsers: Array<{ user_id: string; name: string }> = [];
  if (userIds.length > 0) {
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
      [context.tenantId, userIds],
    );
    activeUsers = users.rows.map((row) => ({
      user_id: String(row.user_id),
      name: String(row.name || 'Salesperson'),
    }));
  }

  const names = new Map(activeUsers.map((user) => [user.user_id, user.name]));

  return {
    companyCurrency,
    canViewTargets: true,
    rows: result.rows.map((row) => {
      const targetScope = String(row.target_scope) as 'company' | 'team' | 'user';
      const metric = String(row.metric) as 'revenue' | 'margin' | 'orders';
      const periodStart = dateOnly(row.period_start);
      const periodEnd = dateOnly(row.period_end);
      const targetValue = Number(row.target_value || 0);
      const actualValue = Number(
        metric === 'orders'
          ? row.order_count
          : metric === 'margin'
            ? row.margin_actual
            : row.revenue_actual,
      );
      const today = dateOnly(row.today);
      const progress = attainmentStatus(
        actualValue,
        targetValue,
        periodStart,
        periodEnd,
        today,
      );
      const userId = row.user_id == null ? null : String(row.user_id);

      return {
        id: String(row.id),
        targetScope,
        teamId: row.team_id == null ? null : String(row.team_id),
        teamName: row.team_name == null ? null : String(row.team_name),
        userId,
        salespersonName:
          userId === null
            ? null
            : names.get(userId) || 'Inactive or unavailable user',
        metric,
        periodStart,
        periodEnd,
        targetValue,
        actualValue,
        attainmentPercent: progress.attainmentPercent,
        elapsedPercent: progress.elapsedPercent,
        status: progress.status,
        notes: row.notes == null ? null : String(row.notes),
      };
    }),
  };
}