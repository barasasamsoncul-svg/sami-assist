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

export type SendVerificationEmailInput = {
  email: string;

  firstName?:
    | string
    | null;

  code: string;

  verifyUrl: string;

  /*
   * Optional so existing callers remain compatible.
   *
   * The API creating the verification code should pass the
   * actual database expiry here.
   */
  expiresInMinutes?: number;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_VERIFICATION_EXPIRY_MINUTES =
  10;

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
  value: string
): boolean {
  return (
    value.length > 0 &&
    value.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
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
   CODE
   ============================================================ */

function normalizeVerificationCode(
  value: string
): string {
  const code =
    value.trim();

  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    throw new Error(
      'Verification code must contain exactly 6 digits.'
    );
  }

  return code;
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
    return DEFAULT_VERIFICATION_EXPIRY_MINUTES;
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
   VERIFY URL
   ============================================================ */

function normalizeVerifyUrl(
  value: string
): string {
  const trimmed =
    value.trim();

  if (!trimmed) {
    throw new Error(
      'Verification URL is required.'
    );
  }

  let verifyUrl:
    URL;

  try {
    verifyUrl =
      new URL(
        trimmed
      );
  } catch {
    throw new Error(
      'Verification URL is invalid.'
    );
  }

  if (
    verifyUrl.protocol !==
      'http:' &&
    verifyUrl.protocol !==
      'https:'
  ) {
    throw new Error(
      'Verification URL must use HTTP or HTTPS.'
    );
  }

  /*
   * When SaMi's authoritative application URL exists,
   * verification links must point back to SaMi.
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
      verifyUrl.origin !==
      appUrl.origin
    ) {
      throw new Error(
        'Verification URL does not belong to SaMi.'
      );
    }
  }

  return verifyUrl.toString();
}

/* ============================================================
   SMTP
   ============================================================ */

function requiredEnv(
  name: string
): string {
  const value =
    process.env[name]
      ?.trim();

  if (!value) {
    throw new Error(
      `${name} is missing.`
    );
  }

  return value;
}

function getTransporter():
  Transporter {
  if (
    transporter
  ) {
    return transporter;
  }

  const host =
    requiredEnv(
      'SMTP_HOST'
    );

  const user =
    requiredEnv(
      'SMTP_USER'
    );

  const pass =
    requiredEnv(
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
    requiredEnv(
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
      '[SaMi] Verification email logo could not be loaded:',
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
  code,
  verifyUrl,
  expiresInMinutes,
}: {
  firstName: string;

  code: string;

  verifyUrl: string;

  expiresInMinutes:
    number;
}): string {
  return [
    `Hello ${firstName},`,

    '',

    'Verify your SaMi account using the code below:',

    '',

    code,

    '',

    `This code expires in ${expiresInMinutes} minute${
      expiresInMinutes === 1
        ? ''
        : 's'
    }.`,

    '',

    'Open the SaMi verification page:',

    verifyUrl,

    '',

    'For your security, never share this verification code with anyone.',

    '',

    'If you did not create a SaMi account, you can safely ignore this email.',

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
  code,
  verifyUrl,
  expiresInMinutes,
  hasLogo,
}: {
  firstName: string;

  code: string;

  verifyUrl: string;

  expiresInMinutes:
    number;

  hasLogo: boolean;
}): string {
  const safeFirstName =
    escapeHtml(
      firstName
    );

  const safeCode =
    escapeHtml(
      code
    );

  const safeVerifyUrl =
    escapeHtml(
      verifyUrl
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
    Verify your SaMi account
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
                Verify your SaMi account
              </h1>

              <p
                style="
                  margin:14px 0 0;
                  font-size:15px;
                  line-height:25px;
                  color:#475569;
                "
              >
                Hello ${safeFirstName}, use the verification code
                below to confirm your email address and continue
                to SaMi.
              </p>

              <!-- =============================================
                   CODE
                   ============================================= -->

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

              <!-- =============================================
                   OPEN VERIFICATION PAGE
                   ============================================= -->

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
                      Open verification page
                    </a>

                  </td>

                </tr>

              </table>

              <!-- =============================================
                   SECURITY
                   ============================================= -->

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

                      For your security, never share this code
                      with anyone.

                    </p>

                  </td>

                </tr>

              </table>

              <!-- =============================================
                   FALLBACK URL
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
                ${safeVerifyUrl}
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
}

/* ============================================================
   SEND VERIFICATION EMAIL
   ============================================================ */

export async function sendVerificationEmail(
  input:
    SendVerificationEmailInput
): Promise<void> {
  /* ==========================================================
     1. NORMALIZE + VALIDATE
     ========================================================== */

  const email =
    normalizeEmail(
      input.email
    );

  if (
    !isValidEmail(
      email
    )
  ) {
    throw new Error(
      'A valid recipient email is required.'
    );
  }

  const firstName =
    normalizeFirstName(
      input.firstName
    );

  const code =
    normalizeVerificationCode(
      input.code
    );

  const verifyUrl =
    normalizeVerifyUrl(
      input.verifyUrl
    );

  const expiresInMinutes =
    normalizeExpiryMinutes(
      input.expiresInMinutes
    );

  /* ==========================================================
     2. LOAD SAMI LOGO
     ========================================================== */

  const logo =
    await getEmailLogo();

  const hasLogo =
    Boolean(
      logo
    );

  /* ==========================================================
     3. BUILD CONTENT
     ========================================================== */

  const subject =
    'Verify your SaMi account';

  const text =
    buildTextEmail({
      firstName,

      code,

      verifyUrl,

      expiresInMinutes,
    });

  const html =
    buildHtmlEmail({
      firstName,

      code,

      verifyUrl,

      expiresInMinutes,

      hasLogo,
    });

  /* ==========================================================
     4. SEND
     ========================================================== */

  const mailer =
    getTransporter();

  const info =
    await mailer.sendMail({
      from:
        getFromAddress(),

      to:
        email,

      replyTo:
        getReplyTo(),

      subject,

      text,

      html,

      /*
       * The SaMi PNG travels inside the email itself.
       *
       * No domain.
       * No public image URL.
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
}