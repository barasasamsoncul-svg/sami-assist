import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

type CurrencyAmount = { currency: string; amount: number };

export type SalesManagementInsightsData = {
  summary: {
    quoteCount: number;
    openQuoteCount: number;
    openQuoteValueByCurrency: CurrencyAmount[];
    expiredOpenQuoteCount: number;
    expiringSoonQuoteCount: number;
    staleQuoteCount: number;
    followUpQuoteCount: number;
    currentMonthQuoteValueByCurrency: CurrencyAmount[];
    priorMonthQuoteValueByCurrency: CurrencyAmount[];
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
    currency: string;
  }>;
  statusCounts: Array<{ status: string; currency: string; count: number; amount: number }>;
  monthly: Array<{ month: string; currency: string; quoteCount: number; amount: number }>;
  topCustomers: Array<{
    customerName: string;
    currency: string;
    quoteCount: number;
    amount: number;
  }>;
  orderSummary: {
    bookedOrderCount: number;
    bookedOrderValueByCurrency: CurrencyAmount[];
    ordersNeedingFulfillment: number;
    ordersNotFullyInvoiced: number;
    currentMonthOrderValueByCurrency: CurrencyAmount[];
    priorMonthOrderValueByCurrency: CurrencyAmount[];
  };
  orderMonthly: Array<{ month: string; currency: string; orderCount: number; amount: number }>;
  topProducts: Array<{
    productName: string;
    sku: string | null;
    currency: string;
    quantity: number;
    orderCount: number;
    amount: number;
  }>;
  teamPerformance: Array<{
    teamName: string;
    currency: string;
    orderCount: number;
    amount: number;
  }>;
  forecast: Array<{
    horizonDays: number;
    currency: string;
    opportunityCount: number;
    openPipelineValue: number;
    weightedPipelineValue: number;
  }>;
};

export type SalesManagementInsightsReport = SalesManagementInsightsData & {
  canViewReports: boolean;
  staleAfterDays: number;
  followUpQueueLimit: number;
  topCustomersLimit: number;
  topProductsLimit: number;
  teamLimit: number;
  asOf: string;
};

const STALE_AFTER_DAYS = 7;
const FOLLOW_UP_QUEUE_LIMIT = 10;
const TOP_CUSTOMERS_LIMIT = 10;
const TOP_PRODUCTS_LIMIT = 10;
const TEAM_LIMIT = 10;
const FORECAST_HORIZONS = [30, 60, 90] as const;

const EMPTY_DATA: SalesManagementInsightsData = {
  summary: {
    quoteCount: 0,
    openQuoteCount: 0,
    openQuoteValueByCurrency: [],
    expiredOpenQuoteCount: 0,
    expiringSoonQuoteCount: 0,
    staleQuoteCount: 0,
    followUpQuoteCount: 0,
    currentMonthQuoteValueByCurrency: [],
    priorMonthQuoteValueByCurrency: [],
  },
  followUpQueue: [],
  statusCounts: [],
  monthly: [],
  topCustomers: [],
  orderSummary: {
    bookedOrderCount: 0,
    bookedOrderValueByCurrency: [],
    ordersNeedingFulfillment: 0,
    ordersNotFullyInvoiced: 0,
    currentMonthOrderValueByCurrency: [],
    priorMonthOrderValueByCurrency: [],
  },
  orderMonthly: [],
  topProducts: [],
  teamPerformance: [],
  forecast: [],
};

function toCurrency(code: unknown, fallback = 'KES'): string {
  return String(code || fallback).toUpperCase();
}

