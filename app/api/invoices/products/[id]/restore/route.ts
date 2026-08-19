import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| POST /api/invoices/products/[id]/restore
|--------------------------------------------------------------------------
|
| Restores a soft-deleted product by setting is_active = true.
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
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if product exists and is inactive
      const existing = await client.query(
        `
          SELECT id, name, is_active
          FROM public.products
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existing.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }

      const product = existing.rows[0];

      if (product.is_active) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product is already active" },
          { status: 409 }
        );
      }

      // Restore
      const result = await client.query(
        `
          UPDATE public.products
          SET
            is_active = true,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, sku, is_active
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: `Product "${product.name}" restored successfully`,
        product: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/products/[id]/restore:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to restore product",
      },
      { status: 500 }
    );
  }
}