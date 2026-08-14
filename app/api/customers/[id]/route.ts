import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = { params: Promise<{ id: string }> };

// GET: Get single customer
export async function GET(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;

    const result = await pool.query(
      `
      SELECT 
        id,
        company_name,
        contact_name,
        email,
        phone,
        website,
        billing_address,
        shipping_address,
        tax_id,
        tax_id_type,
        registration_number,
        currency,
        payment_terms_id,
        credit_limit,
        customer_type,
        industry,
        status,
        notes,
        created_at,
        updated_at
      FROM customers
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Customer fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customer" },
      { status: 500 },
    );
  }
}

// PATCH: Update customer
export async function PATCH(req: Request, context: Context) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const { id } = await context.params;
    const body = await req.json();

    // Check if customer exists
    const check = await pool.query(`SELECT id FROM customers WHERE id = $1`, [id]);
    if (check.rows.length === 0) {
      return NextResponse.json({ error: "Customer not found" }, { status: 404 });
    }

    const {
      company_name,
      contact_name,
      email,
      phone,
      website,
      billing_address,
      shipping_address,
      tax_id,
      tax_id_type,
      registration_number,
      currency,
      payment_terms_id,
      credit_limit,
      customer_type,
      industry,
      status,
      notes,
    } = body;

    const result = await pool.query(
      `
      UPDATE customers SET
        company_name = COALESCE($1, company_name),
        contact_name = $2,
        email = $3,
        phone = $4,
        website = $5,
        billing_address = $6,
        shipping_address = $7,
        tax_id = $8,
        tax_id_type = $9,
        registration_number = $10,
        currency = $11,
        payment_terms_id = $12,
        credit_limit = $13,
        customer_type = $14,
        industry = $15,
        status = $16,
        notes = $17,
        updated_at = NOW()
      WHERE id = $18
      RETURNING *
      `,
      [
        company_name || null,
        contact_name || null,
        email || null,
        phone || null,
        website || null,
        billing_address || null,
        shipping_address || null,
        tax_id || null,
        tax_id_type || null,
        registration_number || null,
        currency || null,
        payment_terms_id || null,
        credit_limit || null,
        customer_type || null,
        industry || null,
        status || null,
        notes || null,
        id,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Customer update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update customer" },
      { status: 500 },
    );
  }
}