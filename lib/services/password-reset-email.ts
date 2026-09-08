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

export interface SendPasswordResetEmailInput {
  email: string;

  firstName?:
    | string
    | null;

  resetUrl: string;

  expiresInMinutes?: number;
}

export interface SendPasswordResetEmailResult {
  success: boolean;

  provider: 'smtp';

  messageId?: string;

  error?: string;
}

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_RESET_EXPIRY_MINUTES =
  30;

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
   CACHES
   ============================================================ */

let transporter:
  Transporter | null =
  null;

let cachedLogo:
  Buffer | null =
  null;

let logoLoadAttempted =
  false;

/* ============================================================
   HTML ESCAPING
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

function normalizeFirstName(
  value:
    | string
    | null
    | undefined
): string {
  if (
    typeof value !==
    'string'
  ) {
    return 'there';
  }

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
    return DEFAULT_RESET_EXPIRY_MINUTES;
  }

  if (
    !Number.isInteger(value) ||
    value < 1 ||
    value > 120
  ) {
    throw new Error(
      'Invalid password reset expiry.'
    );
  }

  return value;
}

/* ============================================================
   RESET URL
   ============================================================ */

function normalizeResetUrl(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      'Password reset URL is required.'
    );
  }

  let resetUrl:
    URL;

  try {
    resetUrl =
      new URL(trimmed);
  } catch {
    throw new Error(
      'Password reset URL is invalid.'
    );
  }

  if (
    resetUrl.protocol !==
      'http:' &&
    resetUrl.protocol !==
      'https:'
  ) {
    throw new Error(
      'Password reset URL must use HTTP or HTTPS.'
    );
  }

  /*
   * When SaMi has an authoritative application URL configured,
   * prevent password-reset links from pointing to another host.
   */
  const configuredAppUrl =
    process.env.APP_URL ||
    process.env
      .NEXT_PUBLIC_APP_URL;

  if (
    configuredAppUrl
  ) {
    let appUrl:
      URL;

    try {
      appUrl =
        new URL(
          configuredAppUrl
        );
    } catch {
      throw new Error(
        'SaMi application URL is invalid.'
      );
    }

    if (
      resetUrl.origin !==
      appUrl.origin
    ) {
      throw new Error(
        'Password reset URL does not belong to SaMi.'
      );
    }
  }

  return resetUrl.toString();
}

/* ============================================================
   SMTP
   ============================================================ */

