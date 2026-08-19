import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/tax-rates/[id]
|--------------------------------------------------------------------------
|
| Returns a single tax rate.
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
        { error: "Tax rate ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          rate,
          tax_type,
          country,
          region,
          is_default,
          is_active,
          sort_order,
          metadata,
          created_at,
          updated_at
        FROM public.tax_rates
        WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tax_rate: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/tax-rates/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch tax rate",
      },
      { status: 500 }
    );
  }
}