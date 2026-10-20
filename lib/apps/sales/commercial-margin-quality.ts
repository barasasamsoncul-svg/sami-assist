import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';

export type SalesCommercialQualitySummary = {
  documentType: 'quotation' | 'order';
  currency: string;
  documentCount: number;
  subtotal: number;
  discountAmount: number;
  netValue: number;
  costTotal: number;
  marginAmount: number;
  marginPercent: number;
  averageDiscountPercent: number;
  lowMarginCount: number;
  highDiscountCount: number;
};

export type SalesCommercialQualityRiskRow = {
  id: string;
  documentType: 'quotation' | 'order';
  documentNumber: string;
  customerName: string;
  status: string;
  currency: string;
  documentDate: string;
  netValue: number;
  discountAmount: number;
  discountPercent: number;
  marginAmount: number;
  marginPercent: number;
  riskReason: string;
};

export type SalesCommercialMarginQualityReport = {
  canViewCommercialQuality: boolean;
  windowDays: number;
  marginThresholdPercent: number;
  discountThresholdPercent: number;
  perCurrencyRiskCap: number;
  asOf: string;
  summaries: SalesCommercialQualitySummary[];
  risks: SalesCommercialQualityRiskRow[];
};

const REPORT_WINDOW_DAYS = 90;
const MARGIN_THRESHOLD_PERCENT = 10;
const DISCOUNT_THRESHOLD_PERCENT = 20;
const PER_CURRENCY_RISK_CAP = 350;

const EMPTY_REPORT: SalesCommercialMarginQualityReport = {
  canViewCommercialQuality: false,
  windowDays: REPORT_WINDOW_DAYS,
  marginThresholdPercent: MARGIN_THRESHOLD_PERCENT,
  discountThresholdPercent: DISCOUNT_THRESHOLD_PERCENT,
  perCurrencyRiskCap: PER_CURRENCY_RISK_CAP,
  asOf: '',
  summaries: [],
  risks: [],
};

function safeNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toCurrency(value: unknown, fallback: string): string {
  return String(value || fallback).toUpperCase();
}

