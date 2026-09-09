import nodemailer from 'nodemailer';

import type {
  Transporter,
} from 'nodemailer';

/* ============================================================
   TYPES
   ============================================================ */

export type SaMiRegistrationPlan =
  | 'free'
  | 'standard'
  | 'custom';

export interface SendSubscriptionConfirmationEmailInput {
  email: string;

  firstName?:
    | string
    | null;

  businessName: string;

  plan: SaMiRegistrationPlan;

  /*
   * Backend-calculated price per billable user.
   *
   * Free     = 0
   * Standard = 2000
   * Custom   = 3340
   *
   * Do not calculate this from client input.
   */
  pricePerUserMonthly: number;

  billableUsers: number;

  /*
   * Registration must always send 0.
   */
  amountDueToday: number;

  currency?: string;

  /*
   * Paid plans:
   * exactly one calendar month after the trial began.
   *
   * Free plan:
   * null.
   */
  firstBillingAt?:
    | Date
    | string
    | null;

  /*
   * True only when tenant provisioning completed successfully.
   */
  workspaceReady: boolean;
}

export interface SendSubscriptionConfirmationEmailResult {
  success: boolean;

  provider: 'smtp';

  messageId?: string;

  error?: string;
}

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH =
  254;

const MAX_NAME_LENGTH =
  120;

const MAX_BUSINESS_NAME_LENGTH =
  160;

/* ============================================================
   CACHE
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
   TEXT NORMALIZATION
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

function normalizeBusinessName(
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
    throw new Error(
      'Business name is required.'
    );
  }

  return normalized.slice(
    0,
    MAX_BUSINESS_NAME_LENGTH
  );
}

/* ============================================================
   PLAN
   ============================================================ */

function getPlanName(
  plan: SaMiRegistrationPlan
): string {
  switch (plan) {
    case 'free':
      return 'Free';

    case 'standard':
      return 'Standard';

    case 'custom':
      return 'Custom';

    default:
      return 'SaMi';
  }
}

function isPaidPlan(
  plan: SaMiRegistrationPlan
): boolean {
  return (
    plan === 'standard' ||
    plan === 'custom'
  );
}

/* ============================================================
   MONEY
   ============================================================ */

function normalizeMoney(
  value: number,
  fieldName: string
): number {
  if (
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new Error(
      `${fieldName} is invalid.`
    );
  }

  return Number(
    value.toFixed(2)
  );
}

function normalizeBillableUsers(
  value: number
): number {
  if (
    !Number.isInteger(value) ||
    value < 1
  ) {
    throw new Error(
      'Billable users must be at least 1.'
    );
  }

  return value;
}

function normalizeCurrency(
  value:
    | string
    | undefined
): string {
  const currency =
    (
      value ||
      'KES'
    )
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new Error(
      'Currency is invalid.'
    );
  }

  return currency;
}

function formatMoney(
  value: number,
  currency: string
): string {
  try {
    return new Intl.NumberFormat(
      'en-KE',
      {
        style:
          'currency',

        currency,

        minimumFractionDigits:
          0,

        maximumFractionDigits:
          2,
      }
    ).format(
      value
    );
  } catch {
    return `${currency} ${value.toLocaleString(
      'en-KE'
    )}`;
  }
}

/* ============================================================
   DATE
   ============================================================ */

function normalizeBillingDate(
  value:
    | Date
    | string
    | null
    | undefined,
  required: boolean
): Date | null {
  if (!value) {
    if (
      required
    ) {
      throw new Error(
        'First billing date is required for a paid plan.'
      );
    }

    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      'First billing date is invalid.'
    );
  }

  return date;
}

function formatDate(
  value: Date
): string {
  const locale =
    process.env
      .EMAIL_LOCALE ||
    'en-KE';

  const timeZone =
    process.env
      .EMAIL_TIMEZONE ||
    'Africa/Nairobi';

  try {
    return new Intl.DateTimeFormat(
      locale,
      {
        dateStyle:
          'long',

        timeZone,
      }
    ).format(
      value
    );
  } catch {
    return value
      .toISOString()
      .slice(
        0,
        10
      );
  }
}

