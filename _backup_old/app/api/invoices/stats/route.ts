import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/stats
|--------------------------------------------------------------------------
|
| Returns comprehensive invoice statistics.
|
| Supports:
| ?customer_id=UUID            - Filter by customer
| ?from_date=2026-01-01        - Filter by issue date
| ?to_date=2026-12-31          - Filter by issue date
| ?currency=KES                - Filter by currency
| ?include_deleted=false       - Include deleted invoices
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const customerId = searchParams.get("customer_id");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const currency = searchParams.get("currency");
    const includeDeleted = searchParams.get("include_deleted") === "true";

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    // Deleted filter
    if (!includeDeleted) {
      conditions.push(`deleted_at IS NULL`);
    }

    // Customer filter
    if (customerId) {
      conditions.push(`customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    // Date filters
    if (fromDate) {
      conditions.push(`issue_date >= $${parameterIndex}`);
      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`issue_date <= $${parameterIndex}`);
      values.push(toDate);
      parameterIndex++;
    }

    // Currency filter
    if (currency) {
      conditions.push(`currency = $${parameterIndex}`);
      values.push(currency);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Main stats query
    const result = await pool.query(
      `
        SELECT
          -- Invoice counts by status
          COUNT(*)::int AS total_invoices,

          COUNT(*) FILTER (WHERE status = 'draft')::int AS draft_invoices,
          COUNT(*) FILTER (WHERE status = 'pending_approval')::int AS pending_approval_invoices,
          COUNT(*) FILTER (WHERE status = 'sent')::int AS sent_invoices,
          COUNT(*) FILTER (WHERE status = 'viewed')::int AS viewed_invoices,
          COUNT(*) FILTER (WHERE status = 'partially_paid')::int AS partially_paid_invoices,
          COUNT(*) FILTER (WHERE status = 'paid')::int AS paid_invoices,
          COUNT(*) FILTER (WHERE status = 'overdue')::int AS overdue_invoices,
          COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_invoices,
          COUNT(*) FILTER (WHERE status = 'void')::int AS void_invoices,

          -- Financial totals
          COALESCE(SUM(total_amount), 0)::numeric AS total_invoiced,
          COALESCE(SUM(amount_paid), 0)::numeric AS total_collected,
          COALESCE(SUM(amount_due), 0)::numeric AS total_outstanding,

          -- Averages
          COALESCE(AVG(total_amount), 0)::numeric AS average_invoice_amount,
          COALESCE(AVG(amount_due), 0)::numeric AS average_outstanding,

          -- Counts by payment terms
          COUNT(*) FILTER (WHERE payment_terms_id IS NOT NULL)::int AS invoices_with_terms,
          COUNT(*) FILTER (WHERE payment_terms_id IS NULL)::int AS invoices_without_terms,

          -- Date ranges
          MIN(issue_date) AS first_invoice_date,
          MAX(issue_date) AS last_invoice_date,

          -- Unique counts
          COUNT(DISTINCT customer_id)::int AS unique_customers,
          COUNT(DISTINCT currency)::int AS unique_currencies,

          -- Delinquency metrics
          COUNT(*) FILTER (
            WHERE status NOT IN ('paid', 'cancelled', 'void')
              AND amount_due > 0
              AND due_date IS NOT NULL
              AND due_date < CURRENT_DATE
          )::int AS overdue_count,

          COALESCE(SUM(
            CASE
              WHEN status NOT IN ('paid', 'cancelled', 'void')
                AND amount_due > 0
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE
              THEN amount_due
              ELSE 0
            END
          ), 0)::numeric AS overdue_amount,

          -- Aging buckets (days past due)
          COALESCE(SUM(
            CASE
              WHEN status NOT IN ('paid', 'cancelled', 'void')
                AND amount_due > 0
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) <= 30
              THEN amount_due
              ELSE 0
            END
          ), 0)::numeric AS aging_0_30,

          COALESCE(SUM(
            CASE
              WHEN status NOT IN ('paid', 'cancelled', 'void')
                AND amount_due > 0
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) > 30
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) <= 60
              THEN amount_due
              ELSE 0
            END
          ), 0)::numeric AS aging_31_60,

          COALESCE(SUM(
            CASE
              WHEN status NOT IN ('paid', 'cancelled', 'void')
                AND amount_due > 0
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) > 60
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) <= 90
              THEN amount_due
              ELSE 0
            END
          ), 0)::numeric AS aging_61_90,

          COALESCE(SUM(
            CASE
              WHEN status NOT IN ('paid', 'cancelled', 'void')
                AND amount_due > 0
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE
                AND EXTRACT(DAY FROM (CURRENT_DATE - due_date)) > 90
              THEN amount_due
              ELSE 0
            END
          ), 0)::numeric AS aging_91_plus

        FROM public.invoices
        ${whereClause}
      `,
      values
    );

    const stats = result.rows[0];

    // Calculate collection rate
    const totalInvoiced = toDecimal(stats.total_invoiced);
    const totalCollected = toDecimal(stats.total_collected);
    const collectionRate = totalInvoiced > 0 ? (totalCollected / totalInvoiced) * 100 : 0;

    // Get monthly trend data (last 12 months)
    const trendResult = await pool.query(
      `
        SELECT
          DATE_TRUNC('month', issue_date) AS month,
          COUNT(*)::int AS invoice_count,
          COALESCE(SUM(total_amount), 0)::numeric AS total_amount,
          COALESCE(SUM(amount_paid), 0)::numeric AS total_paid,
          COALESCE(SUM(amount_due), 0)::numeric AS total_due
        FROM public.invoices
        ${whereClause}
        GROUP BY DATE_TRUNC('month', issue_date)
        ORDER BY month DESC
        LIMIT 12
      `,
      values
    );

    // Get top customers by revenue
    const topCustomersResult = await pool.query(
      `
        SELECT
          c.id,
          c.company_name,
          c.email,
          COUNT(i.id)::int AS invoice_count,
          COALESCE(SUM(i.total_amount), 0)::numeric AS total_revenue,
          COALESCE(SUM(i.amount_due), 0)::numeric AS total_outstanding
        FROM public.invoices i
        INNER JOIN public.customers c ON c.id = i.customer_id
        ${whereClause}
        GROUP BY c.id, c.company_name, c.email
        ORDER BY total_revenue DESC
        LIMIT 5
      `,
      values
    );

    // Get status distribution percentages
    const totalInvoices = toNumber(stats.total_invoices);
    const statusDistribution = {
      draft: {
        count: toNumber(stats.draft_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.draft_invoices) / totalInvoices) * 100 : 0,
      },
      pending_approval: {
        count: toNumber(stats.pending_approval_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.pending_approval_invoices) / totalInvoices) * 100 : 0,
      },
      sent: {
        count: toNumber(stats.sent_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.sent_invoices) / totalInvoices) * 100 : 0,
      },
      viewed: {
        count: toNumber(stats.viewed_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.viewed_invoices) / totalInvoices) * 100 : 0,
      },
      partially_paid: {
        count: toNumber(stats.partially_paid_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.partially_paid_invoices) / totalInvoices) * 100 : 0,
      },
      paid: {
        count: toNumber(stats.paid_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.paid_invoices) / totalInvoices) * 100 : 0,
      },
      overdue: {
        count: toNumber(stats.overdue_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.overdue_invoices) / totalInvoices) * 100 : 0,
      },
      cancelled: {
        count: toNumber(stats.cancelled_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.cancelled_invoices) / totalInvoices) * 100 : 0,
      },
      void: {
        count: toNumber(stats.void_invoices),
        percentage: totalInvoices > 0 ? (toNumber(stats.void_invoices) / totalInvoices) * 100 : 0,
      },
    };

    return NextResponse.json({
      success: true,
      stats: {
        // Invoice counts
        total_invoices: toNumber(stats.total_invoices),
        draft_invoices: toNumber(stats.draft_invoices),
        pending_approval_invoices: toNumber(stats.pending_approval_invoices),
        sent_invoices: toNumber(stats.sent_invoices),
        viewed_invoices: toNumber(stats.viewed_invoices),
        partially_paid_invoices: toNumber(stats.partially_paid_invoices),
        paid_invoices: toNumber(stats.paid_invoices),
        overdue_invoices: toNumber(stats.overdue_invoices),
        cancelled_invoices: toNumber(stats.cancelled_invoices),
        void_invoices: toNumber(stats.void_invoices),

        // Financial totals
        total_invoiced: toDecimal(stats.total_invoiced),
        total_collected: toDecimal(stats.total_collected),
        total_outstanding: toDecimal(stats.total_outstanding),
        collection_rate: Math.round(collectionRate * 100) / 100,

        // Averages
        average_invoice_amount: toDecimal(stats.average_invoice_amount),
        average_outstanding: toDecimal(stats.average_outstanding),

        // Payment terms
        invoices_with_terms: toNumber(stats.invoices_with_terms),
        invoices_without_terms: toNumber(stats.invoices_without_terms),

        // Date ranges
        first_invoice_date: stats.first_invoice_date,
        last_invoice_date: stats.last_invoice_date,

        // Unique counts
        unique_customers: toNumber(stats.unique_customers),
        unique_currencies: toNumber(stats.unique_currencies),

        // Overdue metrics
        overdue_count: toNumber(stats.overdue_count),
        overdue_amount: toDecimal(stats.overdue_amount),

        // Aging buckets
        aging_0_30: toDecimal(stats.aging_0_30),
        aging_31_60: toDecimal(stats.aging_31_60),
        aging_61_90: toDecimal(stats.aging_61_90),
        aging_91_plus: toDecimal(stats.aging_91_plus),

        // Status distribution
        status_distribution: statusDistribution,
      },
      trends: trendResult.rows.map((row) => ({
        month: row.month,
        invoice_count: toNumber(row.invoice_count),
        total_amount: toDecimal(row.total_amount),
        total_paid: toDecimal(row.total_paid),
        total_due: toDecimal(row.total_due),
        collection_rate: toDecimal(row.total_amount) > 0
          ? Math.round((toDecimal(row.total_paid) / toDecimal(row.total_amount)) * 10000) / 100
          : 0,
      })),
      top_customers: topCustomersResult.rows.map((row) => ({
        id: row.id,
        company_name: row.company_name,
        email: row.email,
        invoice_count: toNumber(row.invoice_count),
        total_revenue: toDecimal(row.total_revenue),
        total_outstanding: toDecimal(row.total_outstanding),
      })),
    });
  } catch (error) {
    console.error("GET /api/invoices/stats error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load invoice statistics",
      },
      { status: 500 }
    );
  }
}