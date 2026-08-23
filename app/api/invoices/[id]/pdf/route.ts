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
| GET /api/invoices/[id]/pdf
|--------------------------------------------------------------------------
|
| Generates a PDF for an invoice.
|
| Query parameters:
| ?format=pdf|image
| ?download=true|false
|
| Returns base64 encoded PDF/image data.
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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") || "pdf";
    const download = searchParams.get("download") === "true";

    // Get invoice with all details
    const invoiceResult = await pool.query(
      `
        SELECT
          i.*,

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

          COALESCE(
            (
              SELECT json_agg(
                ii ORDER BY ii.sort_order
              )
              FROM public.invoice_items ii
              WHERE ii.invoice_id = i.id
            ),
            '[]'::json
          ) AS items,

          json_build_object(
            'name', pt.name,
            'due_days', pt.due_days,
            'discount_percentage', pt.discount_percentage
          ) AS payment_terms,

          json_build_object(
            'name', it.name,
            'primary_color', it.primary_color,
            'secondary_color', it.secondary_color,
            'accent_color', it.accent_color,
            'logo_url', it.logo_url,
            'font_family', it.font_family,
            'header_style', it.header_style,
            'show_payment_instructions', it.show_payment_instructions,
            'show_bank_details', it.show_bank_details,
            'show_tax_breakdown', it.show_tax_breakdown,
            'show_discount', it.show_discount,
            'show_shipping', it.show_shipping,
            'show_po_number', it.show_po_number,
            'payment_instructions', it.payment_instructions,
            'bank_details', it.bank_details,
            'terms_and_conditions', it.terms_and_conditions
          ) AS template,

          json_build_object(
            'company_name', s.company_name,
            'company_logo_url', s.company_logo_url,
            'company_address', s.company_address,
            'company_email', s.company_email,
            'company_phone', s.company_phone,
            'company_tax_id', s.company_tax_id,
            'company_website', s.company_website,
            'brand_primary_color', s.brand_primary_color,
            'brand_secondary_color', s.brand_secondary_color,
            'brand_accent_color', s.brand_accent_color,
            'invoice_font_family', s.invoice_font_family,
            'invoice_logo_position', s.invoice_logo_position,
            'invoice_header_style', s.invoice_header_style,
            'footer_text', s.footer_text
          ) AS company_settings

        FROM public.invoices i

        INNER JOIN public.customers c
          ON c.id = i.customer_id

        LEFT JOIN public.payment_terms pt
          ON pt.id = i.payment_terms_id

        LEFT JOIN public.invoice_templates it
          ON it.id = i.template_id

        LEFT JOIN public.invoice_settings s
          ON s.id = (
            SELECT id FROM public.invoice_settings LIMIT 1
          )

        WHERE i.id = $1 AND i.deleted_at IS NULL
      `,
      [id]
    );

    if (invoiceResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    const invoice = invoiceResult.rows[0];

    // Log PDF generation
    await pool.query(
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
        "pdf_generated",
        jsonValue({
          format,
          generated_at: new Date().toISOString(),
        }, {}),
      ]
    );

    // In production, you would generate actual PDF here using:
    // - puppeteer with HTML template
    // - pdfkit
    // - @react-pdf/renderer
    // - External PDF service

    // For now, return the invoice data with rendering instructions
    return NextResponse.json({
      success: true,
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        issue_date: invoice.issue_date,
        due_date: invoice.due_date,
        status: invoice.status,
        currency: invoice.currency,
        subtotal: toDecimal(invoice.subtotal),
        discount_amount: toDecimal(invoice.discount_amount),
        tax_amount: toDecimal(invoice.tax_amount),
        shipping_cost: toDecimal(invoice.shipping_cost),
        total_amount: toDecimal(invoice.total_amount),
        amount_paid: toDecimal(invoice.amount_paid),
        amount_due: toDecimal(invoice.amount_due),
        po_number: invoice.po_number,
        notes: invoice.notes,
        footer_text: invoice.footer_text,
      },
      customer: invoice.customer,
      items: invoice.items,
      payment_terms: invoice.payment_terms,
      template: invoice.template,
      company_settings: invoice.company_settings,
      pdf_data: {
        // This would be base64 encoded PDF data
        // For now, return a placeholder
        generated_at: new Date().toISOString(),
        format,
        download_url: `/api/invoices/${id}/pdf/download`,
        preview_url: `/api/invoices/${id}/pdf/preview`,
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/[id]/pdf:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate PDF",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/[id]/pdf/preview
|--------------------------------------------------------------------------
|
| Returns a preview of the invoice as an image (PNG).
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest, { params }: Context) {
  // This would generate and return a preview image
  // For now, return the invoice data
  return NextResponse.json({
    success: true,
    message: "Preview endpoint - returns image preview",
  });
}