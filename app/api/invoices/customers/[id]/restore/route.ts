import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/customers/[id]/restore
|--------------------------------------------------------------------------
|
| Restores a soft-deleted customer.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    // Check if customer exists and is deleted
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.customers
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    if (!existing.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Customer is not deleted" },
        { status: 409 }
      );
    }

    // Restore
    const result = await client.query(
      `
        UPDATE public.customers
        SET
          status = 'active',
          deleted_at = NULL,
          deleted_by = NULL,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Customer restored successfully",
      customer: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/customers/[id]/restore:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to restore customer",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}