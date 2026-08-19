import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/upcoming
|--------------------------------------------------------------------------
|
| Returns invoices that are due soon (upcoming) or overdue.
|
| Supports:
| ?days=7                    - Number of days ahead to look (default: 7)
| ?status=overdue            - Filter by status (overdue, upcoming, all)
| ?customer_id=UUID          - Filter by customer
| ?min_amount=100            - Minimum amount
| ?max_amount=1000           - Maximum amount
| ?page=1
| ?limit=50
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

    const days = Math.max(1, toNumber(searchParams.get("days"), 7));
    const statusFilter = searchParams.get("status") || "all";
    const customerId = searchParams.get("customer_id");
    const minAmount = searchParams.get("min_amount");
    const maxAmount = searchParams.get("max_amount");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 50)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    // Only show non-deleted invoices
    conditions.push(`i.deleted_at IS NULL`);

    // Only show invoices with due date
    conditions.push(`i.due_date IS NOT NULL`);

    // Exclude paid, cancelled, and void invoices
    conditions.push(`i.status NOT IN ('paid', 'cancelled', 'void')`);

    // Date range
    if (statusFilter === "overdue") {
      // Only overdue invoices (past due date)
      conditions.push(`i.due_date < CURRENT_DATE`);
    } else if (statusFilter === "upcoming") {
      // Only upcoming invoices (future due date within days)
      conditions.push(`i.due_date >= CURRENT_DATE`);
      conditions.push(`i.due_date <= CURRENT_DATE + INTERVAL '${days} days'`);
    } else {
      // All: both overdue and upcoming
      conditions.push(`i.due_date <= CURRENT_DATE + INTERVAL '${days} days'`);
    }

    // Customer filter
    if (customerId) {
      conditions.push(`i.customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    // Amount filters
    if (minAmount) {
      conditions.push(`i.total_amount >= $${parameterIndex}`);
      values.push(toDecimal(minAmount));
      parameterIndex++;
    }

    if (maxAmount) {
      conditions.push(`i.total_amount <= $${parameterIndex}`);
      values.push(toDecimal(maxAmount));
      parameterIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoices i
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get invoices with full details
    const result = await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.issue_date,
          i.due_date,
          i.status,
          i.subtotal,
          i.discount_type,
          i.discount_value,
          i.discount_amount,
          i.tax_calculation_method,
          i.tax_amount,
          i.shipping_cost,
          i.shipping_tax,
          i.rounding_adjustment,
          i.rounded_total,
          i.total_amount,
          i.amount_paid,
          i.amount_due,
          i.currency,
          i.po_number,
          i.payment_terms_display,
          i.fiscal_year,
          i.fiscal_period,
          i.notes,
          i.created_at,
          i.updated_at,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone,
            'billing_address', c.billing_address,
            'tax_id', c.tax_id,
            'currency', c.currency,
            'credit_limit', c.credit_limit
          ) AS customer,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', ii.id,
                  'description', ii.description,
                  'quantity', ii.quantity,
                  'unit_price', ii.unit_price,
                  'line_total', ii.line_total
                )
                ORDER BY ii.sort_order
              ),
              '[]'::json
            )
            FROM public.invoice_items ii
            WHERE ii.invoice_id = i.id
          ) AS items,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments
            WHERE invoice_id = i.id
              AND status = 'completed'
          ) AS total_paid

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        ${whereClause}

        ORDER BY
          i.due_date ASC,
          i.created_at ASC

        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    // Get summary statistics
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::integer AS total_count,
          COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount_due ELSE 0 END), 0) AS overdue_amount,
          COALESCE(SUM(CASE WHEN due_date >= CURRENT_DATE THEN amount_due ELSE 0 END), 0) AS upcoming_amount,
          COALESCE(SUM(amount_due), 0) AS total_due,
          COUNT(CASE WHEN due_date < CURRENT_DATE THEN 1 END)::integer AS overdue_count,
          COUNT(CASE WHEN due_date >= CURRENT_DATE THEN 1 END)::integer AS upcoming_count,
          COALESCE(AVG(amount_due), 0) AS average_due
        FROM public.invoices i
        ${whereClause}
      `,
      values
    );

    const summary = summaryResult.rows[0];

    return NextResponse.json({
      success: true,
      invoices: result.rows,
      summary: {
        total_count: Number(summary?.total_count || 0),
        overdue_amount: toDecimal(summary?.overdue_amount || 0),
        upcoming_amount: toDecimal(summary?.upcoming_amount || 0),
        total_due: toDecimal(summary?.total_due || 0),
        overdue_count: Number(summary?.overdue_count || 0),
        upcoming_count: Number(summary?.upcoming_count || 0),
        average_due: toDecimal(summary?.average_due || 0),
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/upcoming error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch upcoming invoices",
      },
      { status: 500 }
    );
  }
}