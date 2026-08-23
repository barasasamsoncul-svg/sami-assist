import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/tax-rates/[id]/default
|--------------------------------------------------------------------------
|
| Sets a tax rate as the default.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
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

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify tax rate exists and is active
      const taxRateCheck = await client.query(
        `
          SELECT id, name, is_active
          FROM public.tax_rates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (taxRateCheck.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate not found" },
          { status: 404 }
        );
      }

      const taxRate = taxRateCheck.rows[0];

      if (!taxRate.is_active) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot set an inactive tax rate as default" },
          { status: 400 }
        );
      }

      // Remove default from all other tax rates
      await client.query(
        `
          UPDATE public.tax_rates
          SET
            is_default = false,
            updated_at = NOW()
          WHERE is_default = true
            AND id <> $1
        `,
        [id]
      );

      // Set this tax rate as default
      const result = await client.query(
        `
          UPDATE public.tax_rates
          SET
            is_default = true,
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: `Tax rate "${taxRate.name}" set as default`,
        tax_rate: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/tax-rates/[id]/default:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set default tax rate",
      },
      { status: 500 }
    );
  }
}