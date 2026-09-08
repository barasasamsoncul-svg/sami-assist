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
   * Registration must currently always send 0.
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
   CACHE
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
      '[SaMi] Subscription email logo could not be loaded:',
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

      `Amount charged today: ${formatMoney(
        amountDueToday,
        currency
      )}`,

      firstBillingAt
        ? `First payment due: ${formatDate(
            firstBillingAt
          )}`
        : '',

      '',

      'No subscription payment was taken during registration.',

      'When the first paid billing cycle becomes due, SaMi will ask you to complete the first genuine payment. Recurring billing can then continue after successful enrollment.',

      '',

      'If you cancel before the first paid billing cycle begins, you will have been charged KES 0 for the free month.'
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

    'You can manage your plan and billing from SaMi Settings.',

    '',

    'SaMi',

    'AI Powered Business Workspace'
  );

  return lines
    .filter(
      (line) =>
        line !== ''
          ? true
          : true
    )
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
  hasLogo,
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

  hasLogo: boolean;
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
            Amount charged today
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
            margin-top:26px;
          "
        >
          <tr>
            <td
              style="
                padding:18px;
                background:#f0f7ff;
                border:1px solid #cfe0ff;
                border-radius:12px;
              "
            >
              <div
                style="
                  font-size:15px;
                  line-height:22px;
                  font-weight:800;
                  color:#163d8f;
                "
              >
                Your first month is free
              </div>

              <p
                style="
                  margin:8px 0 0;
                  font-size:13px;
                  line-height:21px;
                  color:#475569;
                "
              >
                SaMi charged
                <strong>
                  ${escapeHtml(
                    formatMoney(
                      amountDueToday,
                      currency
                    )
                  )}
                </strong>
                today.
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
                  margin:8px 0 0;
                  font-size:13px;
                  line-height:21px;
                  color:#475569;
                "
              >
                No payment was taken during registration.
                When your first paid cycle becomes due, you will
                complete the first genuine payment. Recurring
                billing can then continue after successful
                enrollment.
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
            margin-top:26px;
          "
        >
          <tr>
            <td
              style="
                padding:18px;
                background:#f8fafc;
                border:1px solid #e2e8f0;
                border-radius:12px;
              "
            >
              <div
                style="
                  font-size:14px;
                  line-height:21px;
                  font-weight:700;
                  color:#0f172a;
                "
              >
                No payment required
              </div>

              <p
                style="
                  margin:6px 0 0;
                  font-size:13px;
                  line-height:21px;
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

  return `
<!DOCTYPE html>

<html lang="en">

<head>
  <meta charset="UTF-8">

  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>
    SaMi plan confirmation
  </title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f3f6fb;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  "
>

  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
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
                  margin-bottom:8px;
                  font-size:12px;
                  line-height:18px;
                  font-weight:700;
                  letter-spacing:1.3px;
                  text-transform:uppercase;
                  color:#315fb5;
                "
              >
                Plan confirmation
              </div>

              <h1
                style="
                  margin:0;
                  font-size:25px;
                  line-height:34px;
                  color:#0f172a;
                "
              >
                Your ${safePlanName} plan is confirmed
              </h1>

              <p
                style="
                  margin:14px 0 0;
                  font-size:15px;
                  line-height:25px;
                  color:#475569;
                "
              >
                Hello ${safeFirstName}, your SaMi plan for
                <strong>${safeBusinessName}</strong>
                has been created successfully.
              </p>

              ${
                paid
                  ? `
                    <div
                      style="
                        display:inline-block;
                        margin-top:20px;
                        padding:7px 12px;
                        border-radius:999px;
                        background:#eaf2ff;
                        color:#163d8f;
                        font-size:12px;
                        line-height:18px;
                        font-weight:800;
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
                  margin-top:24px;
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
                  margin-top:26px;
                "
              >
                <tr>
                  <td
                    style="
                      padding:16px;
                      border-left:3px solid ${
                        workspaceReady
                          ? '#16a34a'
                          : '#315fb5'
                      };
                      background:#f8fafc;
                      border-radius:6px;
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
                      ${
                        workspaceReady
                          ? 'Your workspace is ready.'
                          : 'Your workspace is being prepared.'
                      }
                    </strong>

                    ${
                      workspaceReady
                        ? ' You can use your SaMi workspace after completing the required sign-in and verification steps.'
                        : ' Your account and plan are safe while SaMi finishes preparing the workspace.'
                    }
                  </td>
                </tr>
              </table>

              ${
                paid
                  ? `
                    <p
                      style="
                        margin:22px 0 0;
                        font-size:13px;
                        line-height:21px;
                        color:#64748b;
                      "
                    >
                      If the subscription is cancelled before
                      the first paid billing cycle begins,
                      KES 0 will have been charged for the free
                      month.
                    </p>
                  `
                  : ''
              }

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
                You can manage your subscription from
                SaMi Settings → Billing.
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
   TABLE STYLES
   ============================================================ */

const labelStyle = `
  padding:12px 8px 12px 0;
  border-bottom:1px solid #edf1f6;
  font-size:13px;
  line-height:20px;
  color:#64748b;
  vertical-align:top;
`.replace(
  /\s+/g,
  ' '
);

const valueStyle = `
  padding:12px 0 12px 8px;
  border-bottom:1px solid #edf1f6;
  font-size:13px;
  line-height:20px;
  font-weight:700;
  color:#0f172a;
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
       LOGO
       ======================================================== */

    const logo =
      await getEmailLogo();

    const hasLogo =
      Boolean(
        logo
      );

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

        hasLogo,
      });

    /* ========================================================
       SEND
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

        /*
         * Same SaMi PNG already installed in:
         *
         * public/brand/sami-email-logo.png
         *
         * The image travels inside the email.
         * No domain is required.
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
     * IMPORTANT:
     *
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