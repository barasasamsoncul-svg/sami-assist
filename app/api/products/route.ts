import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/products
 *
 * Returns products/services from the authenticated
 * user's tenant database.
 *
 * Optional query parameters:
 *
 * ?search=laptop
 * ?category=Electronics
 * ?status=active
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
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Read query parameters
    // --------------------------------------------------
    const { searchParams } =
      new URL(req.url);

    const search =
      searchParams.get("search")?.trim() || "";

    const category =
      searchParams.get("category")?.trim() || "";

    const status =
      searchParams.get("status")?.trim() || "";

    const includeInactive =
      searchParams.get("include_inactive") ===
      "true";

    // --------------------------------------------------
    // 4. Build filters
    // --------------------------------------------------
    const conditions: string[] = [];

    const values: unknown[] = [];

    if (!includeInactive) {
      conditions.push("p.is_active = true");
    }

    if (search) {
      values.push(`%${search}%`);

      conditions.push(`
        (
          p.name ILIKE $${values.length}
          OR p.description ILIKE $${values.length}
          OR p.sku ILIKE $${values.length}
          OR p.category ILIKE $${values.length}
        )
      `);
    }

    if (category) {
      values.push(category);

      conditions.push(
        `p.category = $${values.length}`
      );
    }

    if (status) {
      if (
        status !== "active" &&
        status !== "inactive"
      ) {
        return NextResponse.json(
          {
            error:
              "status must be active or inactive",
          },
          { status: 400 }
        );
      }

      values.push(status === "active");

      conditions.push(
        `p.is_active = $${values.length}`
      );
    }

    const whereClause =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    // --------------------------------------------------
    // 5. Fetch products
    // --------------------------------------------------
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
          p.created_at,
          p.updated_at,

          tr.name AS tax_rate_name,
          tr.rate AS tax_rate,
          tr.tax_type AS tax_type

        FROM public.products p

        LEFT JOIN public.tax_rates tr
          ON tr.id = p.tax_rate_id

        ${whereClause}

        ORDER BY
          p.name ASC
      `,
      values
    );

    return NextResponse.json({
      success: true,
      products: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error(
      "GET /api/products error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch products",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/products
 *
 * Creates a product/service.
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
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Parse request body
    // --------------------------------------------------
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
          error: "Product name is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Validate price
    // --------------------------------------------------
    const unitPrice =
      unit_price === undefined ||
      unit_price === null ||
      unit_price === ""
        ? 0
        : Number(unit_price);

    if (
      Number.isNaN(unitPrice) ||
      unitPrice < 0
    ) {
      return NextResponse.json(
        {
          error:
            "unit_price must be a non-negative number",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Validate tax rate if provided
    // --------------------------------------------------
    if (tax_rate_id) {
      const taxResult = await pool.query(
        `
          SELECT id
          FROM public.tax_rates
          WHERE id = $1
          LIMIT 1
        `,
        [tax_rate_id]
      );

      if ((taxResult.rowCount ?? 0) === 0) {
        return NextResponse.json(
          {
            error:
              "The specified tax rate does not exist",
          },
          { status: 400 }
        );
      }
    }

    // --------------------------------------------------
    // 7. Check SKU uniqueness
    // --------------------------------------------------
    const normalizedSku =
      sku &&
      typeof sku === "string" &&
      sku.trim()
        ? sku.trim()
        : null;

    if (normalizedSku) {
      const skuResult =
        await pool.query(
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
          {
            error:
              "A product with this SKU already exists",
          },
          { status: 409 }
        );
      }
    }

    // --------------------------------------------------
    // 8. Insert product
    // --------------------------------------------------
    const result = await pool.query(
      `
        INSERT INTO public.products (
          name,
          description,
          sku,
          unit_price,
          tax_rate_id,
          category,
          is_active,
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
          $8
        )
        RETURNING
          id,
          name,
          description,
          sku,
          unit_price,
          tax_rate_id,
          category,
          is_active,
          notes,
          created_at,
          updated_at
      `,
      [
        name.trim(),
        description || null,
        normalizedSku,
        unitPrice,
        tax_rate_id || null,
        category || null,
        is_active ?? true,
        notes || null,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        product: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/products error:",
      error
    );

    // PostgreSQL unique constraint protection
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        {
          error:
            "A product with this SKU already exists",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to create product",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/products
 *
 * Updates a product/service.
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
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Parse request body
    // --------------------------------------------------
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
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          error: "Product ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Fetch existing product
    // --------------------------------------------------
    const existing =
      await pool.query(
        `
          SELECT *
          FROM public.products
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

    if ((existing.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "Product not found",
        },
        { status: 404 }
      );
    }

    const current =
      existing.rows[0];

    // --------------------------------------------------
    // 5. Resolve name
    // --------------------------------------------------
    const nextName =
      name !== undefined
        ? String(name).trim()
        : current.name;

    if (!nextName) {
      return NextResponse.json(
        {
          error:
            "Product name cannot be empty",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Resolve price
    // --------------------------------------------------
    const nextUnitPrice =
      unit_price !== undefined
        ? Number(unit_price)
        : Number(current.unit_price);

    if (
      Number.isNaN(nextUnitPrice) ||
      nextUnitPrice < 0
    ) {
      return NextResponse.json(
        {
          error:
            "unit_price must be a non-negative number",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 7. Resolve SKU
    // --------------------------------------------------
    const nextSku =
      sku !== undefined
        ? sku &&
          typeof sku === "string" &&
          sku.trim()
          ? sku.trim()
          : null
        : current.sku;

    // Check SKU only when it changed
    if (
      nextSku &&
      nextSku !== current.sku
    ) {
      const skuResult =
        await pool.query(
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
        return NextResponse.json(
          {
            error:
              "A product with this SKU already exists",
          },
          { status: 409 }
        );
      }
    }

    // --------------------------------------------------
    // 8. Validate tax rate
    // --------------------------------------------------
    const nextTaxRateId =
      tax_rate_id !== undefined
        ? tax_rate_id || null
        : current.tax_rate_id;

    if (nextTaxRateId) {
      const taxResult =
        await pool.query(
          `
            SELECT id
            FROM public.tax_rates
            WHERE id = $1
            LIMIT 1
          `,
          [nextTaxRateId]
        );

      if ((taxResult.rowCount ?? 0) === 0) {
        return NextResponse.json(
          {
            error:
              "The specified tax rate does not exist",
          },
          { status: 400 }
        );
      }
    }

    // --------------------------------------------------
    // 9. Update
    // --------------------------------------------------
    const result = await pool.query(
      `
        UPDATE public.products
        SET
          name = $1,
          description = $2,
          sku = $3,
          unit_price = $4,
          tax_rate_id = $5,
          category = $6,
          is_active = $7,
          notes = $8,
          updated_at = NOW()
        WHERE id = $9
        RETURNING
          id,
          name,
          description,
          sku,
          unit_price,
          tax_rate_id,
          category,
          is_active,
          notes,
          created_at,
          updated_at
      `,
      [
        nextName,
        description !== undefined
          ? description
          : current.description,
        nextSku,
        nextUnitPrice,
        nextTaxRateId,
        category !== undefined
          ? category
          : current.category,
        is_active !== undefined
          ? Boolean(is_active)
          : current.is_active,
        notes !== undefined
          ? notes
          : current.notes,
        id,
      ]
    );

    return NextResponse.json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    console.error(
      "PATCH /api/products error:",
      error
    );

    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      return NextResponse.json(
        {
          error:
            "A product with this SKU already exists",
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error: "Failed to update product",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/products?id=<id>
 *
 * Soft-deletes a product by setting is_active = false.
 */
export async function DELETE(
  req: NextRequest
) {
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
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Get product ID
    // --------------------------------------------------
    const { searchParams } =
      new URL(req.url);

    const id =
      searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error: "Product ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Soft delete
    // --------------------------------------------------
    const result = await pool.query(
      `
        UPDATE public.products
        SET
          is_active = false,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          sku,
          is_active
      `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "Product not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      product: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE /api/products error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to deactivate product",
      },
      { status: 500 }
    );
  }
}