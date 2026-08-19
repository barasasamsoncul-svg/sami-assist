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

/*
|--------------------------------------------------------------------------
| POST /api/invoices/overdue
|--------------------------------------------------------------------------
|
| Marks all overdue invoices as overdue status.
| This should be called by a cron job.
|
| Returns the number of invoices marked as overdue.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Call the database function
    const result = await pool.query(
      `
        SELECT public.mark_overdue_invoices() AS count
      `
    );

    const count = Number(result.rows[0]?.count || 0);

    return NextResponse.json({
      success: true,
      message: `${count} invoice(s) marked as overdue`,
      count,
    });
  } catch (error) {
    console.error("POST /api/invoices/overdue error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to mark overdue invoices",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/overdue
|--------------------------------------------------------------------------
|
| Returns all overdue invoices.
|
| Supports:
| ?customer_id=UUID
| ?days=30                    - Days overdue (default: all)
| ?min_amount=100
| ?max_amount=1000
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

    const customerId = searchParams.get("customer_id");
    const days = searchParams.get("days");
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

    // Only show overdue invoices (past due date with amount due > 0)
    conditions.push(`i.due_date IS NOT NULL`);
    conditions.push(`i.due_date < CURRENT_DATE`);
    conditions.push(`i.amount_due > 0`);
    conditions.push(`i.status NOT IN ('paid', 'cancelled', 'void', 'draft', 'pending_approval')`);

    if (customerId) {
      conditions.push(`i.customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    if (days) {
      conditions.push(`i.due_date >= CURRENT_DATE - INTERVAL '${days} days'`);
    }

    if (minAmount) {
      conditions.push(`i.amount_due >= $${parameterIndex}`);
      values.push(toDecimal(minAmount));
      parameterIndex++;
    }

    if (maxAmount) {
      conditions.push(`i.amount_due <= $${parameterIndex}`);
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

    // Get overdue invoices
    const result = await pool.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.issue_date,
          i.due_date,
          i.status,
          i.total_amount,
          i.amount_paid,
          i.amount_due,
          i.currency,
          i.po_number,
          i.payment_terms_display,
          i.notes,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone,
            'billing_address', c.billing_address,
            'tax_id', c.tax_id
          ) AS customer,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments
            WHERE invoice_id = i.id
              AND status = 'completed'
          ) AS total_paid,

          EXTRACT(DAY FROM (CURRENT_DATE - i.due_date))::integer AS days_overdue

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        ${whereClause}

        ORDER BY
          i.due_date ASC,
          i.amount_due DESC

        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    // Get summary
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::integer AS count,
          COALESCE(SUM(amount_due), 0) AS total_due,
          COALESCE(AVG(amount_due), 0) AS average_due,
          MIN(due_date) AS oldest_due_date,
          MAX(due_date) AS newest_due_date
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
        count: Number(summary?.count || 0),
        total_due: toDecimal(summary?.total_due || 0),
        average_due: toDecimal(summary?.average_due || 0),
        oldest_due_date: summary?.oldest_due_date,
        newest_due_date: summary?.newest_due_date,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/overdue error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch overdue invoices",
      },
      { status: 500 }
    );
  }
}