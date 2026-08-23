import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

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
| GET /api/invoices/products
|--------------------------------------------------------------------------
|
| Returns products/services from the authenticated user's tenant database.
|
| Optional query parameters:
| ?search=laptop
| ?category=Electronics
| ?status=active
| ?include_inactive=true
| ?min_price=10
| ?max_price=100
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
    const category = searchParams.get("category")?.trim() || "";
    const status = searchParams.get("status")?.trim() || "";
    const includeInactive = searchParams.get("include_inactive") === "true";
    const minPrice = searchParams.get("min_price");
    const maxPrice = searchParams.get("max_price");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (!includeInactive) {
      conditions.push(`p.is_active = true`);
    }

    if (search) {
      conditions.push(`
        (
          p.name ILIKE $${parameterIndex}
          OR p.description ILIKE $${parameterIndex}
          OR p.sku ILIKE $${parameterIndex}
          OR p.category ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    if (category) {
      conditions.push(`p.category = $${parameterIndex}`);
      values.push(category);
      parameterIndex++;
    }

    if (status) {
      if (status !== "active" && status !== "inactive") {
        return NextResponse.json(
          {
            error: "status must be active or inactive",
          },
          { status: 400 }
        );
      }
      conditions.push(`p.is_active = $${parameterIndex}`);
      values.push(status === "active");
      parameterIndex++;
    }

    if (minPrice) {
      conditions.push(`p.unit_price >= $${parameterIndex}`);
      values.push(toDecimal(minPrice));
      parameterIndex++;
    }

    if (maxPrice) {
      conditions.push(`p.unit_price <= $${parameterIndex}`);
      values.push(toDecimal(maxPrice));
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.products p
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Fetch products
    const result = await pool.query(
      `
        SELECT
          p.id,
          p.name,
          p.description,
          p.sku,
          p.unit_price,
          p.tax_rate_id,
          p.category,
          p.is_active,
          p.notes,
          p.metadata,
          p.created_at,
          p.updated_at,

          tr.name AS tax_rate_name,
          tr.rate AS tax_rate,
          tr.tax_type AS tax_type,
          tr.is_default AS tax_is_default,

          (
            SELECT COUNT(*)
            FROM public.invoice_items ii
            WHERE ii.product_id = p.id
          )::int AS usage_count

        FROM public.products p

        LEFT JOIN public.tax_rates tr
          ON tr.id = p.tax_rate_id

        ${whereClause}

        ORDER BY
          p.name ASC

        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    // Get category summary
    const categorySummary = await pool.query(
      `
        SELECT
          category,
          COUNT(*)::int AS count,
          COALESCE(AVG(unit_price), 0)::numeric AS average_price
        FROM public.products
        ${includeInactive ? '' : 'WHERE is_active = true'}
        GROUP BY category
        ORDER BY count DESC
      `
    );

    return NextResponse.json({
      success: true,
      products: result.rows,
      summary: {
        categories: categorySummary.rows,
        total_count: total,
        active_count: result.rows.filter(p => p.is_active).length,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/products error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch products",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/products
|--------------------------------------------------------------------------
|
| Creates a product/service.
|
| Request body:
| {
|   name: string,
|   description?: string,
|   sku?: string,
|   unit_price?: number,
|   tax_rate_id?: string,
|   category?: string,
|   is_active?: boolean,
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
      name,
      description,
      sku,
      unit_price,
      tax_rate_id,
      category,
      is_active,
      notes,
      metadata,
    } = body;

    // Validate name
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Product name is required" },
        { status: 400 }
      );
    }

    // Validate price
    const unitPrice = unit_price === undefined || unit_price === null || unit_price === ""
      ? 0
      : Number(unit_price);

    if (Number.isNaN(unitPrice) || unitPrice < 0) {
      return NextResponse.json(
        { error: "unit_price must be a non-negative number" },
        { status: 400 }
      );
    }

    // Validate tax rate if provided
    if (tax_rate_id) {
      const taxResult = await pool.query(
        `
          SELECT id, is_active
          FROM public.tax_rates
          WHERE id = $1
          LIMIT 1
        `,
        [tax_rate_id]
      );

      if ((taxResult.rowCount ?? 0) === 0) {
        return NextResponse.json(
          { error: "The specified tax rate does not exist" },
          { status: 400 }
        );
      }

      if (!taxResult.rows[0].is_active) {
        return NextResponse.json(
          { error: "The specified tax rate is inactive" },
          { status: 400 }
        );
      }
    }

    // Check SKU uniqueness
    const normalizedSku = sku && typeof sku === "string" && sku.trim() ? sku.trim() : null;

    if (normalizedSku) {
      const skuResult = await pool.query(
        `
          SELECT id
          FROM public.products
          WHERE sku = $1
          LIMIT 1
        `,
        [normalizedSku]
      );

      if ((skuResult.rowCount ?? 0) > 0) {
        return NextResponse.json(
          { error: "A product with this SKU already exists" },
          { status: 409 }
        );
      }
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Insert product
      const result = await client.query(
        `
          INSERT INTO public.products (
            name,
            description,
            sku,
            unit_price,
            tax_rate_id,
            category,
            is_active,
            notes,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `,
        [
          name.trim(),
          nullableString(description),
          normalizedSku,
          unitPrice,
          tax_rate_id || null,
          nullableString(category),
          is_active ?? true,
          nullableString(notes),
          jsonValue(metadata, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          product: result.rows[0],
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
    console.error("POST /api/invoices/products error:", error);

    // PostgreSQL unique constraint protection
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { error: "A product with this SKU already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create product",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/products
|--------------------------------------------------------------------------
|
| Updates a product/service.
|
| Request body:
| {
|   id: string,
|   name?: string,
|   description?: string,
|   sku?: string,
|   unit_price?: number,
|   tax_rate_id?: string,
|   category?: string,
|   is_active?: boolean,
|   notes?: string,
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
      description,
      sku,
      unit_price,
      tax_rate_id,
      category,
      is_active,
      notes,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Fetch existing product
      const existing = await client.query(
        `
          SELECT *
          FROM public.products
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existing.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Resolve name
      const nextName = name !== undefined ? String(name).trim() : current.name;

      if (!nextName) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product name cannot be empty" },
          { status: 400 }
        );
      }

      // Resolve price
      const nextUnitPrice = unit_price !== undefined ? Number(unit_price) : Number(current.unit_price);

      if (Number.isNaN(nextUnitPrice) || nextUnitPrice < 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "unit_price must be a non-negative number" },
          { status: 400 }
        );
      }

      // Resolve SKU
      const nextSku = sku !== undefined
        ? sku && typeof sku === "string" && sku.trim() ? sku.trim() : null
        : current.sku;

      // Check SKU only when it changed
      if (nextSku && nextSku !== current.sku) {
        const skuResult = await client.query(
          `
            SELECT id
            FROM public.products
            WHERE sku = $1
              AND id <> $2
            LIMIT 1
          `,
          [nextSku, id]
        );

        if ((skuResult.rowCount ?? 0) > 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "A product with this SKU already exists" },
            { status: 409 }
          );
        }
      }

      // Validate tax rate
      const nextTaxRateId = tax_rate_id !== undefined ? tax_rate_id || null : current.tax_rate_id;

      if (nextTaxRateId) {
        const taxResult = await client.query(
          `
            SELECT id, is_active
            FROM public.tax_rates
            WHERE id = $1
            LIMIT 1
          `,
          [nextTaxRateId]
        );

        if ((taxResult.rowCount ?? 0) === 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "The specified tax rate does not exist" },
            { status: 400 }
          );
        }

        if (!taxResult.rows[0].is_active) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "The specified tax rate is inactive" },
            { status: 400 }
          );
        }
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = [
        { key: 'name', value: nextName },
        { key: 'description', value: description !== undefined ? nullableString(description) : current.description },
        { key: 'sku', value: nextSku },
        { key: 'unit_price', value: nextUnitPrice },
        { key: 'tax_rate_id', value: nextTaxRateId },
        { key: 'category', value: category !== undefined ? nullableString(category) : current.category },
        { key: 'is_active', value: is_active !== undefined ? Boolean(is_active) : current.is_active },
        { key: 'notes', value: notes !== undefined ? nullableString(notes) : current.notes },
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
          UPDATE public.products
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        product: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/products error:", error);

    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json(
        { error: "A product with this SKU already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update product",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/products
|--------------------------------------------------------------------------
|
| Soft-deletes a product by setting is_active = false.
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
        { error: "Product ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if product exists
      const existing = await client.query(
        `
          SELECT id, name, is_active
          FROM public.products
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existing.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Product not found" },
          { status: 404 }
        );
      }

      const product = existing.rows[0];

      // Check if product is in use by any invoice items
      const usageCheck = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.invoice_items
          WHERE product_id = $1
        `,
        [id]
      );

      if (usageCheck.rows[0]?.in_use) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Cannot delete product as it is in use by one or more invoice items.",
          },
          { status: 409 }
        );
      }

      // Soft delete
      const result = await client.query(
        `
          UPDATE public.products
          SET
            is_active = false,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, sku, is_active
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: `Product "${product.name}" deactivated successfully`,
        product: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/products error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to deactivate product",
      },
      { status: 500 }
    );
  }
}