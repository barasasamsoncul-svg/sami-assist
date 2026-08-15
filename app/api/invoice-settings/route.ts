import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth-session";
import { getTenantDatabaseForUser } from "@/lib/tenant-db";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);

    let result = await pool.query(`SELECT * FROM invoice_settings LIMIT 1`);

    if (result.rows.length === 0) {
      const defaultResult = await pool.query(
        `
        INSERT INTO invoice_settings (
          invoice_prefix,
          invoice_next_number,
          invoice_number_padding,
          default_currency,
          default_due_days,
          reminder_enabled,
          allow_partial_payments,
          allow_credit_notes
        )
        VALUES ('INV-', 1, 6, 'USD', 30, true, true, true)
        RETURNING *
        `
      );
      return NextResponse.json(defaultResult.rows[0]);
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Settings fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load settings" },
      { status: 500 },
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { pool } = await getTenantDatabaseForUser(user.id);
    const body = await req.json();

    const current = await pool.query(`SELECT id FROM invoice_settings LIMIT 1`);

    if (current.rows.length === 0) {
      return NextResponse.json({ error: "Settings not found" }, { status: 404 });
    }

    const settingsId = current.rows[0].id;

    const result = await pool.query(
      `
      UPDATE invoice_settings SET
        company_name = $1,
        company_logo_url = $2,
        company_address = $3,
        company_email = $4,
        company_phone = $5,
        company_tax_id = $6,
        company_website = $7,
        company_registration_number = $8,
        invoice_prefix = $9,
        invoice_next_number = $10,
        invoice_number_padding = $11,
        invoice_number_format = $12,
        credit_note_prefix = $13,
        credit_note_next_number = $14,
        default_payment_terms_id = $15,
        default_tax_rate_id = $16,
        default_currency = $17,
        default_template_id = $18,
        default_due_days = $19,
        default_tax_calculation = $20,
        payment_instructions = $21,
        bank_details = $22,
        payment_gateways = $23,
        reminder_enabled = $24,
        reminder_days_before = $25,
        reminder_days_after = $26,
        reminder_after_days = $27,
        reminder_after_days_2 = $28,
        reminder_grace_period_days = $29,
        email_subject_template = $30,
        email_body_template = $31,
        terms_and_conditions = $32,
        auto_send_enabled = $33,
        auto_pay_enabled = $34,
        allow_partial_payments = $35,
        allow_credit_notes = $36,
        require_approval = $37,
        updated_at = NOW()
      WHERE id = $38
      RETURNING *
      `,
      [
        body.company_name || null,
        body.company_logo_url || null,
        body.company_address || null,
        body.company_email || null,
        body.company_phone || null,
        body.company_tax_id || null,
        body.company_website || null,
        body.company_registration_number || null,
        body.invoice_prefix || null,
        body.invoice_next_number || null,
        body.invoice_number_padding || null,
        body.invoice_number_format || null,
        body.credit_note_prefix || null,
        body.credit_note_next_number || null,
        body.default_payment_terms_id || null,
        body.default_tax_rate_id || null,
        body.default_currency || null,
        body.default_template_id || null,
        body.default_due_days || null,
        body.default_tax_calculation || null,
        body.payment_instructions || null,
        body.bank_details || null,
        body.payment_gateways || null,
        body.reminder_enabled !== undefined ? body.reminder_enabled : null,
        body.reminder_days_before || null,
        body.reminder_days_after || null,
        body.reminder_after_days || null,
        body.reminder_after_days_2 || null,
        body.reminder_grace_period_days || null,
        body.email_subject_template || null,
        body.email_body_template || null,
        body.terms_and_conditions || null,
        body.auto_send_enabled !== undefined ? body.auto_send_enabled : null,
        body.auto_pay_enabled !== undefined ? body.auto_pay_enabled : null,
        body.allow_partial_payments !== undefined ? body.allow_partial_payments : null,
        body.allow_credit_notes !== undefined ? body.allow_credit_notes : null,
        body.require_approval !== undefined ? body.require_approval : null,
        settingsId,
      ]
    );

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("Settings update error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update settings" },
      { status: 500 },
    );
  }
}