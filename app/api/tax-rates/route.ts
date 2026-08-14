import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: List all tax rates
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT *
      FROM tax_rates
      WHERE is_active = true
      ORDER BY sort_order, name
    `);

    return NextResponse.json({ taxRates: result.rows });
  } catch (error) {
    console.error("Tax rates fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load tax rates" },
      { status: 500 },
    );
  }
}

// POST: Create a new tax rate
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      rate,
      tax_type = 'vat',
      country,
      region,
      is_default = false,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (rate === undefined || rate < 0 || rate > 100) {
      return NextResponse.json({ error: "Valid tax rate (0-100) is required" }, { status: 400 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    if (is_default) {
      await pool.query(`UPDATE tax_rates SET is_default = false WHERE is_default = true`);
    }

    const result = await pool.query(
      `
      INSERT INTO tax_rates (
        name,
        rate,
        tax_type,
        country,
        region,
        is_default,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
      `,
      [
        name.trim(),
        rate,
        tax_type || 'vat',
        country?.trim() || null,
        region?.trim() || null,
        is_default || false,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Tax rate creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tax rate" },
      { status: 500 },
    );
  }
}