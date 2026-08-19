import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

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

    // Create default settings automatically if they don't exist
    if ((result.rowCount ?? 0) === 0) {
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
            email_reminder_subject_template
          )
          VALUES (
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
            'Payment reminder for invoice {invoice_number}'
          )

          RETURNING *
        `
      );
    }

    const settings = result.rows[0];

    // Never expose sensitive credentials to the frontend
    const safeSettings = {
      ...settings,
    };

    return NextResponse.json({
      success: true,
      settings: safeSettings,
    });
  } catch (error) {
    console.error("GET /api/invoices/settings error:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch invoice settings",
      },
      { status: 500 }
    );
  }
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
            email_reminder_subject_template
          )
          VALUES (
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
            'Payment reminder for invoice {invoice_number}'
          )

          RETURNING *
        `
      );

      current = created.rows[0];
    }

    // Helper for detecting whether a field was explicitly supplied
    const has = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    // ---- RESOLVE VALUES ----

    // Company
    const companyName = has("company_name") ? nullableString(body.company_name) : current.company_name;
    const companyLogoUrl = has("company_logo_url") ? nullableString(body.company_logo_url) : current.company_logo_url;
    const companyAddress = has("company_address") ? nullableString(body.company_address) : current.company_address;
    const companyEmail = has("company_email") ? nullableString(body.company_email) : current.company_email;
    const companyPhone = has("company_phone") ? nullableString(body.company_phone) : current.company_phone;
    const companyTaxId = has("company_tax_id") ? nullableString(body.company_tax_id) : current.company_tax_id;
    const companyWebsite = has("company_website") ? nullableString(body.company_website) : current.company_website;
    const companyRegistrationNumber = has("company_registration_number") ? nullableString(body.company_registration_number) : current.company_registration_number;

    // Branding
    const brandPrimaryColor = has("brand_primary_color") ? (body.brand_primary_color || "#1a56db") : current.brand_primary_color;
    const brandSecondaryColor = has("brand_secondary_color") ? (body.brand_secondary_color || "#374151") : current.brand_secondary_color;
    const brandAccentColor = has("brand_accent_color") ? (body.brand_accent_color || null) : current.brand_accent_color;
    const invoiceFontFamily = has("invoice_font_family") ? (body.invoice_font_family || "Inter") : current.invoice_font_family;
    const invoiceLogoPosition = has("invoice_logo_position") ? (body.invoice_logo_position || "left") : current.invoice_logo_position;
    const invoiceHeaderStyle = has("invoice_header_style") ? (body.invoice_header_style || "modern") : current.invoice_header_style;

    // Validate colors
    if (brandPrimaryColor && !isValidHexColor(brandPrimaryColor)) {
      return NextResponse.json(
        { error: "brand_primary_color must be a valid hex color" },
        { status: 400 }
      );
    }

    if (brandSecondaryColor && !isValidHexColor(brandSecondaryColor)) {
      return NextResponse.json(
        { error: "brand_secondary_color must be a valid hex color" },
        { status: 400 }
      );
    }

    if (brandAccentColor && !isValidHexColor(brandAccentColor)) {
      return NextResponse.json(
        { error: "brand_accent_color must be a valid hex color" },
        { status: 400 }
      );
    }

    // Validate logo position
    if (invoiceLogoPosition && !isLogoPosition(invoiceLogoPosition)) {
      return NextResponse.json(
        {
          error: `invalid invoice_logo_position. Must be one of: ${ALLOWED_LOGO_POSITIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Validate header style
    if (invoiceHeaderStyle && !isHeaderStyle(invoiceHeaderStyle)) {
      return NextResponse.json(
        {
          error: `invalid invoice_header_style. Must be one of: ${ALLOWED_HEADER_STYLES.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // Invoice numbering
    const invoicePrefix = has("invoice_prefix") ? String(body.invoice_prefix || "") : current.invoice_prefix;
    const invoiceNextNumber = has("invoice_next_number") ? toNumber(body.invoice_next_number) : current.invoice_next_number;
    const invoiceNumberPadding = has("invoice_number_padding") ? toNumber(body.invoice_number_padding) : current.invoice_number_padding;
    const invoiceNumberFormat = has("invoice_number_format") ? String(body.invoice_number_format || "") : current.invoice_number_format;
    const invoiceSequenceResetFrequency = has("invoice_sequence_reset_frequency") ? (body.invoice_sequence_reset_frequency || "never") : current.invoice_sequence_reset_frequency;

    // Credit note numbering
    const creditNotePrefix = has("credit_note_prefix") ? String(body.credit_note_prefix || "") : current.credit_note_prefix;
    const creditNoteNextNumber = has("credit_note_next_number") ? toNumber(body.credit_note_next_number) : current.credit_note_next_number;
    const creditNoteNumberPadding = has("credit_note_number_padding") ? toNumber(body.credit_note_number_padding) : current.credit_note_number_padding;
    const creditNoteNumberFormat = has("credit_note_number_format") ? String(body.credit_note_number_format || "") : current.credit_note_number_format;

    // Defaults
    const defaultPaymentTermsId = has("default_payment_terms_id") ? (body.default_payment_terms_id || null) : current.default_payment_terms_id;
    const defaultTaxRateId = has("default_tax_rate_id") ? (body.default_tax_rate_id || null) : current.default_tax_rate_id;
    const defaultCurrency = has("default_currency") ? String(body.default_currency || "KES").toUpperCase() : current.default_currency;
    const defaultTemplateId = has("default_template_id") ? (body.default_template_id || null) : current.default_template_id;
    const defaultDueDays = has("default_due_days") ? toNumber(body.default_due_days) : current.default_due_days;

    // Tax
    const defaultTaxCalculation = has("default_tax_calculation") ? (body.default_tax_calculation || "exclusive") : current.default_tax_calculation;

    // Payment
    const paymentInstructions = has("payment_instructions") ? nullableString(body.payment_instructions) : current.payment_instructions;
    const bankDetails = has("bank_details") ? jsonValue(body.bank_details, {}) : current.bank_details;
    const paymentGateways = has("payment_gateways") ? jsonValue(body.payment_gateways, {}) : current.payment_gateways;

    // Email
    const emailEnabled = has("email_enabled") ? Boolean(body.email_enabled) : current.email_enabled;
    const emailProvider = has("email_provider") ? (body.email_provider || "smtp") : current.email_provider;
    const emailFromName = has("email_from_name") ? nullableString(body.email_from_name) : current.email_from_name;
    const emailFromAddress = has("email_from_address") ? nullableString(body.email_from_address) : current.email_from_address;
    const emailReplyTo = has("email_reply_to") ? nullableString(body.email_reply_to) : current.email_reply_to;
    const emailCc = has("email_cc") ? nullableString(body.email_cc) : current.email_cc;
    const emailBcc = has("email_bcc") ? nullableString(body.email_bcc) : current.email_bcc;
    const emailInvoiceSubjectTemplate = has("email_invoice_subject_template") ? nullableString(body.email_invoice_subject_template) : current.email_invoice_subject_template;
    const emailInvoiceBodyTemplate = has("email_invoice_body_template") ? nullableString(body.email_invoice_body_template) : current.email_invoice_body_template;
    const emailPaymentSubjectTemplate = has("email_payment_subject_template") ? nullableString(body.email_payment_subject_template) : current.email_payment_subject_template;
    const emailPaymentBodyTemplate = has("email_payment_body_template") ? nullableString(body.email_payment_body_template) : current.email_payment_body_template;
    const emailReminderSubjectTemplate = has("email_reminder_subject_template") ? nullableString(body.email_reminder_subject_template) : current.email_reminder_subject_template;
    const emailReminderBodyTemplate = has("email_reminder_body_template") ? nullableString(body.email_reminder_body_template) : current.email_reminder_body_template;
    const emailProviderConfig = has("email_provider_config") ? jsonValue(body.email_provider_config, {}) : current.email_provider_config;

    // WhatsApp
    const whatsappEnabled = has("whatsapp_enabled") ? Boolean(body.whatsapp_enabled) : current.whatsapp_enabled;
    const whatsappProvider = has("whatsapp_provider") ? (body.whatsapp_provider || "whatsapp_cloud") : current.whatsapp_provider;
    const whatsappBusinessName = has("whatsapp_business_name") ? nullableString(body.whatsapp_business_name) : current.whatsapp_business_name;
    const whatsappPhoneNumber = has("whatsapp_phone_number") ? nullableString(body.whatsapp_phone_number) : current.whatsapp_phone_number;
    const whatsappInvoiceTemplate = has("whatsapp_invoice_template") ? nullableString(body.whatsapp_invoice_template) : current.whatsapp_invoice_template;
    const whatsappPaymentTemplate = has("whatsapp_payment_template") ? nullableString(body.whatsapp_payment_template) : current.whatsapp_payment_template;
    const whatsappReminderTemplate = has("whatsapp_reminder_template") ? nullableString(body.whatsapp_reminder_template) : current.whatsapp_reminder_template;
    const whatsappProviderConfig = has("whatsapp_provider_config") ? jsonValue(body.whatsapp_provider_config, {}) : current.whatsapp_provider_config;

    // Sharing
    const sharingEnabled = has("sharing_enabled") ? Boolean(body.sharing_enabled) : current.sharing_enabled;
    const allowPublicInvoiceLinks = has("allow_public_invoice_links") ? Boolean(body.allow_public_invoice_links) : current.allow_public_invoice_links;
    const allowEmailSharing = has("allow_email_sharing") ? Boolean(body.allow_email_sharing) : current.allow_email_sharing;
    const allowWhatsappSharing = has("allow_whatsapp_sharing") ? Boolean(body.allow_whatsapp_sharing) : current.allow_whatsapp_sharing;
    const allowDownload = has("allow_download") ? Boolean(body.allow_download) : current.allow_download;
    const allowPrint = has("allow_print") ? Boolean(body.allow_print) : current.allow_print;
    const allowCustomerViewTracking = has("allow_customer_view_tracking") ? Boolean(body.allow_customer_view_tracking) : current.allow_customer_view_tracking;
    const publicLinkExpiryDays = has("public_link_expiry_days") ? toNumber(body.public_link_expiry_days) : current.public_link_expiry_days;

    // Customer Access
    const requireCustomerAuthentication = has("require_customer_authentication") ? Boolean(body.require_customer_authentication) : current.require_customer_authentication;
    const requireInvoicePassword = has("require_invoice_password") ? Boolean(body.require_invoice_password) : current.require_invoice_password;
    const invoiceLinkPasswordEnabled = has("invoice_link_password_enabled") ? Boolean(body.invoice_link_password_enabled) : current.invoice_link_password_enabled;

    // Invoice Display
    const showCompanyLogo = has("show_company_logo") ? Boolean(body.show_company_logo) : current.show_company_logo;
    const showCompanyAddress = has("show_company_address") ? Boolean(body.show_company_address) : current.show_company_address;
    const showCompanyContact = has("show_company_contact") ? Boolean(body.show_company_contact) : current.show_company_contact;
    const showTaxId = has("show_tax_id") ? Boolean(body.show_tax_id) : current.show_tax_id;
    const showPaymentInstructions = has("show_payment_instructions") ? Boolean(body.show_payment_instructions) : current.show_payment_instructions;
    const showBankDetails = has("show_bank_details") ? Boolean(body.show_bank_details) : current.show_bank_details;
    const showTaxBreakdown = has("show_tax_breakdown") ? Boolean(body.show_tax_breakdown) : current.show_tax_breakdown;
    const showDiscount = has("show_discount") ? Boolean(body.show_discount) : current.show_discount;
    const showShipping = has("show_shipping") ? Boolean(body.show_shipping) : current.show_shipping;
    const showPoNumber = has("show_po_number") ? Boolean(body.show_po_number) : current.show_po_number;
    const showCustomerTaxId = has("show_customer_tax_id") ? Boolean(body.show_customer_tax_id) : current.show_customer_tax_id;
    const showCustomerAddress = has("show_customer_address") ? Boolean(body.show_customer_address) : current.show_customer_address;
    const showInvoiceNotes = has("show_invoice_notes") ? Boolean(body.show_invoice_notes) : current.show_invoice_notes;
    const showTermsAndConditions = has("show_terms_and_conditions") ? Boolean(body.show_terms_and_conditions) : current.show_terms_and_conditions;

    // Reminders
    const reminderEnabled = has("reminder_enabled") ? Boolean(body.reminder_enabled) : current.reminder_enabled;
    const reminderDaysBefore = has("reminder_days_before") ? toNumber(body.reminder_days_before) : current.reminder_days_before;
    const reminderDaysAfter = has("reminder_days_after") ? toNumber(body.reminder_days_after) : current.reminder_days_after;
    const reminderAfterDays = has("reminder_after_days") ? toNumber(body.reminder_after_days) : current.reminder_after_days;
    const reminderAfterDays2 = has("reminder_after_days_2") ? toNumber(body.reminder_after_days_2) : current.reminder_after_days_2;
    const reminderGracePeriodDays = has("reminder_grace_period_days") ? toNumber(body.reminder_grace_period_days) : current.reminder_grace_period_days;

    // Feature toggles
    const autoSendEnabled = has("auto_send_enabled") ? Boolean(body.auto_send_enabled) : current.auto_send_enabled;
    const autoPayEnabled = has("auto_pay_enabled") ? Boolean(body.auto_pay_enabled) : current.auto_pay_enabled;
    const allowPartialPayments = has("allow_partial_payments") ? Boolean(body.allow_partial_payments) : current.allow_partial_payments;
    const allowCreditNotes = has("allow_credit_notes") ? Boolean(body.allow_credit_notes) : current.allow_credit_notes;
    const requireApproval = has("require_approval") ? Boolean(body.require_approval) : current.require_approval;

    // Terms
    const termsAndConditions = has("terms_and_conditions") ? nullableString(body.terms_and_conditions) : current.terms_and_conditions;
    const footerText = has("footer_text") ? nullableString(body.footer_text) : current.footer_text;

    // Metadata
    const metadata = has("metadata") ? jsonValue(body.metadata, {}) : current.metadata;

    // ---- VALIDATION ----

    if (!Number.isInteger(invoiceNextNumber) || invoiceNextNumber < 1) {
      return NextResponse.json(
        { error: "invoice_next_number must be a positive integer" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(invoiceNumberPadding) || invoiceNumberPadding < 1 || invoiceNumberPadding > 20) {
      return NextResponse.json(
        { error: "invoice_number_padding must be between 1 and 20" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(creditNoteNextNumber) || creditNoteNextNumber < 1) {
      return NextResponse.json(
        { error: "credit_note_next_number must be a positive integer" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(creditNoteNumberPadding) || creditNoteNumberPadding < 1 || creditNoteNumberPadding > 20) {
      return NextResponse.json(
        { error: "credit_note_number_padding must be between 1 and 20" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(defaultDueDays) || defaultDueDays < 0) {
      return NextResponse.json(
        { error: "default_due_days must be a non-negative integer" },
        { status: 400 }
      );
    }

    if (!isTaxCalculation(defaultTaxCalculation)) {
      return NextResponse.json(
        {
          error: `default_tax_calculation must be one of: ${ALLOWED_TAX_CALCULATIONS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (publicLinkExpiryDays !== null && (!Number.isInteger(publicLinkExpiryDays) || publicLinkExpiryDays < 0)) {
      return NextResponse.json(
        { error: "public_link_expiry_days must be a non-negative integer or null" },
        { status: 400 }
      );
    }

    if (defaultCurrency && (typeof defaultCurrency !== "string" || defaultCurrency.length !== 3)) {
      return NextResponse.json(
        { error: "default_currency must be a 3-letter currency code" },
        { status: 400 }
      );
    }

    const allowedSequenceResetFrequencies = ["never", "yearly", "quarterly", "monthly"];
    if (!allowedSequenceResetFrequencies.includes(invoiceSequenceResetFrequency)) {
      return NextResponse.json(
        {
          error: `invoice_sequence_reset_frequency must be one of: ${allowedSequenceResetFrequencies.join(", ")}`,
        },
        { status: 400 }
      );
    }

    // ---- UPDATE SETTINGS ----

    const result = await pool.query(
      `
        UPDATE public.invoice_settings
        SET
          -- Company
          company_name = $1,
          company_logo_url = $2,
          company_address = $3,
          company_email = $4,
          company_phone = $5,
          company_tax_id = $6,
          company_website = $7,
          company_registration_number = $8,

          -- Branding
          brand_primary_color = $9,
          brand_secondary_color = $10,
          brand_accent_color = $11,
          invoice_font_family = $12,
          invoice_logo_position = $13,
          invoice_header_style = $14,

          -- Numbering
          invoice_prefix = $15,
          invoice_next_number = $16,
          invoice_number_padding = $17,
          invoice_number_format = $18,
          invoice_sequence_reset_frequency = $19,

          credit_note_prefix = $20,
          credit_note_next_number = $21,
          credit_note_number_padding = $22,
          credit_note_number_format = $23,

          -- Defaults
          default_payment_terms_id = $24,
          default_tax_rate_id = $25,
          default_currency = $26,
          default_template_id = $27,
          default_due_days = $28,

          -- Tax
          default_tax_calculation = $29,

          -- Payment
          payment_instructions = $30,
          bank_details = $31,
          payment_gateways = $32,

          -- Email
          email_enabled = $33,
          email_provider = $34,
          email_from_name = $35,
          email_from_address = $36,
          email_reply_to = $37,
          email_cc = $38,
          email_bcc = $39,
          email_invoice_subject_template = $40,
          email_invoice_body_template = $41,
          email_payment_subject_template = $42,
          email_payment_body_template = $43,
          email_reminder_subject_template = $44,
          email_reminder_body_template = $45,
          email_provider_config = $46,

          -- WhatsApp
          whatsapp_enabled = $47,
          whatsapp_provider = $48,
          whatsapp_business_name = $49,
          whatsapp_phone_number = $50,
          whatsapp_invoice_template = $51,
          whatsapp_payment_template = $52,
          whatsapp_reminder_template = $53,
          whatsapp_provider_config = $54,

          -- Sharing
          sharing_enabled = $55,
          allow_public_invoice_links = $56,
          allow_email_sharing = $57,
          allow_whatsapp_sharing = $58,
          allow_download = $59,
          allow_print = $60,
          allow_customer_view_tracking = $61,
          public_link_expiry_days = $62,

          -- Customer Access
          require_customer_authentication = $63,
          require_invoice_password = $64,
          invoice_link_password_enabled = $65,

          -- Invoice Display
          show_company_logo = $66,
          show_company_address = $67,
          show_company_contact = $68,
          show_tax_id = $69,
          show_payment_instructions = $70,
          show_bank_details = $71,
          show_tax_breakdown = $72,
          show_discount = $73,
          show_shipping = $74,
          show_po_number = $75,
          show_customer_tax_id = $76,
          show_customer_address = $77,
          show_invoice_notes = $78,
          show_terms_and_conditions = $79,

          -- Reminders
          reminder_enabled = $80,
          reminder_days_before = $81,
          reminder_days_after = $82,
          reminder_after_days = $83,
          reminder_after_days_2 = $84,
          reminder_grace_period_days = $85,

          -- Features
          auto_send_enabled = $86,
          auto_pay_enabled = $87,
          allow_partial_payments = $88,
          allow_credit_notes = $89,
          require_approval = $90,

          -- Terms
          terms_and_conditions = $91,
          footer_text = $92,

          -- Metadata
          metadata = $93,

          updated_at = NOW()

        WHERE id = $94

        RETURNING *
      `,
      [
        // 1-8 Company
        companyName,
        companyLogoUrl,
        companyAddress,
        companyEmail,
        companyPhone,
        companyTaxId,
        companyWebsite,
        companyRegistrationNumber,

        // 9-14 Branding
        brandPrimaryColor,
        brandSecondaryColor,
        brandAccentColor,
        invoiceFontFamily,
        invoiceLogoPosition,
        invoiceHeaderStyle,

        // 15-19 Numbering
        invoicePrefix,
        invoiceNextNumber,
        invoiceNumberPadding,
        invoiceNumberFormat,
        invoiceSequenceResetFrequency,

        // 20-23 Credit Note
        creditNotePrefix,
        creditNoteNextNumber,
        creditNoteNumberPadding,
        creditNoteNumberFormat,

        // 24-28 Defaults
        defaultPaymentTermsId,
        defaultTaxRateId,
        defaultCurrency,
        defaultTemplateId,
        defaultDueDays,

        // 29 Tax
        defaultTaxCalculation,

        // 30-32 Payment
        paymentInstructions,
        bankDetails,
        paymentGateways,

        // 33-46 Email
        emailEnabled,
        emailProvider,
        emailFromName,
        emailFromAddress,
        emailReplyTo,
        emailCc,
        emailBcc,
        emailInvoiceSubjectTemplate,
        emailInvoiceBodyTemplate,
        emailPaymentSubjectTemplate,
        emailPaymentBodyTemplate,
        emailReminderSubjectTemplate,
        emailReminderBodyTemplate,
        emailProviderConfig,

        // 47-54 WhatsApp
        whatsappEnabled,
        whatsappProvider,
        whatsappBusinessName,
        whatsappPhoneNumber,
        whatsappInvoiceTemplate,
        whatsappPaymentTemplate,
        whatsappReminderTemplate,
        whatsappProviderConfig,

        // 55-62 Sharing
        sharingEnabled,
        allowPublicInvoiceLinks,
        allowEmailSharing,
        allowWhatsappSharing,
        allowDownload,
        allowPrint,
        allowCustomerViewTracking,
        publicLinkExpiryDays,

        // 63-65 Customer Access
        requireCustomerAuthentication,
        requireInvoicePassword,
        invoiceLinkPasswordEnabled,

        // 66-79 Invoice Display
        showCompanyLogo,
        showCompanyAddress,
        showCompanyContact,
        showTaxId,
        showPaymentInstructions,
        showBankDetails,
        showTaxBreakdown,
        showDiscount,
        showShipping,
        showPoNumber,
        showCustomerTaxId,
        showCustomerAddress,
        showInvoiceNotes,
        showTermsAndConditions,

        // 80-85 Reminders
        reminderEnabled,
        reminderDaysBefore,
        reminderDaysAfter,
        reminderAfterDays,
        reminderAfterDays2,
        reminderGracePeriodDays,

        // 86-90 Features
        autoSendEnabled,
        autoPayEnabled,
        allowPartialPayments,
        allowCreditNotes,
        requireApproval,

        // 91-93 Terms & Metadata
        termsAndConditions,
        footerText,
        metadata,

        // 94 ID
        current.id,
      ]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error: "Invoice settings could not be updated",
        },
        { status: 500 }
      );
    }

    const settings = result.rows[0];

    return NextResponse.json({
      success: true,
      settings,
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