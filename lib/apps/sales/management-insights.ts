import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesManagementInsightsData = {
  summary: {
    quoteCount: number;
    openQuoteCount: number;
    openQuoteValue: number;
    expiredOpenQuoteCount: number;
    expiringSoonQuoteCount: number;
    staleQuoteCount: number;
    followUpQuoteCount: number;
    currentMonthQuoteValue: number;
    priorMonthQuoteValue: number;
  };
  followUpQueue: Array<{
    id: string;
    quoteNumber: string;
    customerName: string;
    status: string;
    amount: number;
    validUntil: string | null;
    reason: 'expired' | 'expiring' | 'stale';
    ageDays: number;
  }>;
  statusCounts: Array<{ status: string; count: number; amount: number }>;
  monthly: Array<{ month: string; quoteCount: number; amount: number }>;
  topCustomers: Array<{ customerName: string; quoteCount: number; amount: number }>;
  orderSummary: {
    bookedOrderCount: number;
    bookedOrderValue: number;
    ordersNeedingFulfillment: number;
    ordersNotFullyInvoiced: number;
    currentMonthOrderValue: number;
    priorMonthOrderValue: number;
  };
  orderMonthly: Array<{ month: string; orderCount: number; amount: number }>;
  topProducts: Array<{ productName: string; sku: string | null; quantity: number; orderCount: number; amount: number }>;
  teamPerformance: Array<{ teamName: string; orderCount: number; amount: number }>;
  targetAttainment: Array<{
    id: string;
    scope: 'company' | 'team' | 'user';
    scopeName: string;
    metric: 'revenue' | 'margin' | 'orders';
    periodStart: string;
    periodEnd: string;
    targetValue: number;
    actualValue: number;
    notes: string | null;
  }>;
};

const EMPTY_REPORT: SalesManagementInsightsData = {
  summary: {
    quoteCount: 0,
    openQuoteCount: 0,
    openQuoteValue: 0,
    expiredOpenQuoteCount: 0,
    expiringSoonQuoteCount: 0,
    staleQuoteCount: 0,
    followUpQuoteCount: 0,
    currentMonthQuoteValue: 0,
    priorMonthQuoteValue: 0,
  },
  followUpQueue: [],
  statusCounts: [],
  monthly: [],
  topCustomers: [],
  orderSummary: {
    bookedOrderCount: 0,
    bookedOrderValue: 0,
    ordersNeedingFulfillment: 0,
    ordersNotFullyInvoiced: 0,
    currentMonthOrderValue: 0,
    priorMonthOrderValue: 0,
  },
  orderMonthly: [],
  topProducts: [],
  teamPerformance: [],
  targetAttainment: [],
};

