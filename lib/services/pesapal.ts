import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

/* ============================================================
   CONSTANTS
   ============================================================ */

const DEFAULT_CURRENCY = 'KES';

const REQUEST_TIMEOUT_MS = 20_000;

const MAX_DESCRIPTION_LENGTH = 100;

const MAX_MERCHANT_REFERENCE_LENGTH = 50;

/* ============================================================
   TYPES
   ============================================================ */

export type PesaPalFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'YEARLY';

export interface PesaPalOrder {
  tenantId: string;

  subscriptionId:
    | string
    | null;

  amount: number;

  email: string;

  firstName: string;

  lastName: string;

  businessName: string;

  plan: string;

  selectedApps: string[];

  origin?: string;

  phone?: string | null;

  currency?: string;
}

export interface PesaPalRecurringOrder
  extends PesaPalOrder {
  /*
   * Stable identifier from SaMi.
   *
   * For subscriptions this should be:
   *
   * subscription.id
   *
   * PesaPal returns it as OrderMerchantReference on
   * RECURRING IPNs.
   */
  accountNumber: string;

  /*
   * IMPORTANT:
   *
   * This is the date of the NEXT automatic recurring charge.
   *
   * For SaMi:
   *
   * Free month ends
   *      ↓
   * customer makes first actual paid PesaPal payment
   *      ↓
   * recurring startDate = one month after that payment
   */
  startDate:
    | Date
    | string;

  endDate:
    | Date
    | string;

  frequency:
    PesaPalFrequency;
}

interface PesaPalConfig {
  consumerKey: string;

  consumerSecret: string;

  environment:
    | 'sandbox'
    | 'production';

  apiBaseUrl: string;
}

interface PesaPalError {
  type?: string;
  code?: string;
  message?: string;

  error_type?: string;
}

interface PesaPalTokenResponse {
  token?: string;

  expiryDate?: string;

  error?:
    | PesaPalError
    | string
    | null;

  message?: string;
}

interface PesaPalSubmitOrderResponse {
  order_tracking_id?: string;

  merchant_reference?: string;

  redirect_url?: string;

  error?:
    | PesaPalError
    | string
    | number
    | null;

  message?: string;

  status?:
    | string
    | number;
}

interface PesaPalSubscriptionTransactionInfo {
  account_reference?: string;

  amount?:
    | number
    | string;

  first_name?: string;

  last_name?: string;

  correlation_id?:
    | string
    | number;
}

interface PesaPalTransactionStatusResponse {
  payment_status_description?: string;

  payment_status_code?:
    | number
    | string;

  status_code?:
    | number
    | string;

  order_tracking_id?: string;

  merchant_reference?: string;

  amount?:
    | number
    | string;

  currency?: string;

  payment_method?: string;

  confirmation_code?: string;

  created_date?: string;

  payment_account?: string;

  description?: string;

  subscription_transaction_info?:
    PesaPalSubscriptionTransactionInfo | null;

  error?:
    | PesaPalError
    | string
    | null;

  message?: string;

  [key: string]:
    unknown;
}

type SubmitOrderMode =
  | 'one_time'
  | 'recurring_enrollment';

/* ============================================================
   CONFIG
   ============================================================ */

function getPesaPalConfig():
  PesaPalConfig {
  const consumerKey =
    process.env
      .PESAPAL_CONSUMER_KEY
      ?.trim();

  const consumerSecret =
    process.env
      .PESAPAL_CONSUMER_SECRET
      ?.trim();

  const rawEnvironment =
    (
      process.env
        .PESAPAL_ENV ||
      'sandbox'
    )
      .trim()
      .toLowerCase();

  if (!consumerKey) {
    throw new Error(
      'PESAPAL_CONSUMER_KEY is not configured.'
    );
  }

  if (!consumerSecret) {
    throw new Error(
      'PESAPAL_CONSUMER_SECRET is not configured.'
    );
  }

  const environment:
    | 'sandbox'
    | 'production' =
    rawEnvironment ===
    'production'
      ? 'production'
      : 'sandbox';

  /*
   * Official PesaPal API 3.0 base URLs:
   *
   * Sandbox:
   * https://cybqa.pesapal.com/pesapalv3
   *
   * Production:
   * https://pay.pesapal.com/v3
   */
  const rootUrl =
    environment ===
    'production'
      ? 'https://pay.pesapal.com/v3'
      : 'https://cybqa.pesapal.com/pesapalv3';

  return {
    consumerKey,

    consumerSecret,

    environment,

    apiBaseUrl:
      `${rootUrl}/api`,
  };
}

