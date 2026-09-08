import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

import path from 'path';

import {
  readFile,
} from 'fs/promises';

/* ============================================================
   TYPES
   ============================================================ */

export type SendVerificationEmailResult = {
  success: boolean;

  messageId?: string;
};

export type VerificationEmailOptions = {
  expiresInMinutes?: number;

  verifyUrl?:
    | string
    | null;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_EXPIRY_MINUTES =
  15;

const MAX_EMAIL_LENGTH =
  254;

const MAX_NAME_LENGTH =
  120;

const SAMI_EMAIL_LOGO_CID =
  'sami-email-logo';

const SAMI_EMAIL_LOGO_PATH =
  path.join(
    process.cwd(),
    'public',
    'brand',
    'sami-email-logo.png'
  );

/* ============================================================
   TRANSPORTER
   ============================================================ */

let transporter:
  Transporter | null =
  null;

/*
 * Cache the logo after the first filesystem read.
 *
 * That avoids reading the PNG from disk for every email.
 */
let cachedLogo:
  Buffer | null =
  null;

let logoLoadAttempted =
  false;

/* ============================================================
   HTML
   ============================================================ */

function escapeHtml(
  value: string
): string {
  return value
    .replace(
      /&/g,
      '&amp;'
    )
    .replace(
      /</g,
      '&lt;'
    )
    .replace(
      />/g,
      '&gt;'
    )
    .replace(
      /"/g,
      '&quot;'
    )
    .replace(
      /'/g,
      '&#039;'
    );
}

/* ============================================================
   EMAIL
   ============================================================ */

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  email: string
): boolean {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

/* ============================================================
   NAME
   ============================================================ */

function normalizeName(
  value: string
): string {
  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        ' '
      );

  if (!normalized) {
    return 'there';
  }

  return normalized.slice(
    0,
    MAX_NAME_LENGTH
  );
}

/* ============================================================
   EXPIRY
   ============================================================ */

function normalizeExpiryMinutes(
  value:
    | number
    | undefined
): number {
  if (
    value === undefined
  ) {
    return DEFAULT_EXPIRY_MINUTES;
  }

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 60
  ) {
    throw new Error(
      'Invalid verification email expiry.'
    );
  }

  return value;
}

/* ============================================================
   URL
   ============================================================ */

