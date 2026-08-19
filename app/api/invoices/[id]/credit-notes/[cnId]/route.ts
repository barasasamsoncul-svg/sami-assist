import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

type Context = {
  params: Promise<{ id: string; cnId: string }>;
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
| GET /api/invoices/[id]/credit-notes/[cnId]
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

    const { id, cnId } = await params;

    if (!id || !cnId) {
      return NextResponse.json(
        { error: "Invoice ID and Credit Note ID are required" },
        { status: 400 }
      );
    }

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
            'shipping_address', c.shipping_address,
            'tax_id', c.tax_id,
            'currency', c.currency
          ) AS customer,

          json_build_object(
            'id', i.id,
            'invoice_number', i.invoice_number,
            'total_amount', i.total_amount,
            'amount_paid', i.amount_paid,
            'amount_due', i.amount_due,
            'status', i.status,
            'currency', i.currency
          ) AS invoice,

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
          END AS applied_to_invoice,

          CASE
            WHEN cn.created_by IS NOT NULL THEN (
              SELECT row_to_json(u)
              FROM (
                SELECT
                  id,
                  full_name,
                  email
                FROM public.users
                WHERE id = cn.created_by
              ) u
            )
            ELSE NULL
          END AS created_by_user

        FROM public.credit_notes cn

        INNER JOIN public.customers c
          ON c.id = cn.customer_id

        INNER JOIN public.invoices i
          ON i.id = cn.invoice_id

        WHERE cn.id = $1
          AND cn.invoice_id = $2
      `,
      [cnId, id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Credit note not found for this invoice" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      creditNote: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/credit-notes/[cnId]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch credit note",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/[id]/credit-notes/[cnId]
|--------------------------------------------------------------------------
|
| Updates a credit note. Only allowed for 'issued' status.
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest, { params }: Context) {
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
    const { id, cnId } = await params;

    if (!id || !cnId) {
      return NextResponse.json(
        { error: "Invoice ID and Credit Note ID are required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    await client.query("BEGIN");

    // Get existing credit note
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.credit_notes
        WHERE id = $1 AND invoice_id = $2
        FOR UPDATE
      `,
      [cnId, id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Credit note not found for this invoice" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    // Only allow updates for 'issued' status
    if (existing.status !== "issued") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: `Cannot update credit note with status "${existing.status}"` },
        { status: 409 }
      );
    }

    // Build update
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (body.reason !== undefined) {
      updates.push(`reason = $${paramCount++}`);
      values.push(body.reason);
    }

    if (body.reason_details !== undefined) {
      updates.push(`reason_details = $${paramCount++}`);
      values.push(nullableString(body.reason_details));
    }

    if (body.notes !== undefined) {
      updates.push(`notes = $${paramCount++}`);
      values.push(nullableString(body.notes));
    }

    if (body.metadata !== undefined) {
      updates.push(`metadata = metadata || $${paramCount++}`);
      values.push(jsonValue(body.metadata, {}));
    }

    if (body.issue_date !== undefined) {
      updates.push(`issue_date = $${paramCount++}`);
      values.push(body.issue_date);
    }

    if (updates.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    updates.push(`updated_at = NOW()`);

    const result = await client.query(
      `
        UPDATE public.credit_notes
        SET ${updates.join(", ")}
        WHERE id = $${paramCount} AND invoice_id = $${paramCount + 1}
        RETURNING *
      `,
      [...values, cnId, id]
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
        VALUES ($1, $2, $3, 'credit_note_updated', $4)
      `,
      [
        id,
        user.id,
        user.fullName || user.email,
        jsonValue({
          credit_note_id: cnId,
          credit_note_number: existing.credit_note_number,
          updated_fields: Object.keys(body),
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      creditNote: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("PATCH /api/invoices/[id]/credit-notes/[cnId]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update credit note",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/[id]/credit-notes/[cnId]
|--------------------------------------------------------------------------
|
| Only allows deletion of 'issued' credit notes.
| 'applied' or 'void' credit notes cannot be deleted.
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest, { params }: Context) {
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
    const { id, cnId } = await params;

    if (!id || !cnId) {
      return NextResponse.json(
        { error: "Invoice ID and Credit Note ID are required" },
        { status: 400 }
      );
    }

    await client.query("BEGIN");

    // Get existing credit note
    const existingResult = await client.query(
      `
        SELECT *
        FROM public.credit_notes
        WHERE id = $1 AND invoice_id = $2
        FOR UPDATE
      `,
      [cnId, id]
    );

    if (existingResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Credit note not found for this invoice" },
        { status: 404 }
      );
    }

    const existing = existingResult.rows[0];

    // Only allow deletion for 'issued' status
    if (existing.status !== "issued") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: `Cannot delete credit note with status "${existing.status}"` },
        { status: 409 }
      );
    }

    // Soft delete the credit note (set to void)
    const result = await client.query(
      `
        UPDATE public.credit_notes
        SET
          status = 'void',
          updated_at = NOW()
        WHERE id = $1 AND invoice_id = $2
        RETURNING *
      `,
      [cnId, id]
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
        VALUES ($1, $2, $3, 'credit_note_voided', $4)
      `,
      [
        id,
        user.id,
        user.fullName || user.email,
        jsonValue({
          credit_note_id: cnId,
          credit_note_number: existing.credit_note_number,
          reason: "Deleted by user",
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Credit note voided successfully",
      creditNote: result.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("DELETE /api/invoices/[id]/credit-notes/[cnId]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete credit note",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}