/* ============================================================
   GENERIC HELPERS
   ============================================================ */

function truncate(
  value: string,
  maxLength: number
): string {
  const normalized =
    value.trim();

  if (
    normalized.length <=
    maxLength
  ) {
    return normalized;
  }

  return normalized
    .slice(
      0,
      maxLength
    )
    .trim();
}

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function normalizeCurrency(
  value:
    | string
    | undefined
): string {
  const currency =
    (
      value ||
      DEFAULT_CURRENCY
    )
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z]{3}$/.test(
      currency
    )
  ) {
    throw new Error(
      'Invalid payment currency.'
    );
  }

  return currency;
}

function normalizeAmount(
  value: number
): number {
  const amount =
    Number(value);

  /*
   * PesaPal SubmitOrderRequest is a payment request.
   *
   * SaMi deliberately does NOT use a fake KES 0 payment
   * for the free trial.
   */
  if (
    !Number.isFinite(
      amount
    ) ||
    amount <= 0
  ) {
    throw new Error(
      'PesaPal payment amount must be greater than zero.'
    );
  }

  /*
   * Avoid floating-point noise.
   */
  return Math.round(
    amount * 100
  ) / 100;
}

function normalizeApps(
  apps: string[]
): string[] {
  return [
    ...new Set(
      apps
        .filter(
          (app) =>
            typeof app ===
              'string'
        )
        .map(
          (app) =>
            app
              .trim()
              .toLowerCase()
        )
        .filter(Boolean)
    ),
  ];
}

function createMerchantReference():
  string {
  /*
   * UUID contains only characters accepted by PesaPal:
   *
   * letters
   * numbers
   * dashes
   *
   * and remains below the 50-character limit.
   */
  const reference =
    crypto.randomUUID();

  return reference.slice(
    0,
    MAX_MERCHANT_REFERENCE_LENGTH
  );
}

/* ============================================================
   APP ORIGIN
   ============================================================ */

function getApplicationOrigin(
  suppliedOrigin?: string
): string {
  /*
   * Prefer server-controlled configuration.
   */
  const candidate =
    process.env.APP_URL ||
    process.env
      .NEXT_PUBLIC_APP_URL ||
    suppliedOrigin ||
    'http://localhost:3000';

  try {
    const url =
      new URL(
        candidate
      );

    if (
      url.protocol !==
        'https:' &&
      url.protocol !==
        'http:'
    ) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(
      'SaMi application URL is invalid.'
    );
  }
}

/* ============================================================
   DATE HELPERS
   ============================================================ */

function parseCalendarDate(
  value:
    | Date
    | string
): Date {
  if (
    value instanceof Date
  ) {
    if (
      Number.isNaN(
        value.getTime()
      )
    ) {
      throw new Error(
        'Invalid subscription date.'
      );
    }

    return value;
  }

  const trimmed =
    value.trim();

  /*
   * Support PesaPal's native dd-MM-yyyy format.
   */
  const pesapalMatch =
    /^(\d{2})-(\d{2})-(\d{4})$/.exec(
      trimmed
    );

  if (pesapalMatch) {
    const day =
      Number(
        pesapalMatch[1]
      );

    const month =
      Number(
        pesapalMatch[2]
      );

    const year =
      Number(
        pesapalMatch[3]
      );

    const date =
      new Date(
        Date.UTC(
          year,
          month - 1,
          day
        )
      );

    if (
      date.getUTCFullYear() !==
        year ||
      date.getUTCMonth() !==
        month - 1 ||
      date.getUTCDate() !==
        day
    ) {
      throw new Error(
        'Invalid subscription date.'
      );
    }

    return date;
  }

  /*
   * Also allow ISO dates from SaMi backend services.
   */
  const date =
    new Date(
      trimmed
    );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    throw new Error(
      'Invalid subscription date.'
    );
  }

  return date;
}

