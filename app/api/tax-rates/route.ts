import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/tax-rates
 *
 * Returns tax rates for the authenticated user's business.
 *
 * Optional query parameters:
 *
 * ?search=VAT
 * ?tax_type=vat
 * ?country=Kenya
 * ?region=Nairobi
 * ?include_inactive=true
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
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Query parameters
    // --------------------------------------------------
    const { searchParams } = new URL(req.url);

    const search =
      searchParams.get("search")?.trim() || "";

    const taxType =
      searchParams.get("tax_type")?.trim() || "";

    const country =
      searchParams.get("country")?.trim() || "";

    const region =
      searchParams.get("region")?.trim() || "";

    const includeInactive =
      searchParams.get("include_inactive") === "true";

    // --------------------------------------------------
    // 4. Build filters
    // --------------------------------------------------
    const conditions: string[] = [];
    const values: string[] = [];

    if (!includeInactive) {
      conditions.push("is_active = true");
    }

    if (search) {
      values.push(`%${search}%`);

      conditions.push(`
        (
          name ILIKE $${values.length}
          OR tax_type ILIKE $${values.length}
        )
      `);
    }

    if (taxType) {
      values.push(taxType);

      conditions.push(
        `tax_type = $${values.length}`
      );
    }

    if (country) {
      values.push(country);

      conditions.push(
        `country = $${values.length}`
      );
    }

    if (region) {
      values.push(region);

      conditions.push(
        `region = $${values.length}`
      );
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    // --------------------------------------------------
    // 5. Fetch tax rates
    // --------------------------------------------------
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          rate,
          tax_type,
          country,
          region,
          is_default,
          is_active,
          sort_order,
          created_at,
          updated_at
        FROM public.tax_rates
        ${whereClause}
        ORDER BY
          sort_order ASC,
          rate ASC,
          name ASC
      `,
      values
    );

    // --------------------------------------------------
    // 6. Return
    // --------------------------------------------------
    return NextResponse.json({
      success: true,
      tax_rates: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error(
      "GET /api/tax-rates error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch tax rates",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tax-rates
 *
 * Creates a new tax rate.
 */
export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Request body
    // --------------------------------------------------
    const body = await req.json();

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

    // --------------------------------------------------
    // 4. Validate name
    // --------------------------------------------------
    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return NextResponse.json(
        {
          error: "Tax rate name is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Validate rate
    // --------------------------------------------------
    const taxRate =
      rate === undefined ||
      rate === null ||
      rate === ""
        ? 0
        : Number(rate);

    if (
      Number.isNaN(taxRate) ||
      taxRate < 0 ||
      taxRate > 100
    ) {
      return NextResponse.json(
        {
          error:
            "Tax rate must be between 0 and 100",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Validate tax type
    // --------------------------------------------------
    const allowedTaxTypes = [
      "vat",
      "gst",
      "sales_tax",
      "withholding",
      "none",
    ];

    const taxType =
      tax_type || "vat";

    if (!allowedTaxTypes.includes(taxType)) {
      return NextResponse.json(
        {
          error: "Invalid tax type",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 7. If default, remove previous default
    // --------------------------------------------------
    if (is_default === true) {
      await pool.query(
        `
          UPDATE public.tax_rates
          SET
            is_default = false,
            updated_at = NOW()
          WHERE is_default = true
        `
      );
    }

    // --------------------------------------------------
    // 8. Insert tax rate
    // --------------------------------------------------
    const result = await pool.query(
      `
        INSERT INTO public.tax_rates (
          name,
          rate,
          tax_type,
          country,
          region,
          is_default,
          is_active,
          sort_order
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8
        )
        RETURNING
          id,
          name,
          rate,
          tax_type,
          country,
          region,
          is_default,
          is_active,
          sort_order,
          created_at,
          updated_at
      `,
      [
        name.trim(),
        taxRate,
        taxType,
        country || null,
        region || null,
        is_default ?? false,
        is_active ?? true,
        sort_order ?? 0,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        tax_rate: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/tax-rates error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to create tax rate",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/tax-rates
 *
 * Updates an existing tax rate.
 */
export async function PATCH(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Request body
    // --------------------------------------------------
    const body = await req.json();

    const {
      id,
      name,
      rate,
      tax_type,
      country,
      region,
      is_default,
      is_active,
      sort_order,
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          error: "Tax rate ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Find existing tax rate
    // --------------------------------------------------
    const existing = await pool.query(
      `
        SELECT *
        FROM public.tax_rates
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (existing.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Tax rate not found",
        },
        { status: 404 }
      );
    }

    const current = existing.rows[0];

    // --------------------------------------------------
    // 5. Resolve values
    // --------------------------------------------------
    const nextName =
      name !== undefined
        ? String(name).trim()
        : current.name;

    if (!nextName) {
      return NextResponse.json(
        {
          error:
            "Tax rate name cannot be empty",
        },
        { status: 400 }
      );
    }

    const nextRate =
      rate !== undefined
        ? Number(rate)
        : Number(current.rate);

    if (
      Number.isNaN(nextRate) ||
      nextRate < 0 ||
      nextRate > 100
    ) {
      return NextResponse.json(
        {
          error:
            "Tax rate must be between 0 and 100",
        },
        { status: 400 }
      );
    }

    const allowedTaxTypes = [
      "vat",
      "gst",
      "sales_tax",
      "withholding",
      "none",
    ];

    const nextTaxType =
      tax_type !== undefined
        ? String(tax_type)
        : current.tax_type;

    if (!allowedTaxTypes.includes(nextTaxType)) {
      return NextResponse.json(
        {
          error: "Invalid tax type",
        },
        { status: 400 }
      );
    }

    const nextIsDefault =
      is_default !== undefined
        ? Boolean(is_default)
        : current.is_default;

    const nextIsActive =
      is_active !== undefined
        ? Boolean(is_active)
        : current.is_active;

    const nextSortOrder =
      sort_order !== undefined
        ? Number(sort_order)
        : current.sort_order;

    if (
      !Number.isInteger(nextSortOrder)
    ) {
      return NextResponse.json(
        {
          error:
            "sort_order must be an integer",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Transaction
    // --------------------------------------------------
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Only one default tax rate
      if (nextIsDefault) {
        await client.query(
          `
            UPDATE public.tax_rates
            SET
              is_default = false,
              updated_at = NOW()
            WHERE is_default = true
              AND id <> $1
          `,
          [id]
        );
      }

      const result = await client.query(
        `
          UPDATE public.tax_rates
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
          RETURNING
            id,
            name,
            rate,
            tax_type,
            country,
            region,
            is_default,
            is_active,
            sort_order,
            created_at,
            updated_at
        `,
        [
          nextName,
          nextRate,
          nextTaxType,
          country !== undefined
            ? country
            : current.country,
          region !== undefined
            ? region
            : current.region,
          nextIsDefault,
          nextIsActive,
          nextSortOrder,
          id,
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        tax_rate: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error(
      "PATCH /api/tax-rates error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to update tax rate",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/tax-rates?id=<id>
 *
 * Soft-deletes a tax rate.
 *
 * We keep the record because products and invoice items
 * can reference it.
 */
export async function DELETE(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Tenant database
    // --------------------------------------------------
    const { pool } = await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. ID
    // --------------------------------------------------
    const { searchParams } = new URL(req.url);

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error: "Tax rate ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Deactivate
    // --------------------------------------------------
    const result = await pool.query(
      `
        UPDATE public.tax_rates
        SET
          is_active = false,
          is_default = false,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          rate,
          tax_type,
          is_active,
          is_default
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Tax rate not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tax_rate: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE /api/tax-rates error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to deactivate tax rate",
      },
      { status: 500 }
    );
  }
}