import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

const ALLOWED_STATUSES = ["active", "paused", "completed", "cancelled"] as const;
type RecurringStatus = typeof ALLOWED_STATUSES[number];

function isRecurringStatus(value: unknown): value is RecurringStatus {
  return typeof value === "string" && ALLOWED_STATUSES.includes(value as RecurringStatus);
}

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

function isValidDate(value: unknown): boolean {
  if (!value || typeof value !== "string") {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/recurring/[id]
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
        { error: "Recurring invoice ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          ri.*,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone,
            'billing_address', c.billing_address,
            'tax_id', c.tax_id,
            'currency', c.currency
          ) AS customer,

          json_build_object(
            'id', it.id,
            'name', it.name,
            'is_default', it.is_default,
            'primary_color', it.primary_color
          ) AS template,

          json_build_object(
            'id', pt.id,
            'name', pt.name,
            'due_days', pt.due_days,
            'discount_percentage', pt.discount_percentage
          ) AS payment_terms,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', i.id,
                  'invoice_number', i.invoice_number,
                  'total_amount', i.total_amount,
                  'status', i.status,
                  'issue_date', i.issue_date,
                  'due_date', i.due_date,
                  'created_at', i.created_at
                )
                ORDER BY i.created_at DESC
              ),
              '[]'::json
            )
            FROM public.invoices i
            WHERE i.recurring_id = ri.id
              AND i.deleted_at IS NULL
          ) AS generated_invoices

        FROM public.recurring_invoices ri

        INNER JOIN public.customers c
          ON c.id = ri.customer_id

        LEFT JOIN public.invoice_templates it
          ON it.id = ri.template_id

        LEFT JOIN public.payment_terms pt
          ON pt.id = ri.payment_terms_id

        WHERE ri.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Recurring invoice not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      recurringInvoice: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/recurring/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch recurring invoice",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/recurring/[id]
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest, { params }: Context) {
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
        { error: "Recurring invoice ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const {
      status,
      next_issue_date,
      end_date,
      notes,
      metadata,
    } = body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing recurring invoice
      const existing = await client.query(
        `
          SELECT *
          FROM public.recurring_invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Recurring invoice not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Validate status
      if (status && !isRecurringStatus(status)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${ALLOWED_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      // Validate next_issue_date
      let nextIssueDate = current.next_issue_date;

      if (next_issue_date !== undefined) {
        if (!isValidDate(next_issue_date)) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "Invalid next_issue_date" },
            { status: 400 }
          );
        }
        nextIssueDate = new Date(next_issue_date);
      }

      // Validate end_date
      let endDate = current.end_date;

      if (end_date !== undefined) {
        if (end_date === null || end_date === "") {
          endDate = null;
        } else if (!isValidDate(end_date)) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            { error: "Invalid end_date" },
            { status: 400 }
          );
        } else {
          endDate = new Date(end_date);
          if (endDate < current.start_date) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              { error: "end_date cannot be before start_date" },
              { status: 400 }
            );
          }
        }
      }

      // Build update
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (status !== undefined) {
        updates.push(`status = $${paramCount++}`);
        values.push(status);
      }

      if (next_issue_date !== undefined) {
        updates.push(`next_issue_date = $${paramCount++}`);
        values.push(nextIssueDate);
      }

      if (end_date !== undefined) {
        updates.push(`end_date = $${paramCount++}`);
        values.push(endDate);
      }

      if (notes !== undefined) {
        updates.push(`notes = $${paramCount++}`);
        values.push(nullableString(notes));
      }

      if (metadata !== undefined) {
        updates.push(`metadata = metadata || $${paramCount++}`);
        values.push(metadata);
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
          UPDATE public.recurring_invoices
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        recurringInvoice: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/recurring/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update recurring invoice",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/recurring/[id]
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, { params }: Context) {
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
        { error: "Recurring invoice ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `
          SELECT *
          FROM public.recurring_invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existing.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Recurring invoice not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Check if there are generated invoices
      const generatedCheck = await client.query(
        `
          SELECT COUNT(*) > 0 AS has_generated
          FROM public.invoices
          WHERE recurring_id = $1
            AND deleted_at IS NULL
        `,
        [id]
      );

      if (generatedCheck.rows[0]?.has_generated) {
        // Soft delete: set status to cancelled instead of deleting
        const result = await client.query(
          `
            UPDATE public.recurring_invoices
            SET
              status = 'cancelled',
              updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [id]
        );

        await client.query("COMMIT");

        return NextResponse.json({
          success: true,
          message: "Recurring invoice cancelled successfully (has generated invoices)",
          recurringInvoice: result.rows[0],
        });
      }

      // No generated invoices, soft delete by cancelling
      const result = await client.query(
        `
          UPDATE public.recurring_invoices
          SET
            status = 'cancelled',
            updated_at = NOW()
          WHERE id = $1
          RETURNING *
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Recurring invoice cancelled successfully",
        recurringInvoice: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/recurring/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to cancel recurring invoice",
      },
      { status: 500 }
    );
  }
}