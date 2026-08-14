import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

// GET: Get single product
export async function GET(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const result = await pool.query(
      `
      SELECT 
        p.*,
        t.name as tax_name,
        t.rate as tax_rate
      FROM products p
      LEFT JOIN tax_rates t ON p.tax_rate_id = t.id
      WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Product fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load product" },
      { status: 500 },
    );
  }
}

// PATCH: Update product
export async function PATCH(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    const check = await pool.query(`SELECT id FROM products WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    const {
      name,
      description,
      sku,
      unit_price,
      tax_rate_id,
      category,
      is_active,
      notes,
    } = body;

    const result = await pool.query(
      `
      UPDATE products SET
        name = COALESCE($1, name),
        description = $2,
        sku = $3,
        unit_price = COALESCE($4, unit_price),
        tax_rate_id = $5,
        category = $6,
        is_active = COALESCE($7, is_active),
        notes = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        name || null,
        description || null,
        sku || null,
        unit_price || null,
        tax_rate_id || null,
        category || null,
        is_active !== undefined ? is_active : null,
        notes || null,
        id,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Product update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update product" },
      { status: 500 },
    );
  }
}

// DELETE: Delete or deactivate product
export async function DELETE(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const check = await pool.query(`SELECT id FROM products WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 });
    }

    // Check if product is used in any invoice
    const usageCheck = await pool.query(
      `SELECT COUNT(*) FROM invoice_items WHERE product_id = $1`,
      [id]
    );

    if (parseInt(usageCheck.rows[0].count) > 0) {
      // Soft delete - deactivate
      await pool.query(
        `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1`,
        [id]
      );
      return NextResponse.json({ 
        message: "Product deactivated (used in invoices)",
        deactivated: true 
      });
    }

    // Hard delete - not used
    await pool.query(`DELETE FROM products WHERE id = $1`, [id]);
    return NextResponse.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Product delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete product" },
      { status: 500 },
    );
  }
}