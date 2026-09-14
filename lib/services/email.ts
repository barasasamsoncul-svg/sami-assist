import 'server-only';

import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

/* ============================================================
   TYPES — IDENTITY AUDIENCE
   ============================================================ */

export type EmailAudience =
  | 'workspace'
  | 'platform_admin';

/* ============================================================
   TYPES — ACCOUNT EMAIL VERIFICATION
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

  /**
   * Workspace is the backward-compatible default.
   *
   * Platform Admin uses the same SaMi mail transport and branded
   * email system without creating a second admin mailer.
   */
  audience?: EmailAudience;
};

/* ============================================================
   TYPES — EMAIL CHANGE
   ============================================================ */

export type SendEmailChangeVerificationEmailResult = {
  success: boolean;
  messageId?: string;
};

export type EmailChangeVerificationEmailOptions = {
  expiresInMinutes?: number;

  audience?: EmailAudience;
};

/* ============================================================
   TYPES — SECURITY / EMAIL 2FA
   ============================================================ */

export type SecurityCodeEmailPurpose =
  | 'email_2fa_setup'
  | 'login_2fa'
  | 'security_step_up';

export type SecurityCodeEmailOptions = {
  purpose:
    SecurityCodeEmailPurpose;

  expiresInMinutes?:
    number;

  audience?: EmailAudience;
};

export type SendSecurityCodeEmailResult = {
  success: boolean;
  messageId?: string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_VERIFICATION_EXPIRY_MINUTES =
  15;

const DEFAULT_EMAIL_CHANGE_EXPIRY_MINUTES =
  15;

const DEFAULT_SECURITY_CODE_EXPIRY_MINUTES =
  10;

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
   EMAIL NORMALIZATION
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
    email.length >
      0 &&
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

  if (
    !normalized
  ) {
    return 'there';
  }

  return normalized.slice(
    0,
    MAX_NAME_LENGTH
  );
}

/* ============================================================
   SIX-DIGIT CODE
   ============================================================ */

function normalizeSecurityCode(
  value: string
): string {
  return value.trim();
}

function assertSixDigitCode(
  code: string
) {
  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    throw new Error(
      'Verification code must contain exactly 6 digits.'
    );
  }
}

/* ============================================================
   EXPIRY
   ============================================================ */

function normalizeExpiryMinutes(
  value:
    | number
    | undefined,
  fallback:
    number
): number {
  if (
    value ===
    undefined
  ) {
    return fallback;
  }

  if (
    !Number.isInteger(
      value
    ) ||
    value <
      1 ||
    value >
      60
  ) {
    throw new Error(
      'Invalid email expiry.'
    );
  }

  return value;
}

/* ============================================================
   APP URL
   ============================================================ */

