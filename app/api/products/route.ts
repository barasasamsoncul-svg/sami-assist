import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: List all products
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
      SELECT 
        p.*,
        t.name as tax_name,
        t.rate as tax_rate
      FROM products p
      LEFT JOIN tax_rates t ON p.tax_rate_id = t.id
      ORDER BY p.name ASC
    `);

    return NextResponse.json({ products: result.rows });
  } catch (error) {
    console.error("Products fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load products" },
      { status: 500 },
    );
  }
}

// POST: Create a new product
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      name,
      description,
      sku,
      unit_price,
      tax_rate_id,
      category,
      notes,
    } = body;

    if (!name?.trim()) {
      return NextResponse.json({ error: "Product name is required" }, { status: 400 });
    }

    if (!unit_price || unit_price < 0) {
      return NextResponse.json({ error: "Valid unit price is required" }, { status: 400 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
      INSERT INTO products (
        name,
        description,
        sku,
        unit_price,
        tax_rate_id,
        category,
        notes,
        is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *
      `,
      [
        name.trim(),
        description?.trim() || null,
        sku?.trim() || null,
        unit_price,
        tax_rate_id || null,
        category?.trim() || null,
        notes?.trim() || null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Product creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create product" },
      { status: 500 },
    );
  }
}