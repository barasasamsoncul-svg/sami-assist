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

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/credit-notes/[cnId]/apply
|--------------------------------------------------------------------------
|
| Applies a credit note to an invoice.
|
| Request body:
| {
|   applied_to_invoice_id?: string,  // Optional, defaults to original invoice
|   applied_amount?: number          // Optional, defaults to full amount
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
    const { id, cnId } = await params;

    if (!id || !cnId) {
      return NextResponse.json(
        { error: "Invoice ID and Credit Note ID are required" },
        { status: 400 }
      );
    }

    const body = await req.json();

    await client.query("BEGIN");

    // Get credit note
    const creditNoteResult = await client.query(
      `
        SELECT *
        FROM public.credit_notes
        WHERE id = $1 AND invoice_id = $2
        FOR UPDATE
      `,
      [cnId, id]
    );

    if (creditNoteResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Credit note not found for this invoice" },
        { status: 404 }
      );
    }

    const creditNote = creditNoteResult.rows[0];

    // Only allow application for 'issued' status
    if (creditNote.status !== "issued") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: `Cannot apply credit note with status "${creditNote.status}"` },
        { status: 409 }
      );
    }

    // Determine target invoice
    const targetInvoiceId = body.applied_to_invoice_id || creditNote.invoice_id;

    // Get target invoice
    const invoiceResult = await client.query(
      `
        SELECT *
        FROM public.invoices
        WHERE id = $1
        FOR UPDATE
      `,
      [targetInvoiceId]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Target invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    // Check if target invoice is deleted
    if (invoice.deleted_at) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot apply credit note to a deleted invoice" },
        { status: 409 }
      );
    }

    // Check if invoice is eligible
    if (invoice.status === "cancelled" || invoice.status === "void") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot apply credit note to a cancelled or void invoice" },
        { status: 409 }
      );
    }

    // Determine applied amount
    let appliedAmount = body.applied_amount !== undefined
      ? toDecimal(body.applied_amount)
      : toDecimal(creditNote.amount);

    if (appliedAmount <= 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Applied amount must be greater than zero" },
        { status: 400 }
      );
    }

    if (appliedAmount > toDecimal(creditNote.amount)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `Applied amount (${appliedAmount}) exceeds credit note amount (${creditNote.amount})`,
        },
        { status: 400 }
      );
    }

    // Check if applied amount exceeds invoice amount due
    if (appliedAmount > toDecimal(invoice.amount_due)) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `Applied amount (${appliedAmount}) exceeds invoice amount due (${invoice.amount_due})`,
        },
        { status: 400 }
      );
    }

    // Update credit note
    const updatedCreditNote = await client.query(
      `
        UPDATE public.credit_notes
        SET
          status = 'applied',
          applied_to_invoice_id = $1,
          applied_amount = $2,
          applied_at = NOW(),
          updated_at = NOW()
        WHERE id = $3 AND invoice_id = $4
        RETURNING *
      `,
      [targetInvoiceId, appliedAmount, cnId, id]
    );

    // Update invoice (reduce amount due)
    const newAmountDue = toDecimal(invoice.amount_due) - appliedAmount;
    const newAmountPaid = toDecimal(invoice.total_amount) - newAmountDue;

    await client.query(
      `
        UPDATE public.invoices
        SET
          amount_paid = $1,
          amount_due = $2,
          payment_date = CASE
            WHEN $3 = 0 AND $1 >= total_amount
            THEN COALESCE(
              (
                SELECT MAX(payment_date)::DATE
                FROM public.payments
                WHERE invoice_id = $4
                  AND status = 'completed'
              ),
              payment_date,
              CURRENT_DATE
            )
            ELSE payment_date
          END,
          status = CASE
            WHEN $3 = 0 AND $1 >= total_amount THEN 'paid'
            WHEN $1 > 0 THEN 'partially_paid'
            ELSE status
          END,
          updated_at = NOW()
        WHERE id = $4
      `,
      [newAmountPaid, newAmountDue, newAmountDue, targetInvoiceId]
    );

    // Activity log on original invoice
    await client.query(
      `
        INSERT INTO public.invoice_activity_log (
          invoice_id,
          user_id,
          user_name,
          action,
          details
        )
        VALUES ($1, $2, $3, 'credit_note_applied', $4)
      `,
      [
        id,
        user.id,
        user.fullName || user.email,
        jsonValue({
          credit_note_id: cnId,
          credit_note_number: creditNote.credit_note_number,
          applied_to_invoice: targetInvoiceId,
          applied_amount: appliedAmount,
        }, {}),
      ]
    );

    // Activity log on target invoice if different
    if (targetInvoiceId !== id) {
      await client.query(
        `
          INSERT INTO public.invoice_activity_log (
            invoice_id,
            user_id,
            user_name,
            action,
            details
          )
          VALUES ($1, $2, $3, 'credit_note_received', $4)
        `,
        [
          targetInvoiceId,
          user.id,
          user.fullName || user.email,
          jsonValue({
            credit_note_id: cnId,
            credit_note_number: creditNote.credit_note_number,
            original_invoice: id,
            applied_amount: appliedAmount,
          }, {}),
        ]
      );
    }

    // Create event for webhooks
    await client.query(
      `
        INSERT INTO public.invoice_events (
          invoice_id,
          event_type,
          payload
        )
        VALUES ($1, 'credit_note_applied', $2)
      `,
      [
        id,
        jsonValue({
          credit_note_id: cnId,
          credit_note_number: creditNote.credit_note_number,
          original_invoice_id: id,
          applied_to_invoice_id: targetInvoiceId,
          applied_amount: appliedAmount,
          applied_by: user.id,
          applied_at: new Date().toISOString(),
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: "Credit note applied successfully",
      creditNote: updatedCreditNote.rows[0],
      invoice: {
        id: targetInvoiceId,
        new_amount_due: newAmountDue,
        new_amount_paid: newAmountPaid,
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/[id]/credit-notes/[cnId]/apply:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to apply credit note",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}