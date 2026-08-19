import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/customers
 *
 * Returns customers belonging to the authenticated user's business.
 *
 * Optional query parameters:
 * ?search=acme
 * ?status=active
 * ?customer_type=company
 */
export async function GET(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate user
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get the user's tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Read query parameters
    // --------------------------------------------------
    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const customerType =
      searchParams.get("customer_type")?.trim() || "";

    // --------------------------------------------------
    // 4. Build query safely
    // --------------------------------------------------
    const conditions: string[] = [];
    const values: string[] = [];

    if (search) {
      values.push(`%${search}%`);

      conditions.push(`
        (
          company_name ILIKE $${values.length}
          OR contact_name ILIKE $${values.length}
          OR email ILIKE $${values.length}
          OR phone ILIKE $${values.length}
        )
      `);
    }

    if (status) {
      values.push(status);

      conditions.push(
        `status = $${values.length}`
      );
    }

    if (customerType) {
      values.push(customerType);

      conditions.push(
        `customer_type = $${values.length}`
      );
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    // --------------------------------------------------
    // 5. Fetch customers
    // --------------------------------------------------
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
        FROM public.customers
        ${whereClause}
        ORDER BY company_name ASC
      `,
      values
    );

    // --------------------------------------------------
    // 6. Return customers
    // --------------------------------------------------
    return NextResponse.json({
      success: true,
      customers: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error("GET /api/customers error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch customers",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/customers
 *
 * Creates a new customer.
 */
export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate user
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Read request body
    // --------------------------------------------------
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

    // --------------------------------------------------
    // 4. Validate required fields
    // --------------------------------------------------
    if (
      !company_name ||
      typeof company_name !== "string" ||
      !company_name.trim()
    ) {
      return NextResponse.json(
        {
          error: "Company name is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Validate customer status
    // --------------------------------------------------
    const allowedStatuses = [
      "active",
      "inactive",
      "blocked",
    ];

    const customerStatus =
      status || "active";

    if (!allowedStatuses.includes(customerStatus)) {
      return NextResponse.json(
        {
          error:
            "Invalid customer status",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Validate customer type
    // --------------------------------------------------
    const allowedCustomerTypes = [
      "individual",
      "company",
      "government",
      "non_profit",
    ];

    const customerType =
      customer_type || "company";

    if (
      !allowedCustomerTypes.includes(
        customerType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid customer type",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 7. Insert customer
    // --------------------------------------------------
    const result = await pool.query(
      `
        INSERT INTO public.customers (
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
          notes
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17
        )
        RETURNING
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
      `,
      [
        company_name.trim(),
        contact_name || null,
        email || null,
        phone || null,
        website || null,
        billing_address || null,
        shipping_address || null,
        tax_id || null,
        tax_id_type || "vat",
        registration_number || null,
        currency || "USD",
        payment_terms_id || null,
        credit_limit ?? null,
        customerType,
        industry || null,
        customerStatus,
        notes || null,
      ]
    );

    // --------------------------------------------------
    // 8. Return created customer
    // --------------------------------------------------
    return NextResponse.json(
      {
        success: true,
        customer: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/customers error:", error);

    return NextResponse.json(
      {
        error: "Failed to create customer",
      },
      { status: 500 }
    );
  }
}