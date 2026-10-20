import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
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

export type SalesCommissionPerformanceReport = {
  canViewCommissions: boolean;
  windowDays: number;
  perCurrencyCap: number;
  asOf: string;
  rows: SalesCommissionPerformanceRow[];
};

const REPORT_WINDOW_DAYS = 90;
const PER_CURRENCY_CAP = 250;

const EMPTY_ROWS: SalesCommissionPerformanceRow[] = [];

function toNum(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toCurrency(value: unknown, fallback: string): string {
  return String(value || fallback).toUpperCase();
}

export async function getSalesCommissionPerformance(): Promise<SalesCommissionPerformanceReport> {
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

  const canViewCommissions =
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.COMMISSION_VIEW,
    ) ||
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.COMMISSION_MANAGE,
    );

  if (!canViewReports || !canViewCommissions) {
    return {
      canViewCommissions: false,
      windowDays: REPORT_WINDOW_DAYS,
      perCurrencyCap: PER_CURRENCY_CAP,
      asOf,
      rows: EMPTY_ROWS,
    };
  }

  const result = await context.pool.query(
    `
      WITH commission_rollup AS (
        SELECT
          e.user_id::text AS user_id,
          e.team_id::text AS team_id,
          COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned team') AS team_name,
          UPPER(COALESCE(
            NULLIF(BTRIM(e.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
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
          AND e.accrued_at >= NOW() - ($3::int * INTERVAL '1 day')
        GROUP BY e.user_id, e.team_id, t.name, currency
      ),
      ranked_commissions AS (
        SELECT commission_rollup.*,
          ROW_NUMBER() OVER (
            PARTITION BY currency
            ORDER BY accrued_amount DESC, paid_amount DESC,
                     user_id ASC NULLS LAST,
                     team_name ASC,
                     team_id ASC NULLS LAST
          ) AS currency_rank
        FROM commission_rollup
      )
      SELECT *
      FROM ranked_commissions
      WHERE currency_rank <= $4
      ORDER BY
        currency ASC,
        accrued_amount DESC,
        paid_amount DESC,
        user_id ASC NULLS LAST,
        team_name ASC,
        team_id ASC NULLS LAST
    `,
    [
      context.companyId,
      context.company.currentCompany.currency,
      REPORT_WINDOW_DAYS,
      PER_CURRENCY_CAP,
    ],
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
    canViewCommissions: true,
    windowDays: REPORT_WINDOW_DAYS,
    perCurrencyCap: PER_CURRENCY_CAP,
    asOf,
    rows: result.rows.map((row) => {
      const userId = row.user_id == null ? null : String(row.user_id);
      return {
        userId,
        salespersonName:
          userId === null
            ? 'Unassigned'
            : names.get(userId) || 'Inactive or unavailable user',
        teamId: row.team_id == null ? null : String(row.team_id),
        teamName: String(row.team_name || 'Unassigned team'),
        currency: toCurrency(row.currency, companyCurrency),
        entryCount: toNum(row.entry_count),
        accruedCount: toNum(row.accrued_count),
        accruedAmount: toNum(row.accrued_amount),
        paidCount: toNum(row.paid_count),
        paidAmount: toNum(row.paid_amount),
        reversedCount: toNum(row.reversed_count),
        reversedAmount: toNum(row.reversed_amount),
      };
    }),
  };
}