/* ============================================================
   APP URL / EMAIL ASSETS

   .env.local / Vercel:
   APP_URL=https://your-domain.com

   The logo is served publicly from:
   ${APP_URL}/brand/sami-email-logo.png

   No CID image and no email attachment are used.
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

/*
 * SaMi does not have a native-store download URL yet.
 *
 * The email still shows a professional "Install app" section,
 * but until a real app-store/download destination exists,
 * it opens the main SaMi URL from APP_URL.
 *
 * No fake route or hardcoded public URL is introduced.
 */
function getInstallAppUrl():
  string {
  return getAppUrl();
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
  const configured =
    process.env
      .EMAIL_FROM
      ?.trim();

  if (
    configured
  ) {
    return configured;
  }

  const user =
    requiredEnv(
      'SMTP_USER'
    );

  return `SaMi <${user}>`;
}

function getReplyTo():
  string | undefined {
  const configured =
    process.env
      .EMAIL_REPLY_TO
      ?.trim();

  if (!configured) {
    return undefined;
  }

  const email =
    normalizeEmail(
      configured
    );

  if (
    !isValidEmail(
      email
    )
  ) {
    console.warn(
      '[SaMi] EMAIL_REPLY_TO is invalid and will be ignored.'
    );

    return undefined;
  }

  return email;
}

/* ============================================================
   TEXT EMAIL
   ============================================================ */

function buildTextEmail({
  firstName,
  businessName,
  plan,
  planName,
  pricePerUserMonthly,
  billableUsers,
  monthlyTotal,
  amountDueToday,
  currency,
  firstBillingAt,
  workspaceReady,
  appUrl,
}: {
  firstName: string;

  businessName: string;

  plan: SaMiRegistrationPlan;

  planName: string;

  pricePerUserMonthly: number;

  billableUsers: number;

  monthlyTotal: number;

  amountDueToday: number;

  currency: string;

  firstBillingAt:
    | Date
    | null;

  workspaceReady: boolean;

  appUrl: string;
}): string {
  const paid =
    isPaidPlan(
      plan
    );

  const lines = [
    `Hello ${firstName},`,

    '',

    `Your SaMi ${planName} plan has been confirmed for ${businessName}.`,

    '',

    `Plan: ${planName}`,
  ];

  if (
    paid
  ) {
    lines.push(
      `Price: ${formatMoney(
        pricePerUserMonthly,
        currency
      )}/user/month`,

      `Billable users: ${billableUsers}`,

      `Monthly total after the free month: ${formatMoney(
        monthlyTotal,
        currency
      )}`,

      '',

      'First month: FREE',

      `Amount due today: ${formatMoney(
        amountDueToday,
        currency
      )}`,

      firstBillingAt
        ? `First payment due: ${formatDate(
            firstBillingAt
          )}`
        : '',

      '',

      'No charge was made today.',

      'Your paid plan and workspace are available during the free month.',

      'When the first paid billing cycle becomes due, you will complete the first genuine payment. Recurring billing can then continue after successful enrollment.',

      '',

      'If you cancel before the first paid billing cycle begins, you will have been charged KES 0.'
    );
  } else {
    lines.push(
      `Monthly price: ${formatMoney(
        0,
        currency
      )}`,

      '',

      'No payment method is required for the Free plan.'
    );
  }

  lines.push(
    '',

    workspaceReady
      ? 'Your SaMi workspace is ready.'
      : 'Your SaMi account and plan are confirmed. Your workspace is still being prepared.',

    '',

    `Open SaMi: ${appUrl}`,

    '',

    'SaMi',

    'AI Powered Business Workspace'
  );

  return lines
    .join('\n');
}

/* ============================================================
   HTML EMAIL
   ============================================================ */