function formatPesaPalDate(
  value:
    | Date
    | string
): string {
  const date =
    parseCalendarDate(
      value
    );

  const day =
    String(
      date.getUTCDate()
    ).padStart(
      2,
      '0'
    );

  const month =
    String(
      date.getUTCMonth() +
        1
    ).padStart(
      2,
      '0'
    );

  const year =
    date.getUTCFullYear();

  return `${day}-${month}-${year}`;
}

/* ============================================================
   HTTP
   ============================================================ */

async function fetchWithTimeout(
  input:
    | string
    | URL,
  init: RequestInit
): Promise<Response> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS
    );

  try {
    return await fetch(
      input,
      {
        ...init,

        signal:
          controller.signal,

        cache:
          'no-store',
      }
    );
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.name ===
        'AbortError'
    ) {
      throw new Error(
        'PesaPal request timed out.'
      );
    }

    throw error;
  } finally {
    clearTimeout(
      timer
    );
  }
}

function parseJsonResponse<T>(
  responseText: string
): T | null {
  if (!responseText) {
    return null;
  }

  try {
    return JSON.parse(
      responseText
    ) as T;
  } catch {
    return null;
  }
}

function getPesaPalErrorMessage(
  value: unknown
): string | null {
  if (!value) {
    return null;
  }

  if (
    typeof value ===
    'string'
  ) {
    return value;
  }

  if (
    typeof value ===
      'object' &&
    !Array.isArray(
      value
    )
  ) {
    const error =
      value as Record<
        string,
        unknown
      >;

    if (
      typeof error.message ===
        'string' &&
      error.message.trim()
    ) {
      return error.message
        .trim();
    }

    if (
      typeof error.code ===
        'string' &&
      error.code.trim()
    ) {
      return error.code
        .trim();
    }
  }

  return null;
}

/* ============================================================
   ACCESS TOKEN
   ============================================================ */

export async function getPesaPalAccessToken():
  Promise<string> {
  const {
    consumerKey,
    consumerSecret,
    apiBaseUrl,
  } =
    getPesaPalConfig();

  const response =
    await fetchWithTimeout(
      `${apiBaseUrl}/Auth/RequestToken`,
      {
        method: 'POST',

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',
        },

        body:
          JSON.stringify({
            consumer_key:
              consumerKey,

            consumer_secret:
              consumerSecret,
          }),
      }
    );

  const responseText =
    await response.text();

  const data =
    parseJsonResponse<
      PesaPalTokenResponse
    >(
      responseText
    );

  if (
    !response.ok
  ) {
    console.error(
      '[PesaPal] Authentication failed:',
      {
        status:
          response.status,

        message:
          data?.message ||
          getPesaPalErrorMessage(
            data?.error
          ) ||
          'Authentication request failed.',
      }
    );

    throw new Error(
      'Unable to authenticate with PesaPal.'
    );
  }

  if (
    !data?.token
  ) {
    console.error(
      '[PesaPal] Authentication returned no access token.'
    );

    throw new Error(
      'PesaPal did not return an access token.'
    );
  }

  return data.token;
}

/* ============================================================
   STORE PAYMENT TRANSACTION
   ============================================================ */

