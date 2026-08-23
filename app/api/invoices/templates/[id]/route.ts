import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

type Context = {
  params: Promise<{ id: string }>;
};

/*
|--------------------------------------------------------------------------
| GET /api/invoices/templates/[id]
|--------------------------------------------------------------------------
|
| Returns a single invoice template.
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
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `
        SELECT
          id,
          name,
          is_default,
          is_active,

          primary_color,
          secondary_color,
          accent_color,
          logo_url,
          font_family,
          logo_position,
          header_style,

          show_company_logo,
          show_company_address,
          show_company_contact,
          show_tax_id,
          show_payment_instructions,
          show_bank_details,
          show_tax_breakdown,
          show_discount,
          show_shipping,
          show_po_number,
          show_customer_tax_id,
          show_customer_address,
          show_invoice_notes,
          show_terms_and_conditions,

          header_text,
          footer_text,
          payment_instructions,
          bank_details,
          terms_and_conditions,

          metadata,
          created_at,
          updated_at
        FROM public.invoice_templates
        WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      template: result.rows[0],
    });
  } catch (error) {
    console.error("GET /api/invoices/templates/[id]:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch template",
      },
      { status: 500 }
    );
  }
}