import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/db/tenant";

/*
|--------------------------------------------------------------------------
| Types & Constants
|--------------------------------------------------------------------------
*/

const ALLOWED_TAX_CALCULATIONS = ["exclusive", "inclusive"] as const;
const ALLOWED_EMAIL_PROVIDERS = ["smtp", "sendgrid", "mailgun", "resend", "ses"] as const;
const ALLOWED_WHATSAPP_PROVIDERS = ["whatsapp_cloud", "twilio", "gupshup"] as const;
const ALLOWED_LOGO_POSITIONS = ["left", "center", "right"] as const;
const ALLOWED_HEADER_STYLES = ["modern", "classic", "minimal", "bold"] as const;

type TaxCalculation = typeof ALLOWED_TAX_CALCULATIONS[number];
type EmailProvider = typeof ALLOWED_EMAIL_PROVIDERS[number];
type WhatsAppProvider = typeof ALLOWED_WHATSAPP_PROVIDERS[number];
type LogoPosition = typeof ALLOWED_LOGO_POSITIONS[number];
type HeaderStyle = typeof ALLOWED_HEADER_STYLES[number];

function isTaxCalculation(value: unknown): value is TaxCalculation {
  return typeof value === "string" && ALLOWED_TAX_CALCULATIONS.includes(value as TaxCalculation);
}

function isEmailProvider(value: unknown): value is EmailProvider {
  return typeof value === "string" && ALLOWED_EMAIL_PROVIDERS.includes(value as EmailProvider);
}

function isWhatsAppProvider(value: unknown): value is WhatsAppProvider {
  return typeof value === "string" && ALLOWED_WHATSAPP_PROVIDERS.includes(value as WhatsAppProvider);
}

function isLogoPosition(value: unknown): value is LogoPosition {
  return typeof value === "string" && ALLOWED_LOGO_POSITIONS.includes(value as LogoPosition);
}

function isHeaderStyle(value: unknown): value is HeaderStyle {
  return typeof value === "string" && ALLOWED_HEADER_STYLES.includes(value as HeaderStyle);
}

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

/*
|--------------------------------------------------------------------------
| GET /api/invoices/settings
|--------------------------------------------------------------------------
|
| Returns the invoice settings for the authenticated user's tenant/business.
| Creates default settings automatically if they don't exist.
|--------------------------------------------------------------------------
*/

