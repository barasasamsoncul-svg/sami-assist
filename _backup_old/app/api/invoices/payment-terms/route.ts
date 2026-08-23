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
| GET /api/invoices/payment-terms
|--------------------------------------------------------------------------
|
| Returns all payment terms for the current business.
|
| Optional:
| ?include_inactive=true
| ?search=Net
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

    const includeInactive = searchParams.get("include_inactive") === "true";
    const search = searchParams.get("search")?.trim() || "";
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
      conditions.push(`name ILIKE $${parameterIndex}`);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.payment_terms
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get payment terms
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          description,
          due_days,
          discount_percentage,
          discount_days,
          is_default,
          is_active,
          sort_order,
          metadata,
          created_at,
          updated_at
        FROM public.payment_terms
        ${whereClause}
        ORDER BY sort_order ASC, due_days ASC, name ASC
        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      payment_terms: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/payment-terms error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch payment terms",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/payment-terms
|--------------------------------------------------------------------------
|
| Creates a new payment term.
|
| Request body:
| {
|   name: string,
|   description?: string,
|   due_days?: number,
|   discount_percentage?: number,
|   discount_days?: number | null,
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
      description,
      due_days,
      discount_percentage,
      discount_days,
      is_default,
      is_active,
      sort_order,
      metadata,
    } = body;

    // Validate name
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Payment term name is required" },
        { status: 400 }
      );
    }

    // Validate due days
    const dueDays = due_days === undefined || due_days === null || due_days === "" ? 30 : Number(due_days);

    if (!Number.isInteger(dueDays) || dueDays < 0) {
      return NextResponse.json(
        { error: "due_days must be a non-negative integer" },
        { status: 400 }
      );
    }

    // Validate discount percentage
    const discountPercentage = discount_percentage === undefined || discount_percentage === null || discount_percentage === ""
      ? 0
      : Number(discount_percentage);

    if (Number.isNaN(discountPercentage) || discountPercentage < 0 || discountPercentage > 100) {
      return NextResponse.json(
        { error: "discount_percentage must be between 0 and 100" },
        { status: 400 }
      );
    }

    // Validate discount days
    const discountDays = discount_days === undefined || discount_days === null || discount_days === ""
      ? null
      : Number(discount_days);

    if (discountDays !== null && (!Number.isInteger(discountDays) || discountDays < 0)) {
      return NextResponse.json(
        { error: "discount_days must be a non-negative integer or null" },
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
          SELECT id FROM public.payment_terms
          WHERE LOWER(name) = LOWER($1)
            AND is_active = true
        `,
        [name.trim()]
      );

      if (duplicateCheck.rows.length > 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "A payment term with this name already exists" },
          { status: 409 }
        );
      }

      // If this is default, remove default from existing payment terms
      if (is_default === true) {
        await client.query(
          `
            UPDATE public.payment_terms
            SET
              is_default = false,
              updated_at = NOW()
            WHERE is_default = true
          `
        );
      }

      // Insert
      const result = await client.query(
        `
          INSERT INTO public.payment_terms (
            name,
            description,
            due_days,
            discount_percentage,
            discount_days,
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
          nullableString(description),
          dueDays,
          discountPercentage,
          discountDays,
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
          payment_term: result.rows[0],
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
    console.error("POST /api/invoices/payment-terms error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create payment term",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/payment-terms
|--------------------------------------------------------------------------
|
| Updates a payment term.
|
| Request body:
| {
|   id: string,
|   name?: string,
|   description?: string,
|   due_days?: number,
|   discount_percentage?: number,
|   discount_days?: number | null,
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
      description,
      due_days,
      discount_percentage,
      discount_days,
      is_default,
      is_active,
      sort_order,
      metadata,
    } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Payment term ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Make sure the payment term exists
      const existing = await client.query(
        `
          SELECT *
          FROM public.payment_terms
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment term not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Resolve name
      const nextName = name !== undefined ? String(name).trim() : current.name;

      if (!nextName) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment term name cannot be empty" },
          { status: 400 }
        );
      }

      // Check duplicate name (exclude current)
      if (name !== undefined) {
        const duplicateCheck = await client.query(
          `
            SELECT id FROM public.payment_terms
            WHERE LOWER(name) = LOWER($1)
              AND id <> $2
              AND is_active = true
          `,
          [nextName, id]
        );

        if (duplicateCheck.rows.length > 0) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "A payment term with this name already exists" },
            { status: 409 }
          );
        }
      }

      // Resolve due days
      const nextDueDays = due_days !== undefined ? Number(due_days) : current.due_days;

      if (!Number.isInteger(nextDueDays) || nextDueDays < 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "due_days must be a non-negative integer" },
          { status: 400 }
        );
      }

      // Resolve discount percentage
      const nextDiscountPercentage = discount_percentage !== undefined ? Number(discount_percentage) : Number(current.discount_percentage);

      if (Number.isNaN(nextDiscountPercentage) || nextDiscountPercentage < 0 || nextDiscountPercentage > 100) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "discount_percentage must be between 0 and 100" },
          { status: 400 }
        );
      }

      // Resolve discount days
      const nextDiscountDays = discount_days !== undefined
        ? discount_days === null || discount_days === ""
          ? null
          : Number(discount_days)
        : current.discount_days;

      if (nextDiscountDays !== null && (!Number.isInteger(nextDiscountDays) || nextDiscountDays < 0)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "discount_days must be a non-negative integer or null" },
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

      // If this is default, remove default from other payment terms
      if (nextIsDefault) {
        await client.query(
          `
            UPDATE public.payment_terms
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
        { key: 'description', value: description !== undefined ? nullableString(description) : current.description },
        { key: 'due_days', value: nextDueDays },
        { key: 'discount_percentage', value: nextDiscountPercentage },
        { key: 'discount_days', value: nextDiscountDays },
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
          UPDATE public.payment_terms
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        payment_term: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/payment-terms error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update payment term",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/payment-terms
|--------------------------------------------------------------------------
|
| Soft-deletes a payment term by marking it inactive.
|
| We do NOT physically delete it because invoices may
| already reference this payment term.
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
        { error: "Payment term ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if payment term exists
      const existing = await client.query(
        `
          SELECT id, name, is_default, is_active
          FROM public.payment_terms
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rowCount === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment term not found" },
          { status: 404 }
        );
      }

      const term = existing.rows[0];

      // Don't allow deleting the default payment term
      if (term.is_default) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "The default payment term cannot be deleted. Set another term as default first.",
          },
          { status: 400 }
        );
      }

      // Check if payment term is in use by any customer
      const customerUsage = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.customers
          WHERE payment_terms_id = $1
            AND deleted_at IS NULL
        `,
        [id]
      );

      if (customerUsage.rows[0]?.in_use) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Cannot delete payment term as it is in use by one or more customers.",
          },
          { status: 409 }
        );
      }

      // Check if payment term is in use by any invoice
      const invoiceUsage = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.invoices
          WHERE payment_terms_id = $1
            AND deleted_at IS NULL
        `,
        [id]
      );

      if (invoiceUsage.rows[0]?.in_use) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "Cannot delete payment term as it is in use by one or more invoices.",
          },
          { status: 409 }
        );
      }

      // Soft delete
      const result = await client.query(
        `
          UPDATE public.payment_terms
          SET
            is_active = false,
            is_default = false,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, is_active, is_default
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Payment term deactivated successfully",
        payment_term: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/payment-terms error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to deactivate payment term",
      },
      { status: 500 }
    );
  }
}