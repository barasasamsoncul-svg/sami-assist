import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

// PUT: Update payment term
export async function PUT(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    const check = await pool.query(`SELECT id FROM payment_terms WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Payment term not found" }, { status: 404 });
    }

    const {
      name,
      description,
      due_days,
      discount_percentage,
      discount_days,
      is_default,
      is_active,
    } = body;

    if (is_default) {
      await pool.query(`UPDATE payment_terms SET is_default = false WHERE is_default = true AND id != $1`, [id]);
    }

    const result = await pool.query(
      `
      UPDATE payment_terms SET
        name = COALESCE($1, name),
        description = $2,
        due_days = COALESCE($3, due_days),
        discount_percentage = COALESCE($4, discount_percentage),
        discount_days = $5,
        is_default = COALESCE($6, is_default),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        name || null,
        description || null,
        due_days || null,
        discount_percentage || 0,
        discount_days || null,
        is_default !== undefined ? is_default : null,
        is_active !== undefined ? is_active : null,
        id,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Payment term update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment term" },
      { status: 500 },
    );
  }
}

// DELETE: Delete payment term
export async function DELETE(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const check = await pool.query(`SELECT id FROM payment_terms WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Payment term not found" }, { status: 404 });
    }

    await pool.query(`DELETE FROM payment_terms WHERE id = $1`, [id]);
    return NextResponse.json({ message: "Payment term deleted successfully" });
  } catch (error) {
    console.error("Payment term delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete payment term" },
      { status: 500 },
    );
  }
}