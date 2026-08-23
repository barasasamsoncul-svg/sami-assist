import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

function toDecimal(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : fallback;
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/payments/[id]/reconcile
|--------------------------------------------------------------------------
|
| Reconciles a payment.
|
| Request body:
| {
|   notes?: string
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
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
    const { notes } = body;

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

      // Check if already reconciled
      if (existing.reconciled) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Payment is already reconciled" },
          { status: 409 }
        );
      }

      // Check if payment is completed or pending
      if (existing.status === "failed") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot reconcile a failed payment" },
          { status: 409 }
        );
      }

      if (existing.status === "refunded") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot reconcile a refunded payment" },
          { status: 409 }
        );
      }

      if (existing.status === "disputed") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot reconcile a disputed payment" },
          { status: 409 }
        );
      }

      // Update payment - set reconciled and status to completed
      const result = await client.query(
        `
          UPDATE public.payments
          SET
            reconciled = true,
            reconciled_at = NOW(),
            reconciled_by = $1,
            status = 'completed',
            updated_at = NOW()
          WHERE id = $2
          RETURNING *
        `,
        [user.id, id]
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
          "payment_reconciled",
          jsonValue({
            payment_id: id,
            amount: existing.amount,
            payment_method: existing.payment_method,
            notes: nullableString(notes),
          }, {}),
        ]
      );

      // Create event for webhooks
      await client.query(
        `
          INSERT INTO public.invoice_events (
            invoice_id,
            event_type,
            payload
          )
          VALUES ($1, 'payment_reconciled', $2)
        `,
        [
          existing.invoice_id,
          jsonValue({
            payment_id: id,
            invoice_id: existing.invoice_id,
            amount: existing.amount,
            payment_method: existing.payment_method,
            reconciled_by: user.id,
            reconciled_at: new Date().toISOString(),
          }, {}),
        ]
      );

      await client.query("COMMIT");

      // Get updated payment with allocations
      const finalResult = await pool.query(
        `
          SELECT
            p.*,

            (
              SELECT COALESCE(
                json_agg(
                  json_build_object(
                    'id', pa.id,
                    'invoice_item_id', pa.invoice_item_id,
                    'amount', pa.amount,
                    'notes', pa.notes,
                    'created_at', pa.created_at
                  )
                ),
                '[]'::json
              )
              FROM public.payment_allocations pa
              WHERE pa.payment_id = p.id
            ) AS allocations

          FROM public.payments p
          WHERE p.id = $1
        `,
        [id]
      );

      return NextResponse.json({
        success: true,
        message: "Payment reconciled successfully",
        payment: finalResult.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/payments/[id]/reconcile:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to reconcile payment",
      },
      { status: 500 }
    );
  }
}