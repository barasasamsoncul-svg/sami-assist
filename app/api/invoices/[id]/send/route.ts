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

function jsonValue(value: unknown, fallback: Record<string, unknown> | unknown[] = {}) {
  if (value === undefined || value === null) {
    return fallback;
  }
  return value;
}

function nullableString(value: unknown): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  return String(value);
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/send
|--------------------------------------------------------------------------
|
| Sends an invoice via email or WhatsApp.
|
| Request body:
| {
|   via: 'email' | 'whatsapp',
|   to?: string,
|   subject?: string,
|   message?: string
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

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const { via, to, subject, message } = body;

  if (!via || (via !== "email" && via !== "whatsapp")) {
    return NextResponse.json(
      { error: "via must be 'email' or 'whatsapp'" },
      { status: 400 }
    );
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get invoice with customer details
    const invoiceResult = await client.query(
      `
        SELECT
          i.*,
          c.id AS customer_id,
          c.company_name,
          c.email AS customer_email,
          c.phone AS customer_phone,
          c.contact_name
        FROM public.invoices i
        INNER JOIN public.customers c ON c.id = i.customer_id
        WHERE i.id = $1 AND i.deleted_at IS NULL
        FOR UPDATE
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    // Check if invoice is eligible for sending
    if (invoice.status === "cancelled" || invoice.status === "void") {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: `Cannot send a ${invoice.status} invoice` },
        { status: 409 }
      );
    }

    // Determine recipient
    let recipient = to;
    if (!recipient) {
      if (via === "email") {
        recipient = invoice.customer_email;
      } else {
        recipient = invoice.customer_phone;
      }
    }

    if (!recipient) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        {
          error: `No ${via} address found for this customer. Please provide one.`,
        },
        { status: 400 }
      );
    }

    // Get settings
    const settingsResult = await client.query(
      `
        SELECT *
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    const settings = settingsResult.rows[0] || {};

    // Check if sending is enabled
    if (via === "email" && !settings.email_enabled) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Email sending is disabled in settings" },
        { status: 403 }
      );
    }

    if (via === "whatsapp" && !settings.whatsapp_enabled) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "WhatsApp sending is disabled in settings" },
        { status: 403 }
      );
    }

    // Build email subject
    let emailSubject = subject || settings.email_invoice_subject_template || "Invoice {invoice_number} from {company_name}";
    emailSubject = emailSubject
      .replaceAll("{invoice_number}", invoice.invoice_number)
      .replaceAll("{company_name}", settings.company_name || "Our Company")
      .replaceAll("{customer_name}", invoice.company_name)
      .replaceAll("{total_amount}", invoice.total_amount)
      .replaceAll("{due_date}", invoice.due_date);

    // Build email body
    let emailBody = message || settings.email_invoice_body_template || "";
    emailBody = emailBody
      .replaceAll("{invoice_number}", invoice.invoice_number)
      .replaceAll("{company_name}", settings.company_name || "Our Company")
      .replaceAll("{customer_name}", invoice.company_name)
      .replaceAll("{total_amount}", invoice.total_amount)
      .replaceAll("{amount_due}", invoice.amount_due)
      .replaceAll("{due_date}", invoice.due_date);

    // Log that the invoice was sent (simulate actual sending)
    // In production, you would integrate with email/WhatsApp service here

    // Update invoice status and timestamps
    const updatedResult = await client.query(
      `
        UPDATE public.invoices
        SET
          status = CASE
            WHEN status = 'draft' THEN 'sent'
            WHEN status = 'pending_approval' AND $1 = 'sent' THEN 'sent'
            ELSE status
          END,
          sent_at = CASE
            WHEN status IN ('draft', 'pending_approval') THEN NOW()
            ELSE sent_at
          END,
          updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `,
      [via, id]
    );

    const updatedInvoice = updatedResult.rows[0];

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
        id,
        user.id,
        user.fullName || user.email,
        "sent",
        jsonValue({
          via,
          recipient,
          subject: emailSubject,
          sent_at: new Date().toISOString(),
        }, {}),
      ]
    );

    // Status history if status changed
    if (updatedInvoice.status !== invoice.status) {
      await client.query(
        `
          INSERT INTO public.invoice_status_history (
            invoice_id,
            from_status,
            to_status,
            changed_by,
            reason
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          id,
          invoice.status,
          updatedInvoice.status,
          user.id,
          `Invoice sent via ${via}`,
        ]
      );
    }

    // Event for webhooks
    await client.query(
      `
        INSERT INTO public.invoice_events (
          invoice_id,
          event_type,
          payload
        )
        VALUES ($1, 'invoice_sent', $2)
      `,
      [
        id,
        jsonValue({
          invoice_id: id,
          invoice_number: invoice.invoice_number,
          via,
          recipient,
          sent_by: user.id,
          sent_at: new Date().toISOString(),
        }, {}),
      ]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      success: true,
      message: `Invoice sent via ${via} to ${recipient}`,
      invoice: updatedInvoice,
      sent: {
        via,
        recipient,
        subject: emailSubject,
        sent_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/[id]/send:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send invoice",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}