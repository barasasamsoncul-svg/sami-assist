import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
|--------------------------------------------------------------------------
| GET /api/credit-notes
|--------------------------------------------------------------------------
|
| Supports:
| ?invoice_id=
| ?customer_id=
| ?status=
| ?search=
| ?page=
| ?limit=
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
    const search = searchParams.get("search");

    const page = Math.max(
      1,
      toNumber(searchParams.get("page"), 1)
    );

    const limit = Math.min(
      100,
      Math.max(
        1,
        toNumber(searchParams.get("limit"), 20)
      )
    );

    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameter = 1;

    if (invoiceId) {
      conditions.push(
        `cn.invoice_id = $${parameter++}`
      );
      values.push(invoiceId);
    }

    if (customerId) {
      conditions.push(
        `cn.customer_id = $${parameter++}`
      );
      values.push(customerId);
    }

    if (status) {
      conditions.push(
        `cn.status = $${parameter++}`
      );
      values.push(status);
    }

    if (search) {
      conditions.push(`
        (
          cn.credit_note_number ILIKE $${parameter}
          OR cn.reason ILIKE $${parameter}
          OR c.company_name ILIKE $${parameter}
          OR i.invoice_number ILIKE $${parameter}
        )
      `);

      values.push(`%${search}%`);
      parameter++;
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : "";

    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count

        FROM public.credit_notes cn

        INNER JOIN public.invoices i
          ON i.id = cn.invoice_id

        INNER JOIN public.customers c
          ON c.id = cn.customer_id

        ${where}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

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
            'currency', i.currency
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

        ${where}

        ORDER BY
          cn.issue_date DESC,
          cn.created_at DESC

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
      creditNotes: result.rows,

      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error(
      "GET /api/credit-notes:",
      error
    );

    return NextResponse.json(
      {
        error: "Failed to fetch credit notes",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/credit-notes
|--------------------------------------------------------------------------
|
| Creates a credit note.
|
| The credit note is initially "issued".
| It does NOT automatically reduce the invoice balance until
| it is explicitly applied.
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

  const { pool } = await getTenantDatabaseForUser(user.id);

  const client = await pool.connect();

  try {
    const body = await req.json();

    if (!body.invoice_id) {
      return NextResponse.json(
        {
          error: "invoice_id is required",
        },
        { status: 400 }
      );
    }

    const amount = toNumber(body.amount);

    if (amount <= 0) {
      return NextResponse.json(
        {
          error:
            "Credit note amount must be greater than zero",
        },
        { status: 400 }
      );
    }

    if (!body.reason) {
      return NextResponse.json(
        {
          error: "reason is required",
        },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    /*
    |--------------------------------------------------------------------------
    | Get invoice
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
      [body.invoice_id]
    );

    if ((invoiceResult.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Invoice not found",
        },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    /*
    |--------------------------------------------------------------------------
    | Validate invoice
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
            "Credit notes cannot be created for cancelled or void invoices",
        },
        { status: 409 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Check credit-note setting
    |--------------------------------------------------------------------------
    */

    const settingsResult = await client.query(
      `
        SELECT
          allow_credit_notes

        FROM public.invoice_settings

        ORDER BY created_at ASC

        LIMIT 1
      `
    );

    const allowCreditNotes =
      settingsResult.rows[0]
        ?.allow_credit_notes ?? true;

    if (!allowCreditNotes) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit notes are disabled in invoice settings",
        },
        { status: 403 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Check existing credit notes
    |--------------------------------------------------------------------------
    */

    const creditResult = await client.query(
      `
        SELECT
          COALESCE(
            SUM(amount),
            0
          ) AS total_credits

        FROM public.credit_notes

        WHERE invoice_id = $1

        AND status IN (
          'issued',
          'applied'
        )
      `,
      [body.invoice_id]
    );

    const existingCredits = toNumber(
      creditResult.rows[0]?.total_credits
    );

    const maximumCredit = Math.max(
      0,
      toNumber(invoice.total_amount) -
        existingCredits
    );

    if (amount > maximumCredit) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error:
            "Credit note exceeds the remaining creditable invoice amount",

          invoice_total:
            invoice.total_amount,

          existing_credit_notes:
            existingCredits,

          maximum_credit:
            maximumCredit,
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Generate credit-note number
    |--------------------------------------------------------------------------
    */

    const settingsNumberResult =
      await client.query(
        `
          SELECT
            credit_note_prefix,
            credit_note_next_number

          FROM public.invoice_settings

          ORDER BY created_at ASC

          LIMIT 1

          FOR UPDATE
        `
      );

    let creditNoteNumber: string;

    if (
      settingsNumberResult.rowCount &&
      settingsNumberResult.rowCount > 0
    ) {
      const settings =
        settingsNumberResult.rows[0];

      const prefix =
        settings.credit_note_prefix ||
        "CN-";

      const nextNumber = toNumber(
        settings.credit_note_next_number,
        1
      );

      creditNoteNumber =
        `${prefix}${String(nextNumber).padStart(6, "0")}`;

      await client.query(
        `
          UPDATE public.invoice_settings

          SET
            credit_note_next_number =
              $1,
            updated_at = NOW()

          WHERE
            credit_note_prefix = $2
        `,
        [
          nextNumber + 1,
          prefix,
        ]
      );
    } else {
      creditNoteNumber =
        `CN-${Date.now()}`;
    }

    /*
    |--------------------------------------------------------------------------
    | Create credit note
    |--------------------------------------------------------------------------
    */

    const result = await client.query(
      `
        INSERT INTO public.credit_notes (
          invoice_id,
          customer_id,

          credit_note_number,

          issue_date,

          amount,
          tax_amount,
          currency,

          status,

          reason,
          reason_details,

          created_by,

          notes
        )

        VALUES (
          $1,
          $2,

          $3,

          $4,

          $5,
          $6,
          $7,

          'issued',

          $8,
          $9,

          $10,

          $11
        )

        RETURNING *
      `,
      [
        invoice.id,
        invoice.customer_id,

        creditNoteNumber,

        body.issue_date
          ? new Date(body.issue_date)
          : new Date(),

        amount,

        toNumber(
          body.tax_amount,
          0
        ),

        body.currency ||
          invoice.currency ||
          "USD",

        body.reason,

        body.reason_details ||
          null,

        user.id,

        body.notes || null,
      ]
    );

    const creditNote = result.rows[0];

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
        invoice.id,

        user.id,

        user.fullName ||
          user.email,

        {
          credit_note_id:
            creditNote.id,

          credit_note_number:
            creditNote.credit_note_number,

          amount,

          reason:
            body.reason,

          status: "issued",
        },
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        success: true,
        creditNote,
      },
      { status: 201 }
    );
  } catch (error) {
    await client.query("ROLLBACK");

    console.error(
      "POST /api/credit-notes:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create credit note",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}