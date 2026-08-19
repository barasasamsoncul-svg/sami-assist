import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

/**
 * GET /api/invoice-settings
 *
 * Returns the invoice settings for the authenticated
 * user's tenant/business.
 */
export async function GET() {
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
    // 3. Get settings
    //
    // There should normally be one settings record
    // per tenant.
    // --------------------------------------------------
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

          -- Invoice numbering
          invoice_prefix,
          invoice_next_number,
          invoice_number_padding,
          invoice_number_format,

          credit_note_prefix,
          credit_note_next_number,

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

          -- Reminders
          reminder_enabled,
          reminder_days_before,
          reminder_days_after,
          reminder_after_days,
          reminder_after_days_2,
          reminder_grace_period_days,

          -- Email
          email_enabled,
          email_provider,
          email_from_name,
          email_from_address,
          email_reply_to,
          email_smtp_host,
          email_smtp_port,
          email_smtp_username,
          email_smtp_password,
          email_smtp_secure,

          -- WhatsApp
          whatsapp_enabled,
          whatsapp_provider,
          whatsapp_business_number,
          whatsapp_access_token,
          whatsapp_business_account_id,
          whatsapp_phone_number_id,

          -- Sharing
          share_enabled,
          share_require_password,
          share_password,
          share_expiry_days,
          share_allow_download,
          share_allow_print,

          -- Email templates
          email_subject_template,
          email_body_template,

          -- Terms
          terms_and_conditions,

          -- Feature toggles
          auto_send_enabled,
          auto_pay_enabled,
          allow_partial_payments,
          allow_credit_notes,
          require_approval,

          created_at,
          updated_at

        FROM public.invoice_settings

        ORDER BY created_at ASC

        LIMIT 1
      `
    );

    // --------------------------------------------------
    // 4. Create default settings automatically if
    //    the tenant does not have a settings record.
    // --------------------------------------------------
    if ((result.rowCount ?? 0) === 0) {
      result = await pool.query(
        `
          INSERT INTO public.invoice_settings (
            invoice_prefix,
            invoice_next_number,
            invoice_number_padding,
            invoice_number_format,

            credit_note_prefix,
            credit_note_next_number,

            default_currency,
            default_due_days,

            default_tax_calculation,

            payment_gateways,

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

            share_enabled,
            share_require_password,
            share_expiry_days,
            share_allow_download,
            share_allow_print,

            auto_send_enabled,
            auto_pay_enabled,
            allow_partial_payments,
            allow_credit_notes,
            require_approval
          )
          VALUES (
            'INV-',
            1,
            6,
            '{prefix}{number}',

            'CN-',
            1,

            'USD',
            30,

            'exclusive',

            '{}'::jsonb,

            true,
            3,
            1,
            7,
            14,
            0,

            false,
            'smtp',

            false,
            'whatsapp_cloud',

            true,
            false,
            30,
            true,
            true,

            false,
            false,
            true,
            true,
            false
          )

          RETURNING
            id,

            company_name,
            company_logo_url,
            company_address,
            company_email,
            company_phone,
            company_tax_id,
            company_website,
            company_registration_number,

            invoice_prefix,
            invoice_next_number,
            invoice_number_padding,
            invoice_number_format,

            credit_note_prefix,
            credit_note_next_number,

            default_payment_terms_id,
            default_tax_rate_id,
            default_currency,
            default_template_id,
            default_due_days,

            default_tax_calculation,

            payment_instructions,
            bank_details,
            payment_gateways,

            reminder_enabled,
            reminder_days_before,
            reminder_days_after,
            reminder_after_days,
            reminder_after_days_2,
            reminder_grace_period_days,

            email_enabled,
            email_provider,
            email_from_name,
            email_from_address,
            email_reply_to,
            email_smtp_host,
            email_smtp_port,
            email_smtp_username,
            email_smtp_password,
            email_smtp_secure,

            whatsapp_enabled,
            whatsapp_provider,
            whatsapp_business_number,
            whatsapp_access_token,
            whatsapp_business_account_id,
            whatsapp_phone_number_id,

            share_enabled,
            share_require_password,
            share_password,
            share_expiry_days,
            share_allow_download,
            share_allow_print,

            email_subject_template,
            email_body_template,

            terms_and_conditions,

            auto_send_enabled,
            auto_pay_enabled,
            allow_partial_payments,
            allow_credit_notes,
            require_approval,

            created_at,
            updated_at
        `
      );
    }

    const settings = result.rows[0];

    // --------------------------------------------------
    // 5. Never expose sensitive credentials to the
    //    frontend.
    // --------------------------------------------------
    const safeSettings = {
      ...settings,

      email_smtp_password:
        settings.email_smtp_password
          ? "********"
          : null,

      whatsapp_access_token:
        settings.whatsapp_access_token
          ? "********"
          : null,

      share_password:
        settings.share_password
          ? "********"
          : null,
    };

    return NextResponse.json({
      success: true,
      settings: safeSettings,
    });
  } catch (error) {
    console.error(
      "GET /api/invoice-settings error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to fetch invoice settings",
      },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/invoice-settings
 *
 * Updates the invoice settings.
 *
 * PUT is used because this endpoint represents the
 * complete settings resource.
 */
export async function PUT(req: NextRequest) {
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
    // 3. Parse request
    // --------------------------------------------------
    const body = await req.json();

    // --------------------------------------------------
    // 4. Find existing settings
    // --------------------------------------------------
    const existing =
      await pool.query(
        `
          SELECT *
          FROM public.invoice_settings
          ORDER BY created_at ASC
          LIMIT 1
        `
      );

    let current = existing.rows[0];

    // --------------------------------------------------
    // 5. If no settings exist, create a base record
    // --------------------------------------------------
    if (!current) {
      const created =
        await pool.query(
          `
            INSERT INTO public.invoice_settings (
              invoice_prefix,
              invoice_next_number,
              invoice_number_padding,
              invoice_number_format,

              credit_note_prefix,
              credit_note_next_number,

              default_currency,
              default_due_days,
              default_tax_calculation,

              payment_gateways,

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

              share_enabled,
              share_require_password,
              share_expiry_days,
              share_allow_download,
              share_allow_print,

              auto_send_enabled,
              auto_pay_enabled,
              allow_partial_payments,
              allow_credit_notes,
              require_approval
            )
            VALUES (
              'INV-',
              1,
              6,
              '{prefix}{number}',

              'CN-',
              1,

              'USD',
              30,
              'exclusive',

              '{}'::jsonb,

              true,
              3,
              1,
              7,
              14,
              0,

              false,
              'smtp',

              false,
              'whatsapp_cloud',

              true,
              false,
              30,
              true,
              true,

              false,
              false,
              true,
              true,
              false
            )

            RETURNING *
          `
        );

      current = created.rows[0];
    }

    // --------------------------------------------------
    // 6. Helper for detecting whether a field was
    //    explicitly supplied.
    // --------------------------------------------------
    const has = (key: string) =>
      Object.prototype.hasOwnProperty.call(
        body,
        key
      );

    // --------------------------------------------------
    // 7. Resolve values
    // --------------------------------------------------

    const companyName =
      has("company_name")
        ? body.company_name || null
        : current.company_name;

    const companyLogoUrl =
      has("company_logo_url")
        ? body.company_logo_url || null
        : current.company_logo_url;

    const companyAddress =
      has("company_address")
        ? body.company_address || null
        : current.company_address;

    const companyEmail =
      has("company_email")
        ? body.company_email || null
        : current.company_email;

    const companyPhone =
      has("company_phone")
        ? body.company_phone || null
        : current.company_phone;

    const companyTaxId =
      has("company_tax_id")
        ? body.company_tax_id || null
        : current.company_tax_id;

    const companyWebsite =
      has("company_website")
        ? body.company_website || null
        : current.company_website;

    const companyRegistrationNumber =
      has("company_registration_number")
        ? body.company_registration_number ||
          null
        : current.company_registration_number;

    // --------------------------------------------------
    // Invoice numbering
    // --------------------------------------------------

    const invoicePrefix =
      has("invoice_prefix")
        ? String(body.invoice_prefix ?? "")
        : current.invoice_prefix;

    const invoiceNextNumber =
      has("invoice_next_number")
        ? Number(body.invoice_next_number)
        : current.invoice_next_number;

    const invoiceNumberPadding =
      has("invoice_number_padding")
        ? Number(body.invoice_number_padding)
        : current.invoice_number_padding;

    const invoiceNumberFormat =
      has("invoice_number_format")
        ? String(
            body.invoice_number_format ?? ""
          )
        : current.invoice_number_format;

    const creditNotePrefix =
      has("credit_note_prefix")
        ? String(
            body.credit_note_prefix ?? ""
          )
        : current.credit_note_prefix;

    const creditNoteNextNumber =
      has("credit_note_next_number")
        ? Number(body.credit_note_next_number)
        : current.credit_note_next_number;

    // --------------------------------------------------
    // Defaults
    // --------------------------------------------------

    const defaultPaymentTermsId =
      has("default_payment_terms_id")
        ? body.default_payment_terms_id ||
          null
        : current.default_payment_terms_id;

    const defaultTaxRateId =
      has("default_tax_rate_id")
        ? body.default_tax_rate_id || null
        : current.default_tax_rate_id;

    const defaultCurrency =
      has("default_currency")
        ? String(
            body.default_currency ?? "USD"
          ).toUpperCase()
        : current.default_currency;

    const defaultTemplateId =
      has("default_template_id")
        ? body.default_template_id || null
        : current.default_template_id;

    const defaultDueDays =
      has("default_due_days")
        ? Number(body.default_due_days)
        : current.default_due_days;

    const defaultTaxCalculation =
      has("default_tax_calculation")
        ? body.default_tax_calculation
        : current.default_tax_calculation;

    // --------------------------------------------------
    // Payment
    // --------------------------------------------------

    const paymentInstructions =
      has("payment_instructions")
        ? body.payment_instructions || null
        : current.payment_instructions;

    const bankDetails =
      has("bank_details")
        ? body.bank_details ?? null
        : current.bank_details;

    const paymentGateways =
      has("payment_gateways")
        ? body.payment_gateways ?? {}
        : current.payment_gateways;

    // --------------------------------------------------
    // Reminders
    // --------------------------------------------------

    const reminderEnabled =
      has("reminder_enabled")
        ? Boolean(body.reminder_enabled)
        : current.reminder_enabled;

    const reminderDaysBefore =
      has("reminder_days_before")
        ? Number(body.reminder_days_before)
        : current.reminder_days_before;

    const reminderDaysAfter =
      has("reminder_days_after")
        ? Number(body.reminder_days_after)
        : current.reminder_days_after;

    const reminderAfterDays =
      has("reminder_after_days")
        ? Number(body.reminder_after_days)
        : current.reminder_after_days;

    const reminderAfterDays2 =
      has("reminder_after_days_2")
        ? Number(body.reminder_after_days_2)
        : current.reminder_after_days_2;

    const reminderGracePeriodDays =
      has("reminder_grace_period_days")
        ? Number(
            body.reminder_grace_period_days
          )
        : current.reminder_grace_period_days;

    // --------------------------------------------------
    // Email
    // --------------------------------------------------

    const emailEnabled =
      has("email_enabled")
        ? Boolean(body.email_enabled)
        : current.email_enabled;

    const emailProvider =
      has("email_provider")
        ? body.email_provider || "smtp"
        : current.email_provider;

    const emailFromName =
      has("email_from_name")
        ? body.email_from_name || null
        : current.email_from_name;

    const emailFromAddress =
      has("email_from_address")
        ? body.email_from_address || null
        : current.email_from_address;

    const emailReplyTo =
      has("email_reply_to")
        ? body.email_reply_to || null
        : current.email_reply_to;

    const emailSmtpHost =
      has("email_smtp_host")
        ? body.email_smtp_host || null
        : current.email_smtp_host;

    const emailSmtpPort =
      has("email_smtp_port")
        ? body.email_smtp_port === null ||
          body.email_smtp_port === ""
          ? null
          : Number(body.email_smtp_port)
        : current.email_smtp_port;

    const emailSmtpUsername =
      has("email_smtp_username")
        ? body.email_smtp_username || null
        : current.email_smtp_username;

    /*
     * Important:
     *
     * The frontend receives "********" for an existing
     * password. If the user sends that value back,
     * we preserve the existing password.
     */
    const emailSmtpPassword =
      has("email_smtp_password")
        ? body.email_smtp_password ===
          "********"
          ? current.email_smtp_password
          : body.email_smtp_password ||
            null
        : current.email_smtp_password;

    const emailSmtpSecure =
      has("email_smtp_secure")
        ? Boolean(body.email_smtp_secure)
        : current.email_smtp_secure;

    // --------------------------------------------------
    // WhatsApp
    // --------------------------------------------------

    const whatsappEnabled =
      has("whatsapp_enabled")
        ? Boolean(body.whatsapp_enabled)
        : current.whatsapp_enabled;

    const whatsappProvider =
      has("whatsapp_provider")
        ? body.whatsapp_provider ||
          "whatsapp_cloud"
        : current.whatsapp_provider;

    const whatsappBusinessNumber =
      has("whatsapp_business_number")
        ? body.whatsapp_business_number ||
          null
        : current.whatsapp_business_number;

    const whatsappAccessToken =
      has("whatsapp_access_token")
        ? body.whatsapp_access_token ===
          "********"
          ? current.whatsapp_access_token
          : body.whatsapp_access_token ||
            null
        : current.whatsapp_access_token;

    const whatsappBusinessAccountId =
      has("whatsapp_business_account_id")
        ? body.whatsapp_business_account_id ||
          null
        : current.whatsapp_business_account_id;

    const whatsappPhoneNumberId =
      has("whatsapp_phone_number_id")
        ? body.whatsapp_phone_number_id ||
          null
        : current.whatsapp_phone_number_id;

    // --------------------------------------------------
    // Sharing
    // --------------------------------------------------

    const shareEnabled =
      has("share_enabled")
        ? Boolean(body.share_enabled)
        : current.share_enabled;

    const shareRequirePassword =
      has("share_require_password")
        ? Boolean(
            body.share_require_password
          )
        : current.share_require_password;

    const sharePassword =
      has("share_password")
        ? body.share_password ===
          "********"
          ? current.share_password
          : body.share_password || null
        : current.share_password;

    const shareExpiryDays =
      has("share_expiry_days")
        ? Number(body.share_expiry_days)
        : current.share_expiry_days;

    const shareAllowDownload =
      has("share_allow_download")
        ? Boolean(
            body.share_allow_download
          )
        : current.share_allow_download;

    const shareAllowPrint =
      has("share_allow_print")
        ? Boolean(body.share_allow_print)
        : current.share_allow_print;

    // --------------------------------------------------
    // Email templates
    // --------------------------------------------------

    const emailSubjectTemplate =
      has("email_subject_template")
        ? body.email_subject_template ||
          null
        : current.email_subject_template;

    const emailBodyTemplate =
      has("email_body_template")
        ? body.email_body_template || null
        : current.email_body_template;

    // --------------------------------------------------
    // Terms
    // --------------------------------------------------

    const termsAndConditions =
      has("terms_and_conditions")
        ? body.terms_and_conditions || null
        : current.terms_and_conditions;

    // --------------------------------------------------
    // Feature toggles
    // --------------------------------------------------

    const autoSendEnabled =
      has("auto_send_enabled")
        ? Boolean(body.auto_send_enabled)
        : current.auto_send_enabled;

    const autoPayEnabled =
      has("auto_pay_enabled")
        ? Boolean(body.auto_pay_enabled)
        : current.auto_pay_enabled;

    const allowPartialPayments =
      has("allow_partial_payments")
        ? Boolean(
            body.allow_partial_payments
          )
        : current.allow_partial_payments;

    const allowCreditNotes =
      has("allow_credit_notes")
        ? Boolean(body.allow_credit_notes)
        : current.allow_credit_notes;

    const requireApproval =
      has("require_approval")
        ? Boolean(body.require_approval)
        : current.require_approval;

    // --------------------------------------------------
    // 8. Basic validation
    // --------------------------------------------------

    if (
      !Number.isInteger(invoiceNextNumber) ||
      invoiceNextNumber < 1
    ) {
      return NextResponse.json(
        {
          error:
            "invoice_next_number must be a positive integer",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(invoiceNumberPadding) ||
      invoiceNumberPadding < 1 ||
      invoiceNumberPadding > 20
    ) {
      return NextResponse.json(
        {
          error:
            "invoice_number_padding must be between 1 and 20",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(creditNoteNextNumber) ||
      creditNoteNextNumber < 1
    ) {
      return NextResponse.json(
        {
          error:
            "credit_note_next_number must be a positive integer",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(defaultDueDays) ||
      defaultDueDays < 0
    ) {
      return NextResponse.json(
        {
          error:
            "default_due_days must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    if (
      !["exclusive", "inclusive"].includes(
        defaultTaxCalculation
      )
    ) {
      return NextResponse.json(
        {
          error:
            "default_tax_calculation must be exclusive or inclusive",
        },
        { status: 400 }
      );
    }

    if (
      !Number.isInteger(shareExpiryDays) ||
      shareExpiryDays < 0
    ) {
      return NextResponse.json(
        {
          error:
            "share_expiry_days must be a non-negative integer",
        },
        { status: 400 }
      );
    }

    // --------------------------------------------------
    // 9. Update settings
    // --------------------------------------------------
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

          -- Numbering
          invoice_prefix = $9,
          invoice_next_number = $10,
          invoice_number_padding = $11,
          invoice_number_format = $12,

          credit_note_prefix = $13,
          credit_note_next_number = $14,

          -- Defaults
          default_payment_terms_id = $15,
          default_tax_rate_id = $16,
          default_currency = $17,
          default_template_id = $18,
          default_due_days = $19,

          -- Tax
          default_tax_calculation = $20,

          -- Payment
          payment_instructions = $21,
          bank_details = $22,
          payment_gateways = $23,

          -- Reminders
          reminder_enabled = $24,
          reminder_days_before = $25,
          reminder_days_after = $26,
          reminder_after_days = $27,
          reminder_after_days_2 = $28,
          reminder_grace_period_days = $29,

          -- Email
          email_enabled = $30,
          email_provider = $31,
          email_from_name = $32,
          email_from_address = $33,
          email_reply_to = $34,
          email_smtp_host = $35,
          email_smtp_port = $36,
          email_smtp_username = $37,
          email_smtp_password = $38,
          email_smtp_secure = $39,

          -- WhatsApp
          whatsapp_enabled = $40,
          whatsapp_provider = $41,
          whatsapp_business_number = $42,
          whatsapp_access_token = $43,
          whatsapp_business_account_id = $44,
          whatsapp_phone_number_id = $45,

          -- Sharing
          share_enabled = $46,
          share_require_password = $47,
          share_password = $48,
          share_expiry_days = $49,
          share_allow_download = $50,
          share_allow_print = $51,

          -- Email templates
          email_subject_template = $52,
          email_body_template = $53,

          -- Terms
          terms_and_conditions = $54,

          -- Features
          auto_send_enabled = $55,
          auto_pay_enabled = $56,
          allow_partial_payments = $57,
          allow_credit_notes = $58,
          require_approval = $59,

          updated_at = NOW()

        WHERE id = $60

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

        // 9-14 Numbering
        invoicePrefix,
        invoiceNextNumber,
        invoiceNumberPadding,
        invoiceNumberFormat,
        creditNotePrefix,
        creditNoteNextNumber,

        // 15-19 Defaults
        defaultPaymentTermsId,
        defaultTaxRateId,
        defaultCurrency,
        defaultTemplateId,
        defaultDueDays,

        // 20 Tax
        defaultTaxCalculation,

        // 21-23 Payment
        paymentInstructions,
        bankDetails,
        paymentGateways,

        // 24-29 Reminders
        reminderEnabled,
        reminderDaysBefore,
        reminderDaysAfter,
        reminderAfterDays,
        reminderAfterDays2,
        reminderGracePeriodDays,

        // 30-39 Email
        emailEnabled,
        emailProvider,
        emailFromName,
        emailFromAddress,
        emailReplyTo,
        emailSmtpHost,
        emailSmtpPort,
        emailSmtpUsername,
        emailSmtpPassword,
        emailSmtpSecure,

        // 40-45 WhatsApp
        whatsappEnabled,
        whatsappProvider,
        whatsappBusinessNumber,
        whatsappAccessToken,
        whatsappBusinessAccountId,
        whatsappPhoneNumberId,

        // 46-51 Sharing
        shareEnabled,
        shareRequirePassword,
        sharePassword,
        shareExpiryDays,
        shareAllowDownload,
        shareAllowPrint,

        // 52-53 Email templates
        emailSubjectTemplate,
        emailBodyTemplate,

        // 54 Terms
        termsAndConditions,

        // 55-59 Features
        autoSendEnabled,
        autoPayEnabled,
        allowPartialPayments,
        allowCreditNotes,
        requireApproval,

        // 60 ID
        current.id,
      ]
    );

    if ((result.rowCount ?? 0) === 0) {
      return NextResponse.json(
        {
          error:
            "Invoice settings could not be updated",
        },
        { status: 500 }
      );
    }

    const settings =
      result.rows[0];

    // --------------------------------------------------
    // 10. Remove sensitive values from response
    // --------------------------------------------------
    const safeSettings = {
      ...settings,

      email_smtp_password:
        settings.email_smtp_password
          ? "********"
          : null,

      whatsapp_access_token:
        settings.whatsapp_access_token
          ? "********"
          : null,

      share_password:
        settings.share_password
          ? "********"
          : null,
    };

    return NextResponse.json({
      success: true,
      settings: safeSettings,
    });
  } catch (error) {
    console.error(
      "PUT /api/invoice-settings error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Failed to update invoice settings",
      },
      { status: 500 }
    );
  }
}