import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

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

/* ============================================================
   TRANSPORTER
   ============================================================ */

let transporter:
  Transporter | null =
  null;

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
   APP URL

   .env.local / Vercel:

   APP_URL=https://your-domain.com

   Public email logo:

   ${APP_URL}/brand/sami-email-logo.png

   No CID image.
   No PNG attachment.
   ============================================================ */

function getAppUrl():
  string {
  const raw =
    process.env.APP_URL
      ?.trim();

  if (!raw) {
    throw new Error(
      'APP_URL is required.'
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(raw);
  } catch {
    throw new Error(
      'APP_URL must be a valid URL.'
    );
  }

  if (
    url.protocol !==
      'https:' &&
    url.protocol !==
      'http:'
  ) {
    throw new Error(
      'APP_URL must use HTTP or HTTPS.'
    );
  }

  return url
    .toString()
    .replace(
      /\/+$/,
      ''
    );
}

function getPublicUrl(
  pathname: string
): string {
  return new URL(
    pathname,
    `${getAppUrl()}/`
  ).toString();
}

function getEmailLogoUrl():
  string {
  return getPublicUrl(
    '/brand/sami-email-logo.png'
  );
}

/* ============================================================
   URL
   ============================================================ */

function normalizeVerifyUrl(
  value:
    | string
    | null
    | undefined,
  appUrl: string
): string | null {
  if (!value) {
    return null;
  }

  let url:
    URL;

  try {
    url =
      new URL(
        value.trim()
      );
  } catch {
    return null;
  }

  if (
    url.protocol !==
      'https:' &&
    url.protocol !==
      'http:'
  ) {
    return null;
  }

  /*
   * Verification links must point back to the configured
   * SaMi application origin.
   */
  const configuredAppUrl =
    new URL(
      appUrl
    );

  if (
    url.origin !==
    configuredAppUrl.origin
  ) {
    return null;
  }

  return url.toString();
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

  const appUrl =
    getAppUrl();

  const logoUrl =
    getEmailLogoUrl();

  const verifyUrl =
    normalizeVerifyUrl(
      options.verifyUrl,
      appUrl
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
     4. SAFE VALUES
     ========================================================== */

  const safeName =
    escapeHtml(
      cleanName
    );

  const safeCode =
    escapeHtml(
      cleanCode
    );

  const safeAppUrl =
    escapeHtml(
      appUrl
    );

  const safeLogoUrl =
    escapeHtml(
      logoUrl
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
     5. SUBJECT
     ========================================================== */

  const subject =
    'Verify your email address — SaMi';

  /* ==========================================================
     6. TEXT EMAIL
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

    `Open SaMi: ${appUrl}`,

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
     7. OPTIONAL VERIFY BUTTON
     ========================================================== */

  const verifyButton =
    safeVerifyUrl
      ? `
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            margin:24px 0 0;
          "
        >
          <tr>
            <td
              align="center"
              bgcolor="#164a9f"
              style="
                border-radius:10px;
              "
            >
              <a
                href="${safeVerifyUrl}"
                target="_blank"
                rel="noopener noreferrer"
                style="
                  display:inline-block;
                  padding:14px 24px;
                  border-radius:10px;
                  background:#164a9f;
                  font-size:13px;
                  line-height:19px;
                  font-weight:800;
                  color:#ffffff;
                  text-decoration:none;
                "
              >
                Verify email
              </a>
            </td>
          </tr>
        </table>
      `
      : '';

  /* ==========================================================
     8. HTML EMAIL
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
    width:100%;
    background:#f5f6f8;
    font-family:Arial,Helvetica,sans-serif;
    -webkit-text-size-adjust:100%;
  "
>

  <!-- PREHEADER -->

  <div
    style="
      display:none;
      visibility:hidden;
      opacity:0;
      overflow:hidden;
      max-height:0;
      max-width:0;
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
      background:#f5f6f8;
    "
  >

    <tr>

      <td
        align="center"
        style="
          padding:26px 12px 40px;
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
            max-width:620px;
          "
        >

          <!-- ================================================
               TOP BRAND
               ================================================ -->

          <tr>

            <td
              style="
                padding:0 4px 18px;
              "
            >

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
              >

                <tr>

                  <td
                    align="left"
                    valign="middle"
                  >

                    <a
                      href="${safeAppUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        display:inline-block;
                        text-decoration:none;
                      "
                    >

                      <img
                        src="${safeLogoUrl}"
                        width="182"
                        alt="SaMi"
                        style="
                          display:block;
                          width:182px;
                          max-width:100%;
                          height:auto;
                          border:0;
                          outline:none;
                          text-decoration:none;
                        "
                      >

                    </a>

                  </td>

                  <td
                    align="right"
                    valign="middle"
                    style="
                      font-size:12px;
                      line-height:18px;
                    "
                  >

                    <a
                      href="${safeAppUrl}"
                      target="_blank"
                      rel="noopener noreferrer"
                      style="
                        color:#475569;
                        text-decoration:none;
                        font-weight:700;
                      "
                    >
                      Open SaMi
                    </a>

                  </td>

                </tr>

              </table>

            </td>

          </tr>

          <!-- ================================================
               MAIN CARD
               ================================================ -->

          <tr>

            <td>

              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  width:100%;
                  background:#ffffff;
                  border:1px solid #e6e9ee;
                  border-radius:20px;
                  overflow:hidden;
                "
              >

                <!-- BRAND STRIP -->

                <tr>

                  <td
                    style="
                      height:5px;
                      background:#164a9f;
                      font-size:0;
                      line-height:0;
                    "
                  >
                    &nbsp;
                  </td>

                </tr>

                <!-- HEADER -->

                <tr>

                  <td
                    style="
                      padding:34px 34px 12px;
                    "
                  >

                    <div
                      style="
                        font-size:11px;
                        line-height:16px;
                        font-weight:800;
                        letter-spacing:1.4px;
                        color:#2563c9;
                        text-transform:uppercase;
                      "
                    >
                      Email verification
                    </div>

                    <h1
                      style="
                        margin:9px 0 0;
                        padding:0;
                        font-size:28px;
                        line-height:35px;
                        font-weight:800;
                        letter-spacing:-0.7px;
                        color:#111827;
                      "
                    >
                      Welcome to SaMi, ${safeName}
                    </h1>

                  </td>

                </tr>

                <!-- CONTENT -->

                <tr>

                  <td
                    style="
                      padding:8px 34px 32px;
                    "
                  >

                    <p
                      style="
                        margin:0;
                        font-size:14px;
                        line-height:23px;
                        color:#475569;
                      "
                    >
                      Verify your email address to finish securing
                      your SaMi account. Enter the six-digit code
                      below on the verification screen.
                    </p>

                    <!-- VERIFICATION CODE -->

                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:24px;
                        background:#f3f6fb;
                        border:1px solid #e2e8f2;
                        border-radius:16px;
                      "
                    >

                      <tr>

                        <td
                          align="center"
                          style="
                            padding:24px 16px;
                          "
                        >

                          <div
                            style="
                              margin-bottom:9px;
                              font-size:10px;
                              line-height:16px;
                              font-weight:800;
                              letter-spacing:1.6px;
                              color:#64748b;
                            "
                          >
                            VERIFICATION CODE
                          </div>

                          <div
                            style="
                              display:inline-block;
                              padding:11px 15px 11px 21px;
                              background:#ffffff;
                              border:1px solid #dbe3ef;
                              border-radius:10px;
                              font-family:'Courier New',Courier,monospace;
                              font-size:31px;
                              line-height:39px;
                              font-weight:800;
                              letter-spacing:8px;
                              color:#111827;
                            "
                          >
                            ${safeCode}
                          </div>

                          <div
                            style="
                              margin-top:11px;
                              font-size:11px;
                              line-height:18px;
                              color:#64748b;
                            "
                          >
                            Expires in ${expiresInMinutes}
                            minute${
                              expiresInMinutes === 1
                                ? ''
                                : 's'
                            }.
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
                        width:100%;
                        margin-top:24px;
                        background:#f8fafc;
                        border:1px solid #e5e9ef;
                        border-radius:13px;
                      "
                    >

                      <tr>

                        <td
                          style="
                            padding:15px 16px;
                          "
                        >

                          <div
                            style="
                              font-size:12px;
                              line-height:18px;
                              font-weight:800;
                              color:#334155;
                            "
                          >
                            Keep your account secure
                          </div>

                          <div
                            style="
                              margin-top:4px;
                              font-size:12px;
                              line-height:20px;
                              color:#64748b;
                            "
                          >
                            Never share this code with anyone.
                            SaMi will never ask you to send your
                            verification code by email or message.
                          </div>

                        </td>

                      </tr>

                    </table>

                  </td>

                </tr>

                <!-- ============================================
                     INSTALL APP / ACCESS SECTION
                     ============================================ -->

                <tr>

                  <td
                    style="
                      padding:0 34px 32px;
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
                        background:#f3f6fb;
                        border:1px solid #e4eaf3;
                        border-radius:16px;
                      "
                    >

                      <tr>

                        <td
                          style="
                            padding:18px 16px;
                          "
                        >

                          <table
                            role="presentation"
                            width="100%"
                            cellpadding="0"
                            cellspacing="0"
                            border="0"
                          >

                            <tr>

                              <td
                                valign="middle"
                                style="
                                  width:52px;
                                  padding-right:14px;
                                "
                              >

                                <div
                                  style="
                                    width:48px;
                                    height:48px;
                                    border-radius:13px;
                                    background:#164a9f;
                                    color:#ffffff;
                                    text-align:center;
                                    line-height:48px;
                                    font-size:16px;
                                    font-weight:900;
                                  "
                                >
                                  SM
                                </div>

                              </td>

                              <td
                                valign="middle"
                              >

                                <div
                                  style="
                                    font-size:13px;
                                    line-height:19px;
                                    font-weight:800;
                                    color:#111827;
                                  "
                                >
                                  SaMi on the go
                                </div>

                                <div
                                  style="
                                    margin-top:3px;
                                    font-size:11px;
                                    line-height:17px;
                                    color:#64748b;
                                  "
                                >
                                  Access your business workspace
                                  wherever you are.
                                </div>

                              </td>

                              <td
                                align="right"
                                valign="middle"
                                style="
                                  padding-left:12px;
                                "
                              >

                                <a
                                  href="${safeAppUrl}"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style="
                                    display:inline-block;
                                    padding:10px 15px;
                                    border-radius:9px;
                                    background:#111827;
                                    color:#ffffff;
                                    text-decoration:none;
                                    font-size:11px;
                                    line-height:16px;
                                    font-weight:800;
                                    white-space:nowrap;
                                  "
                                >
                                  Install app
                                </a>

                              </td>

                            </tr>

                          </table>

                        </td>

                      </tr>

                    </table>

                  </td>

                </tr>

                <!-- BOTTOM SECURITY MESSAGE -->

                <tr>

                  <td
                    style="
                      padding:22px 34px 26px;
                      border-top:1px solid #edf0f4;
                      background:#fbfcfd;
                    "
                  >

                    <p
                      style="
                        margin:0;
                        font-size:12px;
                        line-height:20px;
                        color:#64748b;
                      "
                    >
                      If you didn't create a SaMi account, you can
                      safely ignore this email.
                    </p>

                  </td>

                </tr>

              </table>

            </td>

          </tr>

          <!-- ================================================
               FOOTER
               ================================================ -->

          <tr>

            <td
              align="center"
              style="
                padding:24px 16px 0;
              "
            >

              <p
                style="
                  margin:0;
                  font-size:11px;
                  line-height:18px;
                  color:#64748b;
                "
              >

                <a
                  href="${safeAppUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    color:#64748b;
                    text-decoration:none;
                  "
                >
                  Open SaMi
                </a>

              </p>

              <p
                style="
                  margin:11px 0 0;
                  font-size:10px;
                  line-height:17px;
                  color:#94a3b8;
                "
              >
                SaMi — AI Powered Business Workspace
              </p>

              <p
                style="
                  margin:3px 0 0;
                  font-size:10px;
                  line-height:17px;
                  color:#a0a8b4;
                "
              >
                © ${year} SaMi. All rights reserved.
              </p>

              <p
                style="
                  margin:9px 0 0;
                  font-size:9px;
                  line-height:15px;
                  color:#b2bac5;
                "
              >
                This is an automated account-verification email.
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
     9. SEND
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
         * Intentionally no attachments.
         *
         * The SaMi logo is loaded from:
         *
         * APP_URL/brand/sami-email-logo.png
         */
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
