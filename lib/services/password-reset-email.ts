import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

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

/* ============================================================
   CACHE
   ============================================================ */

let transporter:
  Transporter | null =
  null;

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
   APPLICATION URL

   The public SaMi URL belongs in .env.local / Vercel env:

   APP_URL=https://your-domain.com

   Email assets are then loaded from:
   ${APP_URL}/brand/sami-email-logo.png

   There are NO email image attachments.
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

function getInstallAppUrl():
  string {
  const configured =
    process.env
      .SAMI_APP_INSTALL_URL
      ?.trim();

  if (!configured) {
    /*
     * Until SaMi has a dedicated app-store/download page,
     * the Install app button opens the main SaMi experience.
     *
     * Later you can add:
     *
     * SAMI_APP_INSTALL_URL=https://...
     *
     * without changing this code.
     */
    return getAppUrl();
  }

  try {
    const url =
      new URL(
        configured
      );

    if (
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      throw new Error();
    }

    return url.toString();
  } catch {
    throw new Error(
      'SAMI_APP_INSTALL_URL must be a valid HTTP or HTTPS URL.'
    );
  }
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
      'https:' &&
    resetUrl.protocol !==
      'http:'
  ) {
    throw new Error(
      'Password reset URL must use HTTP or HTTPS.'
    );
  }

  /*
   * Password-reset links must point back to the same
   * SaMi origin configured by APP_URL.
   */
  const appUrl =
    new URL(
      getAppUrl()
    );

  if (
    resetUrl.origin !==
    appUrl.origin
  ) {
    throw new Error(
      'Password reset URL does not belong to SaMi.'
    );
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
   TEXT EMAIL
   ============================================================ */

function buildTextEmail({
  firstName,
  resetUrl,
  expiresInMinutes,
  installAppUrl,
}: {
  firstName: string;

  resetUrl: string;

  expiresInMinutes:
    number;

  installAppUrl: string;
}): string {
  return [
    `Hello ${firstName},`,

    '',

    'We received a request to reset the password for your SaMi account.',

    '',

    'Reset your password:',

    resetUrl,

    '',

    `This link expires in ${expiresInMinutes} minute${
      expiresInMinutes === 1
        ? ''
        : 's'
    } and can only be used once.`,

    '',

    'If you did not request this password reset, you can safely ignore this email. Your password will remain unchanged.',

    '',

    'Get SaMi:',

    installAppUrl,

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
  logoUrl,
  appUrl,
  installAppUrl,
}: {
  firstName: string;

  resetUrl: string;

  expiresInMinutes:
    number;

  logoUrl: string;

  appUrl: string;

  installAppUrl: string;
}): string {
  const safeFirstName =
    escapeHtml(
      firstName
    );

  const safeResetUrl =
    escapeHtml(
      resetUrl
    );

  const safeLogoUrl =
    escapeHtml(
      logoUrl
    );

  const safeAppUrl =
    escapeHtml(
      appUrl
    );

  const safeInstallAppUrl =
    escapeHtml(
      installAppUrl
    );

  const safeHelpUrl =
    escapeHtml(
      getPublicUrl(
        '/help'
      )
    );

  const safePrivacyUrl =
    escapeHtml(
      getPublicUrl(
        '/privacy'
      )
    );

  const safeTermsUrl =
    escapeHtml(
      getPublicUrl(
        '/terms'
      )
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
    Reset your SaMi password securely. This link expires in ${expiresInMinutes} minutes.
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

                <tr>
                  <td
                    style="
                      padding:34px 34px 14px;
                    "
                  >

                    <div
                      style="
                        font-size:11px;
                        line-height:16px;
                        font-weight:800;
                        letter-spacing:1.4px;
                        text-transform:uppercase;
                        color:#2563c9;
                      "
                    >
                      Account security
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
                      Reset your password
                    </h1>

                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding:8px 34px 32px;
                    "
                  >

                    <p
                      style="
                        margin:0;
                        font-size:15px;
                        line-height:24px;
                        font-weight:700;
                        color:#111827;
                      "
                    >
                      Hello ${safeFirstName},
                    </p>

                    <p
                      style="
                        margin:12px 0 0;
                        font-size:14px;
                        line-height:23px;
                        color:#475569;
                      "
                    >
                      We received a request to reset the password for
                      your SaMi account. Use the button below to create
                      a new password.
                    </p>

                    <!-- RESET BUTTON -->

                    <table
                      role="presentation"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        margin:26px 0 24px;
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
                            href="${safeResetUrl}"
                            target="_blank"
                            rel="noopener noreferrer"
                            style="
                              display:inline-block;
                              padding:14px 25px;
                              border-radius:10px;
                              background:#164a9f;
                              color:#ffffff;
                              text-decoration:none;
                              font-size:14px;
                              line-height:20px;
                              font-weight:800;
                            "
                          >
                            Reset password
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- EXPIRY / SECURITY -->

                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width:100%;
                        background:#f8fafc;
                        border:1px solid #e8edf3;
                        border-radius:12px;
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
                            Secure reset link
                          </div>

                          <div
                            style="
                              margin-top:4px;
                              font-size:12px;
                              line-height:20px;
                              color:#64748b;
                            "
                          >
                            This link expires in ${expiresInMinutes}
                            minute${
                              expiresInMinutes === 1
                                ? ''
                                : 's'
                            } and can only be used once.
                          </div>
                        </td>
                      </tr>
                    </table>

                    <!-- FALLBACK URL -->

                    <p
                      style="
                        margin:22px 0 0;
                        font-size:12px;
                        line-height:19px;
                        color:#64748b;
                      "
                    >
                      If the button doesn't work, copy and paste this
                      link into your browser:
                    </p>

                    <p
                      style="
                        margin:7px 0 0;
                        font-size:11px;
                        line-height:18px;
                        color:#2563c9;
                        word-break:break-all;
                      "
                    >
                      ${safeResetUrl}
                    </p>

                  </td>
                </tr>

                <!-- ============================================
                     APP / INSTALL SECTION
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
                          valign="middle"
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
                                  Access your business workspace wherever you are.
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
                                  href="${safeInstallAppUrl}"
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

                <!-- ============================================
                     BOTTOM SECURITY MESSAGE
                     ============================================ -->

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
                      If you didn't request this password reset, you
                      can safely ignore this email. Your password will
                      remain unchanged.
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
                  href="${safeHelpUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    color:#64748b;
                    text-decoration:none;
                  "
                >
                  Help
                </a>

                <span
                  style="
                    padding:0 8px;
                    color:#cbd5e1;
                  "
                >
                  •
                </span>

                <a
                  href="${safePrivacyUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    color:#64748b;
                    text-decoration:none;
                  "
                >
                  Privacy
                </a>

                <span
                  style="
                    padding:0 8px;
                    color:#cbd5e1;
                  "
                >
                  •
                </span>

                <a
                  href="${safeTermsUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    color:#64748b;
                    text-decoration:none;
                  "
                >
                  Terms
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
                This is an automated account-security email.
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

    const expiresInMinutes =
      normalizeExpiryMinutes(
        input.expiresInMinutes
      );

    const appUrl =
      getAppUrl();

    const resetUrl =
      normalizeResetUrl(
        input.resetUrl
      );

    const logoUrl =
      getEmailLogoUrl();

    const installAppUrl =
      getInstallAppUrl();

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
       4. BUILD EMAIL
       ======================================================== */

    const subject =
      'Reset your password — SaMi';

    const text =
      buildTextEmail({
        firstName,

        resetUrl,

        expiresInMinutes,

        installAppUrl,
      });

    const html =
      buildHtmlEmail({
        firstName,

        resetUrl,

        expiresInMinutes,

        logoUrl,

        appUrl,

        installAppUrl,
      });

    /* ========================================================
       5. SEND

       IMPORTANT:
       There is intentionally NO attachments property here.
       The logo is loaded from the public APP_URL.
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

    return {
      success: false,

      provider:
        'smtp',

      error:
        'Password reset email could not be sent.',
    };
  }
}