function getAppUrl():
  string {
  const raw =
    process.env
      .APP_URL
      ?.trim();

  if (
    !raw
  ) {
    throw new Error(
      'APP_URL is required.'
    );
  }

  let url:
    URL;

  try {
    url =
      new URL(
        raw
      );
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

/* ============================================================
   PUBLIC URL
   ============================================================ */

function getPublicUrl(
  pathname: string
): string {
  return new URL(
    pathname,
    `${getAppUrl()}/`
  ).toString();
}


/* ============================================================
   IDENTITY AUDIENCE
   ============================================================ */

function normalizeAudience(
  value:
    | EmailAudience
    | undefined
): EmailAudience {
  return value ===
    'platform_admin'
    ? 'platform_admin'
    : 'workspace';
}

function getAudienceAccessUrl(
  appUrl: string,
  audience: EmailAudience
): string {
  if (
    audience ===
    'platform_admin'
  ) {
    return new URL(
      '/admin',
      `${appUrl}/`
    ).toString();
  }

  return appUrl;
}

function getAudienceLabel(
  audience: EmailAudience
): string {
  return audience ===
    'platform_admin'
    ? 'SaMi Platform Admin'
    : 'SaMi';
}

function getAudienceAccountLabel(
  audience: EmailAudience
): string {
  return audience ===
    'platform_admin'
    ? 'SaMi platform administrator account'
    : 'SaMi account';
}

function getAudienceAutomatedLabel(
  audience: EmailAudience,
  purpose: string
): string {
  const scope =
    audience ===
      'platform_admin'
      ? 'platform-administrator'
      : 'account';

  return `This is an automated SaMi ${scope} ${purpose} email.`;
}

/* ============================================================
   EMAIL LOGO
   ============================================================ */

function getEmailLogoUrl():
  string {
  return getPublicUrl(
    '/brand/sami-email-logo.png'
  );
}

/* ============================================================
   VERIFY URL
   ============================================================ */

function normalizeVerifyUrl(
  value:
    | string
    | null
    | undefined,
  appUrl:
    string
): string | null {
  if (
    !value
  ) {
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

  const configuredAppUrl =
    new URL(
      appUrl
    );

  /*
   * Email verification links must return to the configured
   * SaMi application origin.
   */
  if (
    url.origin !==
    configuredAppUrl.origin
  ) {
    return null;
  }

  return url.toString();
}

/* ============================================================
   SMTP CONFIGURATION
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
    port <=
      0 ||
    port >
      65535
  ) {
    throw new Error(
      'Invalid SMTP_PORT configuration.'
    );
  }

  const secure =
    process.env
      .SMTP_SECURE ===
      'true' ||
    port ===
      465;

  transporter =
    nodemailer
      .createTransport({
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
   FROM
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

/* ============================================================
   REPLY TO
   ============================================================ */

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
   EMAIL DELIVERY AVAILABILITY
   ============================================================ */

function ensureEmailDeliveryAvailable(
  emailType:
    string
): boolean {
  if (
    isSmtpConfigured()
  ) {
    return true;
  }

  if (
    process.env
      .NODE_ENV ===
    'production'
  ) {
    throw new Error(
      'SMTP is not configured. Email delivery is required in production.'
    );
  }

  console.warn(
    `[SaMi] SMTP is not configured. ${emailType} email was not delivered.`
  );

  return false;
}

/* ============================================================
   SECURITY EMAIL CONTENT
   ============================================================ */

function getSecurityEmailContent(
  purpose:
    SecurityCodeEmailPurpose,
  audience:
    EmailAudience
) {
  const accountLabel =
    getAudienceAccountLabel(
      audience
    );

  const productLabel =
    getAudienceLabel(
      audience
    );
  switch (
    purpose
  ) {
    case 'email_2fa_setup':
      return {
        label:
          'Verification setup',

        title:
          'Confirm email verification',

        subject:
          'Confirm email verification — SaMi',

        intro:
          `Use this code to confirm that your verified email can be used as a sign-in verification method for your ${accountLabel}.`,

        codeLabel:
          'SETUP CODE',

        securityMessage:
          'Only enter this code inside your SaMi Security settings. Never send it to another person.',

        ignoredMessage:
          'If you did not request email verification setup, you can ignore this email. Your security settings will not change without successful verification.',
      };

    case 'login_2fa':
      return {
        label:
          'Sign-in verification',

        title:
          'Verify your SaMi sign-in',

        subject:
          'Your SaMi sign-in code',

        intro:
          `A sign-in to your ${accountLabel} needs email verification. Enter the code below on the ${productLabel} verification screen.`,

        codeLabel:
          'SIGN-IN CODE',

        securityMessage:
          'Never share this sign-in code. SaMi support will never ask you to tell us this code.',

        ignoredMessage:
          `If you are not trying to sign in to ${productLabel}, do not use this code. Review your account security when you are able to sign in.`,
      };

    case 'security_step_up':
      return {
        label:
          'Security verification',

        title:
          'Confirm this security action',

        subject:
          'Your SaMi security verification code',

        intro:
          `${productLabel} needs to verify your identity before completing a security-sensitive account action.`,

        codeLabel:
          'SECURITY CODE',

        securityMessage:
          'Only enter this code in SaMi. Do not share it with anyone, including someone claiming to be SaMi support.',

        ignoredMessage:
          'If you did not request this security action, do not use the code and review your SaMi account security.',
      };
  }
}

/* ============================================================
   EMAIL SHELL
   ============================================================ */

function buildEmailShell(
  input: {
    preheader:
      string;

    label:
      string;

    title:
      string;

    greeting:
      string;

    intro:
      string;

    code:
      string;

    codeLabel:
      string;

    expiresInMinutes:
      number;

    securityTitle:
      string;

    securityMessage:
      string;

    bottomMessage:
      string;

    appUrl:
      string;

    logoUrl:
      string;

    actionHtml?:
      string;

    automatedLabel:
      string;
  }
): string {
  const safePreheader =
    escapeHtml(
      input.preheader
    );

  const safeLabel =
    escapeHtml(
      input.label
    );

  const safeTitle =
    escapeHtml(
      input.title
    );

  const safeGreeting =
    escapeHtml(
      input.greeting
    );

  const safeIntro =
    escapeHtml(
      input.intro
    );

  const safeCode =
    escapeHtml(
      input.code
    );

  const safeCodeLabel =
    escapeHtml(
      input.codeLabel
    );

  const safeSecurityTitle =
    escapeHtml(
      input.securityTitle
    );

  const safeSecurityMessage =
    escapeHtml(
      input.securityMessage
    );

  const safeBottomMessage =
    escapeHtml(
      input.bottomMessage
    );

  const safeAppUrl =
    escapeHtml(
      input.appUrl
    );

  const safeLogoUrl =
    escapeHtml(
      input.logoUrl
    );

  const safeAutomatedLabel =
    escapeHtml(
      input.automatedLabel
    );

  const year =
    new Date()
      .getFullYear();

  const minuteLabel =
    input
      .expiresInMinutes ===
    1
      ? 'minute'
      : 'minutes';

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

  <title>${safeTitle}</title>

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
    ${safePreheader}
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
                      ${safeLabel}
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
                      ${safeTitle}
                    </h1>

                    <p
                      style="
                        margin:8px 0 0;
                        font-size:13px;
                        line-height:21px;
                        color:#64748b;
                      "
                    >
                      ${safeGreeting}
                    </p>

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
                      ${safeIntro}
                    </p>

                    <!-- CODE -->

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
                            ${safeCodeLabel}
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
                            Expires in
                            ${input.expiresInMinutes}
                            ${minuteLabel}.
                          </div>

                        </td>

                      </tr>

                    </table>

                    ${input.actionHtml || ''}

                    <!-- SECURITY MESSAGE -->

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
                            ${safeSecurityTitle}
                          </div>

                          <div
                            style="
                              margin-top:4px;
                              font-size:12px;
                              line-height:20px;
                              color:#64748b;
                            "
                          >
                            ${safeSecurityMessage}
                          </div>

                        </td>

                      </tr>

                    </table>

                  </td>

                </tr>

                <!-- SAMI ACCESS -->

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
                                  SaMi security
                                </div>

                                <div
                                  style="
                                    margin-top:3px;
                                    font-size:11px;
                                    line-height:17px;
                                    color:#64748b;
                                  "
                                >
                                  Manage your account security
                                  directly inside SaMi.
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
                                  Open SaMi
                                </a>

                              </td>

                            </tr>

                          </table>

                        </td>

                      </tr>

                    </table>

                  </td>

                </tr>

                <!-- BOTTOM MESSAGE -->

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
                      ${safeBottomMessage}
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
                ${safeAutomatedLabel}
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
   OPTIONAL VERIFICATION BUTTON
   ============================================================ */

function buildVerificationAction(
  verifyUrl:
    string | null
): string {
  if (
    !verifyUrl
  ) {
    return '';
  }

  const safeVerifyUrl =
    escapeHtml(
      verifyUrl
    );

  return `
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
  `;
}

/* ============================================================
   SEND ACCOUNT VERIFICATION EMAIL
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
    normalizeSecurityCode(
      code
    );

  const expiresInMinutes =
    normalizeExpiryMinutes(
      options
        .expiresInMinutes,
      DEFAULT_VERIFICATION_EXPIRY_MINUTES
    );

  const audience =
    normalizeAudience(
      options.audience
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

  assertSixDigitCode(
    cleanCode
  );

  /* ==========================================================
     3. APP / BRAND
     ========================================================== */

  const baseAppUrl =
    getAppUrl();

  const appUrl =
    getAudienceAccessUrl(
      baseAppUrl,
      audience
    );

  const logoUrl =
    getEmailLogoUrl();

  const verifyUrl =
    normalizeVerifyUrl(
      options.verifyUrl,
      baseAppUrl
    );

  const accountLabel =
    getAudienceAccountLabel(
      audience
    );

  const productLabel =
    getAudienceLabel(
      audience
    );

  /* ==========================================================
     4. SMTP
     ========================================================== */

  if (
    !ensureEmailDeliveryAvailable(
      'Verification'
    )
  ) {
    return {
      success:
        false,
    };
  }

  /* ==========================================================
     5. TEXT
     ========================================================== */

  const textParts = [
    audience === 'platform_admin'
      ? `Hello ${cleanName},`
      : `Welcome to SaMi, ${cleanName}!`,

    '',

    `Verify your email address to finish securing your ${accountLabel}.`,

    '',

    'Your verification code is:',

    '',

    cleanCode,

    '',

    `This code expires in ${expiresInMinutes} minute${
      expiresInMinutes ===
      1
        ? ''
        : 's'
    }.`,

    '',

    'Never share this verification code with anyone.',
  ];

  if (
    verifyUrl
  ) {
    textParts.push(
      '',
      `Open ${productLabel} to verify your email:`,
      verifyUrl
    );
  }

  textParts.push(
    '',

    `Open ${productLabel}: ${appUrl}`,

    '',

    audience === 'platform_admin'
      ? 'If you did not expect a SaMi platform administrator account to be created for you, contact SaMi platform security.'
      : 'If you did not create a SaMi account, you can safely ignore this email.',

    '',

    'SaMi',

    'AI Powered Business Workspace'
  );

  const text =
    textParts.join(
      '\n'
    );

  /* ==========================================================
     6. HTML
     ========================================================== */

  const html =
    buildEmailShell({
      preheader:
        'Confirm your SaMi email address.',

      label:
        'Email verification',

      title:
        audience === 'platform_admin'
          ? 'Verify your platform administrator email'
          : `Welcome to SaMi, ${cleanName}`,

      greeting:
        audience === 'platform_admin'
          ? `Hello ${cleanName}. Confirm your administrator email address.`
          : 'Confirm your email address.',

      intro:
        `Verify your email address to finish securing your ${accountLabel}. Enter the six-digit code below on the verification screen.`,

      code:
        cleanCode,

      codeLabel:
        'VERIFICATION CODE',

      expiresInMinutes,

      securityTitle:
        'Keep your account secure',

      securityMessage:
        'Never share this code with anyone. SaMi will never ask you to send your verification code by email or message.',

      bottomMessage:
        audience === 'platform_admin'
          ? 'If you did not expect this administrator identity, contact SaMi platform security.'
          : 'If you did not create a SaMi account, you can safely ignore this email.',

      appUrl,

      logoUrl,

      actionHtml:
        buildVerificationAction(
          verifyUrl
        ),

      automatedLabel:
        getAudienceAutomatedLabel(
          audience,
          'email-verification'
        ),
    });

  /* ==========================================================
     7. SEND
     ========================================================== */

  const mailer =
    getTransporter();

  try {
    const info =
      await mailer
        .sendMail({
          from:
            getFromAddress(),

          to:
            normalizedEmail,

          replyTo:
            getReplyTo(),

          subject:
            'Verify your email address — SaMi',

          text,

          html,

          /*
           * No attachments.
           *
           * Branding loads from:
           *
           * APP_URL/brand/sami-email-logo.png
           */
          headers: {
            'X-SaMi-Email-Type':
              'email-verification',

            'X-SaMi-Audience':
              audience,

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
      success:
        true,

      messageId:
        info.messageId,
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Verification email delivery failed:',
      error
    );

    throw new Error(
      'Verification email could not be sent.'
    );
  }
}

/* ============================================================
   SEND EMAIL CHANGE VERIFICATION
   ============================================================ */

export async function sendEmailChangeVerificationEmail(
  email: string,
  code: string,
  name: string,
  options:
    EmailChangeVerificationEmailOptions = {}
): Promise<
  SendEmailChangeVerificationEmailResult
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
    normalizeSecurityCode(
      code
    );

  const expiresInMinutes =
    normalizeExpiryMinutes(
      options
        .expiresInMinutes,
      DEFAULT_EMAIL_CHANGE_EXPIRY_MINUTES
    );

  const audience =
    normalizeAudience(
      options.audience
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

  assertSixDigitCode(
    cleanCode
  );

  /* ==========================================================
     3. APP / BRAND
     ========================================================== */

  const baseAppUrl =
    getAppUrl();

  const appUrl =
    getAudienceAccessUrl(
      baseAppUrl,
      audience
    );

  const logoUrl =
    getEmailLogoUrl();

  const accountLabel =
    getAudienceAccountLabel(
      audience
    );

  const productLabel =
    getAudienceLabel(
      audience
    );

  /* ==========================================================
     4. SMTP
     ========================================================== */

  if (
    !ensureEmailDeliveryAvailable(
      'Email-change verification'
    )
  ) {
    return {
      success:
        false,
    };
  }

  /* ==========================================================
     5. TEXT
     ========================================================== */

  const text = [
    `Hello ${cleanName},`,

    '',

    `A request was made to change the email address on your ${accountLabel}.`,

    '',

    'Use this verification code to confirm the new email address:',

    '',

    cleanCode,

    '',

    `This code expires in ${expiresInMinutes} minute${
      expiresInMinutes ===
      1
        ? ''
        : 's'
    }.`,

    '',

    `Only enter this code inside your ${productLabel} account settings.`,

    '',

    `If you did not request this email change, do not use the code. Your current ${productLabel} email address will remain unchanged.`,

    '',

    `Open ${productLabel}: ${appUrl}`,

    '',

    'SaMi',

    'AI Powered Business Workspace',
  ].join(
    '\n'
  );

  /* ==========================================================
     6. HTML
     ========================================================== */

  const html =
    buildEmailShell({
      preheader:
        'Confirm your new SaMi email address.',

      label:
        'Email change',

      title:
        'Confirm your new email address',

      greeting:
        `Hello ${cleanName}.`,

      intro:
        `A request was made to change the email address on your ${accountLabel}. Enter the six-digit code below in ${productLabel} to confirm this new email address.`,

      code:
        cleanCode,

      codeLabel:
        'EMAIL CHANGE CODE',

      expiresInMinutes,

      securityTitle:
        'Protect this code',

      securityMessage:
        `Only enter this code inside your ${productLabel} account settings. Never share it with anyone, including someone claiming to be SaMi support.`,

      bottomMessage:
        `If you did not request this email change, do not use this code. Your current ${productLabel} email address will remain unchanged.`,

      appUrl,

      logoUrl,

      automatedLabel:
        getAudienceAutomatedLabel(
          audience,
          'account-security'
        ),
    });

  /* ==========================================================
     7. SEND
     ========================================================== */

  const mailer =
    getTransporter();

  try {
    const info =
      await mailer
        .sendMail({
          from:
            getFromAddress(),

          to:
            normalizedEmail,

          replyTo:
            getReplyTo(),

          subject:
            'Confirm your new email address — SaMi',

          text,

          html,

          headers: {
            'X-SaMi-Email-Type':
              'email-change-verification',

            'X-SaMi-Audience':
              audience,

            'X-Auto-Response-Suppress':
              'All',

            'Auto-Submitted':
              'auto-generated',
          },
        });

    /*
     * Never log:
     *
     * - verification code
     * - recipient email
     * - email-change request details
     */
    console.log(
      '[SaMi] Email-change verification delivered successfully.',
      {
        messageId:
          info.messageId,
      }
    );

    return {
      success:
        true,

      messageId:
        info.messageId,
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Email-change verification delivery failed:',
      error
    );

    throw new Error(
      'Email-change verification could not be sent.'
    );
  }
}

/* ============================================================
   SEND SECURITY / EMAIL 2FA CODE
   ============================================================ */

/**
 * Email delivery only.
 *
 * This function DOES NOT:
 *
 * - generate the OTP
 * - hash the OTP
 * - save the OTP
 * - verify the OTP
 * - enable Email 2FA
 *
 * Those responsibilities belong to:
 *
 * lib/auth/email-two-factor.ts
 */
export async function sendSecurityCodeEmail(
  email: string,
  code: string,
  name: string,
  options:
    SecurityCodeEmailOptions
): Promise<
  SendSecurityCodeEmailResult
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
    normalizeSecurityCode(
      code
    );

  const expiresInMinutes =
    normalizeExpiryMinutes(
      options
        .expiresInMinutes,
      DEFAULT_SECURITY_CODE_EXPIRY_MINUTES
    );

  const audience =
    normalizeAudience(
      options.audience
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

  assertSixDigitCode(
    cleanCode
  );

  if (
    options.purpose !==
      'email_2fa_setup' &&
    options.purpose !==
      'login_2fa' &&
    options.purpose !==
      'security_step_up'
  ) {
    throw new Error(
      'Invalid SaMi security email purpose.'
    );
  }

  /* ==========================================================
     3. CONTENT
     ========================================================== */

  const content =
    getSecurityEmailContent(
      options.purpose,
      audience
    );

  const baseAppUrl =
    getAppUrl();

  const appUrl =
    getAudienceAccessUrl(
      baseAppUrl,
      audience
    );

  const logoUrl =
    getEmailLogoUrl();

  const productLabel =
    getAudienceLabel(
      audience
    );

  /* ==========================================================
     4. SMTP
     ========================================================== */

  if (
    !ensureEmailDeliveryAvailable(
      'Security-code'
    )
  ) {
    return {
      success:
        false,
    };
  }

  /* ==========================================================
     5. TEXT
     ========================================================== */

  const text = [
    `Hello ${cleanName},`,

    '',

    content.intro,

    '',

    `${content.codeLabel}:`,

    '',

    cleanCode,

    '',

    `This code expires in ${expiresInMinutes} minute${
      expiresInMinutes ===
      1
        ? ''
        : 's'
    }.`,

    '',

    content.securityMessage,

    '',

    content.ignoredMessage,

    '',

    `Open ${productLabel}: ${appUrl}`,

    '',

    'SaMi',

    'AI Powered Business Workspace',
  ].join(
    '\n'
  );

  /* ==========================================================
     6. HTML
     ========================================================== */

  const html =
    buildEmailShell({
      preheader:
        'A SaMi security verification code was requested.',

      label:
        content.label,

      title:
        content.title,

      greeting:
        `Hello ${cleanName}.`,

      intro:
        content.intro,

      code:
        cleanCode,

      codeLabel:
        content.codeLabel,

      expiresInMinutes,

      securityTitle:
        'Protect this code',

      securityMessage:
        content.securityMessage,

      bottomMessage:
        content.ignoredMessage,

      appUrl,

      logoUrl,

      automatedLabel:
        getAudienceAutomatedLabel(
          audience,
          'security'
        ),
    });

  /* ==========================================================
     7. SEND
     ========================================================== */

  const mailer =
    getTransporter();

  try {
    const info =
      await mailer
        .sendMail({
          from:
            getFromAddress(),

          to:
            normalizedEmail,

          replyTo:
            getReplyTo(),

          subject:
            content.subject,

          text,

          html,

          /*
           * No attachment or CID image.
           *
           * Email branding loads from:
           *
           * APP_URL/brand/sami-email-logo.png
           */
          headers: {
            'X-SaMi-Email-Type':
              options.purpose,

            'X-SaMi-Audience':
              audience,

            'X-Auto-Response-Suppress':
              'All',

            'Auto-Submitted':
              'auto-generated',
          },
        });

    /*
     * Never log:
     *
     * - OTP
     * - email address
     * - verification context
     */
    console.log(
      '[SaMi] Security code email delivered successfully.',
      {
        messageId:
          info.messageId,

        purpose:
          options.purpose,
      }
    );

    return {
      success:
        true,

      messageId:
        info.messageId,
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi] Security code email delivery failed:',
      {
        purpose:
          options.purpose,

        error,
      }
    );

    throw new Error(
      'Security verification email could not be sent.'
    );
  }
}