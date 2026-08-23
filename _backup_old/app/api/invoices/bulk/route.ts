import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/bulk/send
|--------------------------------------------------------------------------
|
| Bulk send invoices.
|
| Request body:
| {
|   invoice_ids: string[],
|   via: 'email' | 'whatsapp',
|   subject?: string,
|   message?: string
| }
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

  const body = await req.json();

  const { invoice_ids, via, subject, message } = body;

  if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
    return NextResponse.json(
      { error: "invoice_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!via || (via !== "email" && via !== "whatsapp")) {
    return NextResponse.json(
      { error: "via must be 'email' or 'whatsapp'" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    let successCount = 0;
    let failedCount = 0;
    const results: Array<{ id: string; success: boolean; error?: string }> = [];

    // Get all invoices
    const invoicesResult = await client.query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.status,
          c.email AS customer_email,
          c.phone AS customer_phone
        FROM public.invoices i
        INNER JOIN public.customers c ON c.id = i.customer_id
        WHERE i.id = ANY($1)
          AND i.deleted_at IS NULL
          AND i.status NOT IN ('cancelled', 'void')
      `,
      [invoice_ids]
    );

    const invoices = invoicesResult.rows;

    for (const invoice of invoices) {
      try {
        // Determine recipient
        let recipient = via === "email" ? invoice.customer_email : invoice.customer_phone;

        if (!recipient) {
          failedCount++;
          results.push({
            id: invoice.id,
            success: false,
            error: `No ${via} address found for customer`,
          });
          continue;
        }

        // Update invoice status
        await client.query(
          `
            UPDATE public.invoices
            SET
              status = CASE
                WHEN status = 'draft' THEN 'sent'
                WHEN status = 'pending_approval' THEN 'sent'
                ELSE status
              END,
              sent_at = CASE
                WHEN status IN ('draft', 'pending_approval') THEN NOW()
                ELSE sent_at
              END,
              updated_at = NOW()
            WHERE id = $1
          `,
          [invoice.id]
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
            invoice.id,
            user.id,
            user.fullName || user.email,
            "bulk_sent",
            jsonValue({
              via,
              recipient,
              sent_at: new Date().toISOString(),
            }, {}),
          ]
        );

        successCount++;
        results.push({
          id: invoice.id,
          success: true,
        });
      } catch (error) {
        failedCount++;
        results.push({
          id: invoice.id,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      total: invoices.length,
      success_count: successCount,
      failed_count: failedCount,
      results,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/bulk/send:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send invoices",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/bulk/status
|--------------------------------------------------------------------------
|
| Bulk update invoice status.
|
| Request body:
| {
|   invoice_ids: string[],
|   status: string,
|   reason?: string
| }
|--------------------------------------------------------------------------
*/

export async function PUT(req: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const body = await req.json();

  const { invoice_ids, status, reason } = body;

  if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
    return NextResponse.json(
      { error: "invoice_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  if (!status) {
    return NextResponse.json(
      { error: "status is required" },
      { status: 400 }
    );
  }

  const validStatuses = ["draft", "sent", "viewed", "paid", "cancelled", "void"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      {
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        UPDATE public.invoices
        SET
          status = $1,
          cancelled_by = CASE WHEN $1 IN ('cancelled', 'void') THEN $2 ELSE NULL END,
          cancelled_reason = CASE WHEN $1 IN ('cancelled', 'void') THEN $3 ELSE NULL END,
          updated_at = NOW()
        WHERE id = ANY($4)
          AND deleted_at IS NULL
        RETURNING id, invoice_number, status
      `,
      [status, user.id, reason || null, invoice_ids]
    );

    const updatedCount = result.rowCount || 0;

    // Activity log for each updated invoice
    for (const invoice of result.rows) {
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
          invoice.id,
          user.id,
          user.fullName || user.email,
          "bulk_status_updated",
          jsonValue({
            status,
            reason: reason || null,
          }, {}),
        ]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      updated_count: updatedCount,
      invoices: result.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/bulk/status:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice status",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/bulk/archive
|--------------------------------------------------------------------------
|
| Bulk archive invoices.
|
| Request body:
| {
|   invoice_ids: string[]
| }
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { pool } = await getTenantDatabaseForUser(user.id);

  const body = await req.json();

  const { invoice_ids } = body;

  if (!invoice_ids || !Array.isArray(invoice_ids) || invoice_ids.length === 0) {
    return NextResponse.json(
      { error: "invoice_ids must be a non-empty array" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Move invoices to archive
    const result = await client.query(
      `
        INSERT INTO public.invoices_archive (
          id, customer_id, invoice_number, issue_date, due_date,
          payment_date, sent_at, viewed_at, approved_at, status,
          subtotal, discount_type, discount_value, discount_amount,
          tax_calculation_method, tax_amount, shipping_cost, shipping_tax,
          rounding_adjustment, rounded_total, total_amount, amount_paid,
          amount_due, po_number, currency, exchange_rate, payment_terms_id,
          payment_terms_display, fiscal_year, fiscal_period, template_id,
          created_by, approved_by, cancelled_by, cancelled_reason,
          reminder_count, last_reminder_sent_at, next_reminder_at,
          notes, internal_notes, footer_text, attachments,
          deleted_at, deleted_by, metadata, created_at, updated_at,
          archived_at, archived_by
        )
        SELECT
          id, customer_id, invoice_number, issue_date, due_date,
          payment_date, sent_at, viewed_at, approved_at, status,
          subtotal, discount_type, discount_value, discount_amount,
          tax_calculation_method, tax_amount, shipping_cost, shipping_tax,
          rounding_adjustment, rounded_total, total_amount, amount_paid,
          amount_due, po_number, currency, exchange_rate, payment_terms_id,
          payment_terms_display, fiscal_year, fiscal_period, template_id,
          created_by, approved_by, cancelled_by, cancelled_reason,
          reminder_count, last_reminder_sent_at, next_reminder_at,
          notes, internal_notes, footer_text, attachments,
          deleted_at, deleted_by, metadata, created_at, updated_at,
          NOW(), $1
        FROM public.invoices
        WHERE id = ANY($2)
          AND deleted_at IS NULL
          AND status IN ('paid', 'cancelled', 'void')
        RETURNING id, invoice_number
      `,
      [user.id, invoice_ids]
    );

    const archivedCount = result.rowCount || 0;

    // Delete archived invoices from main table
    await client.query(
      `
        DELETE FROM public.invoices
        WHERE id = ANY($1)
          AND deleted_at IS NULL
          AND status IN ('paid', 'cancelled', 'void')
      `,
      [invoice_ids]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      archived_count: archivedCount,
      invoices: result.rows,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/bulk/archive:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to archive invoices",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}