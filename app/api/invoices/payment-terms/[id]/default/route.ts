import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/payment-terms/[id]/default
|--------------------------------------------------------------------------
|
| Sets a payment term as the default.
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
        { error: "Payment term ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify payment term exists and is active
      const termCheck = await client.query(
        `
          SELECT id, name, is_active
          FROM public.payment_terms
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (termCheck.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment term not found" },
          { status: 404 }
        );
      }

      const term = termCheck.rows[0];

      if (!term.is_active) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot set an inactive payment term as default" },
          { status: 400 }
        );
      }

      // Remove default from all other payment terms
      await client.query(
        `
          UPDATE public.payment_terms
          SET
            is_default = false,
            updated_at = NOW()
          WHERE is_default = true
            AND id <> $1
        `,
        [id]
      );

      // Set this payment term as default
      const result = await client.query(
        `
          UPDATE public.payment_terms
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
        message: `Payment term "${term.name}" set as default`,
        payment_term: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/payment-terms/[id]/default:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to set default payment term",
      },
      { status: 500 }
    );
  }
}