import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesProductPerformanceRow = {
  productKey: string;
  productName: string;
  sku: string | null;
  currency: string;
  lineCount: number;
  orderCount: number;
  quantityOrdered: number;
  quantityShipped: number;
  quantityDelivered: number;
  quantityInvoiced: number;
  netSales: number;
  discountAmount: number;
  marginAmount: number;
};

export type SalesProductPerformanceReport = {
  rows: SalesProductPerformanceRow[];
  windowDays: number;
  perCurrencyCap: number;
  asOf: string;
};

const REPORT_WINDOW_DAYS = 90;
const PER_CURRENCY_CAP = 250;
const EMPTY_ROWS: SalesProductPerformanceRow[] = [];

export async function getSalesProductPerformance(): Promise<SalesProductPerformanceReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const asOf = new Date().toISOString();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  if (!canViewReports) {
    return {
      rows: EMPTY_ROWS,
      windowDays: REPORT_WINDOW_DAYS,
      perCurrencyCap: PER_CURRENCY_CAP,
      asOf,
    };
  }

  const result = await context.pool.query(
    `
      WITH product_rollup AS (
        SELECT
          CASE
            WHEN i.catalog_item_id IS NOT NULL
              THEN 'catalog:' || i.catalog_item_id::text
            WHEN i.external_product_id IS NOT NULL
              THEN 'external:' || i.external_product_id::text
            ELSE 'description:' || LOWER(BTRIM(i.description))
          END AS product_key,
          COALESCE(MAX(NULLIF(BTRIM(i.description), '')), 'Unnamed product') AS product_name,
          MAX(NULLIF(BTRIM(i.sku_snapshot), '')) AS sku,
          UPPER(COALESCE(
            NULLIF(BTRIM(o.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
          COUNT(*)::int AS line_count,
          COUNT(DISTINCT o.id)::int AS order_count,
          COALESCE(SUM(i.quantity), 0) AS quantity_ordered,
          COALESCE(SUM(i.shipped_quantity), 0) AS quantity_shipped,
          COALESCE(SUM(i.delivered_quantity), 0) AS quantity_delivered,
          COALESCE(SUM(i.invoiced_quantity), 0) AS quantity_invoiced,
          COALESCE(SUM(i.subtotal - i.discount_amount), 0) AS net_sales,
          COALESCE(SUM(i.discount_amount), 0) AS discount_amount,
          COALESCE(SUM(i.margin_amount), 0) AS margin_amount
        FROM sales_order_items_v2 i
        INNER JOIN sales_orders_v2 o
          ON o.id = i.sales_order_id
         AND o.company_id = i.company_id
         AND o.deleted_at IS NULL
        WHERE i.company_id = $1
          AND o.company_id = $1
          AND o.deleted_at IS NULL
          AND o.status IN ('confirmed', 'closed')
          AND o.order_date >= CURRENT_DATE - ($3::int * INTERVAL '1 day')
        GROUP BY
          CASE
            WHEN i.catalog_item_id IS NOT NULL
              THEN 'catalog:' || i.catalog_item_id::text
            WHEN i.external_product_id IS NOT NULL
              THEN 'external:' || i.external_product_id::text
            ELSE 'description:' || LOWER(BTRIM(i.description))
          END,
          UPPER(COALESCE(
            NULLIF(BTRIM(o.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          ))
      ),
      ranked_products AS (
        SELECT product_rollup.*,
          ROW_NUMBER() OVER (
            PARTITION BY currency
            ORDER BY net_sales DESC,
                     order_count DESC,
                     product_name ASC,
                     sku ASC NULLS LAST,
                     product_key ASC
          ) AS currency_rank
        FROM product_rollup
      )
      SELECT *
      FROM ranked_products
      WHERE currency_rank <= $4
      ORDER BY currency ASC,
               net_sales DESC,
               order_count DESC,
               product_name ASC,
               currency_rank ASC
    `,
    [
      context.companyId,
      context.company.currentCompany.currency,
      REPORT_WINDOW_DAYS,
      PER_CURRENCY_CAP,
    ],
  );

  const defaultCurrency = String(
    context.company.currentCompany.currency || 'KES',
  ).toUpperCase();

  return {
    rows: result.rows.map((row) => ({
      productKey: String(row.product_key || 'unknown'),
      productName: String(row.product_name || 'Unnamed product'),
      sku: row.sku == null ? null : String(row.sku),
      currency: String(row.currency || defaultCurrency).toUpperCase(),
      lineCount: Number(row.line_count || 0),
      orderCount: Number(row.order_count || 0),
      quantityOrdered: Number(row.quantity_ordered || 0),
      quantityShipped: Number(row.quantity_shipped || 0),
      quantityDelivered: Number(row.quantity_delivered || 0),
      quantityInvoiced: Number(row.quantity_invoiced || 0),
      netSales: Number(row.net_sales || 0),
      discountAmount: Number(row.discount_amount || 0),
      marginAmount: Number(row.margin_amount || 0),
    })),
    windowDays: REPORT_WINDOW_DAYS,
    perCurrencyCap: PER_CURRENCY_CAP,
    asOf,
  };
}