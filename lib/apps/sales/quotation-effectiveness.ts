import 'server-only';

import {
  hasSalesPermission,
  requireSalesContext,
  SALES_PERMISSIONS,
} from '@/lib/apps/sales/context';
import { queryControl } from '@/lib/db/control';

export type SalesQuotationEffectivenessRow = {
  dimensionKey: string;
  dimensionLabel: string;
  salespersonUserId: string | null;
  currency: string;
  quoteCount: number;
  sentCount: number;
  acceptedCount: number;
  convertedCount: number;
  rejectedCount: number;
  expiredCount: number;
  quotedValue: number;
  acceptedValue: number;
  convertedValue: number;
  lostValue: number;
  sentToAcceptedDays: number | null;
  acceptedToOrderDays: number | null;
  sentToAcceptedRate: number;
  acceptedToOrderRate: number;
};

export type SalesQuotationEffectivenessReport = {
  canViewReports: boolean;
  companyCurrency: string;
  windowDays: number;
  perDimensionCap: number;
  bySalesperson: SalesQuotationEffectivenessRow[];
  byTemplate: SalesQuotationEffectivenessRow[];
};

const REPORT_WINDOW_DAYS = 90;
const PER_DIMENSION_CAP = 100;

const EMPTY_REPORT: SalesQuotationEffectivenessReport = {
  canViewReports: false,
  companyCurrency: 'KES',
  windowDays: REPORT_WINDOW_DAYS,
  perDimensionCap: PER_DIMENSION_CAP,
  bySalesperson: [],
  byTemplate: [],
};

