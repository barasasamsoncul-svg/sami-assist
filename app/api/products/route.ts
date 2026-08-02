import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const result = await pool.query(`
      SELECT id, name, description, sku, product_type, unit_price, tax_rate, is_active
      FROM products
      WHERE is_active = true
      ORDER BY name ASC
    `);

    return NextResponse.json({ products: result.rows });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load products" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const body = await req.json();

    const name = String(body.name ?? "").trim();
    const description = String(body.description ?? "").trim() || null;
    const sku = String(body.sku ?? "").trim() || null;
    const productType = String(body.product_type ?? "service");
    const unitPrice = Number(body.unit_price ?? 0);
    const taxRate = Number(body.tax_rate ?? 0);

    if (!name) return NextResponse.json({ error: "Product/service name is required." }, { status: 400 });
    if (!Number.isFinite(unitPrice) || unitPrice < 0) return NextResponse.json({ error: "Unit price is invalid." }, { status: 400 });
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return NextResponse.json({ error: "Tax rate must be between 0 and 100." }, { status: 400 });

    const result = await pool.query(
      `
      INSERT INTO products (name, description, sku, product_type, unit_price, tax_rate)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [name, description, sku, productType, unitPrice.toFixed(2), taxRate.toFixed(2)],
    );

    return NextResponse.json({ product: result.rows[0] }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create product/service" },
      { status: 500 },
    );
  }
}
