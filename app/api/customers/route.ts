import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// GET: List all customers
export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(`
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
      ORDER BY company_name ASC
    `);

    return NextResponse.json({ customers: result.rows });
  } catch (error) {
    console.error("Customers fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load customers" },
      { status: 500 },
    );
  }
}

// POST: Create a new customer
export async function POST(req: Request) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const {
      company_name,
      contact_name,
      email,
      phone,
      website,
      billing_address,
      shipping_address,
      tax_id,
      tax_id_type = 'vat',
      registration_number,
      currency = 'USD',
      payment_terms_id,
      credit_limit,
      customer_type = 'company',
      industry,
      notes,
    } = body;

    if (!company_name?.trim()) {
      return NextResponse.json({ error: "Company name is required" }, { status: 400 });
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const result = await pool.query(
      `
      INSERT INTO customers (
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
        notes,
        status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'active')
      RETURNING *
      `,
      [
        company_name.trim(),
        contact_name?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        website?.trim() || null,
        billing_address?.trim() || null,
        shipping_address?.trim() || null,
        tax_id?.trim() || null,
        tax_id_type || 'vat',
        registration_number?.trim() || null,
        currency || 'USD',
        payment_terms_id || null,
        credit_limit || null,
        customer_type || 'company',
        industry?.trim() || null,
        notes?.trim() || null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("Customer creation error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create customer" },
      { status: 500 },
    );
  }
}