import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Types & Validation
|--------------------------------------------------------------------------
*/

const ALLOWED_TAX_TYPES = [
  "vat",
  "gst",
  "sales_tax",
  "withholding",
  "none",
  "other",
] as const;

type TaxType = typeof ALLOWED_TAX_TYPES[number];

function isTaxType(value: unknown): value is TaxType {
  return typeof value === "string" && ALLOWED_TAX_TYPES.includes(value as TaxType);
}

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
| GET /api/invoices/tax-rates
|--------------------------------------------------------------------------
|
| Returns tax rates for the authenticated user's business.
|
| Optional query parameters:
| ?search=VAT
| ?tax_type=vat
| ?country=Kenya
| ?region=Nairobi
| ?include_inactive=true
| ?page=1
| ?limit=20
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
    const taxType = searchParams.get("tax_type")?.trim() || "";
    const country = searchParams.get("country")?.trim() || "";
    const region = searchParams.get("region")?.trim() || "";
    const includeInactive = searchParams.get("include_inactive") === "true";

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (!includeInactive) {
      conditions.push(`is_active = true`);
    }

    if (search) {
      conditions.push(`
        (
          name ILIKE $${parameterIndex}
          OR tax_type ILIKE $${parameterIndex}
          OR country ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    if (taxType) {
      if (!isTaxType(taxType)) {
        return NextResponse.json(
          {
            error: `Invalid tax_type. Must be one of: ${ALLOWED_TAX_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }
      conditions.push(`tax_type = $${parameterIndex}`);
      values.push(taxType);
      parameterIndex++;
    }

    if (country) {
      conditions.push(`country = $${parameterIndex}`);
      values.push(country);
      parameterIndex++;
    }

    if (region) {
      conditions.push(`region = $${parameterIndex}`);
      values.push(region);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.tax_rates
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Fetch tax rates
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
          metadata,
          created_at,
          updated_at
        FROM public.tax_rates
        ${whereClause}
        ORDER BY
          sort_order ASC,
          rate ASC,
          name ASC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      tax_rates: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/tax-rates error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch tax rates",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/tax-rates
|--------------------------------------------------------------------------
|
| Creates a new tax rate.
|
| Request body:
| {
|   name: string,
|   rate: number,
|   tax_type?: string,
|   country?: string,
|   region?: string,
|   is_default?: boolean,
|   is_active?: boolean,
|   sort_order?: number,
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
      name,
      rate,
      tax_type,
      country,
      region,
      is_default,
      is_active,
      sort_order,
      metadata,
    } = body;

    // Validate name
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Tax rate name is required" },
        { status: 400 }
      );
    }

    // Validate rate
    const taxRate = rate === undefined || rate === null || rate === "" ? 0 : Number(rate);

    if (Number.isNaN(taxRate) || taxRate < 0 || taxRate > 100) {
      return NextResponse.json(
        { error: "Tax rate must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Validate tax type
    const nextTaxType = tax_type || "vat";

    if (!isTaxType(nextTaxType)) {
      return NextResponse.json(
        {
          error: `Invalid tax_type. Must be one of: ${ALLOWED_TAX_TYPES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate sort order
    const nextSortOrder = sort_order !== undefined ? Number(sort_order) : 0;
    if (!Number.isInteger(nextSortOrder)) {
      return NextResponse.json(
        { error: "sort_order must be an integer" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check for duplicate name
      const duplicateCheck = await client.query(
        `
          SELECT id FROM public.tax_rates
          WHERE LOWER(name) = LOWER($1)
            AND is_active = true
        `,
        [name.trim()]
      );

      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "A tax rate with this name already exists" },
          { status: 409 }
        );
      }

      // If default, remove previous default
      if (is_default === true) {
        await client.query(
          `
            UPDATE public.tax_rates
            SET
              is_default = false,
              updated_at = NOW()
            WHERE is_default = true
          `
        );
      }

      // Insert tax rate
      const result = await client.query(
        `
          INSERT INTO public.tax_rates (
            name,
            rate,
            tax_type,
            country,
            region,
            is_default,
            is_active,
            sort_order,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          name.trim(),
          taxRate,
          nextTaxType,
          nullableString(country),
          nullableString(region),
          is_default ?? false,
          is_active ?? true,
          nextSortOrder,
          jsonValue(metadata, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          tax_rate: result.rows[0],
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
    console.error("POST /api/invoices/tax-rates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create tax rate",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/tax-rates
|--------------------------------------------------------------------------
|
| Updates an existing tax rate.
|
| Request body:
| {
|   id: string,
|   name?: string,
|   rate?: number,
|   tax_type?: string,
|   country?: string,
|   region?: string,
|   is_default?: boolean,
|   is_active?: boolean,
|   sort_order?: number,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest) {
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
      id,
      name,
      rate,
      tax_type,
      country,
      region,
      is_default,
      is_active,
      sort_order,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Tax rate ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Find existing tax rate
      const existing = await client.query(
        `
          SELECT *
          FROM public.tax_rates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Resolve name
      const nextName = name !== undefined ? String(name).trim() : current.name;

      if (!nextName) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate name cannot be empty" },
          { status: 400 }
        );
      }

      // Check duplicate name (exclude current)
      if (name !== undefined) {
        const duplicateCheck = await client.query(
          `
            SELECT id FROM public.tax_rates
            WHERE LOWER(name) = LOWER($1)
              AND id <> $2
              AND is_active = true
          `,
          [nextName, id]
        );

        if (duplicateCheck.rows.length > 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "A tax rate with this name already exists" },
            { status: 409 }
          );
        }
      }

      // Resolve rate
      const nextRate = rate !== undefined ? Number(rate) : Number(current.rate);

      if (Number.isNaN(nextRate) || nextRate < 0 || nextRate > 100) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate must be between 0 and 100" },
          { status: 400 }
        );
      }

      // Resolve tax type
      const nextTaxType = tax_type !== undefined ? String(tax_type) : current.tax_type;

      if (!isTaxType(nextTaxType)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid tax_type. Must be one of: ${ALLOWED_TAX_TYPES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const nextIsDefault = is_default !== undefined ? Boolean(is_default) : current.is_default;
      const nextIsActive = is_active !== undefined ? Boolean(is_active) : current.is_active;
      const nextSortOrder = sort_order !== undefined ? Number(sort_order) : current.sort_order;

      if (!Number.isInteger(nextSortOrder)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "sort_order must be an integer" },
          { status: 400 }
        );
      }

      // If default, remove previous default from other tax rates
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

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = [
        { key: 'name', value: nextName },
        { key: 'rate', value: nextRate },
        { key: 'tax_type', value: nextTaxType },
        { key: 'country', value: country !== undefined ? nullableString(country) : current.country },
        { key: 'region', value: region !== undefined ? nullableString(region) : current.region },
        { key: 'is_default', value: nextIsDefault },
        { key: 'is_active', value: nextIsActive },
        { key: 'sort_order', value: nextSortOrder },
        { key: 'metadata', value: metadata !== undefined ? jsonValue(metadata, {}) : current.metadata },
      ];

      for (const field of fields) {
        updates.push(`${field.key} = $${paramCount++}`);
        values.push(field.value);
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`id = $${paramCount}`);
      values.push(id);

      const result = await client.query(
        `
          UPDATE public.tax_rates
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
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
    console.error("PATCH /api/invoices/tax-rates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update tax rate",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/tax-rates
|--------------------------------------------------------------------------
|
| Soft-deletes a tax rate.
|
| We keep the record because products and invoice items
| can reference it.
|
| ?id=<id>
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest) {
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

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Tax rate ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if tax rate exists
      const existing = await client.query(
        `
          SELECT id, name, is_default, is_active
          FROM public.tax_rates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Tax rate not found" },
          { status: 404 }
        );
      }

      const taxRate = existing.rows[0];

      // Don't allow deleting the default tax rate
      if (taxRate.is_default) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "The default tax rate cannot be deleted. Set another tax rate as default first.",
          },
          { status: 400 }
        );
      }

      // Check if tax rate is in use by any product
      const productUsage = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.products
          WHERE tax_rate_id = $1
            AND is_active = true
        `,
        [id]
      );

      if (productUsage.rows[0]?.in_use) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Cannot delete tax rate as it is in use by one or more active products.",
          },
          { status: 409 }
        );
      }

      // Check if tax rate is in use by any invoice item
      const invoiceUsage = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.invoice_items
          WHERE tax_rate_id = $1
        `,
        [id]
      );

      if (invoiceUsage.rows[0]?.in_use) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Cannot delete tax rate as it is in use by one or more invoice items.",
          },
          { status: 409 }
        );
      }

      // Soft delete (deactivate)
      const result = await client.query(
        `
          UPDATE public.tax_rates
          SET
            is_active = false,
            is_default = false,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, rate, tax_type, is_active, is_default
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Tax rate deactivated successfully",
        tax_rate: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/tax-rates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to deactivate tax rate",
      },
      { status: 500 }
    );
  }
}