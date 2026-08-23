import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

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

/*
|--------------------------------------------------------------------------
| POST /api/invoices/[id]/duplicate
|--------------------------------------------------------------------------
|
| Duplicates an existing invoice.
|
| Request body:
| {
|   issue_date?: string,
|   due_date?: string,
|   status?: string,
|   notes?: string,
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

  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Invoice ID is required" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Get original invoice
    const originalResult = await client.query(
      `
        SELECT
          i.*,
          c.id AS customer_id,
          c.company_name,
          c.currency AS customer_currency
        FROM public.invoices i
        INNER JOIN public.customers c ON c.id = i.customer_id
        WHERE i.id = $1 AND i.deleted_at IS NULL
      `,
      [id]
    );

    if (originalResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const original = originalResult.rows[0];

    // Get invoice items
    const itemsResult = await client.query(
      `
        SELECT
          product_id,
          description,
          quantity,
          unit_price,
          discount_type,
          discount_value,
          discount_amount,
          tax_rate,
          tax_amount,
          tax_rate_id,
          line_total,
          sort_order,
          metadata
        FROM public.invoice_items
        WHERE invoice_id = $1
        ORDER BY sort_order ASC
      `,
      [id]
    );

    if (itemsResult.rows.length === 0) {
      await client.query("ROLLBACK");

      return NextResponse.json(
        { error: "Cannot duplicate invoice with no items" },
        { status: 400 }
      );
    }

    // Get settings for invoice number generation
    const settingsResult = await client.query(
      `
        SELECT *
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE
      `
    );

    const settings = settingsResult.rows[0] || {};

    // Generate invoice number
    const nextNumber = settings.invoice_next_number || 1;
    const prefix = settings.invoice_prefix || "INV-";
    const padding = settings.invoice_number_padding || 6;
    const format = settings.invoice_number_format || "{prefix}{number}";

    const invoiceNumber = format
      .replaceAll("{prefix}", prefix)
      .replaceAll("{number}", String(nextNumber).padStart(padding, "0"));

    // Update next number
    await client.query(
      `
        UPDATE public.invoice_settings
        SET invoice_next_number = $1
        WHERE id = $2
      `,
      [nextNumber + 1, settings.id]
    );

    // Determine issue date
    let issueDate = body.issue_date || new Date().toISOString().slice(0, 10);

    // Determine due date
    let dueDate = body.due_date || original.due_date;
    if (!dueDate) {
      const defaultDueDays = toNumber(settings.default_due_days, 30);
      const date = new Date(issueDate);
      date.setDate(date.getDate() + defaultDueDays);
      dueDate = date.toISOString().slice(0, 10);
    }

    // Determine status
    const status = body.status || "draft";

    // Create duplicate invoice
    const invoiceResult = await client.query(
      `
        INSERT INTO public.invoices (
          customer_id,
          invoice_number,
          issue_date,
          due_date,
          status,
          subtotal,
          discount_type,
          discount_value,
          discount_amount,
          tax_calculation_method,
          tax_amount,
          shipping_cost,
          shipping_tax,
          rounding_adjustment,
          rounded_total,
          total_amount,
          amount_paid,
          amount_due,
          po_number,
          currency,
          exchange_rate,
          payment_terms_id,
          payment_terms_display,
          fiscal_year,
          fiscal_period,
          template_id,
          created_by,
          notes,
          internal_notes,
          footer_text,
          attachments,
          metadata
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, 0, $16,
          $17, $18, $19,
          $20, $21,
          $22, $23,
          $24,
          $25,
          $26, $27, $28,
          $29, $30
        )
        RETURNING *
      `,
      [
        original.customer_id,
        invoiceNumber,
        issueDate,
        dueDate,
        status,
        original.subtotal,
        original.discount_type,
        original.discount_value,
        original.discount_amount,
        original.tax_calculation_method,
        original.tax_amount,
        original.shipping_cost,
        original.shipping_tax,
        original.rounding_adjustment,
        original.rounded_total,
        original.total_amount,
        nullableString(body.po_number || original.po_number),
        original.currency,
        original.exchange_rate || 1,
        original.payment_terms_id,
        original.payment_terms_display,
        original.fiscal_year,
        original.fiscal_period,
        original.template_id,
        user.id,
        nullableString(body.notes || original.notes),
        original.internal_notes,
        original.footer_text,
        original.attachments || [],
        jsonValue(body.metadata || original.metadata || {}, {}),
      ]
    );

    const invoice = invoiceResult.rows[0];

    // Duplicate items
    for (const item of itemsResult.rows) {
      await client.query(
        `
          INSERT INTO public.invoice_items (
            invoice_id,
            product_id,
            description,
            quantity,
            unit_price,
            discount_type,
            discount_value,
            discount_amount,
            tax_rate,
            tax_amount,
            tax_rate_id,
            line_total,
            sort_order,
            metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        `,
        [
          invoice.id,
          item.product_id,
          item.description,
          item.quantity,
          item.unit_price,
          item.discount_type,
          item.discount_value,
          item.discount_amount,
          item.tax_rate,
          item.tax_amount,
          item.tax_rate_id,
          item.line_total,
          item.sort_order,
          item.metadata || {},
        ]
      );
    }

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
        "invoice_duplicated",
        jsonValue({
          original_invoice_id: id,
          original_invoice_number: original.invoice_number,
          invoice_number: invoiceNumber,
        }, {}),
      ]
    );

    // Status history
    await client.query(
      `
        INSERT INTO public.invoice_status_history (
          invoice_id,
          to_status,
          changed_by,
          reason
        )
        VALUES ($1, $2, $3, $4)
      `,
      [
        invoice.id,
        status,
        user.id,
        'Invoice duplicated from ' + original.invoice_number,
      ]
    );

    // Event for webhooks
    await client.query(
      `
        INSERT INTO public.invoice_events (
          invoice_id,
          event_type,
          payload
        )
        VALUES ($1, 'invoice_duplicated', $2)
      `,
      [
        invoice.id,
        jsonValue({
          invoice_id: invoice.id,
          invoice_number: invoiceNumber,
          original_invoice_id: id,
          original_invoice_number: original.invoice_number,
          duplicated_by: user.id,
          duplicated_at: new Date().toISOString(),
        }, {}),
      ]
    );

    await client.query("COMMIT");

    // Return the duplicate with items
    const completeResult = await pool.query(
      `
        SELECT
          i.*,

          json_build_object(
            'id', c.id,
            'company_name', c.company_name,
            'contact_name', c.contact_name,
            'email', c.email,
            'phone', c.phone
          ) AS customer,

          COALESCE(
            (
              SELECT json_agg(ii ORDER BY ii.sort_order)
              FROM public.invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::json
          ) AS items

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        WHERE i.id = $1
      `,
      [invoice.id]
    );

    return NextResponse.json({
      success: true,
      message: `Invoice duplicated from ${original.invoice_number}`,
      original_invoice: {
        id: original.id,
        invoice_number: original.invoice_number,
      },
      invoice: completeResult.rows[0],
    }, { status: 201 });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("POST /api/invoices/[id]/duplicate:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to duplicate invoice",
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}