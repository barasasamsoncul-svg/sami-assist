import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/customers
|--------------------------------------------------------------------------
|
| Returns customers belonging to the authenticated user's business.
|
| Optional query parameters:
| ?search=acme
| ?status=active
| ?customer_type=company
| ?industry=tech
| ?has_credit_limit=true
| ?page=1
| ?limit=20
| ?include_deleted=false
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { searchParams } = new URL(req.url);

    const search = searchParams.get("search")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const customerType = searchParams.get("customer_type")?.trim() || "";
    const industry = searchParams.get("industry")?.trim() || "";
    const hasCreditLimit = searchParams.get("has_credit_limit");
    const includeDeleted = searchParams.get("include_deleted") === "true";

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];
    let parameter = 1;

    // Only show non-deleted by default
    if (!includeDeleted) {
      conditions.push(`deleted_at IS NULL`);
    }

    if (search) {
      conditions.push(`
        (
          company_name ILIKE $${parameter}
          OR contact_name ILIKE $${parameter}
          OR email ILIKE $${parameter}
          OR phone ILIKE $${parameter}
          OR tax_id ILIKE $${parameter}
        )
      `);
      values.push(`%${search}%`);
      parameter++;
    }

    if (status) {
      conditions.push(`status = $${parameter++}`);
      values.push(status);
    }

    if (customerType) {
      conditions.push(`customer_type = $${parameter++}`);
      values.push(customerType);
    }

    if (industry) {
      conditions.push(`industry = $${parameter++}`);
      values.push(industry);
    }

    if (hasCreditLimit === "true") {
      conditions.push(`credit_limit IS NOT NULL`);
    } else if (hasCreditLimit === "false") {
      conditions.push(`credit_limit IS NULL`);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Get total count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM public.customers
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

    // Fetch customers
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
          deleted_at,
          deleted_by,
          notes,
          metadata,
          created_at,
          updated_at,

          (
            SELECT row_to_json(pt)
            FROM (
              SELECT
                id,
                name,
                description,
                due_days,
                discount_percentage,
                discount_days
              FROM public.payment_terms
              WHERE id = customers.payment_terms_id
            ) pt
          ) AS payment_terms,

          (
            SELECT COALESCE(SUM(amount_due), 0)
            FROM public.invoices
            WHERE customer_id = customers.id
              AND status NOT IN ('paid', 'cancelled', 'void')
              AND deleted_at IS NULL
          ) AS total_outstanding,

          (
            SELECT COUNT(*)
            FROM public.invoices
            WHERE customer_id = customers.id
              AND deleted_at IS NULL
          ) AS invoice_count,

          (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM public.invoices
            WHERE customer_id = customers.id
              AND deleted_at IS NULL
          ) AS total_revenue

        FROM public.customers
        ${whereClause}
        ORDER BY company_name ASC
        LIMIT $${parameter}
        OFFSET $${parameter + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      customers: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/customers error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch customers",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/customers
|--------------------------------------------------------------------------
|
| Creates a new customer.
|
| Request body:
| {
|   company_name: string,
|   contact_name?: string,
|   email?: string,
|   phone?: string,
|   website?: string,
|   billing_address?: string,
|   shipping_address?: string,
|   tax_id?: string,
|   tax_id_type?: string,
|   registration_number?: string,
|   currency?: string,
|   payment_terms_id?: string,
|   credit_limit?: number,
|   customer_type?: string,
|   industry?: string,
|   status?: string,
|   notes?: string,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

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
      metadata,
    } = body;

    // Validate required fields
    if (!company_name || typeof company_name !== "string" || !company_name.trim()) {
      return NextResponse.json(
        {
          error: "Company name is required",
        },
        { status: 400 }
      );
    }

    // Validate customer status
    const allowedStatuses = ["active", "inactive", "blocked"];
    const customerStatus = status || "active";

    if (!allowedStatuses.includes(customerStatus)) {
      return NextResponse.json(
        {
          error: "Invalid customer status. Must be one of: active, inactive, blocked",
        },
        { status: 400 }
      );
    }

    // Validate customer type
    const allowedCustomerTypes = ["individual", "company", "government", "non_profit"];
    const customerType = customer_type || "company";

    if (!allowedCustomerTypes.includes(customerType)) {
      return NextResponse.json(
        {
          error: "Invalid customer type. Must be one of: individual, company, government, non_profit",
        },
        { status: 400 }
      );
    }

    // Validate currency
    const customerCurrency = currency || "KES";
    if (customerCurrency.length !== 3) {
      return NextResponse.json(
        {
          error: "Currency must be a 3-letter ISO code",
        },
        { status: 400 }
      );
    }

    // Validate credit limit
    const creditLimitValue = credit_limit !== undefined ? toDecimal(credit_limit) : null;
    if (creditLimitValue !== null && creditLimitValue < 0) {
      return NextResponse.json(
        {
          error: "Credit limit cannot be negative",
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if payment terms exists if provided
      if (payment_terms_id) {
        const termsCheck = await client.query(
          `
            SELECT id
            FROM public.payment_terms
            WHERE id = $1 AND is_active = true
          `,
          [payment_terms_id]
        );

        if (termsCheck.rows.length === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              error: "Payment terms not found or inactive",
            },
            { status: 400 }
          );
        }
      }

      // Insert customer
      const result = await client.query(
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
            notes,
            metadata
          )
          VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16, $17, $18
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
            metadata,
            created_at,
            updated_at
        `,
        [
          company_name.trim(),
          nullableString(contact_name),
          nullableString(email),
          nullableString(phone),
          nullableString(website),
          nullableString(billing_address),
          nullableString(shipping_address),
          nullableString(tax_id),
          tax_id_type || "vat",
          nullableString(registration_number),
          customerCurrency,
          nullableString(payment_terms_id),
          creditLimitValue,
          customerType,
          nullableString(industry),
          customerStatus,
          nullableString(notes),
          jsonValue(metadata, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          customer: result.rows[0],
        },
        { status: 201 }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/customers error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create customer",
      },
      { status: 500 }
    );
  }
}