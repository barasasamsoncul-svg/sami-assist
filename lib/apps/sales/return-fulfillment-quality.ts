import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesReturnStatusSummary = {
  status: string;
  currency: string;
  returnCount: number;
  orderCount: number;
  itemQuantity: number;
  creditAmount: number;
  availableCredit: number;
  refundedAmount: number;
};

export type SalesReturnReasonSummary = {
  reason: string;
  currency: string;
  returnCount: number;
  itemQuantity: number;
  creditAmount: number;
};

export type SalesShipmentStatusSummary = {
  status: string;
  shipmentCount: number;
  orderCount: number;
  itemQuantity: number;
  averageHoursToShip: number | null;
  averageHoursToDeliver: number | null;
};

export type SalesReturnFulfillmentQualityReport = {
  canViewReturns: boolean;
  canViewShipping: boolean;
  returnsByStatus: SalesReturnStatusSummary[];
  returnReasons: SalesReturnReasonSummary[];
  shipmentsByStatus: SalesShipmentStatusSummary[];
};

const EMPTY_REPORT: SalesReturnFulfillmentQualityReport = {
  canViewReturns: false,
  canViewShipping: false,
  returnsByStatus: [],
  returnReasons: [],
  shipmentsByStatus: [],
};

export async function getSalesReturnFulfillmentQualityReport(): Promise<SalesReturnFulfillmentQualityReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  if (!canViewReports) return EMPTY_REPORT;

  const canViewReturns = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.RETURN_VIEW,
  ) || hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.RETURN_MANAGE,
  );
  const canViewShipping = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.SHIPPING_VIEW,
  ) || hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.SHIPPING_MANAGE,
  );

  const [returnStatusResult, returnReasonResult, shipmentResult] = await Promise.all([
    canViewReturns ? context.pool.query(
      `
        WITH item_totals AS (
          SELECT company_id, return_id, COALESCE(SUM(quantity), 0) AS item_quantity
          FROM sales_return_items
          WHERE company_id = $1
          GROUP BY company_id, return_id
        ),
        credit_totals AS (
          SELECT
            company_id,
            return_id,
            COALESCE(SUM(amount), 0) AS credit_amount,
            COALESCE(SUM(available_credit), 0) AS available_credit,
            COALESCE(SUM(refunded_amount), 0) AS refunded_amount
          FROM sales_return_credits
          WHERE company_id = $1
          GROUP BY company_id, return_id
        ),
        return_rows AS (
          SELECT
            r.id,
            r.sales_order_id,
            r.status,
            COALESCE(NULLIF(BTRIM(r.reason), ''), 'Unspecified') AS reason,
            UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), NULLIF(BTRIM($2::text), ''), 'KES')) AS currency,
            COALESCE(i.item_quantity, 0) AS item_quantity,
            COALESCE(c.credit_amount, 0) AS credit_amount,
            COALESCE(c.available_credit, 0) AS available_credit,
            COALESCE(c.refunded_amount, 0) AS refunded_amount
          FROM sales_returns r
          INNER JOIN sales_orders_v2 o
            ON o.id = r.sales_order_id
            AND o.company_id = r.company_id
            AND o.deleted_at IS NULL
          LEFT JOIN item_totals i
            ON i.return_id = r.id
            AND i.company_id = r.company_id
          LEFT JOIN credit_totals c
            ON c.return_id = r.id
            AND c.company_id = r.company_id
          WHERE r.company_id = $1
            AND r.requested_at >= NOW() - INTERVAL '90 days'
            AND o.status <> 'cancelled'
        )
        SELECT
          status,
          currency,
          COUNT(*)::int AS return_count,
          COUNT(DISTINCT sales_order_id)::int AS order_count,
          COALESCE(SUM(item_quantity), 0) AS item_quantity,
          COALESCE(SUM(credit_amount), 0) AS credit_amount,
          COALESCE(SUM(available_credit), 0) AS available_credit,
          COALESCE(SUM(refunded_amount), 0) AS refunded_amount
        FROM return_rows
        GROUP BY status, currency
        ORDER BY currency ASC, return_count DESC, status ASC
        LIMIT 250
      `,
      [context.companyId, context.company.currentCompany.currency],
    ) : Promise.resolve({ rows: [] }),
    canViewReturns ? context.pool.query(
      `
        WITH item_totals AS (
          SELECT company_id, return_id, COALESCE(SUM(quantity), 0) AS item_quantity
          FROM sales_return_items
          WHERE company_id = $1
          GROUP BY company_id, return_id
        ),
        credit_totals AS (
          SELECT company_id, return_id, COALESCE(SUM(amount), 0) AS credit_amount
          FROM sales_return_credits
          WHERE company_id = $1
          GROUP BY company_id, return_id
        ),
        reason_rollup AS (
          SELECT
            COALESCE(NULLIF(BTRIM(r.reason), ''), 'Unspecified') AS reason,
            UPPER(COALESCE(NULLIF(BTRIM(o.currency), ''), NULLIF(BTRIM($2::text), ''), 'KES')) AS currency,
            COUNT(*)::int AS return_count,
            COALESCE(SUM(i.item_quantity), 0) AS item_quantity,
            COALESCE(SUM(c.credit_amount), 0) AS credit_amount
          FROM sales_returns r
          INNER JOIN sales_orders_v2 o
            ON o.id = r.sales_order_id
            AND o.company_id = r.company_id
            AND o.deleted_at IS NULL
          LEFT JOIN item_totals i
            ON i.return_id = r.id
            AND i.company_id = r.company_id
          LEFT JOIN credit_totals c
            ON c.return_id = r.id
            AND c.company_id = r.company_id
          WHERE r.company_id = $1
            AND r.requested_at >= NOW() - INTERVAL '90 days'
            AND r.status <> 'cancelled'
            AND o.status <> 'cancelled'
          GROUP BY reason, currency
        ),
        ranked_reasons AS (
          SELECT reason_rollup.*,
            ROW_NUMBER() OVER (
              PARTITION BY currency
              ORDER BY return_count DESC, credit_amount DESC, reason ASC
            ) AS currency_rank
          FROM reason_rollup
        ),
        balanced_reasons AS (
          SELECT ranked_reasons.*,
            ROW_NUMBER() OVER (
              ORDER BY currency_rank ASC, currency ASC, reason ASC
            ) AS report_rank
          FROM ranked_reasons
        )
        SELECT reason, currency, return_count, item_quantity, credit_amount
        FROM balanced_reasons
        WHERE report_rank <= 100
        ORDER BY currency_rank ASC, currency ASC, reason ASC
      `,
      [context.companyId, context.company.currentCompany.currency],
    ) : Promise.resolve({ rows: [] }),
    canViewShipping ? context.pool.query(
      `
        WITH item_totals AS (
          SELECT company_id, shipment_id, COALESCE(SUM(quantity), 0) AS item_quantity
          FROM sales_shipment_items
          WHERE company_id = $1
          GROUP BY company_id, shipment_id
        )
        SELECT
          s.status,
          COUNT(*)::int AS shipment_count,
          COUNT(DISTINCT s.sales_order_id)::int AS order_count,
          COALESCE(SUM(i.item_quantity), 0) AS item_quantity,
          ROUND((AVG(EXTRACT(EPOCH FROM (s.shipped_at - s.created_at)) / 3600.0)
            FILTER (WHERE s.shipped_at IS NOT NULL AND s.shipped_at >= s.created_at))::numeric, 1) AS average_hours_to_ship,
          ROUND((AVG(EXTRACT(EPOCH FROM (s.delivered_at - s.shipped_at)) / 3600.0)
            FILTER (WHERE s.delivered_at IS NOT NULL AND s.shipped_at IS NOT NULL AND s.delivered_at >= s.shipped_at))::numeric, 1) AS average_hours_to_deliver
        FROM sales_shipments s
        INNER JOIN sales_orders_v2 o
          ON o.id = s.sales_order_id
          AND o.company_id = s.company_id
          AND o.deleted_at IS NULL
          AND o.status <> 'cancelled'
        LEFT JOIN item_totals i
          ON i.shipment_id = s.id
          AND i.company_id = s.company_id
        WHERE s.company_id = $1
          AND s.created_at >= NOW() - INTERVAL '90 days'
        GROUP BY s.status
        ORDER BY shipment_count DESC, s.status ASC
        LIMIT 30
      `,
      [context.companyId],
    ) : Promise.resolve({ rows: [] }),
  ]);

  return {
    canViewReturns,
    canViewShipping,
    returnsByStatus: returnStatusResult.rows.map(row => ({
      status: String(row.status || 'unknown'),
      currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
      returnCount: Number(row.return_count || 0),
      orderCount: Number(row.order_count || 0),
      itemQuantity: Number(row.item_quantity || 0),
      creditAmount: Number(row.credit_amount || 0),
      availableCredit: Number(row.available_credit || 0),
      refundedAmount: Number(row.refunded_amount || 0),
    })),
    returnReasons: returnReasonResult.rows.map(row => ({
      reason: String(row.reason || 'Unspecified'),
      currency: String(row.currency || context.company.currentCompany.currency || 'KES').toUpperCase(),
      returnCount: Number(row.return_count || 0),
      itemQuantity: Number(row.item_quantity || 0),
      creditAmount: Number(row.credit_amount || 0),
    })),
    shipmentsByStatus: shipmentResult.rows.map(row => ({
      status: String(row.status || 'unknown'),
      shipmentCount: Number(row.shipment_count || 0),
      orderCount: Number(row.order_count || 0),
      itemQuantity: Number(row.item_quantity || 0),
      averageHoursToShip: row.average_hours_to_ship == null ? null : Number(row.average_hours_to_ship),
      averageHoursToDeliver: row.average_hours_to_deliver == null ? null : Number(row.average_hours_to_deliver),
    })),
  };
}
