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

const VALID_PAYMENT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "disputed",
] as const;

function isPaymentStatus(value: unknown): value is (typeof VALID_PAYMENT_STATUSES)[number] {
  return typeof value === "string" && VALID_PAYMENT_STATUSES.includes(value as any);
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/payments/[id]
|--------------------------------------------------------------------------
|
| Returns a single payment with full details.
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
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          p.id,
          p.invoice_id,
          p.amount,
          p.currency,
          p.exchange_rate,
          p.payment_method,
          p.payment_method_details,
          p.transaction_reference,
          p.payment_date,
          p.status,
          p.reconciled,
          p.reconciled_at,
          p.reconciled_by,
          p.notes,
          p.metadata,
          p.created_at,
          p.updated_at,

          i.invoice_number,
          i.status AS invoice_status,
          i.total_amount AS invoice_total,
          i.amount_paid AS invoice_amount_paid,
          i.amount_due AS invoice_amount_due,

          c.id AS customer_id,
          c.company_name AS customer_name,
          c.email AS customer_email,
          c.phone AS customer_phone,

          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'id', pa.id,
                  'invoice_item_id', pa.invoice_item_id,
                  'amount', pa.amount,
                  'notes', pa.notes,
                  'created_at', pa.created_at,
                  'item_description', ii.description
                )
              ),
              '[]'::json
            )
            FROM public.payment_allocations pa
            LEFT JOIN public.invoice_items ii
              ON ii.id = pa.invoice_item_id
            WHERE pa.payment_id = p.id
          ) AS allocations

        FROM public.payments p

        INNER JOIN public.invoices i
          ON i.id = p.invoice_id

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE p.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Payment not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      payment: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/payments/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch payment",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/payments/[id]
|--------------------------------------------------------------------------
|
| Updates a payment.
|
| Request body:
| {
|   status?: 'pending'|'completed'|'failed'|'refunded'|'disputed',
|   reconciled?: boolean,
|   notes?: string,
|   metadata?: object,
|   transaction_reference?: string,
|   payment_method_details?: object
| }
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
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const {
      status,
      reconciled,
      notes,
      metadata,
      transaction_reference,
      payment_method_details,
    } = body;

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing payment
      const existingResult = await client.query(
        `
          SELECT *
          FROM public.payments
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment not found" },
          { status: 404 }
        );
      }

      const existing = existingResult.rows[0];

      // Validate status if provided
      if (status && !isPaymentStatus(status)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      // Build update
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = [
        { key: 'status', value: status !== undefined ? status : existing.status },
        { key: 'reconciled', value: reconciled !== undefined ? reconciled : existing.reconciled },
        { key: 'notes', value: notes !== undefined ? nullableString(notes) : existing.notes },
        { key: 'transaction_reference', value: transaction_reference !== undefined ? nullableString(transaction_reference) : existing.transaction_reference },
        { key: 'payment_method_details', value: payment_method_details !== undefined ? jsonValue(payment_method_details, {}) : existing.payment_method_details },
        { key: 'metadata', value: metadata !== undefined ? jsonValue(metadata, {}) : existing.metadata },
      ];

      for (const field of fields) {
        if (field.value !== undefined) {
          updates.push(`${field.key} = $${paramCount++}`);
          values.push(field.value);
        }
      }

      // If reconciling, set reconciled_at and reconciled_by
      if (reconciled === true && !existing.reconciled) {
        updates.push(`reconciled_at = NOW()`);
        updates.push(`reconciled_by = $${paramCount++}`);
        values.push(user.id);
      }

      // If unreconciling, clear reconciled_at and reconciled_by
      if (reconciled === false && existing.reconciled) {
        updates.push(`reconciled_at = NULL`);
        updates.push(`reconciled_by = NULL`);
      }

      // If status changed to completed, update payment_date
      if (status === "completed" && existing.status !== "completed") {
        updates.push(`payment_date = COALESCE(payment_date, NOW())`);
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
          UPDATE public.payments
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
      );

      // Recalculate invoice payment state
      await client.query(
        `
          SELECT public.recalculate_invoice_payment_state($1)
        `,
        [existing.invoice_id]
      );

      // Activity log
      await client.query(
        `
          INSERT INTO public.invoice_activity_log (
            invoice_id,
            user_id,
            user_name,
            action,
            details
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          existing.invoice_id,
          user.id,
          user.fullName || user.email,
          "payment_updated",
          jsonValue({
            payment_id: id,
            previous_status: existing.status,
            new_status: status || existing.status,
            reconciled: reconciled !== undefined ? reconciled : existing.reconciled,
          }, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        payment: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/payments/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update payment",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/payments/[id]
|--------------------------------------------------------------------------
|
| Deletes a payment. Only pending payments can be deleted.
| Completed payments cannot be deleted.
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
        { error: "Payment ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Get existing payment
      const existingResult = await client.query(
        `
          SELECT *
          FROM public.payments
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if (existingResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment not found" },
          { status: 404 }
        );
      }

      const existing = existingResult.rows[0];

      // Only allow deletion of pending payments
      if (existing.status === "completed") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot delete a completed payment. Create a refund or credit note instead." },
          { status: 409 }
        );
      }

      if (existing.status === "refunded") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot delete a refunded payment" },
          { status: 409 }
        );
      }

      if (existing.status === "disputed") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot delete a disputed payment" },
          { status: 409 }
        );
      }

      // Delete payment allocations first
      await client.query(
        `
          DELETE FROM public.payment_allocations
          WHERE payment_id = $1
        `,
        [id]
      );

      // Delete payment
      await client.query(
        `
          DELETE FROM public.payments
          WHERE id = $1
        `,
        [id]
      );

      // Recalculate invoice payment state
      await client.query(
        `
          SELECT public.recalculate_invoice_payment_state($1)
        `,
        [existing.invoice_id]
      );

      // Activity log
      await client.query(
        `
          INSERT INTO public.invoice_activity_log (
            invoice_id,
            user_id,
            user_name,
            action,
            details
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          existing.invoice_id,
          user.id,
          user.fullName || user.email,
          "payment_deleted",
          jsonValue({
            payment_id: id,
            amount: existing.amount,
            status: existing.status,
          }, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Payment deleted successfully",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/payments/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete payment",
      },
      { status: 500 }
    );
  }
}