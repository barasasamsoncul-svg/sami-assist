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
| GET /api/invoices/archive
|--------------------------------------------------------------------------
|
| Returns archived invoices.
|
| Supports:
| ?customer_id=UUID
| ?status=paid|cancelled|void
| ?from_date=2026-01-01
| ?to_date=2026-12-31
| ?search=invoice_number
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
    const status = searchParams.get("status");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const search = searchParams.get("search");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 50)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (customerId) {
      conditions.push(`customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    if (status) {
      conditions.push(`status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

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

    if (search) {
      conditions.push(`
        (
          invoice_number ILIKE $${parameterIndex}
          OR customer_id::text ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoices_archive
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get archived invoices
    const result = await pool.query(
      `
        SELECT
          id,
          customer_id,
          invoice_number,
          issue_date,
          due_date,
          payment_date,
          status,
          total_amount,
          amount_paid,
          amount_due,
          currency,
          archived_at,
          archived_by
        FROM public.invoices_archive
        ${whereClause}
        ORDER BY archived_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      archived_invoices: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/archive:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch archived invoices",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/archive
|--------------------------------------------------------------------------
|
| Archives invoices based on date and status.
|
| Request body:
| {
|   before_date: string,
|   statuses?: string[],
|   force?: boolean
| }
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

    const body = await req.json();

    const { before_date, statuses, force } = body;

    if (!before_date) {
      return NextResponse.json(
        { error: "before_date is required" },
        { status: 400 }
      );
    }

    const beforeDate = new Date(before_date);
    if (isNaN(beforeDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid before_date" },
        { status: 400 }
      );
    }

    const allowedStatuses = ["paid", "cancelled", "void"];
    const archiveStatuses = statuses || allowedStatuses;

    const invalidStatuses = archiveStatuses.filter((s: string) => !allowedStatuses.includes(s));
    if (invalidStatuses.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid statuses: ${invalidStatuses.join(", ")}. Must be one of: ${allowedStatuses.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Call archive function
      const result = await client.query(
        `
          SELECT public.archive_invoices($1::date, $2::text[]) AS count
        `,
        [before_date, archiveStatuses]
      );

      const count = Number(result.rows[0]?.count || 0);

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: `${count} invoice(s) archived`,
        archived_count: count,
        before_date,
        statuses: archiveStatuses,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/archive:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to archive invoices",
      },
      { status: 500 }
    );
  }
}