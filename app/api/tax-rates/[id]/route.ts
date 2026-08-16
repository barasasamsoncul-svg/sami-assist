import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: Get single tax rate
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
      SELECT * FROM tax_rates WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ taxRate: result.rows[0] });
  } catch (error) {
    console.error("Tax rate fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch tax rate" },
      { status: 500 }
    );
  }
}

// PUT: Update tax rate
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
      rate,
      tax_type,
      country,
      region,
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

    if (rate === undefined || rate < 0 || rate > 100) {
      return NextResponse.json(
        { error: "Valid tax rate (0-100) is required" },
        { status: 400 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    // Check if tax rate exists
    const checkResult = await pool.query(
      `SELECT id FROM tax_rates WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 404 }
      );
    }

    // If this is default, unset other defaults
    if (is_default) {
      await pool.query(`UPDATE tax_rates SET is_default = false WHERE is_default = true`);
    }

    const result = await pool.query(
      `
      UPDATE tax_rates 
      SET 
        name = $1,
        rate = $2,
        tax_type = $3,
        country = $4,
        region = $5,
        is_default = $6,
        is_active = $7,
        sort_order = $8,
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
      `,
      [
        name.trim(),
        rate,
        tax_type || 'vat',
        country?.trim() || null,
        region?.trim() || null,
        is_default || false,
        is_active !== undefined ? is_active : true,
        sort_order || 0,
        id,
      ]
    );

    return NextResponse.json({ taxRate: result.rows[0] });
  } catch (error) {
    console.error("Tax rate update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tax rate" },
      { status: 500 }
    );
  }
}

// DELETE: Delete tax rate
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

    // Check if tax rate exists
    const checkResult = await pool.query(
      `SELECT id, is_default FROM tax_rates WHERE id = $1`,
      [id]
    );

    if (checkResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Tax rate not found" },
        { status: 404 }
      );
    }

    // Check if tax rate is in use
    const usageCheck = await pool.query(
      `SELECT id FROM invoice_items WHERE tax_rate_id = $1 LIMIT 1`,
      [id]
    );

    if (usageCheck.rows.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete tax rate that is in use" },
        { status: 400 }
      );
    }

    // Check if tax rate is used in products
    const productUsage = await pool.query(
      `SELECT id FROM products WHERE tax_rate_id = $1 LIMIT 1`,
      [id]
    );

    if (productUsage.rows.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete tax rate that is used in products" },
        { status: 400 }
      );
    }

    // If deleting default, set another as default
    if (checkResult.rows[0].is_default) {
      await pool.query(
        `
        UPDATE tax_rates 
        SET is_default = true 
        WHERE id = (
          SELECT id FROM tax_rates 
          WHERE id != $1 
          ORDER BY sort_order, name 
          LIMIT 1
        )
        `,
        [id]
      );
    }

    await pool.query(
      `DELETE FROM tax_rates WHERE id = $1`,
      [id]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Tax rate deletion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete tax rate" },
      { status: 500 }
    );
  }
}