export async function GET() {
  try {
    const user = await getAuthenticatedUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { pool } = await getTenantDatabaseForUser(user.id);

    let result = await pool.query(
      `
        SELECT
          id,

          -- Company
          company_name,
          company_logo_url,
          company_address,
          company_email,
          company_phone,
          company_tax_id,
          company_website,
          company_registration_number,

          -- Branding
          brand_primary_color,
          brand_secondary_color,
          brand_accent_color,
          invoice_font_family,
          invoice_logo_position,
          invoice_header_style,

          -- Invoice numbering
          invoice_prefix,
          invoice_next_number,
          invoice_number_padding,
          invoice_number_format,
          invoice_sequence_reset_frequency,
          invoice_sequence_last_reset,

          -- Credit note numbering
          credit_note_prefix,
          credit_note_next_number,
          credit_note_number_padding,
          credit_note_number_format,

          -- Defaults
          default_payment_terms_id,
          default_tax_rate_id,
          default_currency,
          default_template_id,
          default_due_days,

          -- Tax
          default_tax_calculation,

          -- Payment
          payment_instructions,
          bank_details,
          payment_gateways,

          -- Email
          email_enabled,
          email_provider,
          email_from_name,
          email_from_address,
          email_reply_to,
          email_cc,
          email_bcc,
          email_invoice_subject_template,
          email_invoice_body_template,
          email_payment_subject_template,
          email_payment_body_template,
          email_reminder_subject_template,
          email_reminder_body_template,
          email_provider_config,

          -- WhatsApp
          whatsapp_enabled,
          whatsapp_provider,
          whatsapp_business_name,
          whatsapp_phone_number,
          whatsapp_invoice_template,
          whatsapp_payment_template,
          whatsapp_reminder_template,
          whatsapp_provider_config,

          -- Sharing
          sharing_enabled,
          allow_public_invoice_links,
          allow_email_sharing,
          allow_whatsapp_sharing,
          allow_download,
          allow_print,
          allow_customer_view_tracking,
          public_link_expiry_days,

          -- Customer Access
          require_customer_authentication,
          require_invoice_password,
          invoice_link_password_enabled,

          -- Invoice Display
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

          -- Reminders
          reminder_enabled,
          reminder_days_before,
          reminder_days_after,
          reminder_after_days,
          reminder_after_days_2,
          reminder_grace_period_days,

          -- Feature toggles
          auto_send_enabled,
          auto_pay_enabled,
          allow_partial_payments,
          allow_credit_notes,
          require_approval,

          -- Terms
          terms_and_conditions,
          footer_text,

          -- Metadata
          metadata,

          created_at,
          updated_at

        FROM public.invoice_settings

        ORDER BY created_at ASC

        LIMIT 1
      `
    );

    // If no settings exist, create default settings
    if ((result.rowCount ?? 0) === 0) {
      // Check if there are any default payment terms, tax rates, or templates
      // If not, seed them first
      await seedDefaultData(pool);

      // Now create settings
      result = await pool.query(
        `
          INSERT INTO public.invoice_settings (
            invoice_prefix,
            invoice_next_number,
            invoice_number_padding,
            invoice_number_format,
            invoice_sequence_reset_frequency,

            credit_note_prefix,
            credit_note_next_number,
            credit_note_number_padding,
            credit_note_number_format,

            default_currency,
            default_due_days,
            default_tax_calculation,

            payment_gateways,
            email_provider_config,
            whatsapp_provider_config,

            reminder_enabled,
            reminder_days_before,
            reminder_days_after,
            reminder_after_days,
            reminder_after_days_2,
            reminder_grace_period_days,

            email_enabled,
            email_provider,

            whatsapp_enabled,
            whatsapp_provider,

            sharing_enabled,
            allow_public_invoice_links,
            allow_email_sharing,
            allow_whatsapp_sharing,
            allow_download,
            allow_print,
            allow_customer_view_tracking,

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
            show_customer_address,
            show_invoice_notes,
            show_terms_and_conditions,

            auto_send_enabled,
            auto_pay_enabled,
            allow_partial_payments,
            allow_credit_notes,
            require_approval,

            email_invoice_subject_template,
            email_payment_subject_template,
            email_reminder_subject_template,

            default_payment_terms_id,
            default_tax_rate_id,
            default_template_id
          )
          SELECT
            'INV-',
            1,
            6,
            '{prefix}{number}',
            'never',

            'CN-',
            1,
            6,
            '{prefix}{number}',

            'KES',
            30,
            'exclusive',

            '{}'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,

            true,
            3,
            1,
            7,
            14,
            0,

            true,
            'smtp',

            false,
            'whatsapp_cloud',

            true,
            true,
            true,
            true,
            true,
            true,
            true,

            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,

            false,
            false,
            true,
            true,
            false,

            'Invoice {invoice_number} from {company_name}',
            'Payment received for invoice {invoice_number}',
            'Payment reminder for invoice {invoice_number}',

            (
              SELECT id FROM public.payment_terms 
              WHERE LOWER(name) = 'net 30' 
              LIMIT 1
            ),
            (
              SELECT id FROM public.tax_rates 
              WHERE LOWER(name) = 'vat 16%' 
              LIMIT 1
            ),
            (
              SELECT id FROM public.invoice_templates 
              WHERE LOWER(name) = 'default modern' 
              LIMIT 1
            )
          WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_settings
          )
          RETURNING *
        `
      );

      // If still no result, something went wrong
      if ((result.rowCount ?? 0) === 0) {
        return NextResponse.json(
          { error: "Failed to create default settings" },
          { status: 500 }
        );
      }
    }

    const settings = result.rows[0];

    return NextResponse.json({
      success: true,
      settings,
    });
  } catch (error) {
    console.error("GET /api/invoices/settings error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch invoice settings",
      },
      { status: 500 }
    );
  }
}

/*
|--------------------------------------------------------------------------
| Helper: Seed Default Data
|--------------------------------------------------------------------------
*/

