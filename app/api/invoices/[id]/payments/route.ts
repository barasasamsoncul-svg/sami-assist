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
| GET /api/invoices/[id]/payments
|--------------------------------------------------------------------------
|
| Returns all payments belonging to one invoice.
| Includes payment allocations and detailed summary.
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
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    /*
     * Verify that the invoice exists and is not deleted.
     */
    const invoiceCheck = await pool.query(
      `
      SELECT
        id,
        invoice_number,
        total_amount,
        amount_paid,
        amount_due,
        currency,
        status,
        customer_id
      FROM public.invoices
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1
      `,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    /*
     * Get payments for this invoice with additional details.
     */
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

        (
          SELECT json_agg(
            json_build_object(
              'id', pa.id,
              'invoice_item_id', pa.invoice_item_id,
              'amount', pa.amount,
              'notes', pa.notes,
              'created_at', pa.created_at,
              'item_description', ii.description
            )
          )
          FROM public.payment_allocations pa
          LEFT JOIN public.invoice_items ii
            ON ii.id = pa.invoice_item_id
          WHERE pa.payment_id = p.id
        ) AS allocations

      FROM public.payments p
      WHERE p.invoice_id = $1
      ORDER BY p.payment_date DESC, p.created_at DESC
      `,
      [id]
    );

    /*
     * Calculate totals from completed payments.
     */
    const completedResult = await pool.query(
      `
      SELECT
        COALESCE(SUM(amount), 0) AS total_paid,
        COUNT(*) AS payment_count,
        COUNT(DISTINCT payment_method) AS method_count,
        MAX(payment_date) AS last_payment_date,
        MIN(payment_date) AS first_payment_date
      FROM public.payments
      WHERE invoice_id = $1
        AND status = 'completed'
      `,
      [id]
    );

    /*
     * Get payment method breakdown.
     */
    const methodBreakdown = await pool.query(
      `
      SELECT
        payment_method,
        COUNT(*) AS count,
        COALESCE(SUM(amount), 0) AS total_amount
      FROM public.payments
      WHERE invoice_id = $1
        AND status = 'completed'
      GROUP BY payment_method
      ORDER BY total_amount DESC
      `,
      [id]
    );

    /*
     * Get pending payments count.
     */
    const pendingResult = await pool.query(
      `
      SELECT COUNT(*) AS pending_count
      FROM public.payments
      WHERE invoice_id = $1
        AND status = 'pending'
      `,
      [id]
    );

    /*
     * Get refunded payments count.
     */
    const refundedResult = await pool.query(
      `
      SELECT
        COUNT(*) AS refunded_count,
        COALESCE(SUM(amount), 0) AS refunded_amount
      FROM public.payments
      WHERE invoice_id = $1
        AND status = 'refunded'
      `,
      [id]
    );

    const invoice = invoiceCheck.rows[0];
    const paymentSummary = completedResult.rows[0];
    const pending = pendingResult.rows[0];
    const refunded = refundedResult.rows[0];

    return NextResponse.json({
      success: true,

      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        total_amount: toDecimal(invoice.total_amount),
        amount_paid: toDecimal(invoice.amount_paid),
        amount_due: toDecimal(invoice.amount_due),
        currency: invoice.currency,
        status: invoice.status,
        customer_id: invoice.customer_id,
      },

      payments: result.rows.map((row) => ({
        ...row,
        amount: toDecimal(row.amount),
        exchange_rate: toDecimal(row.exchange_rate),
        allocations: row.allocations || [],
      })),

      summary: {
        total_paid: toDecimal(paymentSummary.total_paid || 0),
        payment_count: Number(paymentSummary.payment_count || 0),
        method_count: Number(paymentSummary.method_count || 0),
        first_payment_date: paymentSummary.first_payment_date,
        last_payment_date: paymentSummary.last_payment_date,
        pending_count: Number(pending.pending_count || 0),
        refunded_count: Number(refunded.refunded_count || 0),
        refunded_amount: toDecimal(refunded.refunded_amount || 0),
      },

      payment_method_breakdown: methodBreakdown.rows.map((row) => ({
        method: row.payment_method,
        count: Number(row.count),
        total_amount: toDecimal(row.total_amount),
      })),
    });
  } catch (error) {
    console.error("Invoice payments fetch error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch payments",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/payments
|--------------------------------------------------------------------------
|
| Creates a new payment for an invoice.
|
| Request body:
| {
|   amount: number,
|   payment_method: string,
|   payment_date?: string,
|   transaction_reference?: string,
|   payment_method_details?: object,
|   notes?: string,
|   metadata?: object,
|   allocations?: [{ invoice_item_id: string, amount: number }]
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
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    /*
     |--------------------------------------------------------------------------
     | Validate required fields
     |--------------------------------------------------------------------------
     */

    if (!body.amount || body.amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    if (!body.payment_method) {
      return NextResponse.json(
        { error: "payment_method is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      /*
       |--------------------------------------------------------------------------
       | Verify invoice exists and is not deleted
       |--------------------------------------------------------------------------
       */

      const invoiceResult = await client.query(
        `
        SELECT
          id,
          invoice_number,
          total_amount,
          amount_paid,
          amount_due,
          currency,
          status,
          customer_id
        FROM public.invoices
        WHERE id = $1
          AND deleted_at IS NULL
        FOR UPDATE
        `,
        [id]
      );

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }

      const invoice = invoiceResult.rows[0];

      /*
       |--------------------------------------------------------------------------
       | Prevent payments on finalized invoices
       |--------------------------------------------------------------------------
       */

      if (invoice.status === "cancelled" || invoice.status === "void") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: `Cannot add payment to a ${invoice.status} invoice` },
          { status: 409 }
        );
      }

      /*
       |--------------------------------------------------------------------------
       | Check if payment would exceed amount due
       |--------------------------------------------------------------------------
       */

      const amount = toDecimal(body.amount);
      const currentAmountDue = toDecimal(invoice.amount_due);

      if (amount > currentAmountDue && currentAmountDue > 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Payment amount (${amount}) exceeds amount due (${currentAmountDue})`,
          },
          { status: 400 }
        );
      }

      /*
       |--------------------------------------------------------------------------
       | Check allocations if provided
       |--------------------------------------------------------------------------
       */

      let allocations: Array<{ invoice_item_id: string; amount: number }> = [];

      if (body.allocations && Array.isArray(body.allocations)) {
        const totalAllocated = body.allocations.reduce(
          (sum: number, a: { amount: number }) => sum + toDecimal(a.amount),
          0
        );

        if (Math.abs(totalAllocated - amount) > 0.001) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              error: `Total allocated amount (${totalAllocated}) does not match payment amount (${amount})`,
            },
            { status: 400 }
          );
        }

        allocations = body.allocations.map((a: { invoice_item_id: string; amount: number }) => ({
          invoice_item_id: a.invoice_item_id,
          amount: toDecimal(a.amount),
        }));

        // Verify all invoice items exist and belong to this invoice
        for (const alloc of allocations) {
          const itemResult = await client.query(
            `
            SELECT id
            FROM public.invoice_items
            WHERE id = $1
              AND invoice_id = $2
            `,
            [alloc.invoice_item_id, id]
          );

          if (itemResult.rows.length === 0) {
            await client.query("ROLLBACK");

            return NextResponse.json(
              {
                error: `Invoice item ${alloc.invoice_item_id} not found or does not belong to this invoice`,
              },
              { status: 400 }
            );
          }
        }
      }

      /*
       |--------------------------------------------------------------------------
       | Get currency from invoice
       |--------------------------------------------------------------------------
       */

      const currency = body.currency || invoice.currency || "KES";
      const exchangeRate = toDecimal(body.exchange_rate, 1);

      /*
       |--------------------------------------------------------------------------
       | Determine payment status
       |--------------------------------------------------------------------------
       */

      let paymentStatus = body.status || "pending";

      // Auto-complete if reconciled or if payment is confirmed
      if (body.reconciled === true || body.auto_complete === true) {
        paymentStatus = "completed";
      }

      /*
       |--------------------------------------------------------------------------
       | Insert payment
       |--------------------------------------------------------------------------
       */

      const paymentResult = await client.query(
        `
        INSERT INTO public.payments (
          invoice_id,
          amount,
          currency,
          exchange_rate,
          payment_method,
          payment_method_details,
          transaction_reference,
          payment_date,
          status,
          reconciled,
          reconciled_at,
          reconciled_by,
          notes,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
        )
        RETURNING *
        `,
        [
          id,
          amount,
          currency,
          exchangeRate,
          body.payment_method,
          jsonValue(body.payment_method_details, {}),
          nullableString(body.transaction_reference),
          body.payment_date || new Date().toISOString(),
          paymentStatus,
          body.reconciled === true,
          body.reconciled === true ? new Date().toISOString() : null,
          body.reconciled === true ? user.id : null,
          nullableString(body.notes),
          jsonValue(body.metadata, {}),
        ]
      );

      const payment = paymentResult.rows[0];

      /*
       |--------------------------------------------------------------------------
       | Insert payment allocations
       |--------------------------------------------------------------------------
       */

      if (allocations.length > 0) {
        for (const alloc of allocations) {
          await client.query(
            `
            INSERT INTO public.payment_allocations (
              payment_id,
              invoice_item_id,
              amount,
              notes
            )
            VALUES ($1, $2, $3, $4)
            `,
            [
              payment.id,
              alloc.invoice_item_id,
              alloc.amount,
              body.allocation_notes || null,
            ]
          );
        }
      }

      /*
       |--------------------------------------------------------------------------
       | Update invoice payment state using the function
       |--------------------------------------------------------------------------
       */

      await client.query(
        `
        SELECT public.recalculate_invoice_payment_state($1)
        `,
        [id]
      );

      /*
       |--------------------------------------------------------------------------
       | Activity log
       |--------------------------------------------------------------------------
       */

      await client.query(
        `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES ($1, $2, $3, 'payment_added', $4)
        `,
        [
          id,
          user.id,
          user.fullName || user.email,
          {
            payment_id: payment.id,
            amount: amount,
            payment_method: body.payment_method,
            status: paymentStatus,
            transaction_reference: body.transaction_reference || null,
          },
        ]
      );

      /*
       |--------------------------------------------------------------------------
       | Create event for webhooks if payment is completed
       |--------------------------------------------------------------------------
       */

      if (paymentStatus === "completed") {
        await client.query(
          `
          INSERT INTO public.invoice_events (
            invoice_id,
            event_type,
            payload
          )
          VALUES ($1, 'payment_received', $2)
          `,
          [
            id,
            {
              payment_id: payment.id,
              invoice_id: id,
              invoice_number: invoice.invoice_number,
              amount: amount,
              payment_method: body.payment_method,
              transaction_reference: body.transaction_reference || null,
              new_amount_paid: toDecimal(invoice.amount_paid) + amount,
              new_amount_due: toDecimal(invoice.amount_due) - amount,
              payment_date: payment.payment_date,
              received_by: user.id,
            },
          ]
        );
      }

      await client.query("COMMIT");

      /*
       |--------------------------------------------------------------------------
       | Return the created payment with allocations
       |--------------------------------------------------------------------------
       */

      const result = await pool.query(
        `
        SELECT
          p.*,

          (
            SELECT json_agg(
              json_build_object(
                'id', pa.id,
                'invoice_item_id', pa.invoice_item_id,
                'amount', pa.amount,
                'notes', pa.notes,
                'created_at', pa.created_at
              )
            )
            FROM public.payment_allocations pa
            WHERE pa.payment_id = p.id
          ) AS allocations

        FROM public.payments p
        WHERE p.id = $1
        `,
        [payment.id]
      );

      return NextResponse.json(
        {
          success: true,
          payment: result.rows[0],
          message: "Payment created successfully",
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
    console.error("Invoice payment creation error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create payment",
      },
      { status: 500 }
    );
  }
}