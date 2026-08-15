import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

export async function PUT(
  req: NextRequest,
  context: Context
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    const check = await pool.query(`SELECT id FROM tax_rates WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Tax rate not found" }, { status: 404 });
    }

    const {
      name,
      rate,
      tax_type,
      country,
      region,
      is_default,
      is_active,
    } = body;

    if (is_default) {
      await pool.query(`UPDATE tax_rates SET is_default = false WHERE is_default = true AND id != $1`, [id]);
    }

    const result = await pool.query(
      `
      UPDATE tax_rates SET
        name = COALESCE($1, name),
        rate = COALESCE($2, rate),
        tax_type = COALESCE($3, tax_type),
        country = $4,
        region = $5,
        is_default = COALESCE($6, is_default),
        is_active = COALESCE($7, is_active),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
      `,
      [
        name || null,
        rate || null,
        tax_type || null,
        country || null,
        region || null,
        is_default !== undefined ? is_default : null,
        is_active !== undefined ? is_active : null,
        id,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Tax rate update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tax rate" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: Context
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const check = await pool.query(`SELECT id FROM tax_rates WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Tax rate not found" }, { status: 404 });
    }

    await pool.query(`DELETE FROM tax_rates WHERE id = $1`, [id]);
    return NextResponse.json({ message: "Tax rate deleted successfully" });
  } catch (error) {
    console.error("Tax rate delete error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete tax rate" },
      { status: 500 },
    );
  }
}