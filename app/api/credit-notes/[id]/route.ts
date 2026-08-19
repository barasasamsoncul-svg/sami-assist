import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : fallback;
}

/*
|--------------------------------------------------------------------------
| GET /api/credit-notes/[id]
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

    const { pool } =
      await getTenantDatabaseForUser(user.id);

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

    const result = await pool.query(
      `
        SELECT
          cn.*,

          json_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'total_amount', i.total_amount,
            'amount_paid', i.amount_paid,
            'amount_due', i.amount_due,
            'status', i.status,
            'currency', i.currency,
            'issue_date', i.issue_date,
            'due_date', i.due_date
          ) AS invoice,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone
          ) AS customer

        FROM public.credit_notes cn

        INNER JOIN public.invoices i
          ON i.id = cn.invoice_id

        INNER JOIN public.customers c
          ON c.id = cn.customer_id

        WHERE cn.id = $1

        LIMIT 1
      `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "Credit note not found",
        },
        {
          status: 404,
        }
      );
    }

    return NextResponse.json({
      success: true,
      creditNote: result.rows[0],
    });
  } catch (error) {
    console.error(
      "GET /api/credit-notes/[id]:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch credit note",
      },
      {
        status: 500,
      }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/credit-notes/[id]
|--------------------------------------------------------------------------
|
| Used for editing an ISSUED credit note.
|
| Once applied, financial fields cannot be changed.
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

  const { pool } =
    await getTenantDatabaseForUser(user.id);

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
    | Lock credit note
    |--------------------------------------------------------------------------
    */

    const creditResult = await client.query(
      `
        SELECT
          cn.*,

          i.total_amount,
          i.status AS invoice_status

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

    const existing = creditResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Only issued credit notes can be edited
    |--------------------------------------------------------------------------
    */

    if (existing.status !== "issued") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Only issued credit notes can be edited",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Don't modify credit notes for cancelled/void invoices
    |--------------------------------------------------------------------------
    */

    if (
      existing.invoice_status === "cancelled" ||
      existing.invoice_status === "void"
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit notes belonging to cancelled or void invoices cannot be modified",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Values
    |--------------------------------------------------------------------------
    */

    const amount =
      body.amount !== undefined
        ? toNumber(body.amount)
        : toNumber(existing.amount);

    if (amount <= 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note amount must be greater than zero",
        },
        {
          status: 400,
        }
      );
    }

    const taxAmount =
      body.tax_amount !== undefined
        ? toNumber(body.tax_amount)
        : toNumber(existing.tax_amount);

    const reason =
      body.reason !== undefined
        ? body.reason
        : existing.reason;

    if (!reason) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "reason is required",
        },
        {
          status: 400,
        }
      );
    }

    const reasonDetails =
      body.reason_details !== undefined
        ? body.reason_details || null
        : existing.reason_details;

    const notes =
      body.notes !== undefined
        ? body.notes || null
        : existing.notes;

    const currency =
      body.currency !== undefined
        ? body.currency
        : existing.currency;

    const issueDate =
      body.issue_date !== undefined
        ? new Date(body.issue_date)
        : new Date(existing.issue_date);

    if (Number.isNaN(issueDate.getTime())) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Invalid issue_date",
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Make sure total credit doesn't exceed invoice
    |--------------------------------------------------------------------------
    */

    const otherCreditsResult =
      await client.query(
        `
          SELECT
            COALESCE(
              SUM(amount),
              0
            ) AS total_credits

          FROM public.credit_notes

          WHERE invoice_id = $1

          AND id <> $2

          AND status IN (
            'issued',
            'applied'
          )
        `,
        [
          existing.invoice_id,
          id,
        ]
      );

    const otherCredits = toNumber(
      otherCreditsResult.rows[0]?.total_credits
    );

    const maximumCredit = Math.max(
      0,
      toNumber(existing.total_amount) -
        otherCredits
    );

    if (amount > maximumCredit) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note amount exceeds the remaining creditable invoice amount",

          invoice_total:
            existing.total_amount,

          existing_other_credits:
            otherCredits,

          maximum_credit:
            maximumCredit,
        },
        {
          status: 400,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Update
    |--------------------------------------------------------------------------
    */

    const updateResult = await client.query(
      `
        UPDATE public.credit_notes

        SET
          issue_date = $1,
          amount = $2,
          tax_amount = $3,
          currency = $4,
          reason = $5,
          reason_details = $6,
          notes = $7,
          updated_at = NOW()

        WHERE id = $8

        RETURNING *
      `,
      [
        issueDate,
        amount,
        taxAmount,
        currency,
        reason,
        reasonDetails,
        notes,
        id,
      ]
    );

    const creditNote = updateResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Activity
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
        user.fullName || user.email,
        {
          credit_note_id: id,
          credit_note_number:
            existing.credit_note_number,
          old_amount: existing.amount,
          new_amount: amount,
          reason,
        },
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      creditNote,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "PATCH /api/credit-notes/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update credit note",
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
| DELETE /api/credit-notes/[id]
|--------------------------------------------------------------------------
|
| We don't physically delete a credit note.
|
| An issued credit note is changed to VOID.
| Applied credit notes cannot be deleted.
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

  const { pool } =
    await getTenantDatabaseForUser(user.id);

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

    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          cn.*,

          i.status AS invoice_status

        FROM public.credit_notes cn

        INNER JOIN public.invoices i
          ON i.id = cn.invoice_id

        WHERE cn.id = $1

        FOR UPDATE
      `,
      [id]
    );

    if ((result.rowCount ?? 0) === 0) {
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

    const creditNote = result.rows[0];

    if (creditNote.status === "void") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note is already void",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Applied credit notes cannot be deleted
    |--------------------------------------------------------------------------
    */

    if (
      creditNote.status === "applied" ||
      creditNote.applied_to_invoice_id
    ) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "An applied credit note cannot be deleted or voided",
        },
        {
          status: 409,
        }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Void it instead of deleting it
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        UPDATE public.credit_notes

        SET
          status = 'void',
          updated_at = NOW()

        WHERE id = $1
      `,
      [id]
    );

    /*
    |--------------------------------------------------------------------------
    | Activity
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
          'voided',
          $4
        )
      `,
      [
        creditNote.invoice_id,
        user.id,
        user.fullName || user.email,
        {
          credit_note_id: id,
          credit_note_number:
            creditNote.credit_note_number,
          amount: creditNote.amount,
        },
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,

      message:
        "Credit note voided successfully",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "DELETE /api/credit-notes/[id]:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to void credit note",
      },
      {
        status: 500,
      }
    );
  } finally {
    client.release();
  }
}