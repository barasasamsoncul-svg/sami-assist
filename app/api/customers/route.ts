import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET() {
  try {
    // Get the currently signed-in user
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Connect to this user's business tenant database
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // Get customers belonging to this business
    const result = await pool.query(
      `
      SELECT *
      FROM customers
      ORDER BY created_at DESC
      `
    );

    return NextResponse.json(result.rows);
  } catch (error) {
    console.error(
      "Customers fetch error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load customers.",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request
) {
  try {
    const body = await req.json();

    const {
      company_name,
      contact_name,
      email,
      phone,
      address,
    } = body;

    if (!company_name?.trim()) {
      return NextResponse.json(
        {
          error:
            "Company name is required.",
        },
        { status: 400 }
      );
    }

    // Get the currently signed-in user
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    // Connect to this user's business tenant database
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // Create customer in the business tenant database
    const result = await pool.query(
      `
      INSERT INTO customers (
        company_name,
        contact_name,
        email,
        phone,
        address
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        company_name.trim(),
        contact_name?.trim() || null,
        email?.trim() || null,
        phone?.trim() || null,
        address?.trim() || null,
      ]
    );

    return NextResponse.json(
      result.rows[0],
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "Customer creation error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create customer.",
      },
      { status: 500 }
    );
  }
}