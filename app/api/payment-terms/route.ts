import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/payment-terms
 *
 * Returns all active payment terms for the current business.
 *
 * Optional:
 * ?include_inactive=true
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
    const includeInactive =
      searchParams.get("include_inactive") === "true";

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
          created_at,
          updated_at
        FROM public.payment_terms
        ${
          includeInactive
            ? ""
            : "WHERE is_active = true"
        }
        ORDER BY sort_order ASC, due_days ASC, name ASC
      `
    );

    return NextResponse.json({
      success: true,
      payment_terms: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error(
      "GET /api/payment-terms error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch payment terms",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payment-terms
 *
 * Creates a new payment term.
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
    } = body;

    // ---------------------------------------------
    // Validate name
    // ---------------------------------------------
    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return NextResponse.json(
        {
          error: "Payment term name is required",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Validate due days
    // ---------------------------------------------
    const dueDays =
      due_days === undefined ||
      due_days === null ||
      due_days === ""
        ? 30
        : Number(due_days);

    if (
      !Number.isInteger(dueDays) ||
      dueDays < 0
    ) {
      return NextResponse.json(
        {
          error:
            "due_days must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Validate discount
    // ---------------------------------------------
    const discountPercentage =
      discount_percentage === undefined ||
      discount_percentage === null ||
      discount_percentage === ""
        ? 0
        : Number(discount_percentage);

    if (
      Number.isNaN(discountPercentage) ||
      discountPercentage < 0 ||
      discountPercentage > 100
    ) {
      return NextResponse.json(
        {
          error:
            "discount_percentage must be between 0 and 100",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Validate discount days
    // ---------------------------------------------
    const discountDays =
      discount_days === undefined ||
      discount_days === null ||
      discount_days === ""
        ? null
        : Number(discount_days);

    if (
      discountDays !== null &&
      (!Number.isInteger(discountDays) ||
        discountDays < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "discount_days must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // If this is default, remove default from
    // existing payment terms.
    // ---------------------------------------------
    if (is_default === true) {
      await pool.query(
        `
          UPDATE public.payment_terms
          SET
            is_default = false,
            updated_at = NOW()
          WHERE is_default = true
        `
      );
    }

    // ---------------------------------------------
    // Insert
    // ---------------------------------------------
    const result = await pool.query(
      `
        INSERT INTO public.payment_terms (
          name,
          description,
          due_days,
          discount_percentage,
          discount_days,
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
          description,
          due_days,
          discount_percentage,
          discount_days,
          is_default,
          is_active,
          sort_order,
          created_at,
          updated_at
      `,
      [
        name.trim(),
        description || null,
        dueDays,
        discountPercentage,
        discountDays,
        is_default ?? false,
        is_active ?? true,
        sort_order ?? 0,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        payment_term: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/payment-terms error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to create payment term",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/payment-terms
 *
 * Updates a payment term.
 *
 * Body:
 * {
 *   id: string,
 *   name?: string,
 *   description?: string,
 *   due_days?: number,
 *   discount_percentage?: number,
 *   discount_days?: number | null,
 *   is_default?: boolean,
 *   is_active?: boolean,
 *   sort_order?: number
 * }
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
    } = body;

    if (!id) {
      return NextResponse.json(
        {
          error: "Payment term ID is required",
        },
        { status: 400 }
      );
    }

    // ---------------------------------------------
    // Make sure the payment term exists
    // ---------------------------------------------
    const existing = await pool.query(
      `
        SELECT *
        FROM public.payment_terms
        WHERE id = $1
        LIMIT 1
      `,
      [id]
    );

    if (existing.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Payment term not found",
        },
        { status: 404 }
      );
    }

    const current = existing.rows[0];

    // ---------------------------------------------
    // Resolve values
    // ---------------------------------------------
    const nextName =
      name !== undefined
        ? String(name).trim()
        : current.name;

    if (!nextName) {
      return NextResponse.json(
        {
          error:
            "Payment term name cannot be empty",
        },
        { status: 400 }
      );
    }

    const nextDueDays =
      due_days !== undefined
        ? Number(due_days)
        : current.due_days;

    if (
      !Number.isInteger(nextDueDays) ||
      nextDueDays < 0
    ) {
      return NextResponse.json(
        {
          error:
            "due_days must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    const nextDiscountPercentage =
      discount_percentage !== undefined
        ? Number(discount_percentage)
        : Number(current.discount_percentage);

    if (
      Number.isNaN(nextDiscountPercentage) ||
      nextDiscountPercentage < 0 ||
      nextDiscountPercentage > 100
    ) {
      return NextResponse.json(
        {
          error:
            "discount_percentage must be between 0 and 100",
        },
        { status: 400 }
      );
    }

    const nextDiscountDays =
      discount_days !== undefined
        ? discount_days === null ||
          discount_days === ""
          ? null
          : Number(discount_days)
        : current.discount_days;

    if (
      nextDiscountDays !== null &&
      (!Number.isInteger(nextDiscountDays) ||
        nextDiscountDays < 0)
    ) {
      return NextResponse.json(
        {
          error:
            "discount_days must be a non-negative integer",
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

    // ---------------------------------------------
    // Transaction
    // ---------------------------------------------
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

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

      const result = await client.query(
        `
          UPDATE public.payment_terms
          SET
            name = $1,
            description = $2,
            due_days = $3,
            discount_percentage = $4,
            discount_days = $5,
            is_default = $6,
            is_active = $7,
            sort_order = $8,
            updated_at = NOW()
          WHERE id = $9
          RETURNING
            id,
            name,
            description,
            due_days,
            discount_percentage,
            discount_days,
            is_default,
            is_active,
            sort_order,
            created_at,
            updated_at
        `,
        [
          nextName,
          description !== undefined
            ? description
            : current.description,
          nextDueDays,
          nextDiscountPercentage,
          nextDiscountDays,
          nextIsDefault,
          nextIsActive,
          nextSortOrder,
          id,
        ]
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
    console.error(
      "PATCH /api/payment-terms error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to update payment term",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/payment-terms?id=<id>
 *
 * Soft-deletes a payment term by marking it inactive.
 *
 * We do NOT physically delete it because invoices may
 * already reference this payment term.
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
        {
          error: "Payment term ID is required",
        },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        UPDATE public.payment_terms
        SET
          is_active = false,
          is_default = false,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          is_active,
          is_default
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json(
        {
          error: "Payment term not found",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      payment_term: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE /api/payment-terms error:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to deactivate payment term",
      },
      { status: 500 }
    );
  }
}