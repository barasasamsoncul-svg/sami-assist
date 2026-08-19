import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/activity
|--------------------------------------------------------------------------
|
| Returns activity log for a specific invoice.
|
| ?action=created
| ?page=1
| ?limit=50
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

    const action = searchParams.get("action");
    const pageValue = Number(searchParams.get("page") || "1");
    const limitValue = Number(searchParams.get("limit") || "50");

    const page = Number.isFinite(pageValue) ? Math.max(1, Math.floor(pageValue)) : 1;
    const limit = Number.isFinite(limitValue) ? Math.min(100, Math.max(1, Math.floor(limitValue))) : 50;
    const offset = (page - 1) * limit;

    const conditions: string[] = [`invoice_id = $1`];
    const values: unknown[] = [id];
    let parameterIndex = 2;

    if (action) {
      conditions.push(`action = $${parameterIndex}`);
      values.push(action);
      parameterIndex++;
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;

    // Get count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_activity_log
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

    // Get activities
    const result = await pool.query(
      `
        SELECT
          id,
          invoice_id,
          user_id,
          user_name,
          action,
          details,
          ip_address,
          user_agent,
          created_at
        FROM public.invoice_activity_log
        ${whereClause}
        ORDER BY created_at DESC
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
      activities: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total > 0 ? Math.ceil(total / limit) : 0,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/activity:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice activity",
      },
      { status: 500 }
    );
  }
}