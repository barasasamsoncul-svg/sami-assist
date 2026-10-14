import 'server-only';

import { hasSalesPermission, requireSalesContext, SALES_PERMISSIONS } from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

export type SalesCommissionPerformanceRow = {
  userId: string | null;
  salespersonName: string;
  teamId: string | null;
  teamName: string;
  currency: string;
  entryCount: number;
  accruedCount: number;
  accruedAmount: number;
  paidCount: number;
  paidAmount: number;
  reversedCount: number;
  reversedAmount: number;
};

export async function getSalesCommissionPerformance(): Promise<{ rows: SalesCommissionPerformanceRow[] }> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.REPORT_VIEW);
  const canViewCommissions = hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.COMMISSION_VIEW)
    || hasSalesPermission(context.permissions.isOwner, context.permissions.permissionSet, SALES_PERMISSIONS.COMMISSION_MANAGE);
  if (!canViewReports || !canViewCommissions) return { rows: [] };

  const result = await context.pool.query(
    `
      WITH commission_totals AS (
      SELECT
        e.user_id::text AS user_id,
        e.team_id::text AS team_id,
        COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned team') AS team_name,
        UPPER(COALESCE(NULLIF(BTRIM(e.currency), ''), NULLIF(BTRIM($2::text), ''), 'KES')) AS currency,
        COUNT(*)::int AS entry_count,
        COUNT(*) FILTER (WHERE e.status = 'accrued')::int AS accrued_count,
        COALESCE(SUM(e.commission_amount) FILTER (WHERE e.status = 'accrued'), 0) AS accrued_amount,
        COUNT(*) FILTER (WHERE e.status = 'paid')::int AS paid_count,
        COALESCE(SUM(e.commission_amount) FILTER (WHERE e.status = 'paid'), 0) AS paid_amount,
        COUNT(*) FILTER (WHERE e.status = 'reversed')::int AS reversed_count,
        COALESCE(SUM(e.commission_amount) FILTER (WHERE e.status = 'reversed'), 0) AS reversed_amount
      FROM sales_commission_entries e
      INNER JOIN sales_orders_v2 o
        ON o.id = e.order_id
        AND o.company_id = e.company_id
        AND o.deleted_at IS NULL
      LEFT JOIN sales_teams t
        ON t.id = e.team_id
        AND t.company_id = e.company_id
        AND t.deleted_at IS NULL
      WHERE e.company_id = $1
        AND e.accrued_at >= NOW() - INTERVAL '90 days'
      GROUP BY e.user_id, e.team_id, t.name, currency
      ),
      ranked_commission_totals AS (
        SELECT commission_totals.*,
          ROW_NUMBER() OVER (
            PARTITION BY currency
            ORDER BY accrued_amount DESC, paid_amount DESC, user_id NULLS LAST, team_name ASC, team_id NULLS LAST
          ) AS currency_rank
        FROM commission_totals
      )
      SELECT *
      FROM ranked_commission_totals
      ORDER BY currency_rank ASC, currency ASC, accrued_amount DESC, paid_amount DESC, user_id NULLS LAST, team_name ASC
      LIMIT 250
    `,
    [context.companyId, context.company.currentCompany.currency],
  );

  const userIds = Array.from(new Set(result.rows.map(row => row.user_id == null ? null : String(row.user_id)).filter((id): id is string => id !== null)));
  let activeUsers: Array<{ user_id: string; name: string }> = [];
  if (userIds.length > 0) {
    const users = await queryControl(
      `
        SELECT tu.user_id::text AS user_id,
          COALESCE(NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), u.email) AS name
        FROM tenant_users tu
        INNER JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.user_id = ANY($2::uuid[])
          AND tu.status = 'active'
          AND tu.member_type = 'internal'
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL
      `,
      [context.tenantId, userIds],
    );
    activeUsers = users.rows.map(row => ({ user_id: String(row.user_id), name: String(row.name || 'Salesperson') }));
  }
  const names = new Map(activeUsers.map(user => [user.user_id, user.name]));

  return {
    rows: result.rows.map(row => {
      const userId = row.user_id == null ? null : String(row.user_id);
      return {
        userId,
        salespersonName: userId === null ? 'Unassigned' : names.get(userId) || 'Inactive or unavailable user',
        teamId: row.team_id == null ? null : String(row.team_id),
        teamName: String(row.team_name || 'Unassigned team'),
        currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
        entryCount: Number(row.entry_count || 0),
        accruedCount: Number(row.accrued_count || 0),
        accruedAmount: Number(row.accrued_amount || 0),
        paidCount: Number(row.paid_count || 0),
        paidAmount: Number(row.paid_amount || 0),
        reversedCount: Number(row.reversed_count || 0),
        reversedAmount: Number(row.reversed_amount || 0),
      };
    }),
  };
}
