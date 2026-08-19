import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(
  value: unknown,
  fallback = 0
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

function getInvoiceStatus(
  totalAmount: number,
  amountPaid: number,
  currentStatus: string
): string {
  if (
    currentStatus === "cancelled" ||
    currentStatus === "void"
  ) {
    return currentStatus;
  }

  if (amountPaid >= totalAmount) {
    return "paid";
  }

  if (amountPaid > 0) {
    return "partially_paid";
  }

  /*
   * If there is no payment left, preserve the
   * normal invoice lifecycle instead of forcing
   * an invoice back to draft.
   */
  if (
    currentStatus === "paid" ||
    currentStatus === "partially_paid"
  ) {
    return "sent";
  }

  return currentStatus;
}

/*
|--------------------------------------------------------------------------
| GET /api/payments/[id]
|--------------------------------------------------------------------------
*/

export async function GET(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  try {
    const user =
      await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        {
          error: "Unauthorized",
        },
        {
          status: 401,
        }
      );
    }

    const { pool } =
      await getTenantDatabaseForUser(
        user.id
      );

    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Payment ID is required",
        },
        {
          status: 400,
        }
      );
    }

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
                i.currency,
              'issue_date',
                i.issue_date,
              'due_date',
                i.due_date
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

          WHERE p.id = $1

          LIMIT 1
        `,
        [id]
      );

    if (
      (result.rowCount ?? 0) === 0
    ) {
      return NextResponse.json(
        {
          error:
            "Payment not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      payment: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET /api/payments/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch payment",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/payments/[id]
|--------------------------------------------------------------------------
|
| Updates:
|
| amount
| currency
| exchange_rate
| payment_method
| payment_method_details
| transaction_reference
| payment_date
| status
| reconciled
| notes
| metadata
|
|--------------------------------------------------------------------------
*/

export async function PATCH(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const { pool } =
    await getTenantDatabaseForUser(
      user.id
    );

  const client =
    await pool.connect();

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Payment ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body =
      await req.json();

    await client.query(
      "BEGIN"
    );

    /*
    |--------------------------------------------------------------------------
    | Lock payment and invoice
    |--------------------------------------------------------------------------
    */

    const paymentResult =
      await client.query(
        `
          SELECT
            p.*,

            i.total_amount,
            i.amount_paid AS invoice_amount_paid,
            i.amount_due AS invoice_amount_due,
            i.status AS invoice_status,
            i.currency AS invoice_currency

          FROM public.payments p

          INNER JOIN public.invoices i
            ON i.id = p.invoice_id

          WHERE p.id = $1

          FOR UPDATE
        `,
        [id]
      );

    if (
      (paymentResult.rowCount ?? 0) === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payment not found",
        },
        {
          status: 404,
        }
      );
    }

    const existing =
      paymentResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Don't modify payments belonging to void/cancelled invoices
    |--------------------------------------------------------------------------
    */

    if (
      existing.invoice_status ===
        "cancelled" ||
      existing.invoice_status ===
        "void"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payments belonging to cancelled or void invoices cannot be modified",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Build updated values
    |--------------------------------------------------------------------------
    */

    const amount =
      body.amount !== undefined
        ? toNumber(
            body.amount
          )
        : toNumber(
            existing.amount
          );

    if (amount <= 0) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payment amount must be greater than zero",
        },
        {
          status: 400,
        }
      );
    }

    const currency =
      body.currency !== undefined
        ? body.currency
        : existing.currency ||
          existing.invoice_currency ||
          "USD";

    const exchangeRate =
      body.exchange_rate !==
      undefined
        ? toNumber(
            body.exchange_rate,
            1
          )
        : toNumber(
            existing.exchange_rate,
            1
          );

    const paymentMethod =
      body.payment_method !==
      undefined
        ? body.payment_method
        : existing.payment_method;

    if (!paymentMethod) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "payment_method is required",
        },
        {
          status: 400,
        }
      );
    }

    const paymentMethodDetails =
      body.payment_method_details !==
      undefined
        ? body.payment_method_details
        : existing.payment_method_details;

    const transactionReference =
      body.transaction_reference !==
      undefined
        ? body.transaction_reference ||
          null
        : existing.transaction_reference;

    const paymentDate =
      body.payment_date !==
      undefined
        ? new Date(
            body.payment_date
          )
        : new Date(
            existing.payment_date
          );

    if (
      Number.isNaN(
        paymentDate.getTime()
      )
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Invalid payment_date",
        },
        {
          status: 400,
        }
      );
    }

    const status =
      body.status !== undefined
        ? body.status
        : existing.status;

    const reconciled =
      body.reconciled !== undefined
        ? body.reconciled === true
        : existing.reconciled;

    const notes =
      body.notes !== undefined
        ? body.notes || null
        : existing.notes;

    const metadata =
      body.metadata !== undefined
        ? body.metadata
        : existing.metadata;

    /*
    |--------------------------------------------------------------------------
    | Calculate what the invoice will look like
    |--------------------------------------------------------------------------
    |
    | Exclude this payment first, then add the
    | new version of this payment.
    |
    */

    const otherPaymentsResult =
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

          AND id <> $2
        `,
        [
          existing.invoice_id,
          id,
        ]
      );

    const otherCompleted =
      toNumber(
        otherPaymentsResult
          .rows[0]
          ?.amount_paid
      );

    const newCompletedAmount =
      status === "completed"
        ? otherCompleted + amount
        : otherCompleted;

    const totalAmount =
      toNumber(
        existing.total_amount
      );

    /*
    |--------------------------------------------------------------------------
    | Prevent overpayment
    |--------------------------------------------------------------------------
    */

    if (
      newCompletedAmount >
      totalAmount
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payment would exceed the invoice balance",

          invoice_total:
            totalAmount,

          other_completed_payments:
            otherCompleted,

          attempted_total_paid:
            newCompletedAmount,

          remaining_before_payment:
            Math.max(
              0,
              totalAmount -
                otherCompleted
            ),
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update payment
    |--------------------------------------------------------------------------
    */

    const updatedPaymentResult =
      await client.query(
        `
          UPDATE public.payments

          SET
            amount = $1,
            currency = $2,
            exchange_rate = $3,

            payment_method = $4,
            payment_method_details = $5,

            transaction_reference = $6,
            payment_date = $7,

            status = $8,

            reconciled = $9,

            reconciled_at =
              CASE
                WHEN $9 = true
                THEN COALESCE(
                  reconciled_at,
                  NOW()
                )
                ELSE NULL
              END,

            reconciled_by =
              CASE
                WHEN $9 = true
                THEN COALESCE(
                  reconciled_by,
                  $10
                )
                ELSE NULL
              END,

            notes = $11,
            metadata = $12,

            updated_at = NOW()

          WHERE id = $13

          RETURNING *
        `,
        [
          amount,
          currency,
          exchangeRate,

          paymentMethod,
          paymentMethodDetails,

          transactionReference,
          paymentDate,

          status,

          reconciled,
          user.id,

          notes,
          metadata,

          id,
        ]
      );

    const payment =
      updatedPaymentResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Recalculate invoice
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
        [existing.invoice_id]
      );

    const amountPaid =
      toNumber(
        balanceResult.rows[0]
          ?.amount_paid
      );

    const amountDue =
      Math.max(
        0,
        totalAmount -
          amountPaid
      );

    const newInvoiceStatus =
      getInvoiceStatus(
        totalAmount,
        amountPaid,
        existing.invoice_status
      );

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
        newInvoiceStatus,
        totalAmount,
        existing.invoice_id,
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
          'updated',
          $4
        )
      `,
      [
        existing.invoice_id,

        user.id,

        user.fullName ||
          user.email,

        {
          payment_id: id,

          old_amount:
            existing.amount,

          new_amount:
            amount,

          old_status:
            existing.status,

          new_status:
            status,

          amount_paid:
            amountPaid,

          amount_due:
            amountDue,

          invoice_status:
            newInvoiceStatus,
        },
      ]
    );

    await client.query(
      "COMMIT"
    );

    /*
    |--------------------------------------------------------------------------
    | Return complete payment
    |--------------------------------------------------------------------------
    */

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

          WHERE p.id = $1

          LIMIT 1
        `,
        [id]
      );

    return NextResponse.json({
      success: true,
      payment:
        result.rows[0],
    });
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    console.error(
      "PATCH /api/payments/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update payment",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/payments/[id]
|--------------------------------------------------------------------------
|
| Deletes a payment and recalculates the invoice.
|--------------------------------------------------------------------------
*/

export async function DELETE(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const user =
    await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Unauthorized",
      },
      {
        status: 401,
      }
    );
  }

  const { pool } =
    await getTenantDatabaseForUser(
      user.id
    );

  const client =
    await pool.connect();

  try {
    const { id } =
      await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Payment ID is required",
        },
        {
          status: 400,
        }
      );
    }

    await client.query(
      "BEGIN"
    );

    /*
    |--------------------------------------------------------------------------
    | Find and lock payment
    |--------------------------------------------------------------------------
    */

    const paymentResult =
      await client.query(
        `
          SELECT
            p.*,

            i.total_amount,
            i.status AS invoice_status

          FROM public.payments p

          INNER JOIN public.invoices i
            ON i.id = p.invoice_id

          WHERE p.id = $1

          FOR UPDATE
        `,
        [id]
      );

    if (
      (paymentResult.rowCount ?? 0) === 0
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payment not found",
        },
        {
          status: 404,
        }
      );
    }

    const payment =
      paymentResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Protect cancelled / void invoices
    |--------------------------------------------------------------------------
    */

    if (
      payment.invoice_status ===
        "cancelled" ||
      payment.invoice_status ===
        "void"
    ) {
      await client.query(
        "ROLLBACK"
      );

      return NextResponse.json(
        {
          error:
            "Payments belonging to cancelled or void invoices cannot be deleted",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Delete payment
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        DELETE FROM public.payments

        WHERE id = $1
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Recalculate invoice
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
        [payment.invoice_id]
      );

    const amountPaid =
      toNumber(
        balanceResult.rows[0]
          ?.amount_paid
      );

    const totalAmount =
      toNumber(
        payment.total_amount
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
        payment.invoice_status
      );

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
        payment.invoice_id,
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
          'updated',
          $4
        )
      `,
      [
        payment.invoice_id,

        user.id,

        user.fullName ||
          user.email,

        {
          payment_id: id,

          deleted_payment_amount:
            payment.amount,

          amount_paid:
            amountPaid,

          amount_due:
            amountDue,

          invoice_status:
            newStatus,

          reason:
            "Payment deleted",
        },
      ]
    );

    await client.query(
      "COMMIT"
    );

    return NextResponse.json({
      success: true,

      message:
        "Payment deleted successfully",

      invoice: {
        id:
          payment.invoice_id,

        amount_paid:
          amountPaid,

        amount_due:
          amountDue,

        status:
          newStatus,
      },
    });
  } catch (error) {
    await client.query(
      "ROLLBACK"
    );

    console.error(
      "DELETE /api/payments/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete payment",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}