function toNum(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function getSalesManagementInsights(): Promise<SalesManagementInsightsReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const asOf = new Date().toISOString();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );

  if (!canViewReports) {
    return {
      ...EMPTY_DATA,
      canViewReports: false,
      staleAfterDays: STALE_AFTER_DAYS,
      followUpQueueLimit: FOLLOW_UP_QUEUE_LIMIT,
      topCustomersLimit: TOP_CUSTOMERS_LIMIT,
      topProductsLimit: TOP_PRODUCTS_LIMIT,
      teamLimit: TEAM_LIMIT,
      asOf,
    };
  }

  const companyId = context.companyId;

  const [
    summaryResult,
    quoteValuesResult,
    queueResult,
    statusResult,
    monthlyResult,
    customersResult,
    orderSummaryResult,
    orderValuesResult,
    orderMonthlyResult,
    productsResult,
    teamsResult,
    forecastResult,
  ] = await Promise.all([
    context.pool.query(
      `SELECT
         COUNT(*)::int AS quote_count,
         COUNT(*) FILTER (WHERE status IN ('sent','viewed'))::int AS open_quote_count,
         COUNT(*) FILTER (
           WHERE status IN ('sent','viewed') AND valid_until < CURRENT_DATE
         )::int AS expired_open_quote_count,
         COUNT(*) FILTER (
           WHERE status IN ('sent','viewed')
             AND valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
         )::int AS expiring_soon_quote_count,
         COUNT(*) FILTER (
           WHERE status IN ('sent','viewed')
             AND COALESCE(viewed_at::date, sent_at::date, quote_date)
                 <= CURRENT_DATE - $2::int
         )::int AS stale_quote_count,
         COUNT(*) FILTER (
           WHERE status IN ('sent','viewed')
             AND (valid_until < CURRENT_DATE
               OR valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
               OR COALESCE(viewed_at::date, sent_at::date, quote_date)
                   <= CURRENT_DATE - $2::int)
         )::int AS follow_up_quote_count
       FROM sales_quotes
       WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId, STALE_AFTER_DAYS],
    ),
    context.pool.query(
      `SELECT
         base_currency AS currency,
         COALESCE(SUM(base_total_amount) FILTER (WHERE status IN ('sent','viewed')), 0) AS open_quote_value,
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
       GROUP BY base_currency
       ORDER BY base_currency`,
      [companyId],
    ),
    context.pool.query(
      `SELECT id, quote_number, customer_name, status,
              base_total_amount AS amount, base_currency AS currency, valid_until,
              CASE
                WHEN valid_until < CURRENT_DATE THEN 'expired'
                WHEN valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 'expiring'
                ELSE 'stale'
              END AS reason,
              GREATEST(
                0,
                CURRENT_DATE - COALESCE(viewed_at::date, sent_at::date, quote_date)
              )::int AS age_days
       FROM sales_quotes
       WHERE company_id = $1 AND deleted_at IS NULL
         AND status IN ('sent','viewed')
         AND (valid_until < CURRENT_DATE
           OR valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7
           OR COALESCE(viewed_at::date, sent_at::date, quote_date)
               <= CURRENT_DATE - $2::int)
       ORDER BY
         CASE
           WHEN valid_until < CURRENT_DATE THEN 0
           WHEN valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE + 7 THEN 1
           ELSE 2
         END,
         COALESCE(viewed_at::date, sent_at::date, quote_date) ASC,
         quote_date ASC
       LIMIT $3`,
      [companyId, STALE_AFTER_DAYS, FOLLOW_UP_QUEUE_LIMIT],
    ),
    context.pool.query(
      `SELECT status, base_currency AS currency, COUNT(*)::int AS count,
              COALESCE(SUM(base_total_amount), 0) AS amount
       FROM sales_quotes
       WHERE company_id = $1 AND deleted_at IS NULL
       GROUP BY status, base_currency
       ORDER BY status, base_currency`,
      [companyId],
    ),
    context.pool.query(
      `SELECT TO_CHAR(DATE_TRUNC('month', quote_date), 'YYYY-MM') AS month,
              base_currency AS currency, COUNT(*)::int AS quote_count,
              COALESCE(SUM(base_total_amount), 0) AS amount
       FROM sales_quotes
       WHERE company_id = $1 AND deleted_at IS NULL
         AND quote_date >= CURRENT_DATE - INTERVAL '11 months'
       GROUP BY 1, base_currency
       ORDER BY 1, base_currency`,
      [companyId],
    ),
    context.pool.query(
      `WITH customer_totals AS (
         SELECT
           customer_name,
           base_currency AS currency,
           COUNT(*)::int AS quote_count,
           COALESCE(SUM(base_total_amount), 0) AS amount
         FROM sales_quotes
         WHERE company_id = $1 AND deleted_at IS NULL
         GROUP BY customer_name, base_currency
       ),
       ranked_customers AS (
         SELECT customer_totals.*,
           ROW_NUMBER() OVER (
             PARTITION BY currency
             ORDER BY amount DESC, customer_name ASC
           ) AS currency_rank
         FROM customer_totals
       )
       SELECT customer_name, currency, quote_count, amount
       FROM ranked_customers
       WHERE currency_rank <= $2
       ORDER BY currency, amount DESC, customer_name`,
      [companyId, TOP_CUSTOMERS_LIMIT],
    ),
    context.pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('confirmed','closed'))::int AS booked_order_count,
         COUNT(*) FILTER (
           WHERE status IN ('confirmed','closed')
             AND fulfillment_status <> 'fulfilled'
         )::int AS orders_needing_fulfillment,
         COUNT(*) FILTER (
           WHERE status IN ('confirmed','closed')
             AND invoice_status <> 'invoiced'
         )::int AS orders_not_fully_invoiced
       FROM sales_orders_v2
       WHERE company_id = $1 AND deleted_at IS NULL`,
      [companyId],
    ),
    context.pool.query(
      `SELECT
         base_currency AS currency,
         COALESCE(SUM(base_total_amount) FILTER (
           WHERE status IN ('confirmed','closed')
         ), 0) AS booked_order_value,
         COALESCE(SUM(base_total_amount) FILTER (
           WHERE status IN ('confirmed','closed')
             AND order_date >= DATE_TRUNC('month', CURRENT_DATE)::date
             AND order_date < (DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month')::date
         ), 0) AS current_month_order_value,
         COALESCE(SUM(base_total_amount) FILTER (
           WHERE status IN ('confirmed','closed')
             AND order_date >= (DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '1 month')::date
             AND order_date < DATE_TRUNC('month', CURRENT_DATE)::date
         ), 0) AS prior_month_order_value
       FROM sales_orders_v2
       WHERE company_id = $1 AND deleted_at IS NULL
       GROUP BY base_currency
       ORDER BY base_currency`,
      [companyId],
    ),
    context.pool.query(
      `WITH months AS (
         SELECT GENERATE_SERIES(
           DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months',
           DATE_TRUNC('month', CURRENT_DATE),
           INTERVAL '1 month'
         )::date AS month_start
       ),
       currencies AS (
         SELECT DISTINCT base_currency AS currency
         FROM sales_orders_v2
         WHERE company_id = $1
           AND deleted_at IS NULL
           AND status IN ('confirmed','closed')
       )
       SELECT
         TO_CHAR(months.month_start, 'YYYY-MM') AS month,
         currencies.currency,
         COUNT(o.id)::int AS order_count,
         COALESCE(SUM(o.base_total_amount), 0) AS amount
       FROM months
       CROSS JOIN currencies
       LEFT JOIN sales_orders_v2 o
         ON o.company_id = $1
        AND o.deleted_at IS NULL
        AND o.status IN ('confirmed','closed')
        AND o.base_currency = currencies.currency
        AND o.order_date >= months.month_start
        AND o.order_date < (months.month_start + INTERVAL '1 month')::date
       GROUP BY months.month_start, currencies.currency
       ORDER BY months.month_start, currencies.currency`,
      [companyId],
    ),
    context.pool.query(
      `WITH product_totals AS (
         SELECT
           COALESCE(
             NULLIF(BTRIM(i.description), ''),
             NULLIF(BTRIM(i.sku_snapshot), ''),
             'Uncatalogued item'
           ) AS product_name,
           MAX(NULLIF(BTRIM(i.sku_snapshot), '')) AS sku,
           o.base_currency AS currency,
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
           AND o.status IN ('confirmed','closed')
         GROUP BY
           COALESCE(
             NULLIF(BTRIM(i.description), ''),
             NULLIF(BTRIM(i.sku_snapshot), ''),
             'Uncatalogued item'
           ),
           COALESCE(NULLIF(BTRIM(i.sku_snapshot), ''), ''),
           o.base_currency
       ),
       ranked_products AS (
         SELECT product_totals.*,
           ROW_NUMBER() OVER (
             PARTITION BY currency
             ORDER BY amount DESC, product_name ASC, sku ASC NULLS LAST
           ) AS currency_rank
         FROM product_totals
       )
       SELECT product_name, sku, currency, quantity, order_count, amount
       FROM ranked_products
       WHERE currency_rank <= $2
       ORDER BY currency, amount DESC, product_name`,
      [companyId, TOP_PRODUCTS_LIMIT],
    ),
    context.pool.query(
      `WITH team_totals AS (
         SELECT
           COALESCE(t.id::text, 'unassigned') AS team_key,
           COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned') AS team_name,
           o.base_currency AS currency,
           COUNT(*)::int AS order_count,
           COALESCE(SUM(o.base_total_amount), 0) AS amount
         FROM sales_orders_v2 o
         LEFT JOIN sales_teams t
           ON t.id = o.sales_team_id
          AND t.company_id = o.company_id
          AND t.deleted_at IS NULL
         WHERE o.company_id = $1
           AND o.deleted_at IS NULL
           AND o.status IN ('confirmed','closed')
         GROUP BY
           COALESCE(t.id::text, 'unassigned'),
           COALESCE(NULLIF(BTRIM(t.name), ''), 'Unassigned'),
           o.base_currency
       ),
       ranked_teams AS (
         SELECT team_totals.*,
           ROW_NUMBER() OVER (
             PARTITION BY currency
             ORDER BY amount DESC, team_name ASC, team_key ASC
           ) AS currency_rank
         FROM team_totals
       )
       SELECT team_name, currency, order_count, amount
       FROM ranked_teams
       WHERE currency_rank <= $2
       ORDER BY currency, amount DESC, team_name`,
      [companyId, TEAM_LIMIT],
    ),
    context.pool.query(
      `SELECT
         h.horizon_days,
         UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), 'KES')) AS currency,
         COUNT(o.id)::int AS opportunity_count,
         COALESCE(SUM(o.expected_value), 0) AS open_pipeline_value,
         COALESCE(SUM(
           o.expected_value
           * LEAST(100, GREATEST(0, COALESCE(o.probability, s.probability, 0)))
           / 100.0
         ), 0) AS weighted_pipeline_value
       FROM (VALUES ($2::int), ($3::int), ($4::int)) AS h(horizon_days)
       INNER JOIN sales_opportunities o
         ON o.company_id = $1
        AND o.deleted_at IS NULL
        AND o.expected_close_date >= CURRENT_DATE
        AND o.expected_close_date <= CURRENT_DATE + h.horizon_days
       INNER JOIN sales_pipeline_stages s
         ON s.id = o.stage_id
        AND s.company_id = o.company_id
        AND s.stage_type = 'open'
        AND s.deleted_at IS NULL
       WHERE o.company_id = $1
       GROUP BY h.horizon_days, UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), 'KES'))
       ORDER BY h.horizon_days ASC, currency ASC`,
      [companyId, ...FORECAST_HORIZONS],
    ),
  ]);

  const summaryRow = summaryResult.rows[0] || {};

  const quoteValues = quoteValuesResult.rows.map((row) => ({
    currency: toCurrency(row.currency),
    openQuoteValue: toNum(row.open_quote_value),
    currentMonthQuoteValue: toNum(row.current_month_quote_value),
    priorMonthQuoteValue: toNum(row.prior_month_quote_value),
  }));
  const orderValues = orderValuesResult.rows.map((row) => ({
    currency: toCurrency(row.currency),
    bookedOrderValue: toNum(row.booked_order_value),
    currentMonthOrderValue: toNum(row.current_month_order_value),
    priorMonthOrderValue: toNum(row.prior_month_order_value),
  }));

  const orderSummaryRow = orderSummaryResult.rows[0] || {};

  return {
    canViewReports: true,
    staleAfterDays: STALE_AFTER_DAYS,
    followUpQueueLimit: FOLLOW_UP_QUEUE_LIMIT,
    topCustomersLimit: TOP_CUSTOMERS_LIMIT,
    topProductsLimit: TOP_PRODUCTS_LIMIT,
    teamLimit: TEAM_LIMIT,
    asOf,
    summary: {
      quoteCount: toNum(summaryRow.quote_count),
      openQuoteCount: toNum(summaryRow.open_quote_count),
      openQuoteValueByCurrency: quoteValues.map((row) => ({
        currency: row.currency,
        amount: row.openQuoteValue,
      })),
      expiredOpenQuoteCount: toNum(summaryRow.expired_open_quote_count),
      expiringSoonQuoteCount: toNum(summaryRow.expiring_soon_quote_count),
      staleQuoteCount: toNum(summaryRow.stale_quote_count),
      followUpQuoteCount: toNum(summaryRow.follow_up_quote_count),
      currentMonthQuoteValueByCurrency: quoteValues.map((row) => ({
        currency: row.currency,
        amount: row.currentMonthQuoteValue,
      })),
      priorMonthQuoteValueByCurrency: quoteValues.map((row) => ({
        currency: row.currency,
        amount: row.priorMonthQuoteValue,
      })),
    },
    followUpQueue: queueResult.rows.map((row) => ({
      id: String(row.id),
      quoteNumber: String(row.quote_number),
      customerName: String(row.customer_name),
      status: String(row.status),
      amount: toNum(row.amount),
      currency: toCurrency(row.currency),
      validUntil: row.valid_until ? String(row.valid_until).slice(0, 10) : null,
      reason: String(row.reason) as 'expired' | 'expiring' | 'stale',
      ageDays: toNum(row.age_days),
    })),
    statusCounts: statusResult.rows.map((row) => ({
      status: String(row.status),
      currency: toCurrency(row.currency),
      count: toNum(row.count),
      amount: toNum(row.amount),
    })),
    monthly: monthlyResult.rows.map((row) => ({
      month: String(row.month),
      currency: toCurrency(row.currency),
      quoteCount: toNum(row.quote_count),
      amount: toNum(row.amount),
    })),
    topCustomers: customersResult.rows.map((row) => ({
      customerName: String(row.customer_name),
      currency: toCurrency(row.currency),
      quoteCount: toNum(row.quote_count),
      amount: toNum(row.amount),
    })),
    orderSummary: {
      bookedOrderCount: toNum(orderSummaryRow.booked_order_count),
      bookedOrderValueByCurrency: orderValues.map((item) => ({
        currency: item.currency,
        amount: item.bookedOrderValue,
      })),
      ordersNeedingFulfillment: toNum(orderSummaryRow.orders_needing_fulfillment),
      ordersNotFullyInvoiced: toNum(orderSummaryRow.orders_not_fully_invoiced),
      currentMonthOrderValueByCurrency: orderValues.map((item) => ({
        currency: item.currency,
        amount: item.currentMonthOrderValue,
      })),
      priorMonthOrderValueByCurrency: orderValues.map((item) => ({
        currency: item.currency,
        amount: item.priorMonthOrderValue,
      })),
    },
    orderMonthly: orderMonthlyResult.rows.map((row) => ({
      month: String(row.month || ''),
      currency: toCurrency(row.currency),
      orderCount: toNum(row.order_count),
      amount: toNum(row.amount),
    })),
    topProducts: productsResult.rows.map((row) => ({
      productName: String(row.product_name || 'Uncatalogued item'),
      sku: row.sku ? String(row.sku) : null,
      currency: toCurrency(row.currency),
      quantity: toNum(row.quantity),
      orderCount: toNum(row.order_count),
      amount: toNum(row.amount),
    })),
    teamPerformance: teamsResult.rows.map((row) => ({
      teamName: String(row.team_name || 'Unassigned'),
      currency: toCurrency(row.currency),
      orderCount: toNum(row.order_count),
      amount: toNum(row.amount),
    })),
    forecast: forecastResult.rows.map((row) => ({
      horizonDays: toNum(row.horizon_days),
      currency: toCurrency(row.currency),
      opportunityCount: toNum(row.opportunity_count),
      openPipelineValue: toNum(row.open_pipeline_value),
      weightedPipelineValue: toNum(row.weighted_pipeline_value),
    })),
  };
}