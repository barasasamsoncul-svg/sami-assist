import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function getInvoiceStatus(
  totalAmount: number,
  amountPaid: number,
  currentStatus: string
): string {
  if (
    ["cancelled", "void"].includes(currentStatus)
  ) {
    return currentStatus;
  }

  if (amountPaid >= totalAmount) {
    return "paid";
  }

  if (amountPaid > 0) {
    return "partially_paid";
  }

  return currentStatus;
}

/*
|--------------------------------------------------------------------------
| GET /api/payments
|--------------------------------------------------------------------------
|
| Query parameters:
|
| ?invoice_id=...
| ?status=completed
| ?payment_method=bank_transfer
| ?search=...
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

    const { pool } =
      await getTenantDatabaseForUser(user.id);

    const { searchParams } =
      new URL(req.url);

    const invoiceId =
      searchParams.get("invoice_id");

    const status =
      searchParams.get("status");

    const paymentMethod =
      searchParams.get("payment_method");

    const search =
      searchParams.get("search");

    const page = Math.max(
      1,
      toNumber(
        searchParams.get("page"),
        1
      )
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        toNumber(
          searchParams.get("limit"),
          20
        )
      )
    );

    const offset =
      (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameter = 1;

    if (invoiceId) {
      conditions.push(
        `p.invoice_id = $${parameter++}`
      );

      values.push(invoiceId);
    }

    if (status) {
      conditions.push(
        `p.status = $${parameter++}`
      );

      values.push(status);
    }

    if (paymentMethod) {
      conditions.push(
        `p.payment_method = $${parameter++}`
      );

      values.push(paymentMethod);
    }

    if (search) {
      conditions.push(`
        (
          p.transaction_reference ILIKE $${parameter}
          OR i.invoice_number ILIKE $${parameter}
          OR c.company_name ILIKE $${parameter}
        )
      `);

      values.push(`%${search}%`);
      parameter++;
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countResult =
      await pool.query(
        `
          SELECT COUNT(*)::int AS count

          FROM public.payments p

          INNER JOIN public.invoices i
            ON i.id = p.invoice_id

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          ${where}
        `,
        values
      );

    const total =
      countResult.rows[0]?.count ?? 0;

    const result =
      await pool.query(
        `
          SELECT
            p.*,

            json_build_object(
              'id', i.id,
              'invoice_number',
                i.invoice_number,
              'total_amount',
                i.total_amount,
              'amount_paid',
                i.amount_paid,
              'amount_due',
                i.amount_due,
              'status',
                i.status,
              'currency',
                i.currency
            ) AS invoice,

            json_build_object(
              'id', c.id,
              'company_name',
                c.company_name,
              'contact_name',
                c.contact_name,
              'email',
                c.email,
              'phone',
                c.phone
            ) AS customer

          FROM public.payments p

          INNER JOIN public.invoices i
            ON i.id = p.invoice_id

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          ${where}

          ORDER BY
            p.payment_date DESC,
            p.created_at DESC

          LIMIT $${parameter}
          OFFSET $${parameter + 1}
        `,
        [
          ...values,
          limit,
          offset,
        ]
      );

    return NextResponse.json({
      success: true,

      payments:
        result.rows,

      pagination: {
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit
          ),
      },
    });
  } catch (error) {
    console.error(
      "GET /api/payments:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch payments",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/payments
|--------------------------------------------------------------------------
|
| Creates a payment.
|
| The invoice balance is recalculated from ALL completed
| payments rather than trusting the client.
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } =
    await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const body = await req.json();

    if (!body.invoice_id) {
      return NextResponse.json(
        {
          error:
            "invoice_id is required",
        },
        { status: 400 }
      );
    }

    const amount =
      toNumber(body.amount);

    if (amount <= 0) {
      return NextResponse.json(
        {
          error:
            "Payment amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    if (!body.payment_method) {
      return NextResponse.json(
        {
          error:
            "payment_method is required",
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Lock invoice
    |--------------------------------------------------------------------------
    */

    const invoiceResult =
      await client.query(
        `
          SELECT
            id,
            invoice_number,
            total_amount,
            amount_paid,
            amount_due,
            currency,
            status
          FROM public.invoices
          WHERE id = $1
          FOR UPDATE
        `,
        [body.invoice_id]
      );

    if (
      (invoiceResult.rowCount ?? 0) === 0
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Invoice not found",
        },
        { status: 404 }
      );
    }

    const invoice =
      invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Invoice validation
    |--------------------------------------------------------------------------
    */

    if (
      invoice.status === "cancelled" ||
      invoice.status === "void"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Payments cannot be added to a cancelled or void invoice",
        },
        { status: 409 }
      );
    }

    if (
      invoice.status === "paid"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Invoice is already fully paid",
        },
        { status: 409 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Check partial-payment setting
    |--------------------------------------------------------------------------
    */

    const settingsResult =
      await client.query(
        `
          SELECT
            allow_partial_payments
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
        `
      );

    const settings =
      settingsResult.rows[0];

    const allowPartialPayments =
      settings?.allow_partial_payments ??
      true;

    const requestedStatus =
      body.status || "completed";

    /*
    |--------------------------------------------------------------------------
    | Calculate existing completed payments
    |--------------------------------------------------------------------------
    */

    const completedResult =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS amount_paid
          FROM public.payments
          WHERE invoice_id = $1
          AND status = 'completed'
        `,
        [body.invoice_id]
      );

    const existingPaid =
      toNumber(
        completedResult.rows[0]
          ?.amount_paid
      );

    const remaining =
      Math.max(
        0,
        toNumber(
          invoice.total_amount
        ) - existingPaid
      );

    /*
    |--------------------------------------------------------------------------
    | Don't allow overpayment
    |--------------------------------------------------------------------------
    */

    if (
      requestedStatus === "completed" &&
      amount > remaining
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Payment exceeds the remaining invoice balance",

          invoice_total:
            invoice.total_amount,

          already_paid:
            existingPaid,

          remaining_balance:
            remaining,
        },
        { status: 400 }
      );
    }

    if (
      !allowPartialPayments &&
      amount < remaining &&
      requestedStatus === "completed"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Partial payments are disabled for this business",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Payment date
    |--------------------------------------------------------------------------
    */

    const paymentDate =
      body.payment_date
        ? new Date(
            body.payment_date
          )
        : new Date();

    if (
      Number.isNaN(
        paymentDate.getTime()
      )
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Invalid payment_date",
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Create payment
    |--------------------------------------------------------------------------
    */

    const paymentResult =
      await client.query(
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
            $1,

            $2,
            $3,
            $4,

            $5,
            $6,

            $7,
            $8,

            $9,

            $10,
            $11,
            $12,

            $13,
            $14
          )

          RETURNING *
        `,
        [
          body.invoice_id,

          amount,

          body.currency ||
            invoice.currency ||
            "USD",

          toNumber(
            body.exchange_rate,
            1
          ),

          body.payment_method,

          body.payment_method_details ??
            {},

          body.transaction_reference ||
            null,

          paymentDate,

          requestedStatus,

          body.reconciled === true,

          body.reconciled === true
            ? new Date()
            : null,

          body.reconciled === true
            ? user.id
            : null,

          body.notes ||
            null,

          body.metadata ??
            {},
        ]
      );

    const payment =
      paymentResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Recalculate invoice balance
    |--------------------------------------------------------------------------
    */

    const balanceResult =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS amount_paid

          FROM public.payments

          WHERE invoice_id = $1
          AND status = 'completed'
        `,
        [body.invoice_id]
      );

    const amountPaid =
      toNumber(
        balanceResult.rows[0]
          ?.amount_paid
      );

    const totalAmount =
      toNumber(
        invoice.total_amount
      );

    const amountDue =
      Math.max(
        0,
        totalAmount -
          amountPaid
      );

    const newStatus =
      getInvoiceStatus(
        totalAmount,
        amountPaid,
        invoice.status
      );

    /*
    |--------------------------------------------------------------------------
    | Update invoice
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE public.invoices

        SET
          amount_paid = $1,
          amount_due = $2,

          status = $3,

          payment_date =
            CASE
              WHEN $1 >= $4
              THEN CURRENT_DATE
              ELSE NULL
            END,

          updated_at = NOW()

        WHERE id = $5
      `,
      [
        amountPaid,
        amountDue,
        newStatus,
        totalAmount,
        body.invoice_id,
      ]
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
        VALUES (
          $1,
          $2,
          $3,
          'paid',
          $4
        )
      `,
      [
        body.invoice_id,

        user.id,

        user.fullName ||
          user.email,

        {
          payment_id:
            payment.id,

          amount,

          payment_method:
            body.payment_method,

          amount_paid:
            amountPaid,

          amount_due:
            amountDue,

          invoice_status:
            newStatus,
        },
      ]
    );

    await client.query("COMMIT");

    /*
    |--------------------------------------------------------------------------
    | Return updated invoice
    |--------------------------------------------------------------------------
    */

    const invoiceUpdatedResult =
      await pool.query(
        `
          SELECT
            i.*,

            json_build_object(
              'id', c.id,
              'company_name',
                c.company_name,
              'contact_name',
                c.contact_name,
              'email',
                c.email,
              'phone',
                c.phone
            ) AS customer

          FROM public.invoices i

          INNER JOIN public.customers c
            ON c.id = i.customer_id

          WHERE i.id = $1
        `,
        [body.invoice_id]
      );

    return NextResponse.json(
      {
        success: true,

        payment,

        invoice:
          invoiceUpdatedResult
            .rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "POST /api/payments:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create payment",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}