async function storePaymentTransaction({
  data,
  orderTrackingId,
  merchantReference,
  amount,
  currency,
  description,
  mode,
  accountNumber,
  recurringStartDate,
  recurringEndDate,
  recurringFrequency,
}: {
  data:
    PesaPalOrder;

  orderTrackingId:
    string;

  merchantReference:
    string;

  amount:
    number;

  currency:
    string;

  description:
    string;

  mode:
    SubmitOrderMode;

  accountNumber?:
    string;

  recurringStartDate?:
    string;

  recurringEndDate?:
    string;

  recurringFrequency?:
    PesaPalFrequency;
}) {
  await queryControl(
    `
      INSERT INTO payment_transactions (
        tenant_id,
        subscription_id,
        provider,
        provider_transaction_id,
        amount,
        currency,
        status,
        description,
        metadata,
        created_at
      )

      VALUES (
        $1,
        $2,
        'pesapal',
        $3,
        $4,
        $5,
        'pending',
        $6,
        $7,
        NOW()
      )
    `,
    [
      data.tenantId,

      data.subscriptionId,

      orderTrackingId,

      amount,

      currency,

      description,

      JSON.stringify({
        merchantReference,

        billingPurpose:
          mode,

        plan:
          data.plan,

        apps:
          normalizeApps(
            data.selectedApps
          ),

        businessName:
          data.businessName
            .trim(),

        email:
          normalizeEmail(
            data.email
          ),

        firstName:
          data.firstName
            .trim(),

        lastName:
          data.lastName
            .trim(),

        accountNumber:
          accountNumber ||
          null,

        subscriptionReference:
          accountNumber ||
          data.subscriptionId ||
          null,

        recurringStartDate:
          recurringStartDate ||
          null,

        recurringEndDate:
          recurringEndDate ||
          null,

        recurringFrequency:
          recurringFrequency ||
          null,

        createdAt:
          new Date()
            .toISOString(),
      }),
    ]
  );
}

/* ============================================================
   CORE SUBMIT ORDER
   ============================================================ */

