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

function buildCreditNoteNumber(
  prefix: string,
  number: number,
  padding: number,
  format: string,
  date: Date = new Date()
) {
  const padded = String(number).padStart(padding, "0");

  let result = format
    .replaceAll("{prefix}", prefix)
    .replaceAll("{number}", padded)
    .replaceAll("{year}", String(date.getFullYear()))
    .replaceAll("{month}", String(date.getMonth() + 1).padStart(2, "0"))
    .replaceAll("{day}", String(date.getDate()).padStart(2, "0"));

  return result;
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/credit-notes
|--------------------------------------------------------------------------
|
| Returns all credit notes for a specific invoice.
| Supports filtering by status.
|
| ?status=issued|applied|void
| ?page=1
| ?limit=20
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

    // Verify invoice exists
    const invoiceCheck = await pool.query(
      `
        SELECT id, invoice_number, customer_id
        FROM public.invoices
        WHERE id = $1 AND deleted_at IS NULL
      `,
      [id]
    );

    if (invoiceCheck.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceCheck.rows[0];

    const { searchParams } = new URL(req.url);

    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [`cn.invoice_id = $1`];
    const values: unknown[] = [id];
    let parameter = 2;

    if (status) {
      conditions.push(`cn.status = $${parameter++}`);
      values.push(status);
    }

    if (search) {
      conditions.push(`
        (
          cn.credit_note_number ILIKE $${parameter}
          OR cn.reason ILIKE $${parameter}
          OR c.company_name ILIKE $${parameter}
        )
      `);
      values.push(`%${search}%`);
      parameter++;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;

    // Get total count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::int AS count
        FROM public.credit_notes cn
        INNER JOIN public.customers c ON c.id = cn.customer_id
        ${where}
      `,
      values
    );

    const total = countResult.rows[0]?.count ?? 0;

    // Get credit notes
    const result = await pool.query(
      `
        SELECT
          cn.*,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone,
            'billing_address', c.billing_address,
            'tax_id', c.tax_id
          ) AS customer,

          CASE
            WHEN cn.applied_to_invoice_id IS NOT NULL THEN (
              SELECT row_to_json(ai)
              FROM (
                SELECT
                  id,
                  invoice_number,
                  total_amount,
                  amount_paid,
                  amount_due,
                  status,
                  currency
                FROM public.invoices
                WHERE id = cn.applied_to_invoice_id
              ) ai
            )
            ELSE NULL
          END AS applied_to_invoice

        FROM public.credit_notes cn

        INNER JOIN public.customers c
          ON c.id = cn.customer_id

        ${where}

        ORDER BY
          cn.issue_date DESC,
          cn.created_at DESC

        LIMIT $${parameter}
        OFFSET $${parameter + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        customer_id: invoice.customer_id,
      },
      creditNotes: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/credit-notes:", error);

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
| POST /api/invoices/[id]/credit-notes
|--------------------------------------------------------------------------
|
| Creates a credit note for an invoice.
|
| The credit note is initially "issued".
| It does NOT automatically reduce the invoice balance until
| it is explicitly applied.
|
| Request body:
| {
|   amount: number,
|   tax_amount?: number,
|   reason: string,
|   reason_details?: string,
|   notes?: string,
|   issue_date?: string,
|   currency?: string,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
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
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    const amount = toDecimal(body.amount);

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Credit note amount must be greater than zero" },
        { status: 400 }
      );
    }

    if (!body.reason) {
      return NextResponse.json(
        { error: "reason is required" },
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
          status,
          deleted_at
        FROM public.invoices
        WHERE id = $1
        FOR UPDATE
      `,
      [id]
    );

    if ((invoiceResult.rowCount ?? 0) === 0) {
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
        { error: "Cannot create credit note for a deleted invoice" },
        { status: 409 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Validate invoice
    |--------------------------------------------------------------------------
    */

    if (invoice.status === "cancelled" || invoice.status === "void") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Credit notes cannot be created for cancelled or void invoices",
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
          allow_credit_notes,
          credit_note_prefix,
          credit_note_next_number,
          credit_note_number_padding,
          credit_note_number_format
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    const allowCreditNotes = settingsResult.rows[0]?.allow_credit_notes ?? true;

    if (!allowCreditNotes) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Credit notes are disabled in invoice settings" },
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
          COALESCE(SUM(amount), 0) AS total_credits
        FROM public.credit_notes
        WHERE invoice_id = $1
          AND status IN ('issued', 'applied')
      `,
      [id]
    );

    const existingCredits = toDecimal(creditResult.rows[0]?.total_credits);
    const maximumCredit = Math.max(0, toDecimal(invoice.total_amount) - existingCredits);

    if (amount > maximumCredit) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: "Credit note exceeds the remaining creditable invoice amount",
          invoice_total: invoice.total_amount,
          existing_credit_notes: existingCredits,
          maximum_credit: maximumCredit,
        },
        { status: 400 }
      );
    }

    /*
    |--------------------------------------------------------------------------
    | Generate credit-note number
    |--------------------------------------------------------------------------
    */

    const settingsNumberResult = await client.query(
      `
        SELECT
          id,
          credit_note_prefix,
          credit_note_next_number,
          credit_note_number_padding,
          credit_note_number_format
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `
    );

    let creditNoteNumber: string;

    if (settingsNumberResult.rowCount && settingsNumberResult.rowCount > 0) {
      const settings = settingsNumberResult.rows[0];

      const prefix = settings.credit_note_prefix || "CN-";
      const nextNumber = toNumber(settings.credit_note_next_number, 1);
      const padding = toNumber(settings.credit_note_number_padding, 6);
      const format = settings.credit_note_number_format || "{prefix}{number}";
      const issueDate = body.issue_date ? new Date(body.issue_date) : new Date();

      creditNoteNumber = buildCreditNoteNumber(
        prefix,
        nextNumber,
        padding,
        format,
        issueDate
      );

      await client.query(
        `
          UPDATE public.invoice_settings
          SET
            credit_note_next_number = $1,
            updated_at = NOW()
          WHERE id = $2
        `,
        [nextNumber + 1, settings.id]
      );
    } else {
      creditNoteNumber = `CN-${Date.now()}`;
    }

    /*
    |--------------------------------------------------------------------------
    | Create credit note
    |--------------------------------------------------------------------------
    */

    const taxAmount = toDecimal(body.tax_amount, 0);
    const currency = body.currency || invoice.currency || "KES";

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
          notes,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          'issued',
          $8, $9, $10, $11, $12
        )
        RETURNING *
      `,
      [
        invoice.id,
        invoice.customer_id,
        creditNoteNumber,
        body.issue_date ? new Date(body.issue_date) : new Date(),
        amount,
        taxAmount,
        currency,
        body.reason,
        nullableString(body.reason_details),
        user.id,
        nullableString(body.notes),
        jsonValue(body.metadata, {}),
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
        VALUES ($1, $2, $3, 'credit_note_issued', $4)
      `,
      [
        invoice.id,
        user.id,
        user.fullName || user.email,
        jsonValue({
          credit_note_id: creditNote.id,
          credit_note_number: creditNote.credit_note_number,
          amount: amount,
          tax_amount: taxAmount,
          reason: body.reason,
          status: "issued",
        }, {}),
      ]
    );

    /*
    |--------------------------------------------------------------------------
    | Create event for webhooks
    |--------------------------------------------------------------------------
    */

    await client.query(
      `
        INSERT INTO public.invoice_events (
          invoice_id,
          event_type,
          payload
        )
        VALUES ($1, 'credit_note_issued', $2)
      `,
      [
        invoice.id,
        jsonValue({
          credit_note_id: creditNote.id,
          credit_note_number: creditNote.credit_note_number,
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          customer_id: invoice.customer_id,
          amount: amount,
          tax_amount: taxAmount,
          reason: body.reason,
          issued_by: user.id,
          issued_at: new Date().toISOString(),
        }, {}),
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

    console.error("POST /api/invoices/[id]/credit-notes:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create credit note",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}