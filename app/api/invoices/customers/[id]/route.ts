import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

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
| GET /api/invoices/customers/[id]
|--------------------------------------------------------------------------
*/

export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          c.id,
          c.company_name,
          c.contact_name,
          c.email,
          c.phone,
          c.website,
          c.billing_address,
          c.shipping_address,
          c.tax_id,
          c.tax_id_type,
          c.registration_number,
          c.currency,
          c.payment_terms_id,
          c.credit_limit,
          c.customer_type,
          c.industry,
          c.status,
          c.deleted_at,
          c.deleted_by,
          c.notes,
          c.metadata,
          c.created_at,
          c.updated_at,

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
              WHERE id = c.payment_terms_id
            ) pt
          ) AS payment_terms,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id,
                  'invoice_number', i.invoice_number,
                  'total_amount', i.total_amount,
                  'amount_due', i.amount_due,
                  'status', i.status,
                  'issue_date', i.issue_date,
                  'due_date', i.due_date
                )
                ORDER BY i.created_at DESC
                LIMIT 10
              ),
              '[]'::json
            )
            FROM public.invoices i
            WHERE i.customer_id = c.id
              AND i.deleted_at IS NULL
          ) AS recent_invoices,

          (
            SELECT COALESCE(SUM(amount_due), 0)
            FROM public.invoices
            WHERE customer_id = c.id
              AND status NOT IN ('paid', 'cancelled', 'void')
              AND deleted_at IS NULL
          ) AS total_outstanding,

          (
            SELECT COUNT(*)
            FROM public.invoices
            WHERE customer_id = c.id
              AND deleted_at IS NULL
          ) AS invoice_count,

          (
            SELECT COALESCE(SUM(total_amount), 0)
            FROM public.invoices
            WHERE customer_id = c.id
              AND deleted_at IS NULL
          ) AS total_revenue,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM public.payments p
            INNER JOIN public.invoices i ON i.id = p.invoice_id
            WHERE i.customer_id = c.id
              AND p.status = 'completed'
          ) AS total_paid

        FROM public.customers c
        WHERE c.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      customer: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/customers/[id]:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch customer",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/customers/[id]
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    await client.query("BEGIN");

    // Check if customer exists
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.customers
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    // Build update
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const fields = [
      'company_name',
      'contact_name',
      'email',
      'phone',
      'website',
      'billing_address',
      'shipping_address',
      'tax_id',
      'tax_id_type',
      'registration_number',
      'currency',
      'payment_terms_id',
      'credit_limit',
      'customer_type',
      'industry',
      'status',
      'notes',
      'metadata',
    ];

    for (const field of fields) {
      if (body[field] !== undefined) {
        if (field === 'credit_limit') {
          const value = body[field] !== null ? toDecimal(body[field]) : null;
          if (value !== null && value < 0) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "Credit limit cannot be negative" },
              { status: 400 }
            );
          }
          updates.push(`${field} = $${paramCount++}`);
          values.push(value);
        } else if (field === 'metadata') {
          updates.push(`${field} = metadata || $${paramCount++}`);
          values.push(jsonValue(body[field], {}));
        } else if (field === 'status') {
          const allowedStatuses = ["active", "inactive", "blocked"];
          if (!allowedStatuses.includes(body[field])) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "Invalid status. Must be one of: active, inactive, blocked" },
              { status: 400 }
            );
          }
          updates.push(`${field} = $${paramCount++}`);
          values.push(body[field]);
        } else if (field === 'customer_type') {
          const allowedTypes = ["individual", "company", "government", "non_profit"];
          if (!allowedTypes.includes(body[field])) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "Invalid customer type" },
              { status: 400 }
            );
          }
          updates.push(`${field} = $${paramCount++}`);
          values.push(body[field]);
        } else if (field === 'currency') {
          if (body[field] && body[field].length !== 3) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "Currency must be a 3-letter ISO code" },
              { status: 400 }
            );
          }
          updates.push(`${field} = $${paramCount++}`);
          values.push(body[field]);
        } else {
          updates.push(`${field} = $${paramCount++}`);
          values.push(nullableString(body[field]));
        }
      }
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);
    updates.push(`id = $${paramCount}`);
    values.push(id);

    const result = await client.query(
      `
        UPDATE public.customers
        SET ${updates.join(", ")}
        WHERE id = $${paramCount}
        RETURNING *
      `,
      values
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      customer: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("PATCH /api/invoices/customers/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update customer",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/customers/[id]
|--------------------------------------------------------------------------
|
| Soft deletes a customer.
| Customers with existing invoices cannot be deleted.
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, { params }: Context) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Customer ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));

    await client.query("BEGIN");

    // Check if customer exists
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.customers
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Customer not found" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    // Check if customer has invoices
    const invoiceCheck = await client.query(
      `
        SELECT COUNT(*) > 0 AS has_invoices
        FROM public.invoices
        WHERE customer_id = $1
          AND deleted_at IS NULL
      `,
      [id]
    );

    if (invoiceCheck.rows[0]?.has_invoices) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Cannot delete customer with existing invoices. Block or deactivate them instead.",
        },
        { status: 409 }
      );
    }

    // Soft delete
    const result = await client.query(
      `
        UPDATE public.customers
        SET
          status = 'inactive',
          deleted_at = NOW(),
          deleted_by = $1,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [user.id, id]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Customer deleted successfully",
      customer: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE /api/invoices/customers/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete customer",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}