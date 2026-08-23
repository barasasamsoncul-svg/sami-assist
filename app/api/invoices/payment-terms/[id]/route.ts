import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/payment-terms/[id]
|--------------------------------------------------------------------------
|
| Returns a single payment term.
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
        { error: "Payment term ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          description,
          due_days,
          discount_percentage,
          discount_days,
          is_default,
          is_active,
          sort_order,
          metadata,
          created_at,
          updated_at
        FROM public.payment_terms
        WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment term not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      payment_term: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/payment-terms/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch payment term",
      },
      { status: 500 }
    );
  }
}