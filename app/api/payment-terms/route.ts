import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: List all payment terms
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT *
      FROM payment_terms
      WHERE is_active = true
      ORDER BY sort_order, name
    `);

    return NextResponse.json({ paymentTerms: result.rows });
  } catch (error) {
    console.error("Payment terms fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load payment terms" },
      { status: 500 },
    );
  }
}

// POST: Create a new payment term
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      description,
      due_days,
      discount_percentage = 0,
      discount_days,
      is_default = false,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    if (!due_days || due_days < 0) {
      return NextResponse.json({ error: "Valid due days is required" }, { status: 400 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // If this is default, unset other defaults
    if (is_default) {
      await pool.query(`UPDATE payment_terms SET is_default = false WHERE is_default = true`);
    }

    const result = await pool.query(
      `
      INSERT INTO payment_terms (
        name,
        description,
        due_days,
        discount_percentage,
        discount_days,
        is_default,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, true)
      RETURNING *
      `,
      [
        name.trim(),
        description?.trim() || null,
        due_days,
        discount_percentage || 0,
        discount_days || null,
        is_default || false,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Payment term creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create payment term" },
      { status: 500 },
    );
  }
}