export async function getSalesCommercialMarginQualityReport(): Promise<SalesCommercialMarginQualityReport> {
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
  const canViewMargins =
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.MARGIN_VIEW,
    ) ||
    hasSalesPermission(
      context.permissions.isOwner,
      context.permissions.permissionSet,
      SALES_PERMISSIONS.MARGIN_MANAGE,
    );

  if (!canViewReports || !canViewMargins) {
    return { ...EMPTY_REPORT, asOf };
  }

  const result = await context.pool.query(
    `
      WITH documents AS (
        SELECT
          'quotation'::text AS document_type,
          q.id::text AS id,
          q.quote_number AS document_number,
          q.customer_name,
          q.status,
          q.quote_date AS document_date,
          UPPER(COALESCE(
            NULLIF(BTRIM(q.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
          COALESCE(q.subtotal, 0)::numeric AS subtotal,
          COALESCE(q.discount_total, 0)::numeric AS discount_amount,
          COALESCE(q.cost_total, 0)::numeric AS cost_total,
          COALESCE(q.margin_amount, 0)::numeric AS margin_amount,
          COALESCE(q.margin_percent, 0)::numeric AS margin_percent
        FROM sales_quotes q
        WHERE q.company_id = $1
          AND q.deleted_at IS NULL
          AND q.quote_date >= CURRENT_DATE - ($3::int * INTERVAL '1 day')
          AND q.quote_date <= CURRENT_DATE

        UNION ALL

        SELECT
          'order'::text AS document_type,
          o.id::text AS id,
          o.order_number AS document_number,
          o.customer_name,
          o.status,
          o.order_date AS document_date,
          UPPER(COALESCE(
            NULLIF(BTRIM(o.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
          COALESCE(o.subtotal, 0)::numeric AS subtotal,
          COALESCE(o.discount_total, 0)::numeric AS discount_amount,
          COALESCE(o.cost_total, 0)::numeric AS cost_total,
          COALESCE(o.margin_amount, 0)::numeric AS margin_amount,
          COALESCE(o.margin_percent, 0)::numeric AS margin_percent
        FROM sales_orders_v2 o
        WHERE o.company_id = $1
          AND o.deleted_at IS NULL
          AND o.status IN ('confirmed','closed')
          AND o.order_date >= CURRENT_DATE - ($3::int * INTERVAL '1 day')
          AND o.order_date <= CURRENT_DATE
      ),
      assessed AS (
        SELECT
          documents.*,
          CASE WHEN subtotal > 0
            THEN ROUND((discount_amount / subtotal * 100)::numeric, 2)
            ELSE 0
          END AS discount_percent,
          GREATEST(0, subtotal - discount_amount) AS net_value
        FROM documents
      ),
      summary AS (
        SELECT
          document_type,
          currency,
          COUNT(*)::int AS document_count,
          COALESCE(SUM(subtotal), 0) AS subtotal,
          COALESCE(SUM(discount_amount), 0) AS discount_amount,
          COALESCE(SUM(net_value), 0) AS net_value,
          COALESCE(SUM(cost_total), 0) AS cost_total,
          COALESCE(SUM(margin_amount), 0) AS margin_amount,
          CASE WHEN SUM(net_value) > 0
            THEN ROUND((SUM(margin_amount) / SUM(net_value) * 100)::numeric, 2)
            ELSE 0
          END AS weighted_margin_percent,
          CASE WHEN SUM(subtotal) > 0
            THEN ROUND((SUM(discount_amount) / SUM(subtotal) * 100)::numeric, 2)
            ELSE 0
          END AS average_discount_percent,
          COUNT(*) FILTER (WHERE margin_percent < $4)::int AS low_margin_count,
          COUNT(*) FILTER (WHERE discount_percent >= $5)::int AS high_discount_count
        FROM assessed
        GROUP BY document_type, currency
      ),
      risks AS (
        SELECT
          assessed.*,
          CONCAT_WS(
            ' + ',
            CASE WHEN margin_percent < $4 THEN 'Below margin threshold' END,
            CASE WHEN discount_percent >= $5 THEN 'High discount' END
          ) AS risk_reason
        FROM assessed
        WHERE (
          document_type = 'quotation'
          AND status IN ('draft','sent','viewed','accepted')
        ) OR (
          document_type = 'order'
          AND status = 'confirmed'
        )
      ),
      report_rows AS (
        SELECT
          'summary'::text AS row_type,
          s.document_type,
          NULL::text AS id,
          NULL::text AS document_number,
          NULL::text AS customer_name,
          NULL::text AS status,
          NULL::date AS document_date,
          s.currency,
          s.document_count,
          s.subtotal,
          s.discount_amount,
          s.net_value,
          s.cost_total,
          s.margin_amount,
          s.weighted_margin_percent AS margin_percent,
          s.average_discount_percent AS discount_percent,
          s.low_margin_count,
          s.high_discount_count,
          NULL::text AS risk_reason
        FROM summary s

        UNION ALL

        SELECT
          'risk'::text AS row_type,
          r.document_type,
          r.id,
          r.document_number,
          r.customer_name,
          r.status,
          r.document_date,
          r.currency,
          NULL::int AS document_count,
          r.subtotal,
          r.discount_amount,
          r.net_value,
          r.cost_total,
          r.margin_amount,
          r.margin_percent,
          r.discount_percent,
          NULL::int AS low_margin_count,
          NULL::int AS high_discount_count,
          r.risk_reason
        FROM risks r
        WHERE r.margin_percent < $4 OR r.discount_percent >= $5
      ),
      ranked_rows AS (
        SELECT report_rows.*,
          ROW_NUMBER() OVER (
            PARTITION BY row_type, currency
            ORDER BY
              margin_percent ASC NULLS LAST,
              discount_percent DESC NULLS LAST,
              document_date ASC NULLS LAST,
              document_number ASC NULLS LAST,
              id ASC NULLS LAST
          ) AS currency_rank
        FROM report_rows
      )
      SELECT *
      FROM ranked_rows
      WHERE row_type = 'summary' OR currency_rank <= $6
      ORDER BY
        row_type DESC,
        currency ASC,
        margin_percent ASC NULLS LAST,
        discount_percent DESC NULLS LAST,
        document_date ASC NULLS LAST,
        document_number ASC NULLS LAST
    `,
    [
      context.companyId,
      context.company.currentCompany.currency,
      REPORT_WINDOW_DAYS,
      MARGIN_THRESHOLD_PERCENT,
      DISCOUNT_THRESHOLD_PERCENT,
      PER_CURRENCY_RISK_CAP,
    ],
  );

  const summaries: SalesCommercialQualitySummary[] = [];
  const risks: SalesCommercialQualityRiskRow[] = [];

  for (const row of result.rows) {
    if (row.row_type === 'summary') {
      summaries.push({
        documentType: String(row.document_type) as 'quotation' | 'order',
        currency: toCurrency(row.currency, companyCurrency),
        documentCount: Number(row.document_count || 0),
        subtotal: safeNumber(row.subtotal),
        discountAmount: safeNumber(row.discount_amount),
        netValue: safeNumber(row.net_value),
        costTotal: safeNumber(row.cost_total),
        marginAmount: safeNumber(row.margin_amount),
        marginPercent: safeNumber(row.margin_percent),
        averageDiscountPercent: safeNumber(row.discount_percent),
        lowMarginCount: Number(row.low_margin_count || 0),
        highDiscountCount: Number(row.high_discount_count || 0),
      });
    } else {
      risks.push({
        id: String(row.id),
        documentType: String(row.document_type) as 'quotation' | 'order',
        documentNumber: String(row.document_number || ''),
        customerName: String(row.customer_name || 'Unnamed customer'),
        status: String(row.status || 'unknown'),
        currency: toCurrency(row.currency, companyCurrency),
        documentDate:
          row.document_date == null ? '' : String(row.document_date).slice(0, 10),
        netValue: safeNumber(row.net_value),
        discountAmount: safeNumber(row.discount_amount),
        discountPercent: safeNumber(row.discount_percent),
        marginAmount: safeNumber(row.margin_amount),
        marginPercent: safeNumber(row.margin_percent),
        riskReason: String(row.risk_reason || 'Review commercial terms'),
      });
    }
  }

  return {
    canViewCommercialQuality: true,
    windowDays: REPORT_WINDOW_DAYS,
    marginThresholdPercent: MARGIN_THRESHOLD_PERCENT,
    discountThresholdPercent: DISCOUNT_THRESHOLD_PERCENT,
    perCurrencyRiskCap: PER_CURRENCY_RISK_CAP,
    asOf,
    summaries,
    risks,
  };
}