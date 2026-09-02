import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

type SendVerificationEmailResult = {
  success: boolean;
  messageId?: string;
};

let transporter: Transporter | null = null;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function getTransporter(): Transporter {
  if (transporter) {
    return transporter;
  }

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error('SMTP configuration is incomplete');
  }

  const port = Number.parseInt(process.env.SMTP_PORT || '587', 10);

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Invalid SMTP_PORT configuration');
  }

  const secure = process.env.SMTP_SECURE === 'true' || port === 465;

  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass: password,
    },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return transporter;
}

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string
): Promise<SendVerificationEmailResult> {
  const normalizedEmail = normalizeEmail(email);
  const cleanName = name.trim() || 'there';
  const cleanCode = code.trim();

  const safeName = escapeHtml(cleanName);
  const safeCode = escapeHtml(cleanCode);

  if (!normalizedEmail) {
    throw new Error('Recipient email is required');
  }

  if (!safeCode) {
    throw new Error('Verification code is required');
  }

  if (!/^\d{6}$/.test(cleanCode)) {
    throw new Error('Verification code must contain exactly 6 digits');
  }

  const smtpConfigured =
    Boolean(process.env.SMTP_HOST) &&
    Boolean(process.env.SMTP_USER) &&
    Boolean(process.env.SMTP_PASSWORD);

  if (!smtpConfigured) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SMTP is not configured. Email delivery is required in production.');
    }

    console.warn(
      `[SaMi] SMTP is not configured. Verification email was not sent to ${normalizedEmail}.`
    );

    return {
      success: false,
    };
  }

  const subject = 'SaMi — Verify your email address';

  const text = `
Welcome to SaMi, ${cleanName}!

Thanks for signing up.

Your SaMi verification code is:

${cleanCode}

This code will expire in 15 minutes.

If you did not create a SaMi account, you can safely ignore this email.

SaMi
AI-powered business workspace
  `.trim();

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>Verify your SaMi email</title>
</head>
<body style="margin:0;padding:0;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f6f7f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:32px 32px 24px;text-align:center;border-bottom:1px solid #eef0f2;">
              <div style="font-size:30px;line-height:36px;font-weight:800;color:#111827;letter-spacing:-1px;">SaMi</div>
              <div style="margin-top:5px;font-size:13px;line-height:20px;color:#6b7280;">AI-powered business workspace</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 32px 32px;">
              <h1 style="margin:0;font-size:24px;line-height:32px;font-weight:700;color:#111827;">Welcome to SaMi, ${safeName}!</h1>
              <p style="margin:14px 0 0;font-size:16px;line-height:26px;color:#4b5563;">
                Thanks for creating your SaMi account. Please verify your email address using the verification code below.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td align="center" style="padding:26px 16px;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:10px;">
                    <div style="margin-bottom:10px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.5px;color:#64748b;">VERIFICATION CODE</div>
                    <div style="display:inline-block;padding:12px 18px;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;font-family:'Courier New',Courier,monospace;font-size:34px;line-height:42px;font-weight:700;letter-spacing:8px;color:#111827;">${safeCode}</div>
                  </td>
                </tr>
              </table>
              <p style="margin:22px 0 0;font-size:14px;line-height:22px;color:#4b5563;"><strong>This code expires in 15 minutes.</strong></p>
              <p style="margin:12px 0 0;font-size:14px;line-height:22px;color:#6b7280;">For your security, never share this verification code with anyone.</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 28px;background:#fafafa;border-top:1px solid #eef0f2;text-align:center;">
              <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#6b7280;">If you didn't create a SaMi account, you can safely ignore this email.</p>
              <p style="margin:0;font-size:12px;line-height:18px;color:#9ca3af;">© ${new Date().getFullYear()} SaMi. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const mailer = getTransporter();

  const fromAddress = process.env.EMAIL_FROM?.trim() || `SaMi <${process.env.SMTP_USER}>`;

  try {
    const info = await mailer.sendMail({
      from: fromAddress,
      to: normalizedEmail,
      subject,
      text,
      html,
      headers: {
        'X-SaMi-Email-Type': 'verification',
        'X-Auto-Response-Suppress': 'All',
      },
    });

    console.log(`[SaMi] Verification email sent successfully. Message ID: ${info.messageId}`);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('[SaMi] Verification email delivery failed:', error);
    throw new Error('Verification email could not be sent');
  }
}