function numeric(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function ratePercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export async function getSalesQuotationEffectivenessReport(): Promise<SalesQuotationEffectivenessReport> {
  const context = await requireSalesContext(SALES_PERMISSIONS.QUOTE_VIEW);
  const companyCurrency = String(
    context.company.currentCompany.currency || 'KES',
  ).toUpperCase();

  const canViewReports = hasSalesPermission(
    context.permissions.isOwner,
    context.permissions.permissionSet,
    SALES_PERMISSIONS.REPORT_VIEW,
  );
  if (!canViewReports) return { ...EMPTY_REPORT, companyCurrency };

  const result = await context.pool.query(
    `
      WITH quote_cohort AS (
        SELECT
          q.id,
          q.salesperson_user_id::text AS salesperson_user_id,
          q.template_id::text AS template_id,
          COALESCE(
            NULLIF(BTRIM(template.name), ''),
            CASE
              WHEN q.template_id IS NULL THEN 'No template'
              ELSE 'Deleted template'
            END
          ) AS template_name,
          UPPER(COALESCE(
            NULLIF(BTRIM(q.currency), ''),
            NULLIF(BTRIM($2::text), ''),
            'KES'
          )) AS currency,
          q.status,
          q.total_amount,
          q.sent_at,
          q.accepted_at,
          q.converted_at,
          q.rejected_at,
          q.expired_at,
          q.sales_order_id
        FROM sales_quotes q
        LEFT JOIN sales_quote_templates template
          ON template.id = q.template_id
         AND template.company_id = q.company_id
         AND template.deleted_at IS NULL
        WHERE q.company_id = $1
          AND q.deleted_at IS NULL
          AND q.quote_date >= CURRENT_DATE - ($3::int * INTERVAL '1 day')
          AND q.quote_date <= CURRENT_DATE
      ),
      salesperson_rollup AS (
        SELECT
          'salesperson'::text AS dimension_type,
          COALESCE(salesperson_user_id, 'unassigned') AS dimension_key,
          NULL::text AS dimension_label,
          salesperson_user_id,
          currency,
          COUNT(*)::int AS quote_count,
          COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent_count,
          COUNT(*) FILTER (
            WHERE accepted_at IS NOT NULL
               OR status IN ('accepted','converted')
               OR sales_order_id IS NOT NULL
          )::int AS accepted_count,
          COUNT(*) FILTER (
            WHERE sales_order_id IS NOT NULL OR status = 'converted'
          )::int AS converted_count,
          COUNT(*) FILTER (
            WHERE rejected_at IS NOT NULL OR status = 'rejected'
          )::int AS rejected_count,
          COUNT(*) FILTER (
            WHERE expired_at IS NOT NULL OR status = 'expired'
          )::int AS expired_count,
          COALESCE(SUM(total_amount), 0) AS quoted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE accepted_at IS NOT NULL
               OR status IN ('accepted','converted')
               OR sales_order_id IS NOT NULL
          ), 0) AS accepted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE sales_order_id IS NOT NULL OR status = 'converted'
          ), 0) AS converted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE rejected_at IS NOT NULL
               OR status = 'rejected'
               OR expired_at IS NOT NULL
               OR status = 'expired'
          ), 0) AS lost_value,
          ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - sent_at)) / 86400.0)
            FILTER (
              WHERE sent_at IS NOT NULL
                AND accepted_at IS NOT NULL
                AND accepted_at >= sent_at
            )::numeric, 1) AS sent_to_accepted_days,
          ROUND(AVG(EXTRACT(EPOCH FROM (converted_at - accepted_at)) / 86400.0)
            FILTER (
              WHERE accepted_at IS NOT NULL
                AND converted_at IS NOT NULL
                AND converted_at >= accepted_at
            )::numeric, 1) AS accepted_to_order_days
        FROM quote_cohort
        GROUP BY salesperson_user_id, currency
      ),
      template_rollup AS (
        SELECT
          'template'::text AS dimension_type,
          COALESCE(template_id, 'none') AS dimension_key,
          template_name AS dimension_label,
          NULL::text AS salesperson_user_id,
          currency,
          COUNT(*)::int AS quote_count,
          COUNT(*) FILTER (WHERE sent_at IS NOT NULL)::int AS sent_count,
          COUNT(*) FILTER (
            WHERE accepted_at IS NOT NULL
               OR status IN ('accepted','converted')
               OR sales_order_id IS NOT NULL
          )::int AS accepted_count,
          COUNT(*) FILTER (
            WHERE sales_order_id IS NOT NULL OR status = 'converted'
          )::int AS converted_count,
          COUNT(*) FILTER (
            WHERE rejected_at IS NOT NULL OR status = 'rejected'
          )::int AS rejected_count,
          COUNT(*) FILTER (
            WHERE expired_at IS NOT NULL OR status = 'expired'
          )::int AS expired_count,
          COALESCE(SUM(total_amount), 0) AS quoted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE accepted_at IS NOT NULL
               OR status IN ('accepted','converted')
               OR sales_order_id IS NOT NULL
          ), 0) AS accepted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE sales_order_id IS NOT NULL OR status = 'converted'
          ), 0) AS converted_value,
          COALESCE(SUM(total_amount) FILTER (
            WHERE rejected_at IS NOT NULL
               OR status = 'rejected'
               OR expired_at IS NOT NULL
               OR status = 'expired'
          ), 0) AS lost_value,
          ROUND(AVG(EXTRACT(EPOCH FROM (accepted_at - sent_at)) / 86400.0)
            FILTER (
              WHERE sent_at IS NOT NULL
                AND accepted_at IS NOT NULL
                AND accepted_at >= sent_at
            )::numeric, 1) AS sent_to_accepted_days,
          ROUND(AVG(EXTRACT(EPOCH FROM (converted_at - accepted_at)) / 86400.0)
            FILTER (
              WHERE accepted_at IS NOT NULL
                AND converted_at IS NOT NULL
                AND converted_at >= accepted_at
            )::numeric, 1) AS accepted_to_order_days
        FROM quote_cohort
        GROUP BY template_id, template_name, currency
      ),
      dimensions AS (
        SELECT * FROM salesperson_rollup
        UNION ALL
        SELECT * FROM template_rollup
      ),
      ranked_dimensions AS (
        SELECT dimensions.*,
          ROW_NUMBER() OVER (
            PARTITION BY dimension_type, currency
            ORDER BY converted_value DESC,
                     accepted_value DESC,
                     quote_count DESC,
                     dimension_label ASC NULLS LAST,
                     dimension_key ASC
          ) AS dimension_rank
        FROM dimensions
      )
      SELECT *
      FROM ranked_dimensions
      WHERE dimension_rank <= $4
      ORDER BY
        dimension_type ASC,
        currency ASC,
        converted_value DESC,
        quote_count DESC,
        dimension_label ASC NULLS LAST
    `,
    [context.companyId, companyCurrency, REPORT_WINDOW_DAYS, PER_DIMENSION_CAP],
  );

  const salespersonIds = Array.from(
    new Set(
      result.rows
        .filter(
          (row) =>
            row.dimension_type === 'salesperson' && row.salesperson_user_id != null,
        )
        .map((row) => String(row.salesperson_user_id)),
    ),
  );

  let activeUsers: Array<{ user_id: string; name: string }> = [];
  if (salespersonIds.length > 0) {
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
      [context.tenantId, salespersonIds],
    );
    activeUsers = users.rows.map((row) => ({
      user_id: String(row.user_id),
      name: String(row.name || 'Salesperson'),
    }));
  }

  const names = new Map(activeUsers.map((user) => [user.user_id, user.name]));

  const rows = result.rows.map((row) => {
    const dimensionType = String(row.dimension_type);
    const key = String(row.dimension_key);
    const rawUserId =
      row.salesperson_user_id == null ? null : String(row.salesperson_user_id);
    const dimensionLabel =
      dimensionType === 'salesperson'
        ? rawUserId === null
          ? 'Unassigned salesperson'
          : names.get(rawUserId) || 'Inactive or unavailable user'
        : String(row.dimension_label || 'No template');

    const sentCount = Number(row.sent_count || 0);
    const acceptedCount = Number(row.accepted_count || 0);
    const convertedCount = Number(row.converted_count || 0);

    return {
      dimensionType,
      dimensionKey: key,
      dimensionLabel,
      salespersonUserId: rawUserId,
      currency: String(row.currency || companyCurrency).toUpperCase(),
      quoteCount: Number(row.quote_count || 0),
      sentCount,
      acceptedCount,
      convertedCount,
      rejectedCount: Number(row.rejected_count || 0),
      expiredCount: Number(row.expired_count || 0),
      quotedValue: numeric(row.quoted_value),
      acceptedValue: numeric(row.accepted_value),
      convertedValue: numeric(row.converted_value),
      lostValue: numeric(row.lost_value),
      sentToAcceptedDays:
        row.sent_to_accepted_days == null
          ? null
          : numeric(row.sent_to_accepted_days),
      acceptedToOrderDays:
        row.accepted_to_order_days == null
          ? null
          : numeric(row.accepted_to_order_days),
      sentToAcceptedRate: ratePercent(acceptedCount, sentCount),
      acceptedToOrderRate: ratePercent(convertedCount, acceptedCount),
    };
  });

  return {
    canViewReports: true,
    companyCurrency,
    windowDays: REPORT_WINDOW_DAYS,
    perDimensionCap: PER_DIMENSION_CAP,
    bySalesperson: rows.filter((row) => row.dimensionType === 'salesperson'),
    byTemplate: rows.filter((row) => row.dimensionType === 'template'),
  };
}