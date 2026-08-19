import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Types & Validation
|--------------------------------------------------------------------------
*/

const VALID_PAYMENT_STATUSES = [
  "pending",
  "completed",
  "failed",
  "refunded",
  "disputed",
] as const;

const VALID_PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "credit_card",
  "debit_card",
  "mobile_money",
  "cheque",
  "paypal",
  "stripe",
  "mpesa",
  "other",
] as const;

function isPaymentStatus(value: unknown): value is (typeof VALID_PAYMENT_STATUSES)[number] {
  return typeof value === "string" && VALID_PAYMENT_STATUSES.includes(value as any);
}

function isPaymentMethod(value: unknown): value is (typeof VALID_PAYMENT_METHODS)[number] {
  return typeof value === "string" && VALID_PAYMENT_METHODS.includes(value as any);
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
| GET /api/invoices/payments
|--------------------------------------------------------------------------
|
| Returns all payments with filtering options.
|
| Supports:
| ?invoice_id=UUID
| ?customer_id=UUID
| ?status=completed|pending|failed|refunded|disputed
| ?payment_method=cash|bank_transfer|credit_card|...
| ?from_date=2026-01-01
| ?to_date=2026-12-31
| ?reconciled=true|false
| ?min_amount=100
| ?max_amount=1000
| ?search=reference
| ?page=1
| ?limit=50
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

    const invoiceId = searchParams.get("invoice_id");
    const customerId = searchParams.get("customer_id");
    const status = searchParams.get("status");
    const paymentMethod = searchParams.get("payment_method");
    const fromDate = searchParams.get("from_date");
    const toDate = searchParams.get("to_date");
    const reconciled = searchParams.get("reconciled");
    const minAmount = searchParams.get("min_amount");
    const maxAmount = searchParams.get("max_amount");
    const search = searchParams.get("search");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 50)));
    const offset = (page - 1) * limit;

    // Validate status
    if (status && !isPaymentStatus(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate payment method
    if (paymentMethod && !isPaymentMethod(paymentMethod)) {
      return NextResponse.json(
        {
          error: `Invalid payment_method. Must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    // Only show payments for non-deleted invoices
    conditions.push(`i.deleted_at IS NULL`);

    if (invoiceId) {
      conditions.push(`p.invoice_id = $${parameterIndex}`);
      values.push(invoiceId);
      parameterIndex++;
    }

    if (customerId) {
      conditions.push(`i.customer_id = $${parameterIndex}`);
      values.push(customerId);
      parameterIndex++;
    }

    if (status) {
      conditions.push(`p.status = $${parameterIndex}`);
      values.push(status);
      parameterIndex++;
    }

    if (paymentMethod) {
      conditions.push(`p.payment_method = $${parameterIndex}`);
      values.push(paymentMethod);
      parameterIndex++;
    }

    if (fromDate) {
      conditions.push(`p.payment_date >= $${parameterIndex}`);
      values.push(fromDate);
      parameterIndex++;
    }

    if (toDate) {
      conditions.push(`p.payment_date <= $${parameterIndex}::date + INTERVAL '1 day'`);
      values.push(toDate);
      parameterIndex++;
    }

    if (reconciled === "true") {
      conditions.push(`p.reconciled = true`);
    } else if (reconciled === "false") {
      conditions.push(`p.reconciled = false`);
    }

    if (minAmount) {
      conditions.push(`p.amount >= $${parameterIndex}`);
      values.push(toDecimal(minAmount));
      parameterIndex++;
    }

    if (maxAmount) {
      conditions.push(`p.amount <= $${parameterIndex}`);
      values.push(toDecimal(maxAmount));
      parameterIndex++;
    }

    if (search) {
      conditions.push(`
        (
          p.transaction_reference ILIKE $${parameterIndex}
          OR i.invoice_number ILIKE $${parameterIndex}
          OR c.company_name ILIKE $${parameterIndex}
          OR p.payment_method ILIKE $${parameterIndex}
        )
      `);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.payments p
        INNER JOIN public.invoices i ON i.id = p.invoice_id
        INNER JOIN public.customers c ON c.id = i.customer_id
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get payments with full details
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

        ${whereClause}

        ORDER BY
          p.payment_date DESC,
          p.created_at DESC

        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    // Get summary statistics
    const summaryResult = await pool.query(
      `
        SELECT
          COUNT(*)::integer AS total_count,
          COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS total_completed_amount,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) AS total_pending_amount,
          COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) AS total_refunded_amount,
          COALESCE(SUM(CASE WHEN status = 'failed' THEN amount ELSE 0 END), 0) AS total_failed_amount,
          COALESCE(AVG(CASE WHEN status = 'completed' THEN amount ELSE NULL END), 0) AS average_payment_amount,
          COUNT(DISTINCT payment_method) AS method_count
        FROM public.payments p
        INNER JOIN public.invoices i ON i.id = p.invoice_id
        ${whereClause}
      `,
      values
    );

    // Get payment method breakdown
    const methodBreakdown = await pool.query(
      `
        SELECT
          payment_method,
          COUNT(*)::integer AS count,
          COALESCE(SUM(amount), 0) AS total_amount
        FROM public.payments p
        INNER JOIN public.invoices i ON i.id = p.invoice_id
        ${whereClause}
        GROUP BY payment_method
        ORDER BY total_amount DESC
      `,
      values
    );

    return NextResponse.json({
      success: true,
      payments: result.rows,
      summary: {
        total_count: Number(summaryResult.rows[0]?.total_count || 0),
        total_completed_amount: toDecimal(summaryResult.rows[0]?.total_completed_amount || 0),
        total_pending_amount: toDecimal(summaryResult.rows[0]?.total_pending_amount || 0),
        total_refunded_amount: toDecimal(summaryResult.rows[0]?.total_refunded_amount || 0),
        total_failed_amount: toDecimal(summaryResult.rows[0]?.total_failed_amount || 0),
        average_payment_amount: toDecimal(summaryResult.rows[0]?.average_payment_amount || 0),
        method_count: Number(summaryResult.rows[0]?.method_count || 0),
      },
      payment_method_breakdown: methodBreakdown.rows.map((row) => ({
        method: row.payment_method,
        count: Number(row.count),
        total_amount: toDecimal(row.total_amount),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/payments error:", error);

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
| POST /api/invoices/payments
|--------------------------------------------------------------------------
|
| Creates a new payment.
|
| Request body:
| {
|   invoice_id: string,
|   amount: number,
|   currency?: string,
|   exchange_rate?: number,
|   payment_method: string,
|   payment_method_details?: object,
|   transaction_reference?: string,
|   payment_date?: string,
|   status?: 'pending'|'completed'|'failed'|'refunded'|'disputed',
|   reconciled?: boolean,
|   notes?: string,
|   metadata?: object,
|   allocations?: [{ invoice_item_id: string, amount: number }]
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
      notes,
      metadata,
      allocations,
    } = body;

    // Validate required fields
    if (!invoice_id) {
      return NextResponse.json(
        { error: "invoice_id is required" },
        { status: 400 }
      );
    }

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Amount must be greater than 0" },
        { status: 400 }
      );
    }

    if (!payment_method) {
      return NextResponse.json(
        { error: "payment_method is required" },
        { status: 400 }
      );
    }

    if (!isPaymentMethod(payment_method)) {
      return NextResponse.json(
        {
          error: `Invalid payment_method. Must be one of: ${VALID_PAYMENT_METHODS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate status if provided
    if (status && !isPaymentStatus(status)) {
      return NextResponse.json(
        {
          error: `Invalid status. Must be one of: ${VALID_PAYMENT_STATUSES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Verify invoice exists and get details
      const invoiceResult = await client.query(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.total_amount,
            i.amount_paid,
            i.amount_due,
            i.currency,
            i.status,
            i.deleted_at,
            c.id AS customer_id,
            c.currency AS customer_currency
          FROM public.invoices i
          INNER JOIN public.customers c ON c.id = i.customer_id
          WHERE i.id = $1
          FOR UPDATE
        `,
        [invoice_id]
      );

      if (invoiceResult.rows.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice not found" },
          { status: 404 }
        );
      }

      const invoice = invoiceResult.rows[0];

      // Check if invoice is deleted
      if (invoice.deleted_at) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Cannot add payment to a deleted invoice" },
          { status: 409 }
        );
      }

      // Check if invoice is eligible for payment
      if (invoice.status === "cancelled" || invoice.status === "void") {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: `Cannot add payment to a ${invoice.status} invoice` },
          { status: 409 }
        );
      }

      const paymentAmount = toDecimal(amount);
      const currentAmountDue = toDecimal(invoice.amount_due);

      // Check if payment amount exceeds amount due
      if (paymentAmount > currentAmountDue && currentAmountDue > 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Payment amount (${paymentAmount}) exceeds amount due (${currentAmountDue})`,
          },
          { status: 400 }
        );
      }

      // Validate allocations if provided
      let paymentAllocations: Array<{ invoice_item_id: string; amount: number }> = [];

      if (allocations && Array.isArray(allocations)) {
        const totalAllocated = allocations.reduce(
          (sum: number, a: { amount: number }) => sum + toDecimal(a.amount),
          0
        );

        if (Math.abs(totalAllocated - paymentAmount) > 0.001) {
          await client.query("ROLLBACK");

          return NextResponse.json(
            {
              error: `Total allocated amount (${totalAllocated}) does not match payment amount (${paymentAmount})`,
            },
            { status: 400 }
          );
        }

        // Verify all invoice items exist and belong to this invoice
        for (const alloc of allocations) {
          const itemResult = await client.query(
            `
              SELECT id
              FROM public.invoice_items
              WHERE id = $1
                AND invoice_id = $2
            `,
            [alloc.invoice_item_id, invoice_id]
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

          paymentAllocations.push({
            invoice_item_id: alloc.invoice_item_id,
            amount: toDecimal(alloc.amount),
          });
        }
      }

      const paymentCurrency = currency || invoice.currency || "KES";
      const exchangeRate = toDecimal(exchange_rate, 1);
      const paymentStatus = status || (reconciled === true ? "completed" : "pending");

      // Insert payment
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
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          RETURNING *
        `,
        [
          invoice_id,
          paymentAmount,
          paymentCurrency,
          exchangeRate,
          payment_method,
          jsonValue(payment_method_details, {}),
          nullableString(transaction_reference),
          payment_date || new Date().toISOString(),
          paymentStatus,
          reconciled === true,
          reconciled === true ? new Date().toISOString() : null,
          reconciled === true ? user.id : null,
          nullableString(notes),
          jsonValue(metadata, {}),
        ]
      );

      const payment = paymentResult.rows[0];

      // Insert payment allocations
      if (paymentAllocations.length > 0) {
        for (const alloc of paymentAllocations) {
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
              null,
            ]
          );
        }
      }

      // Recalculate invoice payment state
      await client.query(
        `
          SELECT public.recalculate_invoice_payment_state($1)
        `,
        [invoice_id]
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
          invoice_id,
          user.id,
          user.fullName || user.email,
          "payment_added",
          jsonValue({
            payment_id: payment.id,
            amount: paymentAmount,
            payment_method: payment_method,
            status: paymentStatus,
            transaction_reference: transaction_reference || null,
          }, {}),
        ]
      );

      // Create event for webhooks if payment is completed
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
            invoice_id,
            jsonValue({
              payment_id: payment.id,
              invoice_id: invoice_id,
              invoice_number: invoice.invoice_number,
              amount: paymentAmount,
              payment_method: payment_method,
              transaction_reference: transaction_reference || null,
              received_by: user.id,
              received_at: new Date().toISOString(),
            }, {}),
          ]
        );
      }

      await client.query("COMMIT");

      // Return created payment with allocations
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
        [payment.id]
      );

      return NextResponse.json(
        {
          success: true,
          payment: finalResult.rows[0],
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
    console.error("POST /api/invoices/payments error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create payment",
      },
      { status: 500 }
    );
  }
}