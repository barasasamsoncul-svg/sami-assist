import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/*
|--------------------------------------------------------------------------
| Types
|--------------------------------------------------------------------------
*/

const VALID_LOGO_POSITIONS = ["left", "center", "right"] as const;
const VALID_HEADER_STYLES = ["modern", "classic", "minimal", "bold"] as const;

type LogoPosition = typeof VALID_LOGO_POSITIONS[number];
type HeaderStyle = typeof VALID_HEADER_STYLES[number];

/*
|--------------------------------------------------------------------------
| Helpers
|--------------------------------------------------------------------------
*/

function toNumber(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function isValidHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(value);
}

function isValidLogoPosition(value: unknown): value is LogoPosition {
  return typeof value === "string" && VALID_LOGO_POSITIONS.includes(value as LogoPosition);
}

function isValidHeaderStyle(value: unknown): value is HeaderStyle {
  return typeof value === "string" && VALID_HEADER_STYLES.includes(value as HeaderStyle);
}

/*
|--------------------------------------------------------------------------
| GET /api/invoices/templates
|--------------------------------------------------------------------------
|
| Returns invoice templates belonging to the authenticated user's business.
|
| Optional:
| ?include_inactive=true
| ?search=Modern
| ?page=1
| ?limit=20
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

    const includeInactive = searchParams.get("include_inactive") === "true";
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, toNumber(searchParams.get("page"), 1));
    const limit = Math.min(100, Math.max(1, toNumber(searchParams.get("limit"), 20)));
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const values: unknown[] = [];

    let parameterIndex = 1;

    if (!includeInactive) {
      conditions.push(`is_active = true`);
    }

    if (search) {
      conditions.push(`name ILIKE $${parameterIndex}`);
      values.push(`%${search}%`);
      parameterIndex++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Count
    const countResult = await pool.query(
      `
        SELECT COUNT(*)::integer AS count
        FROM public.invoice_templates
        ${whereClause}
      `,
      values
    );

    const total = countResult.rows[0]?.count || 0;

    // Get templates
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

        ${whereClause}

        ORDER BY
          is_default DESC,
          sort_order ASC,
          name ASC

        LIMIT $${parameterIndex}
        OFFSET $${parameterIndex + 1}
      `,
      [...values, limit, offset]
    );

    return NextResponse.json({
      success: true,
      templates: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("GET /api/invoices/templates error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch invoice templates",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| POST /api/invoices/templates
|--------------------------------------------------------------------------
|
| Creates a new invoice template.
|
| Request body:
| {
|   name: string,
|   is_default?: boolean,
|   is_active?: boolean,
|   primary_color?: string,
|   secondary_color?: string,
|   accent_color?: string,
|   logo_url?: string,
|   font_family?: string,
|   logo_position?: 'left'|'center'|'right',
|   header_style?: 'modern'|'classic'|'minimal'|'bold',
|   show_*?: boolean,
|   header_text?: string,
|   footer_text?: string,
|   payment_instructions?: string,
|   bank_details?: string,
|   terms_and_conditions?: string,
|   metadata?: object
| }
|--------------------------------------------------------------------------
*/

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const body = await req.json();

    const {
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
    } = body;

    // Validate name
    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { error: "Template name is required" },
        { status: 400 }
      );
    }

    // Validate colors
    const primaryColor = primary_color ?? "#1a56db";
    const secondaryColor = secondary_color ?? "#374151";

    if (!isValidHexColor(primaryColor) || !isValidHexColor(secondaryColor)) {
      return NextResponse.json(
        { error: "primary_color and secondary_color must be valid hex colors" },
        { status: 400 }
      );
    }

    // Validate accent color if provided
    if (accent_color && !isValidHexColor(accent_color)) {
      return NextResponse.json(
        { error: "accent_color must be a valid hex color" },
        { status: 400 }
      );
    }

    // Validate logo position
    if (logo_position && !isValidLogoPosition(logo_position)) {
      return NextResponse.json(
        {
          error: `Invalid logo_position. Must be one of: ${VALID_LOGO_POSITIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate header style
    if (header_style && !isValidHeaderStyle(header_style)) {
      return NextResponse.json(
        {
          error: `Invalid header_style. Must be one of: ${VALID_HEADER_STYLES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Handle default template
      const makeDefault = Boolean(is_default);

      if (makeDefault) {
        await client.query(
          `
            UPDATE public.invoice_templates
            SET
              is_default = false,
              updated_at = NOW()
            WHERE is_default = true
              AND is_active = true
          `
        );
      }

      // Insert template
      const result = await client.query(
        `
          INSERT INTO public.invoice_templates (
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

            metadata
          )
          VALUES (
            $1, $2, $3,
            $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24,
            $25, $26, $27, $28, $29,
            $30
          )
          RETURNING *
        `,
        [
          name.trim(),
          makeDefault,
          is_active ?? true,

          primaryColor,
          secondaryColor,
          accent_color || null,
          nullableString(logo_url),
          font_family || "Inter, sans-serif",
          logo_position || "left",
          header_style || "modern",

          show_company_logo ?? true,
          show_company_address ?? true,
          show_company_contact ?? true,
          show_tax_id ?? true,
          show_payment_instructions ?? true,
          show_bank_details ?? true,
          show_tax_breakdown ?? true,
          show_discount ?? true,
          show_shipping ?? true,
          show_po_number ?? true,
          show_customer_tax_id ?? false,
          show_customer_address ?? true,
          show_invoice_notes ?? true,
          show_terms_and_conditions ?? true,

          nullableString(header_text),
          nullableString(footer_text),
          nullableString(payment_instructions),
          bank_details || null,
          nullableString(terms_and_conditions),

          jsonValue(metadata, {}),
        ]
      );

      await client.query("COMMIT");

      return NextResponse.json(
        {
          success: true,
          template: result.rows[0],
        },
        { status: 201 }
      );
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("POST /api/invoices/templates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create invoice template",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| PATCH /api/invoices/templates
|--------------------------------------------------------------------------
|
| Updates an invoice template.
|
| Request body:
| {
|   id: string,
|   name?: string,
|   is_default?: boolean,
|   is_active?: boolean,
|   ... (same fields as POST)
| }
|--------------------------------------------------------------------------
*/

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    const body = await req.json();

    const {
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
    } = body;

    // Validate ID
    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Fetch current template
      const existing = await client.query(
        `
          SELECT *
          FROM public.invoice_templates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existing.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice template not found" },
          { status: 404 }
        );
      }

      const current = existing.rows[0];

      // Validate name
      const nextName = name !== undefined ? String(name).trim() : current.name;
      if (!nextName) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Template name cannot be empty" },
          { status: 400 }
        );
      }

      // Validate colors
      const nextPrimaryColor = primary_color ?? current.primary_color ?? "#1a56db";
      const nextSecondaryColor = secondary_color ?? current.secondary_color ?? "#374151";

      if (!isValidHexColor(nextPrimaryColor) || !isValidHexColor(nextSecondaryColor)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "primary_color and secondary_color must be valid hex colors" },
          { status: 400 }
        );
      }

      // Validate accent color if provided
      const nextAccentColor = accent_color !== undefined ? accent_color : current.accent_color;
      if (nextAccentColor && !isValidHexColor(nextAccentColor)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "accent_color must be a valid hex color" },
          { status: 400 }
        );
      }

      // Validate logo position
      const nextLogoPosition = logo_position !== undefined ? logo_position : current.logo_position;
      if (nextLogoPosition && !isValidLogoPosition(nextLogoPosition)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid logo_position. Must be one of: ${VALID_LOGO_POSITIONS.join(", ")}`,
          },
          { status: 400 }
        );
      }

      // Validate header style
      const nextHeaderStyle = header_style !== undefined ? header_style : current.header_style;
      if (nextHeaderStyle && !isValidHeaderStyle(nextHeaderStyle)) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: `Invalid header_style. Must be one of: ${VALID_HEADER_STYLES.join(", ")}`,
          },
          { status: 400 }
        );
      }

      const nextIsDefault = is_default !== undefined ? Boolean(is_default) : Boolean(current.is_default);

      // If becoming default, remove default from other templates
      if (nextIsDefault) {
        await client.query(
          `
            UPDATE public.invoice_templates
            SET
              is_default = false,
              updated_at = NOW()
            WHERE id <> $1
              AND is_default = true
              AND is_active = true
          `,
          [id]
        );
      }

      // Build update query
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      const fields = [
        { key: 'name', value: nextName },
        { key: 'is_default', value: nextIsDefault },
        { key: 'is_active', value: is_active !== undefined ? Boolean(is_active) : current.is_active },
        { key: 'primary_color', value: nextPrimaryColor },
        { key: 'secondary_color', value: nextSecondaryColor },
        { key: 'accent_color', value: nextAccentColor },
        { key: 'logo_url', value: logo_url !== undefined ? nullableString(logo_url) : current.logo_url },
        { key: 'font_family', value: font_family !== undefined ? font_family || "Inter, sans-serif" : current.font_family },
        { key: 'logo_position', value: nextLogoPosition },
        { key: 'header_style', value: nextHeaderStyle },
        { key: 'show_company_logo', value: show_company_logo !== undefined ? Boolean(show_company_logo) : current.show_company_logo },
        { key: 'show_company_address', value: show_company_address !== undefined ? Boolean(show_company_address) : current.show_company_address },
        { key: 'show_company_contact', value: show_company_contact !== undefined ? Boolean(show_company_contact) : current.show_company_contact },
        { key: 'show_tax_id', value: show_tax_id !== undefined ? Boolean(show_tax_id) : current.show_tax_id },
        { key: 'show_payment_instructions', value: show_payment_instructions !== undefined ? Boolean(show_payment_instructions) : current.show_payment_instructions },
        { key: 'show_bank_details', value: show_bank_details !== undefined ? Boolean(show_bank_details) : current.show_bank_details },
        { key: 'show_tax_breakdown', value: show_tax_breakdown !== undefined ? Boolean(show_tax_breakdown) : current.show_tax_breakdown },
        { key: 'show_discount', value: show_discount !== undefined ? Boolean(show_discount) : current.show_discount },
        { key: 'show_shipping', value: show_shipping !== undefined ? Boolean(show_shipping) : current.show_shipping },
        { key: 'show_po_number', value: show_po_number !== undefined ? Boolean(show_po_number) : current.show_po_number },
        { key: 'show_customer_tax_id', value: show_customer_tax_id !== undefined ? Boolean(show_customer_tax_id) : current.show_customer_tax_id },
        { key: 'show_customer_address', value: show_customer_address !== undefined ? Boolean(show_customer_address) : current.show_customer_address },
        { key: 'show_invoice_notes', value: show_invoice_notes !== undefined ? Boolean(show_invoice_notes) : current.show_invoice_notes },
        { key: 'show_terms_and_conditions', value: show_terms_and_conditions !== undefined ? Boolean(show_terms_and_conditions) : current.show_terms_and_conditions },
        { key: 'header_text', value: header_text !== undefined ? nullableString(header_text) : current.header_text },
        { key: 'footer_text', value: footer_text !== undefined ? nullableString(footer_text) : current.footer_text },
        { key: 'payment_instructions', value: payment_instructions !== undefined ? nullableString(payment_instructions) : current.payment_instructions },
        { key: 'bank_details', value: bank_details !== undefined ? bank_details : current.bank_details },
        { key: 'terms_and_conditions', value: terms_and_conditions !== undefined ? nullableString(terms_and_conditions) : current.terms_and_conditions },
        { key: 'metadata', value: metadata !== undefined ? jsonValue(metadata, {}) : current.metadata },
      ];

      for (const field of fields) {
        if (field.value !== undefined) {
          updates.push(`${field.key} = $${paramCount++}`);
          values.push(field.value);
        }
      }

      if (updates.length === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "No fields to update" },
          { status: 400 }
        );
      }

      updates.push(`updated_at = NOW()`);
      updates.push(`id = $${paramCount}`);
      values.push(id);

      const result = await client.query(
        `
          UPDATE public.invoice_templates
          SET ${updates.join(", ")}
          WHERE id = $${paramCount}
          RETURNING *
        `,
        values
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        template: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("PATCH /api/invoices/templates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice template",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| DELETE /api/invoices/templates
|--------------------------------------------------------------------------
|
| Soft-deletes an invoice template (sets is_active = false).
|
| ?id=<id>
|--------------------------------------------------------------------------
*/

export async function DELETE(req: NextRequest) {
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

    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "Template ID is required" },
        { status: 400 }
      );
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const existing = await client.query(
        `
          SELECT id, name, is_default, is_active
          FROM public.invoice_templates
          WHERE id = $1
          FOR UPDATE
        `,
        [id]
      );

      if ((existing.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          { error: "Invoice template not found" },
          { status: 404 }
        );
      }

      const template = existing.rows[0];

      // Don't allow deleting default template
      if (template.is_default) {
        await client.query("ROLLBACK");

        return NextResponse.json(
          {
            error: "The default invoice template cannot be deleted. Set another template as default first.",
          },
          { status: 400 }
        );
      }

      // Check if template is in use by any invoice
      const usageCheck = await client.query(
        `
          SELECT COUNT(*) > 0 AS in_use
          FROM public.invoices
          WHERE template_id = $1
            AND deleted_at IS NULL
        `,
        [id]
      );

      if (usageCheck.rows[0]?.in_use) {
        // Instead of preventing deletion, just deactivate it
        await client.query(
          `
            UPDATE public.invoice_templates
            SET
              is_active = false,
              updated_at = NOW()
            WHERE id = $1
            RETURNING id, name, is_default, is_active
          `,
          [id]
        );

        await client.query("COMMIT");

        return NextResponse.json({
          success: true,
          message: "Template deactivated as it is in use by existing invoices",
          template: { id, name: template.name, is_default: false, is_active: false },
        });
      }

      // Soft delete (deactivate)
      const result = await client.query(
        `
          UPDATE public.invoice_templates
          SET
            is_active = false,
            updated_at = NOW()
          WHERE id = $1
          RETURNING id, name, is_default, is_active
        `,
        [id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        success: true,
        message: "Template deleted successfully",
        template: result.rows[0],
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("DELETE /api/invoices/templates error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete invoice template",
      },
      { status: 500 }
    );
  }
}