export async function getSalesManagementInsights(): Promise<SalesManagementInsightsData> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) return EMPTY_REPORT;

  const companyId = context.companyId;
  const [
    summaryResult,
    queueResult,
    statusResult,
    monthlyResult,
    customersResult,
    orderSummaryResult,
    orderMonthlyResult,
    productsResult,
    teamsResult,
    targetAttainmentResult,
  ] = await Promise.all([
    context.pool.query(`
      SELECT
        COUNT(*)::int AS quote_count,
        COUNT(*) FILTER (WHERE status IN ('sent', 'viewed'))::int AS open_quote_count,
        COALESCE(SUM(base_total_amount) FILTER (WHERE status IN ('sent', 'viewed')), 0) AS open_quote_value,
        COUNT(*) FILTER (WHERE status IN ('sent', 'viewed') AND valid_until < CURRENT_DATE)::int AS expired_open_quote_count,
        COUNT(*) FILTER (WHERE status IN ('sent', 'viewed') AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7)::int AS expiring_soon_quote_count,
        COUNT(*) FILTER (WHERE status IN ('sent', 'viewed') AND COALESCE(viewed_at::date, sent_at::date, quote_date) <= CURRENT_DATE - 7)::int AS stale_quote_count,
        COUNT(*) FILTER (
          WHERE status IN ('sent', 'viewed')
            AND (valid_until < CURRENT_DATE
              OR valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
              OR COALESCE(viewed_at::date, sent_at::date, quote_date) <= CURRENT_DATE - 7)
        )::int AS follow_up_quote_count,
        COALESCE(SUM(base_total_amount) FILTER (
          WHERE quote_date >= DATE_TRUNC('month', CURRENT_DATE)::date
            AND quote_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
        ), 0) AS current_month_quote_value,
        COALESCE(SUM(base_total_amount) FILTER (
          WHERE quote_date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date
            AND quote_date < DATE_TRUNC('month', CURRENT_DATE)::date
        ), 0) AS prior_month_quote_value
      FROM sales_quotes
      WHERE company_id = $1 AND deleted_at IS NULL
    `, [companyId]),
    context.pool.query(`
      SELECT id, quote_number, customer_name, status,
        base_total_amount AS amount, valid_until,
        CASE
          WHEN valid_until < CURRENT_DATE THEN 'expired'
          WHEN valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 'expiring'
          ELSE 'stale'
        END AS reason,
        GREATEST(0, CURRENT_DATE - COALESCE(viewed_at::date, sent_at::date, quote_date))::int AS age_days
      FROM sales_quotes
      WHERE company_id = $1 AND deleted_at IS NULL
        AND status IN ('sent', 'viewed')
        AND (valid_until < CURRENT_DATE
          OR valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
          OR COALESCE(viewed_at::date, sent_at::date, quote_date) <= CURRENT_DATE - 7)
      ORDER BY CASE
        WHEN valid_until < CURRENT_DATE THEN 0
        WHEN valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 1
        ELSE 2
      END, base_total_amount DESC, quote_date ASC
      LIMIT 10
    `, [companyId]),
    context.pool.query(`
      SELECT status, COUNT(*)::int AS count, COALESCE(SUM(base_total_amount), 0) AS amount
      FROM sales_quotes
      WHERE company_id = $1 AND deleted_at IS NULL
      GROUP BY status ORDER BY status
    `, [companyId]),
    context.pool.query(`
      SELECT TO_CHAR(DATE_TRUNC('month', quote_date), 'YYYY-MM') AS month,
        COUNT(*)::int AS quote_count, COALESCE(SUM(base_total_amount), 0) AS amount
      FROM sales_quotes
      WHERE company_id = $1 AND deleted_at IS NULL
        AND quote_date >= CURRENT_DATE - INTERVAL '11 months'
      GROUP BY 1 ORDER BY 1
    `, [companyId]),
    context.pool.query(`
      SELECT customer_name, COUNT(*)::int AS quote_count,
        COALESCE(SUM(base_total_amount), 0) AS amount
      FROM sales_quotes
      WHERE company_id = $1 AND deleted_at IS NULL
      GROUP BY customer_name ORDER BY amount DESC LIMIT 10
    `, [companyId]),
    context.pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('confirmed', 'closed'))::int AS booked_order_count,
        COALESCE(SUM(base_total_amount) FILTER (WHERE status IN ('confirmed', 'closed')), 0) AS booked_order_value,
        COUNT(*) FILTER (
          WHERE status IN ('confirmed', 'closed')
            AND fulfillment_status <> 'fulfilled'
        )::int AS orders_needing_fulfillment,
        COUNT(*) FILTER (
          WHERE status IN ('confirmed', 'closed')
            AND invoice_status <> 'invoiced'
        )::int AS orders_not_fully_invoiced,
        COALESCE(SUM(base_total_amount) FILTER (
          WHERE status IN ('confirmed', 'closed')
            AND order_date >= DATE_TRUNC('month', CURRENT_DATE)::date
            AND order_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
        ), 0) AS current_month_order_value,
        COALESCE(SUM(base_total_amount) FILTER (
          WHERE status IN ('confirmed', 'closed')
            AND order_date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date
            AND order_date < DATE_TRUNC('month', CURRENT_DATE)::date
        ), 0) AS prior_month_order_value
      FROM sales_orders_v2
      WHERE company_id = $1 AND deleted_at IS NULL
    `, [companyId]),
    context.pool.query(`
      WITH months AS (
        SELECT GENERATE_SERIES(
          DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
          DATE_TRUNC('month', CURRENT_DATE),
          INTERVAL '1 month'
        )::date AS month_start
      )
      SELECT
        TO_CHAR(months.month_start, 'YYYY-MM') AS month,
        COUNT(o.id)::int AS order_count,
        COALESCE(SUM(o.base_total_amount), 0) AS amount
      FROM months
      LEFT JOIN sales_orders_v2 o
        ON o.company_id = $1
        AND o.deleted_at IS NULL
        AND o.status IN ('confirmed', 'closed')
        AND o.order_date >= months.month_start
        AND o.order_date < (months.month_start + INTERVAL '1 month')::date
      GROUP BY months.month_start
      ORDER BY months.month_start
    `, [companyId]),
    context.pool.query(`
      SELECT
        COALESCE(NULLIF(BTRIM(i.description), ''), NULLIF(BTRIM(i.sku_snapshot), ''), 'Uncatalogued item') AS product_name,
        MAX(NULLIF(BTRIM(i.sku_snapshot), '')) AS sku,
        COALESCE(SUM(i.quantity), 0) AS quantity,
        COUNT(DISTINCT o.id)::int AS order_count,
        COALESCE(SUM(i.line_total * COALESCE(o.exchange_rate, 1)), 0) AS amount
      FROM sales_order_items_v2 i
      INNER JOIN sales_orders_v2 o
        ON o.id = i.sales_order_id
        AND o.company_id = i.company_id
      WHERE i.company_id = $1
        AND o.company_id = $1
        AND o.deleted_at IS NULL
        AND o.status IN ('confirmed', 'closed')
      GROUP BY
        COALESCE(NULLIF(BTRIM(i.description), ''), NULLIF(BTRIM(i.sku_snapshot), ''), 'Uncatalogued item'),
        COALESCE(NULLIF(BTRIM(i.sku_snapshot), ''), '')
      ORDER BY amount DESC
      LIMIT 10
    `, [companyId]),
    context.pool.query(`
      SELECT
        COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned') AS team_name,
        COUNT(*)::int AS order_count,
        COALESCE(SUM(o.base_total_amount), 0) AS amount
      FROM sales_orders_v2 o
      LEFT JOIN sales_teams t
        ON t.id = o.sales_team_id
        AND t.company_id = o.company_id
        AND t.deleted_at IS NULL
      WHERE o.company_id = $1
        AND o.deleted_at IS NULL
        AND o.status IN ('confirmed', 'closed')
      GROUP BY
        COALESCE(t.id::text, 'unassigned'),
        COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned')
      ORDER BY amount DESC, team_name
      LIMIT 10
    `, [companyId]),
    context.pool.query(`
      SELECT
        target.id,
        target.target_scope,
        target.metric,
        target.period_start,
        target.period_end,
        target.target_value,
        target.notes,
        CASE
          WHEN target.target_scope = 'company' THEN 'Company'
          WHEN target.target_scope = 'team' THEN COALESCE(NULLIF(BTRIM(team.name), ''), 'Unavailable team')
          ELSE COALESCE(
            NULLIF(BTRIM(COALESCE(u.full_name, '')), ''),
            NULLIF(BTRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''),
            u.email,
            'Unavailable salesperson'
          )
        END AS scope_name,
        COALESCE(achievement.actual_value, 0) AS actual_value
      FROM sales_targets target
      LEFT JOIN sales_teams team
        ON team.id = target.team_id
        AND team.company_id = target.company_id
      LEFT JOIN tenant_users tu
        ON tu.user_id = target.user_id
        AND tu.tenant_id = $2
        AND tu.deleted_at IS NULL
      LEFT JOIN users u
        ON u.id = tu.user_id
        AND u.deleted_at IS NULL
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN target.metric = 'orders' THEN COUNT(*)::numeric
            WHEN target.metric = 'margin' THEN COALESCE(SUM(sales_order.margin_amount), 0)
            ELSE COALESCE(SUM(sales_order.subtotal - sales_order.discount_total), 0)
          END AS actual_value
        FROM sales_orders_v2 sales_order
        WHERE sales_order.company_id = target.company_id
          AND sales_order.deleted_at IS NULL
          AND sales_order.status <> 'cancelled'
          AND sales_order.order_date BETWEEN target.period_start AND target.period_end
          AND (
            target.target_scope = 'company'
            OR (target.target_scope = 'team' AND sales_order.sales_team_id = target.team_id)
            OR (target.target_scope = 'user' AND sales_order.salesperson_user_id = target.user_id)
          )
      ) achievement ON TRUE
      WHERE target.company_id = $1
        AND target.deleted_at IS NULL
        AND target.is_active = TRUE
      ORDER BY target.period_start DESC, target.period_end DESC,
               CASE target.target_scope WHEN 'company' THEN 0 WHEN 'team' THEN 1 ELSE 2 END,
               LOWER(target.metric), target.id
      LIMIT 100
    `, [companyId, context.tenantId]),
  ]);

  const summaryRow = summaryResult.rows[0] || {};
  return {
    summary: {
      quoteCount: Number(summaryRow.quote_count || 0),
      openQuoteCount: Number(summaryRow.open_quote_count || 0),
      openQuoteValue: Number(summaryRow.open_quote_value || 0),
      expiredOpenQuoteCount: Number(summaryRow.expired_open_quote_count || 0),
      expiringSoonQuoteCount: Number(summaryRow.expiring_soon_quote_count || 0),
      staleQuoteCount: Number(summaryRow.stale_quote_count || 0),
      followUpQuoteCount: Number(summaryRow.follow_up_quote_count || 0),
      currentMonthQuoteValue: Number(summaryRow.current_month_quote_value || 0),
      priorMonthQuoteValue: Number(summaryRow.prior_month_quote_value || 0),
    },
    followUpQueue: queueResult.rows.map(row => ({
      id: String(row.id),
      quoteNumber: String(row.quote_number),
      customerName: String(row.customer_name),
      status: String(row.status),
      amount: Number(row.amount || 0),
      validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
      reason: String(row.reason) as 'expired' | 'expiring' | 'stale',
      ageDays: Number(row.age_days || 0),
    })),
    statusCounts: statusResult.rows.map(row => ({
      status: String(row.status), count: Number(row.count || 0), amount: Number(row.amount || 0),
    })),
    monthly: monthlyResult.rows.map(row => ({
      month: String(row.month), quoteCount: Number(row.quote_count || 0), amount: Number(row.amount || 0),
    })),
    topCustomers: customersResult.rows.map(row => ({
      customerName: String(row.customer_name), quoteCount: Number(row.quote_count || 0), amount: Number(row.amount || 0),
    })),
    orderSummary: (() => {
      const row = orderSummaryResult.rows[0] || {};
      return {
        bookedOrderCount: Number(row.booked_order_count || 0),
        bookedOrderValue: Number(row.booked_order_value || 0),
        ordersNeedingFulfillment: Number(row.orders_needing_fulfillment || 0),
        ordersNotFullyInvoiced: Number(row.orders_not_fully_invoiced || 0),
        currentMonthOrderValue: Number(row.current_month_order_value || 0),
        priorMonthOrderValue: Number(row.prior_month_order_value || 0),
      };
    })(),
    orderMonthly: orderMonthlyResult.rows.map(row => ({
      month: String(row.month || ''),
      orderCount: Number(row.order_count || 0),
      amount: Number(row.amount || 0),
    })),
    topProducts: productsResult.rows.map(row => ({
      productName: String(row.product_name || 'Uncatalogued item'),
      sku: row.sku ? String(row.sku) : null,
      quantity: Number(row.quantity || 0),
      orderCount: Number(row.order_count || 0),
      amount: Number(row.amount || 0),
    })),
    teamPerformance: teamsResult.rows.map(row => ({
      teamName: String(row.team_name || 'Unassigned'),
      orderCount: Number(row.order_count || 0),
      amount: Number(row.amount || 0),
    })),
    targetAttainment: targetAttainmentResult.rows.map(row => ({
      id: String(row.id),
      scope: String(row.target_scope) as 'company' | 'team' | 'user',
      scopeName: String(row.scope_name || 'Unavailable target scope'),
      metric: String(row.metric) as 'revenue' | 'margin' | 'orders',
      periodStart: String(row.period_start).slice(0, 10),
      periodEnd: String(row.period_end).slice(0, 10),
      targetValue: Number(row.target_value || 0),
      actualValue: Number(row.actual_value || 0),
      notes: row.notes ? String(row.notes) : null,
    })),
  };
}