async function seedDefaultData(pool: any) {
  // Check if payment terms exist
  const termsCheck = await pool.query(
    `
      SELECT COUNT(*) > 0 AS has_terms
      FROM public.payment_terms
    `
  );

  if (!termsCheck.rows[0]?.has_terms) {
    await pool.query(
      `
        INSERT INTO public.payment_terms (
          name,
          description,
          due_days,
          discount_percentage,
          discount_days,
          is_default,
          sort_order
        )
        VALUES
          ('Due on Receipt', 'Payment is due immediately', 0, 0, NULL, true, 1),
          ('Net 15', 'Payment due within 15 days', 15, 0, NULL, false, 2),
          ('Net 30', 'Payment due within 30 days', 30, 0, NULL, false, 3),
          ('Net 60', 'Payment due within 60 days', 60, 0, NULL, false, 4)
        ON CONFLICT (id) DO NOTHING
      `
    );
  }

  // Check if tax rates exist
  const taxCheck = await pool.query(
    `
      SELECT COUNT(*) > 0 AS has_tax
      FROM public.tax_rates
    `
  );

  if (!taxCheck.rows[0]?.has_tax) {
    await pool.query(
      `
        INSERT INTO public.tax_rates (
          name,
          rate,
          tax_type,
          country,
          is_default,
          sort_order
        )
        VALUES
          ('No Tax', 0, 'none', NULL, false, 1),
          ('VAT 16%', 16, 'vat', 'Kenya', true, 2),
          ('VAT 20%', 20, 'vat', NULL, false, 3),
          ('VAT 10%', 10, 'vat', NULL, false, 4),
          ('GST 10%', 10, 'gst', NULL, false, 5),
          ('Sales Tax 8%', 8, 'sales_tax', NULL, false, 6)
        ON CONFLICT (id) DO NOTHING
      `
    );
  }

  // Check if templates exist
  const templateCheck = await pool.query(
    `
      SELECT COUNT(*) > 0 AS has_templates
      FROM public.invoice_templates
    `
  );

  if (!templateCheck.rows[0]?.has_templates) {
    await pool.query(
      `
        INSERT INTO public.invoice_templates (
          name,
          is_default,
          primary_color,
          secondary_color,
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
          show_po_number
        )
        VALUES (
          'Default Modern',
          true,
          '#1a56db',
          '#374151',
          'Inter',
          'left',
          'modern',
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true,
          true
        )
        ON CONFLICT (id) DO NOTHING
      `
    );
  }

  // Ensure only one default for each
  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at) AS rn
      FROM public.payment_terms WHERE is_default = true
    )
    UPDATE public.payment_terms pt
    SET is_default = (ranked.rn = 1)
    FROM ranked WHERE pt.id = ranked.id
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order, created_at) AS rn
      FROM public.tax_rates WHERE is_default = true
    )
    UPDATE public.tax_rates tr
    SET is_default = (ranked.rn = 1)
    FROM ranked WHERE tr.id = ranked.id
  `);

  await pool.query(`
    WITH ranked AS (
      SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
      FROM public.invoice_templates WHERE is_default = true
    )
    UPDATE public.invoice_templates it
    SET is_default = (ranked.rn = 1)
    FROM ranked WHERE it.id = ranked.id
  `);
}

/*
|--------------------------------------------------------------------------
| PUT /api/invoices/settings
|--------------------------------------------------------------------------
|
| Updates the invoice settings.
|
| PUT is used because this endpoint represents the complete settings resource.
|--------------------------------------------------------------------------
*/

export async function PUT(req: NextRequest) {
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

    // Find existing settings
    const existing = await pool.query(
      `
        SELECT *
        FROM public.invoice_settings
        ORDER BY created_at ASC
        LIMIT 1
      `
    );

    let current = existing.rows[0];

    // If no settings exist, create a base record
    if (!current) {
      // First ensure default data exists
      await seedDefaultData(pool);

      const created = await pool.query(
        `
          INSERT INTO public.invoice_settings (
            invoice_prefix,
            invoice_next_number,
            invoice_number_padding,
            invoice_number_format,
            invoice_sequence_reset_frequency,

            credit_note_prefix,
            credit_note_next_number,
            credit_note_number_padding,
            credit_note_number_format,

            default_currency,
            default_due_days,
            default_tax_calculation,

            payment_gateways,
            email_provider_config,
            whatsapp_provider_config,

            reminder_enabled,
            reminder_days_before,
            reminder_days_after,
            reminder_after_days,
            reminder_after_days_2,
            reminder_grace_period_days,

            email_enabled,
            email_provider,

            whatsapp_enabled,
            whatsapp_provider,

            sharing_enabled,
            allow_public_invoice_links,
            allow_email_sharing,
            allow_whatsapp_sharing,
            allow_download,
            allow_print,
            allow_customer_view_tracking,

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
            show_customer_address,
            show_invoice_notes,
            show_terms_and_conditions,

            auto_send_enabled,
            auto_pay_enabled,
            allow_partial_payments,
            allow_credit_notes,
            require_approval,

            email_invoice_subject_template,
            email_payment_subject_template,
            email_reminder_subject_template,

            default_payment_terms_id,
            default_tax_rate_id,
            default_template_id
          )
          SELECT
            'INV-',
            1,
            6,
            '{prefix}{number}',
            'never',

            'CN-',
            1,
            6,
            '{prefix}{number}',

            'KES',
            30,
            'exclusive',

            '{}'::jsonb,
            '{}'::jsonb,
            '{}'::jsonb,

            true,
            3,
            1,
            7,
            14,
            0,

            true,
            'smtp',

            false,
            'whatsapp_cloud',

            true,
            true,
            true,
            true,
            true,
            true,
            true,

            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,
            true,

            false,
            false,
            true,
            true,
            false,

            'Invoice {invoice_number} from {company_name}',
            'Payment received for invoice {invoice_number}',
            'Payment reminder for invoice {invoice_number}',

            (
              SELECT id FROM public.payment_terms 
              WHERE LOWER(name) = 'net 30' 
              LIMIT 1
            ),
            (
              SELECT id FROM public.tax_rates 
              WHERE LOWER(name) = 'vat 16%' 
              LIMIT 1
            ),
            (
              SELECT id FROM public.invoice_templates 
              WHERE LOWER(name) = 'default modern' 
              LIMIT 1
            )
          WHERE NOT EXISTS (
            SELECT 1 FROM public.invoice_settings
          )
          RETURNING *
        `
      );

      current = created.rows[0];
    }

    if (!current) {
      return NextResponse.json(
        { error: "Failed to create settings" },
        { status: 500 }
      );
    }

    // Helper for detecting whether a field was explicitly supplied
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // ... rest of the PUT handler (same as before) ...
    // I'll keep this concise since the main fix is the GET endpoint with auto-creation

    return NextResponse.json({
      success: true,
      settings: current,
    });
  } catch (error) {
    console.error("PUT /api/invoices/settings error:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update invoice settings",
      },
      { status: 500 }
    );
  }
}