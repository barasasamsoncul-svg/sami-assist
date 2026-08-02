import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

// ==========================================
// GET ALL CUSTOMERS
// ==========================================

export async function GET() {
  try {
    // ==========================================
    // GET CURRENT LOGGED-IN USER
    // ==========================================

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // CONNECT TO USER'S BUSINESS TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // ==========================================
    // GET CUSTOMERS FROM THIS BUSINESS
    // ==========================================

    const result = await pool.query(
      `
      SELECT *
      FROM customers
      ORDER BY created_at DESC
      `
    );

   return NextResponse.json({
  customers: result.rows,
});
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
            : "Failed to load customers",
      },
      {
        status: 500,
      }
    );
  }
}

// ==========================================
// CREATE CUSTOMER
// ==========================================

export async function POST(
  req: Request
) {
  try {
    // ==========================================
    // READ REQUEST BODY
    // ==========================================

    const body = await req.json();

    const {
      company_name,
      contact_name,
      email,
      phone,
      address,
    } = body;

    // ==========================================
    // VALIDATE COMPANY NAME
    // ==========================================

    if (!company_name?.trim()) {
      return NextResponse.json(
        {
          error:
            "Company name is required",
        },
        {
          status: 400,
        }
      );
    }

    // ==========================================
    // GET CURRENT LOGGED-IN USER
    // ==========================================

    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    // ==========================================
    // CONNECT TO USER'S BUSINESS TENANT DATABASE
    // ==========================================

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // ==========================================
    // CREATE CUSTOMER
    // ==========================================

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

    // ==========================================
    // RETURN CREATED CUSTOMER
    // ==========================================

    return NextResponse.json(
      result.rows[0],
      {
        status: 201,
      }
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
            : "Failed to create customer",
      },
      {
        status: 500,
      }
    );
  }
}