async function submitPesaPalOrder({
  data,
  mode,
  recurring,
}: {
  data:
    PesaPalOrder;

  mode:
    SubmitOrderMode;

  recurring?: {
    accountNumber:
      string;

    startDate:
      string;

    endDate:
      string;

    frequency:
      PesaPalFrequency;
  };
}) {
  const {
    apiBaseUrl,
  } =
    getPesaPalConfig();

  const token =
    await getPesaPalAccessToken();

  const ipnId =
    process.env
      .PESAPAL_IPN_ID
      ?.trim();

  if (!ipnId) {
    throw new Error(
      'PESAPAL_IPN_ID is not configured.'
    );
  }

  const amount =
    normalizeAmount(
      data.amount
    );

  const currency =
    normalizeCurrency(
      data.currency
    );

  const origin =
    getApplicationOrigin(
      data.origin
    );

  const merchantReference =
    createMerchantReference();

  const callbackUrl =
    `${origin}/api/auth/pesapal-callback`;

  const cancellationUrl =
    `${origin}/auth/payment-cancelled`;

  const email =
    normalizeEmail(
      data.email
    );

  if (!email) {
    throw new Error(
      'Customer email is required for PesaPal.'
    );
  }

  const firstName =
    data.firstName
      .trim();

  const lastName =
    data.lastName
      .trim();

  const businessName =
    data.businessName
      .trim();

  const description =
    truncate(
      `SaMi ${data.plan} Plan - ${businessName}`,
      MAX_DESCRIPTION_LENGTH
    );

  const postData:
    Record<
      string,
      unknown
    > = {
      id:
        merchantReference,

      currency,

      amount,

      description,

      callback_url:
        callbackUrl,

      cancellation_url:
        cancellationUrl,

      notification_id:
        ipnId,

      redirect_mode:
        'TOP_WINDOW',

      billing_address: {
        email_address:
          email,

        phone_number:
          data.phone?.trim() ||
          '',

        country_code:
          'KE',

        first_name:
          firstName,

        middle_name:
          '',

        last_name:
          lastName,

        line_1:
          '',

        line_2:
          '',

        city:
          '',

        state:
          '',

        postal_code:
          '',

        zip_code:
          '',
      },
    };

  /* ==========================================================
     RECURRING ENROLLMENT
     ========================================================== */

  if (recurring) {
    postData.account_number =
      recurring.accountNumber;

    postData.subscription_details =
      {
        start_date:
          recurring.startDate,

        end_date:
          recurring.endDate,

        frequency:
          recurring.frequency,
      };
  }

  const response =
    await fetchWithTimeout(
      `${apiBaseUrl}/Transactions/SubmitOrderRequest`,
      {
        method: 'POST',

        headers: {
          Accept:
            'application/json',

          'Content-Type':
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },

        body:
          JSON.stringify(
            postData
          ),
      }
    );

  const responseText =
    await response.text();

  const result =
    parseJsonResponse<
      PesaPalSubmitOrderResponse
    >(
      responseText
    );

  if (
    !response.ok
  ) {
    const providerMessage =
      result?.message ||
      getPesaPalErrorMessage(
        result?.error
      );

    console.error(
      '[PesaPal] Submit order failed:',
      {
        status:
          response.status,

        message:
          providerMessage ||
          'Unknown provider error.',
      }
    );

    throw new Error(
      'PesaPal could not create the payment request.'
    );
  }

  const orderTrackingId =
    result
      ?.order_tracking_id
      ?.trim();

  const redirectUrl =
    result
      ?.redirect_url
      ?.trim();

  if (
    !orderTrackingId ||
    !redirectUrl
  ) {
    console.error(
      '[PesaPal] Incomplete SubmitOrderRequest response.'
    );

    throw new Error(
      'PesaPal did not return a valid payment order.'
    );
  }

  const returnedReference =
    result
      ?.merchant_reference
      ?.trim() ||
    merchantReference;

  /*
   * The payment transaction is written only AFTER PesaPal
   * successfully creates the remote order.
   */
  await storePaymentTransaction({
    data,

    orderTrackingId,

    merchantReference:
      returnedReference,

    amount,

    currency,

    description,

    mode,

    accountNumber:
      recurring
        ?.accountNumber,

    recurringStartDate:
      recurring
        ?.startDate,

    recurringEndDate:
      recurring
        ?.endDate,

    recurringFrequency:
      recurring
        ?.frequency,
  });

  return {
    orderTrackingId,

    merchantReference:
      returnedReference,

    redirectUrl,

    amount,

    currency,

    recurring:
      Boolean(
        recurring
      ),

    accountNumber:
      recurring
        ?.accountNumber ||
      null,

    recurringStartDate:
      recurring
        ?.startDate ||
      null,

    recurringEndDate:
      recurring
        ?.endDate ||
      null,

    recurringFrequency:
      recurring
        ?.frequency ||
      null,
  };
}

/* ============================================================
   NORMAL ONE-TIME PAYMENT
   ============================================================ */

export async function createPesaPalOrder(
  data: PesaPalOrder
) {
  return submitPesaPalOrder({
    data,

    mode:
      'one_time',
  });
}

/* ============================================================
   RECURRING PAYMENT ENROLLMENT
   ============================================================ */

export async function createPesaPalRecurringOrder(
  data:
    PesaPalRecurringOrder
) {
  const accountNumber =
    data.accountNumber
      .trim();

  if (!accountNumber) {
    throw new Error(
      'PesaPal recurring account number is required.'
    );
  }

  const startDate =
    formatPesaPalDate(
      data.startDate
    );

  const endDate =
    formatPesaPalDate(
      data.endDate
    );

  const start =
    parseCalendarDate(
      data.startDate
    );

  const end =
    parseCalendarDate(
      data.endDate
    );

  if (
    end.getTime() <=
    start.getTime()
  ) {
    throw new Error(
      'Recurring payment end date must be after the start date.'
    );
  }

  const allowedFrequencies:
    PesaPalFrequency[] =
    [
      'DAILY',
      'WEEKLY',
      'MONTHLY',
      'YEARLY',
    ];

  if (
    !allowedFrequencies.includes(
      data.frequency
    )
  ) {
    throw new Error(
      'Unsupported PesaPal recurring frequency.'
    );
  }

  /*
   * IMPORTANT:
   *
   * This initial amount MUST be a real positive payment.
   *
   * PesaPal uses the successful payment to allow the
   * customer to authorize recurring card billing.
   */
  normalizeAmount(
    data.amount
  );

  return submitPesaPalOrder({
    data,

    mode:
      'recurring_enrollment',

    recurring: {
      accountNumber,

      startDate,

      endDate,

      frequency:
        data.frequency,
    },
  });
}

