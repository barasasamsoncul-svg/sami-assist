import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number) ? number : fallback;
}

/*
|--------------------------------------------------------------------------
| POST /api/credit-notes/[id]/apply
|--------------------------------------------------------------------------
|
| Apply an issued credit note to an invoice.
|
| Body:
|
| {
|   "invoice_id": "uuid",
|   "amount": 100
| }
|
| If amount is omitted, the full credit note amount is applied.
|--------------------------------------------------------------------------
*/

export async function POST(
  req: NextRequest,
  context: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const user = await getAuthenticatedUser();

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

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        {
          error: "Credit note ID is required",
        },
        {
          status: 400,
        }
      );
    }

    const body = await req.json();

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Lock the credit note
    |--------------------------------------------------------------------------
    */

    const creditResult = await client.query(
      `
        SELECT
          cn.*,

          i.status AS original_invoice_status,
          i.customer_id AS original_invoice_customer_id

        FROM public.credit_notes cn

        INNER JOIN public.invoices i
          ON i.id = cn.invoice_id

        WHERE cn.id = $1

        FOR UPDATE
      `,
      [id]
    );

    if ((creditResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Credit note not found",
        },
        {
          status: 404,
        }
      );
    }

    const creditNote = creditResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Credit note must still be issued
    |--------------------------------------------------------------------------
    */

    if (creditNote.status !== "issued") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            creditNote.status === "applied"
              ? "Credit note has already been applied"
              : "Credit note cannot be applied because it is void",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Determine target invoice
    |--------------------------------------------------------------------------
    */

    const targetInvoiceId =
      body.invoice_id || creditNote.invoice_id;

    /*
    |--------------------------------------------------------------------------
    | Lock target invoice
    |--------------------------------------------------------------------------
    */

    const invoiceResult = await client.query(
      `
        SELECT
          id,
          invoice_number,
          customer_id,
          total_amount,
          amount_paid,
          amount_due,
          currency,
          status

        FROM public.invoices

        WHERE id = $1

        FOR UPDATE
      `,
      [targetInvoiceId]
    );

    if ((invoiceResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Target invoice not found",
        },
        {
          status: 404,
        }
      );
    }

    const invoice = invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Credit note and invoice must belong to same customer
    |--------------------------------------------------------------------------
    */

    if (
      invoice.customer_id !==
      creditNote.customer_id
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note and invoice belong to different customers",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Invoice must be usable
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
            "A credit note cannot be applied to a cancelled or void invoice",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Determine application amount
    |--------------------------------------------------------------------------
    */

    const creditAmount = toNumber(
      creditNote.amount
    );

    const requestedAmount =
      body.amount !== undefined
        ? toNumber(body.amount)
        : creditAmount;

    if (requestedAmount <= 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Application amount must be greater than zero",
        },
        {
          status: 400,
        }
      );
    }

    if (requestedAmount > creditAmount) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Application amount cannot exceed the credit note amount",

          credit_note_amount:
            creditAmount,

          requested_amount:
            requestedAmount,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Don't allow credit to exceed invoice balance
    |--------------------------------------------------------------------------
    */

    const invoiceDue = Math.max(
      0,
      toNumber(invoice.amount_due)
    );

    if (invoiceDue <= 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "This invoice has no outstanding balance",
        },
        {
          status: 400,
        }
      );
    }

    if (requestedAmount > invoiceDue) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit amount exceeds the invoice outstanding balance",

          invoice_amount_due:
            invoiceDue,

          requested_amount:
            requestedAmount,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Currency validation
    |--------------------------------------------------------------------------
    */

    if (
      creditNote.currency &&
      invoice.currency &&
      creditNote.currency !== invoice.currency
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note currency does not match invoice currency",

          credit_note_currency:
            creditNote.currency,

          invoice_currency:
            invoice.currency,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Apply credit
    |--------------------------------------------------------------------------
    */

    const newAmountPaid =
      toNumber(invoice.amount_paid);

    const newAmountDue = Math.max(
      0,
      invoiceDue - requestedAmount
    );

    /*
    | A credit note can make the invoice fully settled,
    | but it does not represent a cash payment.
    |
    | Therefore amount_paid remains unchanged.
    | amount_due is reduced by the credit.
    */

    const newStatus =
      newAmountDue <= 0
        ? "paid"
        : newAmountPaid > 0
          ? "partially_paid"
          : invoice.status;

    /*
    |--------------------------------------------------------------------------
    | Update credit note
    |--------------------------------------------------------------------------
    */

    const updateCreditResult =
      await client.query(
        `
          UPDATE public.credit_notes

          SET
            status = 'applied',

            applied_to_invoice_id = $1,
            applied_amount = $2,
            applied_at = NOW(),

            updated_at = NOW()

          WHERE id = $3

          RETURNING *
        `,
        [
          targetInvoiceId,
          requestedAmount,
          id,
        ]
      );

    const updatedCreditNote =
      updateCreditResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Update invoice balance
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE public.invoices

        SET
          amount_due = $1,
          status = $2,

          payment_date =
            CASE
              WHEN $1 <= 0
              THEN CURRENT_DATE
              ELSE payment_date
            END,

          updated_at = NOW()

        WHERE id = $3
      `,
      [
        newAmountDue,
        newStatus,
        targetInvoiceId,
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
        targetInvoiceId,

        user.id,

        user.fullName ||
          user.email,

        {
          action:
            "credit_note_applied",

          credit_note_id:
            id,

          credit_note_number:
            creditNote.credit_note_number,

          amount:
            requestedAmount,

          invoice_id:
            targetInvoiceId,

          invoice_number:
            invoice.invoice_number,

          previous_amount_due:
            invoiceDue,

          new_amount_due:
            newAmountDue,

          new_invoice_status:
            newStatus,
        },
      ]
    );

    await client.query("COMMIT");

    /*
    |--------------------------------------------------------------------------
    | Return updated records
    |--------------------------------------------------------------------------
    */

    return NextResponse.json({
      success: true,

      creditNote:
        updatedCreditNote,

      invoice: {
        id: invoice.id,

        invoice_number:
          invoice.invoice_number,

        total_amount:
          invoice.total_amount,

        amount_paid:
          newAmountPaid,

        amount_due:
          newAmountDue,

        status:
          newStatus,

        currency:
          invoice.currency,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "POST /api/credit-notes/[id]/apply:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to apply credit note",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}