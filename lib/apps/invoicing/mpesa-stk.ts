import 'server-only';

import crypto from 'node:crypto';

import type {
  InvoicePaymentProviderSecrets,
  NormalizedInvoicePayment,
} from '@/lib/apps/invoicing/payment-provider-adapters';
import {
  recordVerifiedExternalInvoiceSettlement,
} from '@/lib/apps/invoicing/external-settlement';
import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';
import {
  openIntegrationSecret,
} from '@/lib/integrations/crypto';

const REQUEST_TIMEOUT_MS = 15_000;
const MPESA_PROVIDER_KEY = 'invoicing_payment_mpesa';

type MpesaStkConnection = {
  id: string;
  providerKey: string;
  ownerUserId: string;
  secrets: InvoicePaymentProviderSecrets;
};

type MpesaStkIntent = {
  id: string;
  companyId: string;
  connectionId: string;
  ownerUserId: string;
  providerKey: string;
  status: string;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  checkoutRequestId: string | null;
  merchantRequestId: string | null;
  callbackTokenHash: string;
  secrets: InvoicePaymentProviderSecrets;
};

function cleanString(
  value: unknown,
  max = 1_000,
) {
  return typeof value === 'string'
    ? value
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .trim()
        .slice(0, max)
    : '';
}

function safeObject(
  value: unknown,
) {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function safeArray(
  value: unknown,
) {
  return Array.isArray(value)
    ? value
    : [];
}

function providerBase(
  environment:
    InvoicePaymentProviderSecrets['environment'],
) {
  return environment === 'live'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () =>
        controller.abort(),
      REQUEST_TIMEOUT_MS,
    );
  try {
    return await fetch(
      url,
      {
        ...init,
        cache: 'no-store',
        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}

async function jsonBody(
  response: Response,
) {
  return safeObject(
    await response
      .json()
      .catch(
        () => ({}),
      ),
  );
}

function requireMpesaStkSecrets(
  secrets:
    InvoicePaymentProviderSecrets,
) {
  if (
    secrets.provider !==
      'mpesa' ||
    !secrets.consumerKey ||
    !secrets.consumerSecret ||
    !secrets.shortCode ||
    !secrets.passkey ||
    !secrets.shortCodeType
  ) {
    throw new Error(
      'M-PESA Express is not fully configured. Reconnect M-PESA with the shortcode type and Lipa na M-PESA Online passkey.',
    );
  }
  return secrets as
    InvoicePaymentProviderSecrets & {
      consumerKey: string;
      consumerSecret: string;
      shortCode: string;
      passkey: string;
      shortCodeType:
        'paybill' |
        'till';
    };
}

async function mpesaToken(
  secrets:
    InvoicePaymentProviderSecrets,
) {
  const stk =
    requireMpesaStkSecrets(
      secrets,
    );
  const authorization =
    Buffer.from(
      stk.consumerKey +
        ':' +
        stk.consumerSecret,
      'utf8',
    ).toString(
      'base64',
    );

  const response =
    await fetchWithTimeout(
      providerBase(
        stk.environment,
      ) +
        '/oauth/v1/generate?grant_type=client_credentials',
      {
        method:
          'GET',
        headers: {
          Accept:
            'application/json',
          Authorization:
            'Basic ' +
            authorization,
        },
      },
    );

  const body =
    await jsonBody(
      response,
    );
  const token =
    cleanString(
      body.access_token,
      8_000,
    );

  if (
    !response.ok ||
    !token
  ) {
    throw new Error(
      cleanString(
        body.errorMessage,
        400,
      ) ||
      'Safaricom Daraja could not authorize M-PESA Express.',
    );
  }

  return token;
}

function mpesaTimestamp(
  now =
    new Date(),
) {
  const eastAfrica =
    new Date(
      now.getTime() +
      3 *
        60 *
        60 *
        1000,
    );

  const pad =
    (
      value: number,
    ) =>
      String(
        value,
      ).padStart(
        2,
        '0',
      );

  return (
    String(
      eastAfrica.getUTCFullYear(),
    ) +
    pad(
      eastAfrica.getUTCMonth() +
        1,
    ) +
    pad(
      eastAfrica.getUTCDate(),
    ) +
    pad(
      eastAfrica.getUTCHours(),
    ) +
    pad(
      eastAfrica.getUTCMinutes(),
    ) +
    pad(
      eastAfrica.getUTCSeconds(),
    )
  );
}

function mpesaPassword(
  shortCode:
    string,
  passkey:
    string,
  timestamp:
    string,
) {
  return Buffer.from(
    shortCode +
      passkey +
      timestamp,
    'utf8',
  ).toString(
    'base64',
  );
}

export function normalizeKenyanMpesaPhone(
  value: unknown,
) {
  let phone =
    cleanString(
      value,
      40,
    ).replace(
      /[\s()-]/g,
      '',
    );

  if (
    phone.startsWith(
      '+',
    )
  ) {
    phone =
      phone.slice(
        1,
      );
  }

  if (
    phone.startsWith(
      '0',
    )
  ) {
    phone =
      '254' +
      phone.slice(
        1,
      );
  }

  if (
    phone.startsWith(
      '7',
    ) ||
    phone.startsWith(
      '1',
    )
  ) {
    phone =
      '254' +
      phone;
  }

  if (
    !/^254(?:7\d{8}|1\d{8})$/.test(
      phone,
    )
  ) {
    throw new Error(
      'Enter a valid Kenyan M-PESA phone number, for example 0712345678.',
    );
  }

  return phone;
}

function accountReference(
  invoiceNumber:
    string,
) {
  const compact =
    invoiceNumber
      .replace(
        /[^A-Za-z0-9]/g,
        '',
      )
      .slice(
        0,
        12,
      );

  return (
    compact ||
    'SaMiInvoice'
  );
}

function callbackTokenHash(
  value: string,
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      value,
      'utf8',
    )
    .digest(
      'hex',
    );
}

function callbackMetadata(
  callback:
    Record<string, unknown>,
) {
  const metadata =
    safeObject(
      callback.CallbackMetadata,
    );

  const map =
    new Map<
      string,
      unknown
    >();

  for (
    const rawItem
    of safeArray(
      metadata.Item,
    )
  ) {
    const item =
      safeObject(
        rawItem,
      );
    const name =
      cleanString(
        item.Name,
        80,
      );
    if (
      name
    ) {
      map.set(
        name,
        item.Value,
      );
    }
  }

  return map;
}

function paymentDateFromMpesa(
  value: unknown,
) {
  const text =
    String(
      value ||
      '',
    ).replace(
      /\D/g,
      '',
    );

  if (
    !/^\d{14}$/.test(
      text,
    )
  ) {
    return undefined;
  }

  const year =
    Number(
      text.slice(
        0,
        4,
      ),
    );
  const month =
    Number(
      text.slice(
        4,
        6,
      ),
    );
  const day =
    Number(
      text.slice(
        6,
        8,
      ),
    );
  const hour =
    Number(
      text.slice(
        8,
        10,
      ),
    );
  const minute =
    Number(
      text.slice(
        10,
        12,
      ),
    );
  const second =
    Number(
      text.slice(
        12,
        14,
      ),
    );

  return new Date(
    Date.UTC(
      year,
      month -
        1,
      day,
      hour -
        3,
      minute,
      second,
    ),
  ).toISOString();
}

function isWholeKesAmount(
  amount: number,
  currency: string,
) {
  return (
    currency
      .trim()
      .toUpperCase() ===
      'KES' &&
    Number.isFinite(
      amount,
    ) &&
    amount >=
      1 &&
    Number.isInteger(
      amount,
    )
  );
}

export function mpesaStkCheckoutRequirement(
  input: {
    secrets:
      InvoicePaymentProviderSecrets;
    amount:
      number;
    currency:
      string;
  },
) {
  try {
    requireMpesaStkSecrets(
      input.secrets,
    );
  } catch (
    error
  ) {
    return error instanceof
      Error
      ? error.message
      : 'M-PESA Express is not configured.';
  }

  if (
    !isWholeKesAmount(
      input.amount,
      input.currency,
    )
  ) {
    return 'M-PESA STK Push is available for whole-KES invoice balances of at least KSh 1.';
  }

  return null;
}

async function createIntent(
  input: {
    tenantId:
      string;
    companyId:
      string;
    connection:
      MpesaStkConnection;
    invoiceId:
      string;
    invoiceNumber:
      string;
    amount:
      number;
    currency:
      string;
    phoneNumber:
      string;
    callbackTokenHash:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  const id =
    crypto.randomUUID();

  await pool.query(
    `
      INSERT INTO integration_events (
        id,
        company_id,
        connection_id,
        provider_key,
        event_key,
        external_event_id,
        payload,
        status,
        occurred_at,
        created_at
      )
      VALUES (
        $1,
        $2::uuid,
        $3::uuid,
        $4,
        'invoicing.mpesa_stk.intent',
        $5,
        $6::jsonb,
        'pending',
        NOW(),
        NOW()
      )
    `,
    [
      id,
      input.companyId,
      input.connection.id,
      input.connection.providerKey,
      id,
      JSON.stringify({
        invoiceId:
          input.invoiceId,
        invoiceNumber:
          input.invoiceNumber,
        amount:
          input.amount,
        currency:
          input.currency,
        provider:
          'mpesa',
        phoneSuffix:
          input.phoneNumber.slice(
            -4,
          ),
        callbackTokenHash:
          input.callbackTokenHash,
      }),
    ],
  );

  return id;
}

async function markIntentFailed(
  input: {
    tenantId:
      string;
    eventId:
      string;
    message:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE integration_events
      SET
        status='failed',
        processed_at=NOW(),
        payload=
          COALESCE(
            payload,
            '{}'::jsonb
          ) ||
          jsonb_build_object(
            'failure',
            $2::text
          )
      WHERE id=$1::uuid
    `,
    [
      input.eventId,
      input.message
        .replace(
          /[\u0000-\u001f\u007f]/g,
          ' ',
        )
        .replace(
          /\s+/g,
          ' ',
        )
        .trim()
        .slice(
          0,
          500,
        ),
    ],
  );
}

async function markIntentCreated(
  input: {
    tenantId:
      string;
    eventId:
      string;
    checkoutRequestId:
      string;
    merchantRequestId:
      string;
    customerMessage:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE integration_events
      SET
        event_key=
          'invoicing.mpesa_stk.created',
        external_event_id=
          $2,
        payload=
          COALESCE(
            payload,
            '{}'::jsonb
          ) ||
          jsonb_build_object(
            'checkoutRequestId',
            $2::text,
            'merchantRequestId',
            $3::text,
            'customerMessage',
            $4::text
          )
      WHERE id=$1::uuid
    `,
    [
      input.eventId,
      input.checkoutRequestId,
      input.merchantRequestId,
      input.customerMessage,
    ],
  );
}

export async function createMpesaStkPush(
  input: {
    tenantId:
      string;
    companyId:
      string;
    connection:
      MpesaStkConnection;
    invoiceId:
      string;
    invoiceNumber:
      string;
    amount:
      number;
    currency:
      string;
    phoneNumber:
      unknown;
    callbackOrigin:
      string;
  },
) {
  const secrets =
    requireMpesaStkSecrets(
      input.connection
        .secrets,
    );

  const requirement =
    mpesaStkCheckoutRequirement({
      secrets,
      amount:
        input.amount,
      currency:
        input.currency,
    });

  if (
    requirement
  ) {
    throw new Error(
      requirement,
    );
  }

  const phoneNumber =
    normalizeKenyanMpesaPhone(
      input.phoneNumber,
    );

  const callbackToken =
    crypto
      .randomBytes(
        32,
      )
      .toString(
        'base64url',
      );

  const tokenHash =
    callbackTokenHash(
      callbackToken,
    );

  const eventId =
    await createIntent({
      tenantId:
        input.tenantId,
      companyId:
        input.companyId,
      connection:
        input.connection,
      invoiceId:
        input.invoiceId,
      invoiceNumber:
        input.invoiceNumber,
      amount:
        input.amount,
      currency:
        input.currency,
      phoneNumber,
      callbackTokenHash:
        tokenHash,
    });

  try {
    const token =
      await mpesaToken(
        secrets,
      );
    const timestamp =
      mpesaTimestamp();
    const password =
      mpesaPassword(
        secrets.shortCode,
        secrets.passkey,
        timestamp,
      );

    const callbackUrl =
      input.callbackOrigin +
      '/api/public/invoicing/mpesa-stk/' +
      encodeURIComponent(
        input.tenantId,
      ) +
      '/' +
      encodeURIComponent(
        callbackToken,
      );

    const response =
      await fetchWithTimeout(
        providerBase(
          secrets.environment,
        ) +
          '/mpesa/stkpush/v1/processrequest',
        {
          method:
            'POST',
          headers: {
            Accept:
              'application/json',
            'Content-Type':
              'application/json',
            Authorization:
              'Bearer ' +
              token,
          },
          body:
            JSON.stringify({
              BusinessShortCode:
                secrets.shortCode,
              Password:
                password,
              Timestamp:
                timestamp,
              TransactionType:
                secrets.shortCodeType ===
                  'till'
                  ? 'CustomerBuyGoodsOnline'
                  : 'CustomerPayBillOnline',
              Amount:
                input.amount,
              PartyA:
                phoneNumber,
              PartyB:
                secrets.shortCode,
              PhoneNumber:
                phoneNumber,
              CallBackURL:
                callbackUrl,
              AccountReference:
                accountReference(
                  input.invoiceNumber,
                ),
              TransactionDesc:
                'SaMi invoice',
            }),
        },
      );

    const body =
      await jsonBody(
        response,
      );

    const responseCode =
      cleanString(
        body.ResponseCode,
        20,
      );
    const checkoutRequestId =
      cleanString(
        body.CheckoutRequestID,
        255,
      );
    const merchantRequestId =
      cleanString(
        body.MerchantRequestID,
        255,
      );
    const customerMessage =
      cleanString(
        body.CustomerMessage,
        500,
      ) ||
      cleanString(
        body.ResponseDescription,
        500,
      ) ||
      'Check your phone and enter your M-PESA PIN.';

    if (
      !response.ok ||
      responseCode !==
        '0' ||
      !checkoutRequestId ||
      !merchantRequestId
    ) {
      throw new Error(
        cleanString(
          body.errorMessage,
          500,
        ) ||
        cleanString(
          body.ResponseDescription,
          500,
        ) ||
        'Safaricom could not start the M-PESA phone prompt.',
      );
    }

    await markIntentCreated({
      tenantId:
        input.tenantId,
      eventId,
      checkoutRequestId,
      merchantRequestId,
      customerMessage,
    });

    return {
      mode:
        'stk' as const,
      checkoutRequestId,
      merchantRequestId,
      message:
        customerMessage,
    };
  } catch (
    error
  ) {
    await markIntentFailed({
      tenantId:
        input.tenantId,
      eventId,
      message:
        error instanceof
          Error
          ? error.message
          : 'M-PESA STK request failed.',
    });

    throw error;
  }
}

async function queryMpesaStk(
  secrets:
    InvoicePaymentProviderSecrets,
  checkoutRequestId:
    string,
) {
  const stk =
    requireMpesaStkSecrets(
      secrets,
    );
  const token =
    await mpesaToken(
      stk,
    );
  const timestamp =
    mpesaTimestamp();
  const password =
    mpesaPassword(
      stk.shortCode,
      stk.passkey,
      timestamp,
    );

  const response =
    await fetchWithTimeout(
      providerBase(
        stk.environment,
      ) +
        '/mpesa/stkpushquery/v1/query',
      {
        method:
          'POST',
        headers: {
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
          Authorization:
            'Bearer ' +
            token,
        },
        body:
          JSON.stringify({
            BusinessShortCode:
              stk.shortCode,
            Password:
              password,
            Timestamp:
              timestamp,
            CheckoutRequestID:
              checkoutRequestId,
          }),
      },
    );

  const body =
    await jsonBody(
      response,
    );

  if (
    !response.ok
  ) {
    throw new Error(
      cleanString(
        body.errorMessage,
        500,
      ) ||
      cleanString(
        body.ResponseDescription,
        500,
      ) ||
      'Safaricom could not verify the M-PESA prompt.',
    );
  }

  const responseCode =
    cleanString(
      body.ResponseCode,
      20,
    );

  if (
    responseCode &&
    responseCode !==
      '0'
  ) {
    throw new Error(
      cleanString(
        body.ResponseDescription,
        500,
      ) ||
      'Safaricom rejected the M-PESA status check.',
    );
  }

  const resultCode =
    cleanString(
      body.ResultCode,
      40,
    );

  return {
    resultCode:
      resultCode ||
      null,
    resultDesc:
      cleanString(
        body.ResultDesc,
        500,
      ) ||
      cleanString(
        body.ResponseDescription,
        500,
      ) ||
      '',
    merchantRequestId:
      cleanString(
        body.MerchantRequestID,
        255,
      ) ||
      null,
    checkoutRequestId:
      cleanString(
        body.CheckoutRequestID,
        255,
      ) ||
      checkoutRequestId,
  };
}

function intentFromRow(
  row:
    Record<string, unknown>,
) {
  const payload =
    safeObject(
      row.payload,
    );

  const sealed =
    openIntegrationSecret<{
      providerData?:
        InvoicePaymentProviderSecrets;
    }>(
      String(
        row.sealed_payload,
      ),
    );

  if (
    !sealed.providerData ||
    sealed.providerData.provider !==
      'mpesa'
  ) {
    throw new Error(
      'M-PESA merchant credentials are unavailable.',
    );
  }

  return {
    id:
      String(
        row.id,
      ),
    companyId:
      String(
        row.company_id,
      ),
    connectionId:
      String(
        row.connection_id,
      ),
    ownerUserId:
      String(
        row.owner_user_id,
      ),
    providerKey:
      String(
        row.provider_key,
      ),
    status:
      String(
        row.status,
      ),
    invoiceId:
      cleanString(
        payload.invoiceId,
        100,
      ),
    invoiceNumber:
      cleanString(
        payload.invoiceNumber,
        160,
      ),
    amount:
      Number(
        payload.amount ||
        0,
      ),
    currency:
      cleanString(
        payload.currency,
        12,
      ).toUpperCase(),
    checkoutRequestId:
      cleanString(
        payload.checkoutRequestId,
        255,
      ) ||
      null,
    merchantRequestId:
      cleanString(
        payload.merchantRequestId,
        255,
      ) ||
      null,
    callbackTokenHash:
      cleanString(
        payload.callbackTokenHash,
        100,
      ),
    secrets:
      sealed.providerData,
  } satisfies MpesaStkIntent;
}

async function loadIntentByCallbackToken(
  input: {
    tenantId:
      string;
    callbackToken:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  const tokenHash =
    callbackTokenHash(
      input.callbackToken,
    );

  const result =
    await pool.query(
      `
        SELECT
          e.id,
          e.company_id,
          e.connection_id,
          e.provider_key,
          e.payload,
          e.status,
          c.owner_user_id,
          cr.sealed_payload
        FROM integration_events e
        INNER JOIN integration_connections c
          ON c.id=e.connection_id
         AND c.company_id=e.company_id
        INNER JOIN integration_credentials cr
          ON cr.connection_id=c.id
        WHERE e.provider_key=$1
          AND e.event_key IN (
            'invoicing.mpesa_stk.intent',
            'invoicing.mpesa_stk.created'
          )
          AND e.payload->>'callbackTokenHash'=$2
          AND c.status='connected'
          AND c.archived_at IS NULL
        ORDER BY e.created_at DESC
        LIMIT 1
      `,
      [
        MPESA_PROVIDER_KEY,
        tokenHash,
      ],
    );

  if (
    !result.rows[0]
  ) {
    return null;
  }

  return intentFromRow(
    result.rows[0],
  );
}

async function loadIntentByCheckout(
  input: {
    tenantId:
      string;
    companyId:
      string;
    invoiceId:
      string;
    checkoutRequestId:
      string;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );
  const result =
    await pool.query(
      `
        SELECT
          e.id,
          e.company_id,
          e.connection_id,
          e.provider_key,
          e.payload,
          e.status,
          c.owner_user_id,
          cr.sealed_payload
        FROM integration_events e
        INNER JOIN integration_connections c
          ON c.id=e.connection_id
         AND c.company_id=e.company_id
        INNER JOIN integration_credentials cr
          ON cr.connection_id=c.id
        WHERE e.company_id=$1::uuid
          AND e.provider_key=$2
          AND e.payload->>'invoiceId'=$3
          AND e.payload->>'checkoutRequestId'=$4
          AND c.status='connected'
          AND c.archived_at IS NULL
        ORDER BY e.created_at DESC
        LIMIT 1
      `,
      [
        input.companyId,
        MPESA_PROVIDER_KEY,
        input.invoiceId,
        input.checkoutRequestId,
      ],
    );

  if (
    !result.rows[0]
  ) {
    return null;
  }

  return intentFromRow(
    result.rows[0],
  );
}

async function updateIntentState(
  input: {
    tenantId:
      string;
    eventId:
      string;
    status:
      'processed' |
      'ignored' |
      'failed';
    evidence:
      Record<string, unknown>;
  },
) {
  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE integration_events
      SET
        status=$2,
        processed_at=NOW(),
        payload=
          COALESCE(
            payload,
            '{}'::jsonb
          ) ||
          $3::jsonb
      WHERE id=$1::uuid
    `,
    [
      input.eventId,
      input.status,
      JSON.stringify(
        input.evidence,
      ),
    ],
  );
}

async function settleIntent(
  input: {
    tenantId:
      string;
    intent:
      MpesaStkIntent;
    payment:
      NormalizedInvoicePayment;
    evidence:
      Record<string, unknown>;
  },
) {
  const result =
    await recordVerifiedExternalInvoiceSettlement({
      tenantId:
        input.tenantId,
      companyId:
        input.intent
          .companyId,
      userId:
        input.intent
          .ownerUserId,
      providerKey:
        input.intent
          .providerKey,
      externalEventId:
        input.payment
          .externalEventId,
      payload:
        input.payment,
    });

  await updateIntentState({
    tenantId:
      input.tenantId,
    eventId:
      input.intent.id,
    status:
      'processed',
    evidence: {
      ...input.evidence,
      settlementPaymentId:
        result.paymentId,
      settlementInvoiceId:
        result.invoiceId,
      settlementReused:
        result.reused,
    },
  });

  const pool =
    await getTenantPoolByTenantId(
      input.tenantId,
    );

  await pool.query(
    `
      UPDATE integration_connections
      SET
        health_status='healthy',
        last_health_check_at=NOW(),
        updated_at=NOW()
      WHERE id=$1::uuid
    `,
    [
      input.intent
        .connectionId,
    ],
  );

  return result;
}

export async function receiveMpesaStkCallback(
  input: {
    tenantId:
      string;
    callbackToken:
      string;
    rawBody:
      string;
  },
) {
  if (
    Buffer.byteLength(
      input.rawBody,
      'utf8',
    ) >
      128 *
        1024
  ) {
    return {
      status:
        413,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Request too large',
      },
    };
  }

  const intent =
    await loadIntentByCallbackToken({
      tenantId:
        input.tenantId,
      callbackToken:
        input.callbackToken,
    });

  if (
    !intent
  ) {
    return {
      status:
        404,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Request not found',
      },
    };
  }

  let root:
    Record<string, unknown>;

  try {
    root =
      safeObject(
        JSON.parse(
          input.rawBody ||
          '{}',
        ),
      );
  } catch {
    return {
      status:
        400,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Invalid payload',
      },
    };
  }

  const callback =
    safeObject(
      safeObject(
        root.Body,
      ).stkCallback,
    );

  const checkoutRequestId =
    cleanString(
      callback.CheckoutRequestID,
      255,
    );

  const merchantRequestId =
    cleanString(
      callback.MerchantRequestID,
      255,
    );

  const resultCode =
    cleanString(
      callback.ResultCode,
      40,
    );

  const resultDesc =
    cleanString(
      callback.ResultDesc,
      500,
    );

  if (
    !checkoutRequestId
  ) {
    return {
      status:
        400,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Checkout reference missing',
      },
    };
  }

  if (
    intent.checkoutRequestId &&
    intent.checkoutRequestId !==
      checkoutRequestId
  ) {
    return {
      status:
        409,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Checkout reference mismatch',
      },
    };
  }

  if (
    intent.merchantRequestId &&
    merchantRequestId &&
    intent.merchantRequestId !==
      merchantRequestId
  ) {
    return {
      status:
        409,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Merchant reference mismatch',
      },
    };
  }

  let query;
  try {
    query =
      await queryMpesaStk(
        intent.secrets,
        checkoutRequestId,
      );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Invoicing] M-PESA STK callback verification failed:',
      error,
    );
    return {
      status:
        503,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Verification unavailable',
      },
    };
  }

  if (
    resultCode !==
      '0'
  ) {
    await updateIntentState({
      tenantId:
        input.tenantId,
      eventId:
        intent.id,
      status:
        'ignored',
      evidence: {
        mpesaResultCode:
          resultCode ||
          'unknown',
        mpesaResultDesc:
          resultDesc,
        checkoutRequestId,
        merchantRequestId,
      },
    });

    return {
      status:
        200,
      body: {
        ResultCode:
          0,
        ResultDesc:
          'Accepted',
      },
    };
  }

  if (
    query.resultCode !==
      '0'
  ) {
    return {
      status:
        409,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Transaction not verified',
      },
    };
  }

  const metadata =
    callbackMetadata(
      callback,
    );

  const amount =
    Number(
      metadata.get(
        'Amount',
      ) ||
      0,
    );

  const receipt =
    cleanString(
      metadata.get(
        'MpesaReceiptNumber',
      ),
      100,
    );

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount !==
      intent.amount ||
    !receipt
  ) {
    await updateIntentState({
      tenantId:
        input.tenantId,
      eventId:
        intent.id,
      status:
        'failed',
      evidence: {
        mpesaResultCode:
          resultCode,
        mpesaResultDesc:
          resultDesc,
        checkoutRequestId,
        amountMismatch:
          amount,
      },
    });

    return {
      status:
        422,
      body: {
        ResultCode:
          1,
        ResultDesc:
          'Payment evidence mismatch',
      },
    };
  }

  const payment:
    NormalizedInvoicePayment = {
      externalEventId:
        checkoutRequestId,
      invoiceId:
        intent.invoiceId,
      invoiceNumber:
        intent.invoiceNumber,
      status:
        'succeeded',
      amount,
      currency:
        'KES',
      providerReference:
        receipt,
      method:
        'M-PESA STK',
      paymentDate:
        paymentDateFromMpesa(
          metadata.get(
            'TransactionDate',
          ),
        ),
      notes:
        'Verified through Safaricom M-PESA Express callback and STK query.',
    };

  await settleIntent({
    tenantId:
      input.tenantId,
    intent,
    payment,
    evidence: {
      mpesaResultCode:
        resultCode,
      mpesaResultDesc:
        resultDesc,
      checkoutRequestId,
      merchantRequestId,
      mpesaReceiptNumber:
        receipt,
      payerPhoneSuffix:
        String(
          metadata.get(
            'PhoneNumber',
          ) ||
          '',
        ).slice(
          -4,
        ),
      callbackVerifiedAt:
        new Date()
          .toISOString(),
    },
  });

  return {
    status:
      200,
    body: {
      ResultCode:
        0,
      ResultDesc:
        'Accepted',
    },
  };
}

export async function checkMpesaStkStatus(
  input: {
    tenantId:
      string;
    companyId:
      string;
    invoiceId:
      string;
    checkoutRequestId:
      unknown;
  },
) {
  const checkoutRequestId =
    cleanString(
      input.checkoutRequestId,
      255,
    );

  if (
    !checkoutRequestId
  ) {
    throw new Error(
      'M-PESA checkout reference is required.',
    );
  }

  const intent =
    await loadIntentByCheckout({
      tenantId:
        input.tenantId,
      companyId:
        input.companyId,
      invoiceId:
        input.invoiceId,
      checkoutRequestId,
    });

  if (
    !intent
  ) {
    throw new Error(
      'M-PESA checkout could not be found for this invoice.',
    );
  }

  if (
    intent.status ===
      'processed'
  ) {
    return {
      status:
        'paid' as const,
      message:
        'Payment verified.',
    };
  }

  if (
    intent.status ===
      'ignored'
  ) {
    return {
      status:
        'failed' as const,
      message:
        'The M-PESA prompt was cancelled or did not complete.',
    };
  }

  const query =
    await queryMpesaStk(
      intent.secrets,
      checkoutRequestId,
    );

  if (
    query.resultCode ===
      null
  ) {
    return {
      status:
        'pending' as const,
      message:
        query.resultDesc ||
        'Waiting for M-PESA confirmation.',
    };
  }

  if (
    query.resultCode !==
      '0'
  ) {
    await updateIntentState({
      tenantId:
        input.tenantId,
      eventId:
        intent.id,
      status:
        'ignored',
      evidence: {
        mpesaQueryResultCode:
          query.resultCode,
        mpesaQueryResultDesc:
          query.resultDesc,
      },
    });

    return {
      status:
        'failed' as const,
      message:
        query.resultDesc ||
        'The M-PESA payment did not complete.',
    };
  }

  const payment:
    NormalizedInvoicePayment = {
      externalEventId:
        checkoutRequestId,
      invoiceId:
        intent.invoiceId,
      invoiceNumber:
        intent.invoiceNumber,
      status:
        'succeeded',
      amount:
        intent.amount,
      currency:
        intent.currency,
      providerReference:
        checkoutRequestId,
      method:
        'M-PESA STK',
      notes:
        'Verified through Safaricom M-PESA Express STK query fallback.',
    };

  await settleIntent({
    tenantId:
      input.tenantId,
    intent,
    payment,
    evidence: {
      mpesaQueryResultCode:
        query.resultCode,
      mpesaQueryResultDesc:
        query.resultDesc,
      checkoutRequestId,
      queryVerifiedAt:
        new Date()
          .toISOString(),
    },
  });

  return {
    status:
      'paid' as const,
    message:
      'Payment verified.',
  };
}