/* ============================================================
   TRANSACTION STATUS
   ============================================================ */

function numberOrNull(
  value: unknown
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const parsed =
    Number(value);

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    return null;
  }

  return parsed;
}

export async function getPesaPalTransactionStatus(
  orderTrackingId: string
) {
  const normalizedTrackingId =
    orderTrackingId
      .trim();

  if (
    !normalizedTrackingId
  ) {
    throw new Error(
      'PesaPal order tracking ID is required.'
    );
  }

  const {
    apiBaseUrl,
  } =
    getPesaPalConfig();

  const token =
    await getPesaPalAccessToken();

  const searchParams =
    new URLSearchParams({
      orderTrackingId:
        normalizedTrackingId,
    });

  const response =
    await fetchWithTimeout(
      `${apiBaseUrl}/Transactions/GetTransactionStatus?${searchParams.toString()}`,
      {
        method: 'GET',

        headers: {
          Accept:
            'application/json',

          Authorization:
            `Bearer ${token}`,
        },
      }
    );

  const responseText =
    await response.text();

  const result =
    parseJsonResponse<
      PesaPalTransactionStatusResponse
    >(
      responseText
    );

  if (
    !response.ok
  ) {
    console.error(
      '[PesaPal] Transaction status request failed:',
      {
        status:
          response.status,

        orderTrackingId:
          normalizedTrackingId,

        message:
          result?.message ||
          getPesaPalErrorMessage(
            result?.error
          ) ||
          'Unknown provider error.',
      }
    );

    throw new Error(
      'Unable to verify payment status with PesaPal.'
    );
  }

  if (!result) {
    throw new Error(
      'PesaPal returned an invalid transaction status response.'
    );
  }

  const status =
    String(
      result
        .payment_status_description ||
      ''
    )
      .trim()
      .toUpperCase();

  const subscriptionInfo =
    result
      .subscription_transaction_info;

  return {
    status,

    orderTrackingId:
      result
        .order_tracking_id ||
      normalizedTrackingId,

    merchantReference:
      result
        .merchant_reference ||
      null,

    amount:
      numberOrNull(
        result.amount
      ),

    currency:
      typeof result.currency ===
        'string'
        ? result.currency
            .trim()
            .toUpperCase()
        : null,

    paymentMethod:
      result
        .payment_method ||
      null,

    confirmationCode:
      result
        .confirmation_code ||
      null,

    paymentStatusCode:
      numberOrNull(
        result
          .payment_status_code ??
        result
          .status_code
      ),

    createdDate:
      result
        .created_date ||
      null,

    paymentAccount:
      result
        .payment_account ||
      null,

    description:
      result.description ||
      null,

    /*
     * PesaPal adds this object for RECURRING transactions.
     */
    subscriptionTransactionInfo:
      subscriptionInfo
        ? {
            accountReference:
              subscriptionInfo
                .account_reference ||
              null,

            amount:
              numberOrNull(
                subscriptionInfo
                  .amount
              ),

            firstName:
              subscriptionInfo
                .first_name ||
              null,

            lastName:
              subscriptionInfo
                .last_name ||
              null,

            correlationId:
              subscriptionInfo
                .correlation_id ??
              null,
          }
        : null,

    raw:
      result,
  };
}