function normalizeHttpUrl(
  value:
    | string
    | null
    | undefined
): string | null {
  if (!value) {
    return null;
  }

  try {
    const url =
      new URL(
        value.trim()
      );

    if (
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

/* ============================================================
   LOGO
   ============================================================ */

async function getEmailLogo():
  Promise<Buffer | null> {
  if (
    cachedLogo
  ) {
    return cachedLogo;
  }

  if (
    logoLoadAttempted
  ) {
    return null;
  }

  logoLoadAttempted =
    true;

  try {
    cachedLogo =
      await readFile(
        SAMI_EMAIL_LOGO_PATH
      );

    return cachedLogo;
  } catch (error) {
    console.error(
      '[SaMi] Email logo could not be loaded:',
      error
    );

    return null;
  }
}

function buildBrandHeader(
  hasLogo: boolean
): string {
  if (
    hasLogo
  ) {
    return `
      <img
        src="cid:${SAMI_EMAIL_LOGO_CID}"
        width="240"
        alt="SaMi — AI Powered Business Workspace"
        style="
          display:block;
          width:240px;
          max-width:100%;
          height:auto;
          margin:0 auto;
          border:0;
          outline:none;
          text-decoration:none;
        "
      >
    `.trim();
  }

  /*
   * Safe fallback if the PNG cannot be loaded.
   */
  return `
    <div
      style="
        font-size:30px;
        line-height:36px;
        font-weight:800;
        letter-spacing:-1px;
        color:#163d8f;
      "
    >
      SaMi
    </div>

    <div
      style="
        margin-top:5px;
        font-size:12px;
        line-height:18px;
        font-weight:600;
        letter-spacing:1.7px;
        text-transform:uppercase;
        color:#64748b;
      "
    >
      AI Powered Business Workspace
    </div>
  `.trim();
}

/* ============================================================
   SMTP
   ============================================================ */

function isSmtpConfigured():
  boolean {
  return (
    Boolean(
      process.env
        .SMTP_HOST
        ?.trim()
    ) &&
    Boolean(
      process.env
        .SMTP_USER
        ?.trim()
    ) &&
    Boolean(
      process.env
        .SMTP_PASSWORD
    )
  );
}

function getTransporter():
  Transporter {
  if (
    transporter
  ) {
    return transporter;
  }

  const host =
    process.env
      .SMTP_HOST
      ?.trim();

  const user =
    process.env
      .SMTP_USER
      ?.trim();

  const password =
    process.env
      .SMTP_PASSWORD;

  if (
    !host ||
    !user ||
    !password
  ) {
    throw new Error(
      'SMTP configuration is incomplete.'
    );
  }

  const port =
    Number.parseInt(
      process.env
        .SMTP_PORT ||
        '587',
      10
    );

  if (
    !Number.isInteger(
      port
    ) ||
    port <= 0 ||
    port > 65535
  ) {
    throw new Error(
      'Invalid SMTP_PORT configuration.'
    );
  }

  const secure =
    process.env
      .SMTP_SECURE ===
      'true' ||
    port === 465;

  transporter =
    nodemailer.createTransport({
      host,

      port,

      secure,

      auth: {
        user,

        pass:
          password,
      },

      connectionTimeout:
        10_000,

      greetingTimeout:
        10_000,

      socketTimeout:
        20_000,
    });

  return transporter;
}

/* ============================================================
   SENDER
   ============================================================ */

function getFromAddress():
  string {
  const configuredFrom =
    process.env
      .EMAIL_FROM
      ?.trim();

  if (
    configuredFrom
  ) {
    return configuredFrom;
  }

  const smtpUser =
    process.env
      .SMTP_USER
      ?.trim();

  if (
    !smtpUser
  ) {
    throw new Error(
      'Email sender is not configured.'
    );
  }

  return `SaMi <${smtpUser}>`;
}

function getReplyTo():
  string | undefined {
  const replyTo =
    process.env
      .EMAIL_REPLY_TO
      ?.trim();

  if (
    !replyTo
  ) {
    return undefined;
  }

  const normalized =
    normalizeEmail(
      replyTo
    );

  if (
    !isValidEmail(
      normalized
    )
  ) {
    console.warn(
      '[SaMi] EMAIL_REPLY_TO is invalid and will be ignored.'
    );

    return undefined;
  }

  return normalized;
}

/* ============================================================
   SEND VERIFICATION EMAIL
   ============================================================ */

export async function sendVerificationEmail(
  email: string,
  code: string,
  name: string,
  options:
    VerificationEmailOptions = {}
): Promise<
  SendVerificationEmailResult
> {
  /* ==========================================================
     1. NORMALIZE
     ========================================================== */

  const normalizedEmail =
    normalizeEmail(
      email
    );

  const cleanName =
    normalizeName(
      name
    );

  const cleanCode =
    code.trim();

  const expiresInMinutes =
    normalizeExpiryMinutes(
      options
        .expiresInMinutes
    );

  const verifyUrl =
    normalizeHttpUrl(
      options
        .verifyUrl
    );

  /* ==========================================================
     2. VALIDATE
     ========================================================== */

  if (
    !isValidEmail(
      normalizedEmail
    )
  ) {
    throw new Error(
      'A valid recipient email is required.'
    );
  }

  if (
    !/^\d{6}$/.test(
      cleanCode
    )
  ) {
    throw new Error(
      'Verification code must contain exactly 6 digits.'
    );
  }

  /* ==========================================================
     3. SMTP
     ========================================================== */

  if (
    !isSmtpConfigured()
  ) {
    if (
      process.env.NODE_ENV ===
      'production'
    ) {
      throw new Error(
        'SMTP is not configured. Email delivery is required in production.'
      );
    }

    console.warn(
      '[SaMi] SMTP is not configured. Verification email was not delivered.'
    );

    return {
      success: false,
    };
  }

  /* ==========================================================
     4. LOAD SAMI LOGO
     ========================================================== */

  const logo =
    await getEmailLogo();

  const hasLogo =
    Boolean(
      logo
    );

  /* ==========================================================
     5. SAFE VALUES
     ========================================================== */

  const safeName =
    escapeHtml(
      cleanName
    );

  const safeCode =
    escapeHtml(
      cleanCode
    );

  const safeVerifyUrl =
    verifyUrl
      ? escapeHtml(
          verifyUrl
        )
      : null;

  const year =
    new Date()
      .getFullYear();

  /* ==========================================================
     6. SUBJECT
     ========================================================== */

  const subject =
    'Verify your email address — SaMi';

  /* ==========================================================
     7. TEXT EMAIL
     ========================================================== */

  const textParts = [
    `Welcome to SaMi, ${cleanName}!`,

    '',

    'Thanks for creating your SaMi account.',

    '',

    'Your verification code is:',

    '',

    cleanCode,

    '',

    `This code expires in ${expiresInMinutes} minute${
      expiresInMinutes === 1
        ? ''
        : 's'
    }.`,

    '',

    'For your security, never share this verification code with anyone.',
  ];

  if (
    verifyUrl
  ) {
    textParts.push(
      '',
      'Open SaMi to verify your email:',
      verifyUrl
    );
  }

  textParts.push(
    '',

    'If you did not create a SaMi account, you can safely ignore this email.',

    '',

    'SaMi',

    'AI Powered Business Workspace'
  );

  const text =
    textParts.join(
      '\n'
    );

  /* ==========================================================
     8. OPTIONAL BUTTON
     ========================================================== */

  const verifyButton =
    safeVerifyUrl
      ? `
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          align="center"
          style="
            margin:28px auto 0;
          "
        >

          <tr>

            <td
              align="center"
              bgcolor="#163d8f"
              style="
                border-radius:10px;
                background:#163d8f;
              "
            >

              <a
                href="${safeVerifyUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="
                  display:inline-block;
                  padding:13px 24px;
                  border-radius:10px;
                  font-size:14px;
                  line-height:20px;
                  font-weight:700;
                  color:#ffffff;
                  text-decoration:none;
                "
              >
                Verify email in SaMi
              </a>

            </td>

          </tr>

        </table>
      `
      : '';

  /* ==========================================================
     9. HTML EMAIL
     ========================================================== */

  const html = `
<!DOCTYPE html>

<html lang="en">

<head>

  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <meta
    name="color-scheme"
    content="light"
  >

  <meta
    name="supported-color-schemes"
    content="light"
  >

  <title>
    Verify your SaMi email
  </title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f3f6fb;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
    -webkit-text-size-adjust:100%;
  "
>

  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
      color:transparent;
    "
  >
    Your SaMi verification code is ${safeCode}.
  </div>

  <table
    role="presentation"
    width="100%"
    cellpadding="0"
    cellspacing="0"
    border="0"
    style="
      width:100%;
      background:#f3f6fb;
    "
  >

    <tr>

      <td
        align="center"
        style="
          padding:40px 16px;
        "
      >

        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            max-width:600px;
            background:#ffffff;
            border:1px solid #e5eaf2;
            border-radius:18px;
            overflow:hidden;
          "
        >

          <!-- BRAND -->

          <tr>

            <td
              align="center"
              style="
                padding:24px 32px 20px;
                border-bottom:1px solid #edf1f6;
                background:#ffffff;
              "
            >

              ${buildBrandHeader(
                hasLogo
              )}

            </td>

          </tr>

          <!-- CONTENT -->

          <tr>

            <td
              style="
                padding:36px 32px 32px;
              "
            >

              <div
                style="
                  margin:0 0 8px;
                  font-size:12px;
                  line-height:18px;
                  font-weight:700;
                  letter-spacing:1.3px;
                  color:#315fb5;
                  text-transform:uppercase;
                "
              >
                Email verification
              </div>

              <h1
                style="
                  margin:0;
                  font-size:25px;
                  line-height:34px;
                  font-weight:700;
                  letter-spacing:-0.4px;
                  color:#0f172a;
                "
              >
                Welcome to SaMi, ${safeName}
              </h1>

              <p
                style="
                  margin:14px 0 0;
                  font-size:15px;
                  line-height:25px;
                  color:#475569;
                "
              >
                Verify your email address to finish securing
                your SaMi account. Enter the code below on the
                verification screen.
              </p>

              <!-- CODE -->

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin-top:28px;
                "
              >

                <tr>

                  <td
                    align="center"
                    style="
                      padding:26px 16px;
                      background:#f6f9fe;
                      border:1px solid #dbe5f5;
                      border-radius:14px;
                    "
                  >

                    <div
                      style="
                        margin-bottom:10px;
                        font-size:11px;
                        line-height:18px;
                        font-weight:700;
                        letter-spacing:1.7px;
                        color:#64748b;
                      "
                    >
                      VERIFICATION CODE
                    </div>

                    <div
                      style="
                        display:inline-block;
                        padding:12px 16px 12px 22px;
                        background:#ffffff;
                        border:1px solid #dbe3ef;
                        border-radius:10px;
                        font-family:'Courier New',Courier,monospace;
                        font-size:32px;
                        line-height:40px;
                        font-weight:700;
                        letter-spacing:8px;
                        color:#0f172a;
                      "
                    >
                      ${safeCode}
                    </div>

                  </td>

                </tr>

              </table>

              ${verifyButton}

              <!-- SECURITY -->

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin-top:26px;
                "
              >

                <tr>

                  <td
                    style="
                      padding:14px 16px;
                      background:#f8fafc;
                      border-left:3px solid #315fb5;
                      border-radius:6px;
                    "
                  >

                    <p
                      style="
                        margin:0;
                        font-size:13px;
                        line-height:21px;
                        color:#475569;
                      "
                    >

                      <strong
                        style="
                          color:#0f172a;
                        "
                      >
                        This code expires in
                        ${expiresInMinutes}
                        minute${
                          expiresInMinutes === 1
                            ? ''
                            : 's'
                        }.
                      </strong>

                      For your security, never share this
                      verification code with anyone.

                    </p>

                  </td>

                </tr>

              </table>

            </td>

          </tr>

          <!-- FOOTER -->

          <tr>

            <td
              align="center"
              style="
                padding:24px 32px 28px;
                background:#fafbfd;
                border-top:1px solid #edf1f6;
              "
            >

              <p
                style="
                  margin:0;
                  font-size:13px;
                  line-height:20px;
                  color:#64748b;
                "
              >
                If you didn't create a SaMi account, you can
                safely ignore this email.
              </p>

              <p
                style="
                  margin:12px 0 0;
                  font-size:12px;
                  line-height:18px;
                  color:#94a3b8;
                "
              >
                © ${year} SaMi. All rights reserved.
              </p>

            </td>

          </tr>

        </table>

      </td>

    </tr>

  </table>

</body>

</html>
  `.trim();

  /* ==========================================================
     10. SEND
     ========================================================== */

  const mailer =
    getTransporter();

  try {
    const info =
      await mailer.sendMail({
        from:
          getFromAddress(),

        to:
          normalizedEmail,

        replyTo:
          getReplyTo(),

        subject,

        text,

        html,

        /*
         * The logo is embedded directly into the email.
         *
         * No public domain is required.
         */
        attachments:
          logo
            ? [
                {
                  filename:
                    'sami-email-logo.png',

                  content:
                    logo,

                  cid:
                    SAMI_EMAIL_LOGO_CID,

                  contentType:
                    'image/png',

                  contentDisposition:
                    'inline',
                },
              ]
            : undefined,

        headers: {
          'X-SaMi-Email-Type':
            'email-verification',

          'X-Auto-Response-Suppress':
            'All',

          'Auto-Submitted':
            'auto-generated',
        },
      });

    console.log(
      '[SaMi] Verification email delivered successfully.',
      {
        messageId:
          info.messageId,
      }
    );

    return {
      success: true,

      messageId:
        info.messageId,
    };
  } catch (error) {
    console.error(
      '[SaMi] Verification email delivery failed:',
      error
    );

    throw new Error(
      'Verification email could not be sent.'
    );
  }
}