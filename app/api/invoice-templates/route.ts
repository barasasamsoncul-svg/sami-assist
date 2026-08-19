import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/invoice-templates
 *
 * Returns invoice templates belonging to the
 * authenticated user's business.
 *
 * Optional:
 *
 * ?include_inactive=true
 */
export async function GET(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate user
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Read query parameters
    // --------------------------------------------------
    const { searchParams } =
      new URL(req.url);

    const includeInactive =
      searchParams.get("include_inactive") ===
      "true";

    // --------------------------------------------------
    // 4. Fetch templates
    // --------------------------------------------------
    const result = await pool.query(
      `
        SELECT
          id,
          name,
          is_default,
          is_active,

          primary_color,
          secondary_color,
          logo_url,
          font_family,

          show_payment_instructions,
          show_bank_details,
          show_tax_breakdown,
          show_discount,
          show_shipping,
          show_po_number,

          header_text,
          footer_text,
          payment_instructions,
          bank_details,
          terms_and_conditions,

          created_at,
          updated_at

        FROM public.invoice_templates

        ${
          includeInactive
            ? ""
            : "WHERE is_active = true"
        }

        ORDER BY
          is_default DESC,
          sort_order ASC,
          name ASC
      `
    );

    return NextResponse.json({
      success: true,
      templates: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    console.error(
      "GET /api/invoice-templates error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch invoice templates",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/invoice-templates
 *
 * Creates a new invoice template.
 */
export async function POST(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Parse body
    // --------------------------------------------------
    const body = await req.json();

    const {
      name,
      is_default,
      is_active,

      primary_color,
      secondary_color,
      logo_url,
      font_family,

      show_payment_instructions,
      show_bank_details,
      show_tax_breakdown,
      show_discount,
      show_shipping,
      show_po_number,

      header_text,
      footer_text,
      payment_instructions,
      bank_details,
      terms_and_conditions,
    } = body;

    // --------------------------------------------------
    // 4. Validate name
    // --------------------------------------------------
    if (
      !name ||
      typeof name !== "string" ||
      !name.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "Template name is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Validate colors
    // --------------------------------------------------
    const primaryColor =
      primary_color ?? "#1a56db";

    const secondaryColor =
      secondary_color ?? "#374151";

    if (
      !isValidHexColor(primaryColor) ||
      !isValidHexColor(secondaryColor)
    ) {
      return NextResponse.json(
        {
          error:
            "primary_color and secondary_color must be valid hex colors",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Validate logo URL
    // --------------------------------------------------
    if (
      logo_url !== undefined &&
      logo_url !== null &&
      typeof logo_url !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "logo_url must be a string or null",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 7. Handle default template
    //
    // Only one active template should be default.
    // --------------------------------------------------
    const makeDefault =
      Boolean(is_default);

    if (makeDefault) {
      await pool.query(
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

    // --------------------------------------------------
    // 8. Insert template
    // --------------------------------------------------
    const result = await pool.query(
      `
        INSERT INTO public.invoice_templates (
          name,
          is_default,
          is_active,

          primary_color,
          secondary_color,
          logo_url,
          font_family,

          show_payment_instructions,
          show_bank_details,
          show_tax_breakdown,
          show_discount,
          show_shipping,
          show_po_number,

          header_text,
          footer_text,
          payment_instructions,
          bank_details,
          terms_and_conditions
        )
        VALUES (
          $1,
          $2,
          $3,

          $4,
          $5,
          $6,
          $7,

          $8,
          $9,
          $10,
          $11,
          $12,
          $13,

          $14,
          $15,
          $16,
          $17,
          $18
        )
        RETURNING
          id,
          name,
          is_default,
          is_active,

          primary_color,
          secondary_color,
          logo_url,
          font_family,

          show_payment_instructions,
          show_bank_details,
          show_tax_breakdown,
          show_discount,
          show_shipping,
          show_po_number,

          header_text,
          footer_text,
          payment_instructions,
          bank_details,
          terms_and_conditions,

          created_at,
          updated_at
      `,
      [
        name.trim(),
        makeDefault,
        is_active ?? true,

        primaryColor,
        secondaryColor,
        logo_url || null,
        font_family ||
          "Inter, sans-serif",

        show_payment_instructions ??
          true,
        show_bank_details ??
          true,
        show_tax_breakdown ??
          true,
        show_discount ??
          true,
        show_shipping ??
          true,
        show_po_number ??
          true,

        header_text || null,
        footer_text || null,
        payment_instructions || null,
        bank_details ?? null,
        terms_and_conditions || null,
      ]
    );

    return NextResponse.json(
      {
        success: true,
        template: result.rows[0],
      },
      { status: 201 }
    );
  } catch (error) {
    console.error(
      "POST /api/invoice-templates error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to create invoice template",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/invoice-templates
 *
 * Updates an invoice template.
 */
export async function PATCH(req: NextRequest) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Parse body
    // --------------------------------------------------
    const body = await req.json();

    const {
      id,
      name,
      is_default,
      is_active,

      primary_color,
      secondary_color,
      logo_url,
      font_family,

      show_payment_instructions,
      show_bank_details,
      show_tax_breakdown,
      show_discount,
      show_shipping,
      show_po_number,

      header_text,
      footer_text,
      payment_instructions,
      bank_details,
      terms_and_conditions,
    } = body;

    // --------------------------------------------------
    // 4. Validate ID
    // --------------------------------------------------
    if (!id) {
      return NextResponse.json(
        {
          error:
            "Template ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 5. Fetch current template
    // --------------------------------------------------
    const existing =
      await pool.query(
        `
          SELECT *
          FROM public.invoice_templates
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

    if ((existing.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error:
            "Invoice template not found",
        },
        { status: 404 }
      );
    }

    const current =
      existing.rows[0];

    // --------------------------------------------------
    // 6. Resolve values
    // --------------------------------------------------
    const nextName =
      name !== undefined
        ? String(name).trim()
        : current.name;

    if (!nextName) {
      return NextResponse.json(
        {
          error:
            "Template name cannot be empty",
        },
        { status: 400 }
      );
    }

    const nextPrimaryColor =
      primary_color ??
      current.primary_color ??
      "#1a56db";

    const nextSecondaryColor =
      secondary_color ??
      current.secondary_color ??
      "#374151";

    if (
      !isValidHexColor(
        nextPrimaryColor
      ) ||
      !isValidHexColor(
        nextSecondaryColor
      )
    ) {
      return NextResponse.json(
        {
          error:
            "primary_color and secondary_color must be valid hex colors",
        },
        { status: 400 }
      );
    }

    const nextIsDefault =
      is_default !== undefined
        ? Boolean(is_default)
        : Boolean(current.is_default);

    // --------------------------------------------------
    // 7. If becoming default, remove default
    //    from other templates
    // --------------------------------------------------
    if (nextIsDefault) {
      await pool.query(
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

    // --------------------------------------------------
    // 8. Update template
    // --------------------------------------------------
    const result = await pool.query(
      `
        UPDATE public.invoice_templates
        SET
          name = $1,
          is_default = $2,
          is_active = $3,

          primary_color = $4,
          secondary_color = $5,
          logo_url = $6,
          font_family = $7,

          show_payment_instructions = $8,
          show_bank_details = $9,
          show_tax_breakdown = $10,
          show_discount = $11,
          show_shipping = $12,
          show_po_number = $13,

          header_text = $14,
          footer_text = $15,
          payment_instructions = $16,
          bank_details = $17,
          terms_and_conditions = $18,

          updated_at = NOW()

        WHERE id = $19

        RETURNING
          id,
          name,
          is_default,
          is_active,

          primary_color,
          secondary_color,
          logo_url,
          font_family,

          show_payment_instructions,
          show_bank_details,
          show_tax_breakdown,
          show_discount,
          show_shipping,
          show_po_number,

          header_text,
          footer_text,
          payment_instructions,
          bank_details,
          terms_and_conditions,

          created_at,
          updated_at
      `,
      [
        nextName,
        nextIsDefault,
        is_active !== undefined
          ? Boolean(is_active)
          : current.is_active,

        nextPrimaryColor,
        nextSecondaryColor,

        logo_url !== undefined
          ? logo_url || null
          : current.logo_url,

        font_family !== undefined
          ? font_family ||
            "Inter, sans-serif"
          : current.font_family,

        show_payment_instructions !==
        undefined
          ? Boolean(
              show_payment_instructions
            )
          : current.show_payment_instructions,

        show_bank_details !== undefined
          ? Boolean(show_bank_details)
          : current.show_bank_details,

        show_tax_breakdown !== undefined
          ? Boolean(show_tax_breakdown)
          : current.show_tax_breakdown,

        show_discount !== undefined
          ? Boolean(show_discount)
          : current.show_discount,

        show_shipping !== undefined
          ? Boolean(show_shipping)
          : current.show_shipping,

        show_po_number !== undefined
          ? Boolean(show_po_number)
          : current.show_po_number,

        header_text !== undefined
          ? header_text || null
          : current.header_text,

        footer_text !== undefined
          ? footer_text || null
          : current.footer_text,

        payment_instructions !==
        undefined
          ? payment_instructions || null
          : current.payment_instructions,

        bank_details !== undefined
          ? bank_details
          : current.bank_details,

        terms_and_conditions !==
        undefined
          ? terms_and_conditions || null
          : current.terms_and_conditions,

        id,
      ]
    );

    return NextResponse.json({
      success: true,
      template: result.rows[0],
    });
  } catch (error) {
    console.error(
      "PATCH /api/invoice-templates error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to update invoice template",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/invoice-templates?id=<id>
 *
 * Soft-deletes an invoice template.
 */
export async function DELETE(
  req: NextRequest
) {
  try {
    // --------------------------------------------------
    // 1. Authenticate
    // --------------------------------------------------
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // --------------------------------------------------
    // 2. Get tenant database
    // --------------------------------------------------
    const { pool } =
      await getTenantDatabaseForUser(user.id);

    // --------------------------------------------------
    // 3. Get ID
    // --------------------------------------------------
    const { searchParams } =
      new URL(req.url);

    const id =
      searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        {
          error:
            "Template ID is required",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 4. Check template
    // --------------------------------------------------
    const existing =
      await pool.query(
        `
          SELECT
            id,
            name,
            is_default,
            is_active
          FROM public.invoice_templates
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );

    if ((existing.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error:
            "Invoice template not found",
        },
        { status: 404 }
      );
    }

    const template =
      existing.rows[0];

    // --------------------------------------------------
    // 5. Don't allow deleting default template
    // --------------------------------------------------
    if (template.is_default) {
      return NextResponse.json(
        {
          error:
            "The default invoice template cannot be deleted. Set another template as default first.",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 6. Soft delete
    // --------------------------------------------------
    const result = await pool.query(
      `
        UPDATE public.invoice_templates
        SET
          is_active = false,
          updated_at = NOW()
        WHERE id = $1
        RETURNING
          id,
          name,
          is_default,
          is_active
      `,
      [id]
    );

    return NextResponse.json({
      success: true,
      template: result.rows[0],
    });
  } catch (error) {
    console.error(
      "DELETE /api/invoice-templates error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to deactivate invoice template",
      },
      { status: 500 }
    );
  }
}

/**
 * Simple hex color validation.
 *
 * Accepts:
 * #fff
 * #ffffff
 */
function isValidHexColor(
  value: unknown
): value is string {
  return (
    typeof value === "string" &&
    /^#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?$/.test(
      value
    )
  );
}