function getRequiredEnv(
  name: string
): string {
  const value =
    process.env[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `${name} is required.`
    );
  }

  return value;
}

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
    getRequiredEnv(
      'SMTP_HOST'
    );

  const user =
    getRequiredEnv(
      'SMTP_USER'
    );

  const pass =
    getRequiredEnv(
      'SMTP_PASSWORD'
    );

  const port =
    Number.parseInt(
      process.env
        .SMTP_PORT ||
        '587',
      10
    );

  if (
    !Number.isInteger(port) ||
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

        pass,
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

function getSenderEmail():
  string {
  const configured =
    process.env
      .EMAIL_FROM
      ?.trim();

  if (
    configured
  ) {
    return configured;
  }

  const smtpUser =
    getRequiredEnv(
      'SMTP_USER'
    );

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
   SAMI LOGO
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
      '[SaMi] Password-reset email logo could not be loaded:',
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
   * Fallback only if the image cannot be read.
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
   TEXT EMAIL
   ============================================================ */

function buildTextEmail({
  firstName,
  resetUrl,
  expiresInMinutes,
}: {
  firstName: string;

  resetUrl: string;

  expiresInMinutes:
    number;
}): string {
  return [
    `Hello ${firstName},`,

    '',

    'We received a request to reset the password for your SaMi account.',

    '',

    'Reset your password using this secure link:',

    '',

    resetUrl,

    '',

    `This link expires in ${expiresInMinutes} minute${
      expiresInMinutes === 1
        ? ''
        : 's'
    }.`,

    '',

    'For your security, this reset link can only be used once.',

    '',

    'If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.',

    '',

    'SaMi',

    'AI Powered Business Workspace',
  ].join('\n');
}

/* ============================================================
   HTML EMAIL
   ============================================================ */

function buildHtmlEmail({
  firstName,
  resetUrl,
  expiresInMinutes,
  hasLogo,
}: {
  firstName: string;

  resetUrl: string;

  expiresInMinutes:
    number;

  hasLogo: boolean;
}): string {
  const safeFirstName =
    escapeHtml(
      firstName
    );

  const safeResetUrl =
    escapeHtml(
      resetUrl
    );

  const year =
    new Date()
      .getFullYear();

  return `
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
    Reset your SaMi password
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

  <!-- PREHEADER -->

  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
      color:transparent;
    "
  >
    Reset your SaMi password. This link expires in ${expiresInMinutes} minutes.
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

          <!-- ================================================
               SAMI BRAND
               ================================================ -->

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

          <!-- ================================================
               CONTENT
               ================================================ -->

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
                  text-transform:uppercase;
                  color:#315fb5;
                "
              >
                Account security
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
                Reset your password
              </h1>

              <p
                style="
                  margin:14px 0 0;
                  font-size:15px;
                  line-height:25px;
                  color:#475569;
                "
              >
                Hello ${safeFirstName},
              </p>

              <p
                style="
                  margin:10px 0 0;
                  font-size:15px;
                  line-height:25px;
                  color:#475569;
                "
              >
                We received a request to reset the password for
                your SaMi account. Use the button below to create
                a new password.
              </p>

              <!-- =============================================
                   RESET BUTTON
                   ============================================= -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  margin:28px 0;
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
                      href="${safeResetUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display:inline-block;
                        padding:14px 24px;
                        border-radius:10px;
                        font-size:14px;
                        line-height:20px;
                        font-weight:700;
                        color:#ffffff;
                        text-decoration:none;
                      "
                    >
                      Reset password
                    </a>

                  </td>

                </tr>

              </table>

              <!-- =============================================
                   SECURITY NOTICE
                   ============================================= -->

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
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
                        This link expires in ${expiresInMinutes}
                        minute${
                          expiresInMinutes === 1
                            ? ''
                            : 's'
                        }.
                      </strong>

                      For your security, the reset link can only
                      be used once.

                    </p>

                  </td>

                </tr>

              </table>

              <!-- =============================================
                   FALLBACK LINK
                   ============================================= -->

              <p
                style="
                  margin:22px 0 0;
                  font-size:13px;
                  line-height:21px;
                  color:#64748b;
                "
              >
                If the button doesn't work, copy and paste this
                address into your browser:
              </p>

              <p
                style="
                  margin:8px 0 0;
                  font-size:12px;
                  line-height:19px;
                  color:#315fb5;
                  word-break:break-all;
                "
              >
                ${safeResetUrl}
              </p>

            </td>

          </tr>

          <!-- ================================================
               FOOTER
               ================================================ -->

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
                If you didn't request this password reset, you
                can safely ignore this email. Your password will
                remain unchanged.
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
}

/* ============================================================
   SEND PASSWORD RESET EMAIL
   ============================================================ */

export async function sendPasswordResetEmail(
  input:
    SendPasswordResetEmailInput
): Promise<
  SendPasswordResetEmailResult
> {
  try {
    /* ========================================================
       1. NORMALIZE
       ======================================================== */

    const email =
      normalizeEmail(
        input.email
      );

    const firstName =
      normalizeFirstName(
        input.firstName
      );

    const resetUrl =
      normalizeResetUrl(
        input.resetUrl
      );

    const expiresInMinutes =
      normalizeExpiryMinutes(
        input.expiresInMinutes
      );

    /* ========================================================
       2. VALIDATE EMAIL
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      throw new Error(
        'A valid recipient email is required.'
      );
    }

    /* ========================================================
       3. SMTP CONFIGURATION
       ======================================================== */

    if (
      !isSmtpConfigured()
    ) {
      if (
        process.env.NODE_ENV ===
        'production'
      ) {
        throw new Error(
          'SMTP is not configured.'
        );
      }

      console.warn(
        '[SaMi] SMTP is not configured. Password reset email was not delivered.'
      );

      return {
        success: false,

        provider:
          'smtp',

        error:
          'Email delivery is unavailable.',
      };
    }

    /* ========================================================
       4. LOAD EXACT SAMI EMAIL LOGO
       ======================================================== */

    const logo =
      await getEmailLogo();

    const hasLogo =
      Boolean(
        logo
      );

    /* ========================================================
       5. BUILD EMAIL
       ======================================================== */

    const subject =
      'Reset your password — SaMi';

    const text =
      buildTextEmail({
        firstName,

        resetUrl,

        expiresInMinutes,
      });

    const html =
      buildHtmlEmail({
        firstName,

        resetUrl,

        expiresInMinutes,

        hasLogo,
      });

    /* ========================================================
       6. SEND
       ======================================================== */

    const mailer =
      getTransporter();

    const info =
      await mailer.sendMail({
        from:
          getSenderEmail(),

        to:
          email,

        replyTo:
          getReplyTo(),

        subject,

        text,

        html,

        /*
         * Exact SaMi PNG embedded directly inside the email.
         *
         * No public URL.
         * No domain.
         * No EMAIL_LOGO_URL.
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
            'password-reset',

          'X-Auto-Response-Suppress':
            'All',

          'Auto-Submitted':
            'auto-generated',
        },
      });

    /*
     * Never log:
     *
     * - recipient email
     * - reset URL
     * - reset token
     */
    console.log(
      '[SaMi] Password reset email delivered successfully.',
      {
        messageId:
          info.messageId,
      }
    );

    return {
      success: true,

      provider:
        'smtp',

      messageId:
        info.messageId,
    };
  } catch (error) {
    console.error(
      '[SaMi] Password reset email delivery failed:',
      error
    );

    /*
     * Do not pass internal SMTP/provider/configuration errors
     * towards the browser.
     */
    return {
      success: false,

      provider:
        'smtp',

      error:
        'Password reset email could not be sent.',
    };
  }
}