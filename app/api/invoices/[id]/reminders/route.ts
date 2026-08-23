import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/reminders
|--------------------------------------------------------------------------
|
| Returns all reminders for a specific invoice.
|
| ?status=scheduled|sent|failed|cancelled
| ?page=1
| ?limit=25
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Verify invoice exists
    const invoiceCheck = await pool.query(
      `
        SELECT id, invoice_number
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceCheck.rows[0];
    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const page = Math.max(1, Number(searchParams.get("page") || 1));
    const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") || 25)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`r.invoice_id = $1`];
    const values: unknown[] = [id];
    let parameterIndex = 2;

    if (status) {
      if (!isStatus(status)) {
        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      conditions.push(`r.status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_reminders r
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get reminders
    const result = await pool.query(
      `
        SELECT
          r.*
        FROM public.invoice_reminders r
        ${whereClause}
        ORDER BY
          r.scheduled_at ASC NULLS LAST,
          r.created_at DESC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
      reminders: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/reminders:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice reminders",
      },
      { status: 500 }
    );
  }
}

// Helper for status validation (reuse from main route)
const VALID_STATUSES = ["scheduled", "sent", "failed", "cancelled"] as const;
function isStatus(value: unknown): value is (typeof VALID_STATUSES)[number] {
  return typeof value === "string" && VALID_STATUSES.includes(value as any);
}