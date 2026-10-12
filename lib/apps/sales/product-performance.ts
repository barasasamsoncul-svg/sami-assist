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

const EMPTY_REPORT: { rows: SalesProductPerformanceRow[] } = { rows: [] };

export async function getSalesProductPerformance(): Promise<{ rows: SalesProductPerformanceRow[] }> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  if (!canViewReports) return EMPTY_REPORT;

  const result = await context.pool.query(
    `
      SELECT
        CASE
          WHEN i.catalog_item_id IS NOT NULL THEN 'catalog:' || i.catalog_item_id::text
          WHEN i.external_product_id IS NOT NULL THEN 'external:' || i.external_product_id::text
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
        AND o.order_date >= CURRENT_DATE - INTERVAL '90 days'
      GROUP BY product_key, currency
      ORDER BY net_sales DESC, order_count DESC, product_name ASC, currency ASC
      LIMIT 250
    `,
    [context.companyId, context.company.currentCompany.currency],
  );

  return {
    rows: result.rows.map(row => ({
      productKey: String(row.product_key || 'unknown'),
      productName: String(row.product_name || 'Unnamed product'),
      sku: row.sku == null ? null : String(row.sku),
      currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
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
  };
}
