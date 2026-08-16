import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: Get single payment term
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // Changed to Promise
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await params;  // Await the params

    const result = await pool.query(
      `
      SELECT * FROM payment_terms WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment term not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ paymentTerm: result.rows[0] });
  } catch (error) {
    console.error("Payment term fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch payment term" },
      { status: 500 }
    );
  }
}

// PUT: Update payment term
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // Changed to Promise
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { id } = await params;  // Await the params
    const {
      name,
      description,
      due_days,
      discount_percentage,
      discount_days,
      is_default,
      is_active,
      sort_order,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    if (due_days === undefined || due_days < 0) {
      return NextResponse.json(
        { error: "Valid due days is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Check if payment term exists
    const checkResult = await pool.query(
      `SELECT id FROM payment_terms WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment term not found" },
        { status: 404 }
      );
    }

    // If this is default, unset other defaults
    if (is_default) {
      await pool.query(`UPDATE payment_terms SET is_default = false WHERE is_default = true`);
    }

    const result = await pool.query(
      `
      UPDATE payment_terms 
      SET 
        name = $1,
        description = $2,
        due_days = $3,
        discount_percentage = $4,
        discount_days = $5,
        is_default = $6,
        is_active = $7,
        sort_order = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        name.trim(),
        description?.trim() || null,
        due_days,
        discount_percentage || 0,
        discount_days || null,
        is_default || false,
        is_active !== undefined ? is_active : true,
        sort_order || 0,
        id,
      ]
    );

    return NextResponse.json({ paymentTerm: result.rows[0] });
  } catch (error) {
    console.error("Payment term update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update payment term" },
      { status: 500 }
    );
  }
}

// DELETE: Delete payment term
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }  // Changed to Promise
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await params;  // Await the params

    // Check if payment term exists
    const checkResult = await pool.query(
      `SELECT id, is_default FROM payment_terms WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment term not found" },
        { status: 404 }
      );
    }

    // Check if payment term is in use
    const usageCheck = await pool.query(
      `SELECT id FROM invoices WHERE payment_terms_id = $1 LIMIT 1`,
      [id]
    );

    if (usageCheck.rows.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete payment term that is in use" },
        { status: 400 }
      );
    }

    // If deleting default, set another as default
    if (checkResult.rows[0].is_default) {
      await pool.query(
        `
        UPDATE payment_terms 
        SET is_default = true 
        WHERE id = (
          SELECT id FROM payment_terms 
          WHERE id != $1 
          ORDER BY sort_order, name 
          LIMIT 1
        )
        `,
        [id]
      );
    }

    await pool.query(
      `DELETE FROM payment_terms WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Payment term deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete payment term" },
      { status: 500 }
    );
  }
}