function buildHtmlEmail({
  firstName,
  businessName,
  plan,
  planName,
  pricePerUserMonthly,
  billableUsers,
  monthlyTotal,
  amountDueToday,
  currency,
  firstBillingAt,
  workspaceReady,
  appUrl,
  logoUrl,
  installAppUrl,
}: {
  firstName: string;

  businessName: string;

  plan: SaMiRegistrationPlan;

  planName: string;

  pricePerUserMonthly: number;

  billableUsers: number;

  monthlyTotal: number;

  amountDueToday: number;

  currency: string;

  firstBillingAt:
    | Date
    | null;

  workspaceReady: boolean;

  appUrl: string;

  logoUrl: string;

  installAppUrl: string;
}): string {
  const paid =
    isPaidPlan(
      plan
    );

  const safeFirstName =
    escapeHtml(
      firstName
    );

  const safeBusinessName =
    escapeHtml(
      businessName
    );

  const safePlanName =
    escapeHtml(
      planName
    );

  const safeAppUrl =
    escapeHtml(
      appUrl
    );

  const safeLogoUrl =
    escapeHtml(
      logoUrl
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

  const year =
    new Date()
      .getFullYear();

  const billingDetails =
    paid
      ? `
        <tr>
          <td style="${labelStyle}">
            Price
          </td>

          <td style="${valueStyle}">
            ${escapeHtml(
              formatMoney(
                pricePerUserMonthly,
                currency
              )
            )}/user/month
          </td>
        </tr>

        <tr>
          <td style="${labelStyle}">
            Billable users
          </td>

          <td style="${valueStyle}">
            ${billableUsers}
          </td>
        </tr>

        <tr>
          <td style="${labelStyle}">
            Monthly total
          </td>

          <td style="${valueStyle}">
            ${escapeHtml(
              formatMoney(
                monthlyTotal,
                currency
              )
            )}
          </td>
        </tr>

        <tr>
          <td style="${labelStyle}">
            Amount due today
          </td>

          <td style="${valueStyle}">
            ${escapeHtml(
              formatMoney(
                amountDueToday,
                currency
              )
            )}
          </td>
        </tr>

        <tr>
          <td style="${labelStyle}">
            First payment due
          </td>

          <td style="${valueStyle}">
            ${
              firstBillingAt
                ? escapeHtml(
                    formatDate(
                      firstBillingAt
                    )
                  )
                : '—'
            }
          </td>
        </tr>
      `
      : `
        <tr>
          <td style="${labelStyle}">
            Monthly price
          </td>

          <td style="${valueStyle}">
            ${escapeHtml(
              formatMoney(
                0,
                currency
              )
            )}
          </td>
        </tr>

        <tr>
          <td style="${labelStyle}">
            Payment method
          </td>

          <td style="${valueStyle}">
            Not required
          </td>
        </tr>
      `;

  const paidNotice =
    paid
      ? `
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="
            width:100%;
            margin-top:24px;
            background:#f1f6ff;
            border:1px solid #d9e7ff;
            border-radius:14px;
          "
        >
          <tr>
            <td
              style="
                padding:18px;
              "
            >
              <div
                style="
                  font-size:14px;
                  line-height:21px;
                  font-weight:800;
                  color:#164a9f;
                "
              >
                Your first month is free
              </div>

              <p
                style="
                  margin:6px 0 0;
                  font-size:12px;
                  line-height:20px;
                  color:#475569;
                "
              >
                No charge was made today.
                ${
                  firstBillingAt
                    ? `Your first paid billing cycle becomes due on <strong>${escapeHtml(
                        formatDate(
                          firstBillingAt
                        )
                      )}</strong>.`
                    : ''
                }
              </p>

              <p
                style="
                  margin:7px 0 0;
                  font-size:12px;
                  line-height:20px;
                  color:#64748b;
                "
              >
                Your paid-plan access is available throughout the free month.
                When the first paid cycle becomes due, you will complete the
                first genuine payment. Recurring billing can then continue
                after successful enrollment.
              </p>
            </td>
          </tr>
        </table>
      `
      : `
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
            border-radius:14px;
          "
        >
          <tr>
            <td
              style="
                padding:18px;
              "
            >
              <div
                style="
                  font-size:14px;
                  line-height:21px;
                  font-weight:800;
                  color:#111827;
                "
              >
                No payment required
              </div>

              <p
                style="
                  margin:6px 0 0;
                  font-size:12px;
                  line-height:20px;
                  color:#64748b;
                "
              >
                Your Free plan costs KES 0 and does not require
                a payment method.
              </p>
            </td>
          </tr>
        </table>
      `;

  const workspaceTitle =
    workspaceReady
      ? 'Your workspace is ready'
      : 'Your workspace is being prepared';

  const workspaceMessage =
    workspaceReady
      ? 'Your SaMi workspace is available. Sign in to continue.'
      : 'Your account and plan are confirmed while SaMi finishes preparing your workspace.';

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
    SaMi plan confirmation
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
    Your SaMi ${safePlanName} plan has been confirmed.
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
                        text-transform:uppercase;
                        color:#2563c9;
                      "
                    >
                      Plan confirmation
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
                      Your ${safePlanName} plan is confirmed
                    </h1>

                  </td>
                </tr>

                <!-- MAIN CONTENT -->

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
                        margin:10px 0 0;
                        font-size:14px;
                        line-height:23px;
                        color:#475569;
                      "
                    >
                      Your SaMi ${safePlanName} plan for
                      <strong>${safeBusinessName}</strong>
                      has been created successfully.
                    </p>

                    ${
                      paid
                        ? `
                          <div
                            style="
                              display:inline-block;
                              margin-top:18px;
                              padding:7px 11px;
                              border-radius:999px;
                              background:#eaf2ff;
                              color:#164a9f;
                              font-size:11px;
                              line-height:17px;
                              font-weight:900;
                              letter-spacing:0.5px;
                            "
                          >
                            FIRST MONTH FREE
                          </div>
                        `
                        : ''
                    }

                    <!-- PLAN SUMMARY -->

                    <table
                      role="presentation"
                      width="100%"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:22px;
                        border-collapse:collapse;
                      "
                    >

                      <tr>
                        <td style="${labelStyle}">
                          Plan
                        </td>

                        <td style="${valueStyle}">
                          ${safePlanName}
                        </td>
                      </tr>

                      ${billingDetails}

                    </table>

                    ${paidNotice}

                    <!-- WORKSPACE -->

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
                        border-radius:14px;
                      "
                    >
                      <tr>
                        <td
                          style="
                            padding:17px;
                          "
                        >
                          <div
                            style="
                              font-size:13px;
                              line-height:20px;
                              font-weight:800;
                              color:#111827;
                            "
                          >
                            ${workspaceTitle}
                          </div>

                          <div
                            style="
                              margin-top:4px;
                              font-size:12px;
                              line-height:20px;
                              color:#64748b;
                            "
                          >
                            ${workspaceMessage}
                          </div>

                          ${
                            workspaceReady
                              ? `
                                <table
                                  role="presentation"
                                  cellpadding="0"
                                  cellspacing="0"
                                  border="0"
                                  style="
                                    margin-top:14px;
                                  "
                                >
                                  <tr>
                                    <td
                                      bgcolor="#164a9f"
                                      style="
                                        border-radius:9px;
                                      "
                                    >
                                      <a
                                        href="${safeAppUrl}"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style="
                                          display:inline-block;
                                          padding:11px 17px;
                                          border-radius:9px;
                                          background:#164a9f;
                                          color:#ffffff;
                                          text-decoration:none;
                                          font-size:12px;
                                          line-height:17px;
                                          font-weight:800;
                                        "
                                      >
                                        Open workspace
                                      </a>
                                    </td>
                                  </tr>
                                </table>
                              `
                              : ''
                          }
                        </td>
                      </tr>
                    </table>

                    ${
                      paid
                        ? `
                          <p
                            style="
                              margin:20px 0 0;
                              font-size:12px;
                              line-height:20px;
                              color:#64748b;
                            "
                          >
                            Cancel before the first paid billing cycle
                            begins and your total charge for the free
                            month remains KES 0.
                          </p>
                        `
                        : ''
                    }

                  </td>
                </tr>

                <!-- ============================================
                     APP PROMOTION
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
                  href="${safeAppUrl}"
                  target="_blank"
                  rel="noopener noreferrer"
                  style="
                    color:#64748b;
                    text-decoration:none;
                  "
                >
                  SaMi
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
                This is an automated subscription email.
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
   TABLE STYLES
   ============================================================ */

const labelStyle = `
  padding:12px 8px 12px 0;
  border-bottom:1px solid #edf1f6;
  font-size:12px;
  line-height:19px;
  color:#64748b;
  vertical-align:top;
`.replace(
  /\s+/g,
  ' '
);

const valueStyle = `
  padding:12px 0 12px 8px;
  border-bottom:1px solid #edf1f6;
  font-size:12px;
  line-height:19px;
  font-weight:800;
  color:#111827;
  text-align:right;
  vertical-align:top;
`.replace(
  /\s+/g,
  ' '
);

/* ============================================================
   SEND
   ============================================================ */

export async function sendSubscriptionConfirmationEmail(
  input:
    SendSubscriptionConfirmationEmailInput
): Promise<
  SendSubscriptionConfirmationEmailResult
> {
  try {
    /* ========================================================
       NORMALIZE
       ======================================================== */

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

    const businessName =
      normalizeBusinessName(
        input.businessName
      );

    const plan =
      input.plan;

    if (
      plan !== 'free' &&
      plan !== 'standard' &&
      plan !== 'custom'
    ) {
      throw new Error(
        'Subscription plan is invalid.'
      );
    }

    const paid =
      isPaidPlan(
        plan
      );

    const planName =
      getPlanName(
        plan
      );

    const currency =
      normalizeCurrency(
        input.currency
      );

    const pricePerUserMonthly =
      normalizeMoney(
        input.pricePerUserMonthly,
        'Monthly price'
      );

    const billableUsers =
      normalizeBillableUsers(
        input.billableUsers
      );

    const amountDueToday =
      normalizeMoney(
        input.amountDueToday,
        'Amount due today'
      );

    /*
     * Registration billing rule:
     *
     * Free:
     *   KES 0
     *
     * Standard / Custom:
     *   first month free
     *   KES 0 charged today
     */
    if (
      amountDueToday !==
      0
    ) {
      throw new Error(
        'Registration subscription email cannot report an immediate charge.'
      );
    }

    if (
      plan === 'free' &&
      pricePerUserMonthly !==
      0
    ) {
      throw new Error(
        'Free plan monthly price must be zero.'
      );
    }

    if (
      paid &&
      pricePerUserMonthly <=
      0
    ) {
      throw new Error(
        'Paid plan monthly price must be greater than zero.'
      );
    }

    const firstBillingAt =
      normalizeBillingDate(
        input.firstBillingAt,
        paid
      );

    const monthlyTotal =
      Number(
        (
          pricePerUserMonthly *
          billableUsers
        ).toFixed(2)
      );

    const appUrl =
      getAppUrl();

    const logoUrl =
      getEmailLogoUrl();

    const installAppUrl =
      getInstallAppUrl();

    /* ========================================================
       SMTP
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
        '[SaMi] SMTP is not configured. Subscription confirmation email was not delivered.'
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
       CONTENT
       ======================================================== */

    const subject =
      paid
        ? `${planName} plan confirmed — first month free`
        : 'Your SaMi Free plan is ready';

    const text =
      buildTextEmail({
        firstName,

        businessName,

        plan,

        planName,

        pricePerUserMonthly,

        billableUsers,

        monthlyTotal,

        amountDueToday,

        currency,

        firstBillingAt,

        workspaceReady:
          input.workspaceReady,

        appUrl,
      });

    const html =
      buildHtmlEmail({
        firstName,

        businessName,

        plan,

        planName,

        pricePerUserMonthly,

        billableUsers,

        monthlyTotal,

        amountDueToday,

        currency,

        firstBillingAt,

        workspaceReady:
          input.workspaceReady,

        appUrl,

        logoUrl,

        installAppUrl,
      });

    /* ========================================================
       SEND

       IMPORTANT:
       No attachments are sent.
       The SaMi logo is loaded from APP_URL.
       ======================================================== */

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

        headers: {
          'X-SaMi-Email-Type':
            'subscription-confirmation',

          'X-Auto-Response-Suppress':
            'All',

          'Auto-Submitted':
            'auto-generated',
        },
      });

    console.log(
      '[SaMi] Subscription confirmation email delivered successfully.',
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
      '[SaMi] Subscription confirmation email delivery failed:',
      error
    );

    /*
     * Subscription email delivery must never undo or invalidate
     * an otherwise successful registration.
     */
    return {
      success: false,

      provider:
        'smtp',

      error:
        'Subscription confirmation email could not be sent.',
    };
  }
}
