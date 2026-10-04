import 'server-only';

import crypto from 'node:crypto';
import Stripe from 'stripe';

import type {
  InvoicePaymentProviderSecrets,
} from '@/lib/apps/invoicing/payment-provider-adapters';

export type InvoiceRefundProvider =
  | 'stripe'
  | 'paypal'
  | 'paystack'
  | 'flutterwave'
  | 'pesapal';

export type InvoiceProviderRefundStatus =
  | 'succeeded'
  | 'pending'
  | 'requires_action'
  | 'failed';

export type InvoiceProviderRefundResult = {
  provider: InvoiceRefundProvider;
  status: InvoiceProviderRefundStatus;
  externalRefundId: string | null;
  providerReference: string | null;
  message: string;
  manualConfirmationRequired?: boolean;
};

const REQUEST_TIMEOUT_MS = 15_000;

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

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
) {
  const controller =
    new AbortController();
  const timeout =
    setTimeout(
      () => controller.abort(),
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

function currencyExponent(
  currency: string,
) {
  const code =
    currency
      .trim()
      .toUpperCase();

  if (
    [
      'BIF','CLP','DJF','GNF','JPY','KMF','KRW','MGA',
      'PYG','RWF','UGX','VND','VUV','XAF','XOF','XPF',
    ].includes(
      code,
    )
  ) {
    return 0;
  }

  if (
    [
      'BHD','IQD','JOD','KWD','LYD','OMR','TND',
    ].includes(
      code,
    )
  ) {
    return 3;
  }

  return 2;
}

function toMinorUnits(
  amount: number,
  currency: string,
) {
  return Math.round(
    amount *
      10 **
        currencyExponent(
          currency,
        ),
  );
}

function amountString(
  amount: number,
  currency: string,
) {
  return amount.toFixed(
    currencyExponent(
      currency,
    ),
  );
}

function providerBase(
  provider:
    'paypal' |
    'pesapal',
  environment:
    InvoicePaymentProviderSecrets['environment'],
) {
  if (
    provider ===
      'paypal'
  ) {
    return environment ===
      'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  return environment ===
    'live'
    ? 'https://pay.pesapal.com/v3'
    : 'https://cybqa.pesapal.com/pesapalv3';
}

async function paypalToken(
  secrets:
    InvoicePaymentProviderSecrets,
) {
  if (
    !secrets.clientId ||
    !secrets.clientSecret
  ) {
    throw new Error(
      'PayPal merchant credentials are unavailable.',
    );
  }

  const authorization =
    Buffer.from(
      secrets.clientId +
        ':' +
        secrets.clientSecret,
      'utf8',
    ).toString(
      'base64',
    );

  const body =
    new URLSearchParams();
  body.set(
    'grant_type',
    'client_credentials',
  );

  const response =
    await fetchWithTimeout(
      providerBase(
        'paypal',
        secrets.environment,
      ) +
        '/v1/oauth2/token',
      {
        method:
          'POST',
        headers: {
          Accept:
            'application/json',
          'Content-Type':
            'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            authorization,
        },
        body,
      },
    );

  const payload =
    await jsonBody(
      response,
    );
  const token =
    cleanString(
      payload.access_token,
      8_000,
    );

  if (
    !response.ok ||
    !token
  ) {
    throw new Error(
      cleanString(
        payload.error_description,
        500,
      ) ||
      'PayPal could not authorize this refund.',
    );
  }

  return token;
}

async function pesapalToken(
  secrets:
    InvoicePaymentProviderSecrets,
) {
  if (
    !secrets.consumerKey ||
    !secrets.consumerSecret
  ) {
    throw new Error(
      'Pesapal merchant credentials are unavailable.',
    );
  }

  const response =
    await fetchWithTimeout(
      providerBase(
        'pesapal',
        secrets.environment,
      ) +
        '/api/Auth/RequestToken',
      {
        method:
          'POST',
        headers: {
          Accept:
            'application/json',
          'Content-Type':
            'application/json',
        },
        body:
          JSON.stringify({
            consumer_key:
              secrets.consumerKey,
            consumer_secret:
              secrets.consumerSecret,
          }),
      },
    );

  const body =
    await jsonBody(
      response,
    );
  const token =
    cleanString(
      body.token,
      8_000,
    );

  if (
    !response.ok ||
    !token
  ) {
    throw new Error(
      cleanString(
        body.message,
        500,
      ) ||
      'Pesapal could not authorize this refund.',
    );
  }

  return token;
}

function normalizeStripeStatus(
  status: unknown,
): InvoiceProviderRefundStatus {
  const value =
    cleanString(
      status,
      60,
    ).toLowerCase();

  if (
    value ===
      'succeeded'
  ) {
    return 'succeeded';
  }

  if (
    value ===
      'pending'
  ) {
    return 'pending';
  }

  if (
    value ===
      'requires_action'
  ) {
    return 'requires_action';
  }

  return 'failed';
}

function normalizePayPalStatus(
  status: unknown,
): InvoiceProviderRefundStatus {
  const value =
    cleanString(
      status,
      60,
    ).toUpperCase();

  if (
    value ===
      'COMPLETED'
  ) {
    return 'succeeded';
  }

  if (
    value ===
      'PENDING'
  ) {
    return 'pending';
  }

  return 'failed';
}

function normalizePaystackStatus(
  status: unknown,
): InvoiceProviderRefundStatus {
  const value =
    cleanString(
      status,
      80,
    )
      .toLowerCase()
      .replace(
        /_/g,
        '-',
      );

  if (
    [
      'processed',
      'success',
      'successful',
      'completed',
    ].includes(
      value,
    )
  ) {
    return 'succeeded';
  }

  if (
    [
      'pending',
      'processing',
      'queued',
    ].includes(
      value,
    )
  ) {
    return 'pending';
  }

  if (
    value ===
      'needs-attention'
  ) {
    return 'requires_action';
  }

  return 'failed';
}

function normalizeFlutterwaveStatus(
  status: unknown,
): InvoiceProviderRefundStatus {
  const value =
    cleanString(
      status,
      80,
    ).toLowerCase();

  if (
    [
      'completed-bank-transfer',
      'completed-momo',
      'completed-mpgs',
      'completed-offline',
      'completed-preauth',
      'successful',
      'succeeded',
    ].includes(
      value,
    )
  ) {
    return 'succeeded';
  }

  if (
    [
      'new',
      'pending',
      'processing',
      'completed',
      'pending-momo',
    ].includes(
      value,
    )
  ) {
    return 'pending';
  }

  return 'failed';
}

function requireProviderTransactionId(
  value: unknown,
) {
  const id =
    cleanString(
      value,
      255,
    );

  if (
    !id
  ) {
    throw new Error(
      'The original provider transaction reference is unavailable. This payment must be refunded manually.',
    );
  }

  return id;
}

export function providerFromStorageKey(
  value: unknown,
): InvoiceRefundProvider | null {
  const key =
    cleanString(
      value,
      180,
    ).toLowerCase();

  const prefix =
    'invoicing_payment_';

  const provider =
    key.startsWith(
      prefix,
    )
      ? key.slice(
          prefix.length,
        )
      : key;

  if (
    [
      'stripe',
      'paypal',
      'paystack',
      'flutterwave',
      'pesapal',
    ].includes(
      provider,
    )
  ) {
    return provider as
      InvoiceRefundProvider;
  }

  return null;
}

export async function createInvoiceProviderRefundRemote(
  input: {
    provider:
      InvoiceRefundProvider;
    secrets:
      InvoicePaymentProviderSecrets;
    providerTransactionId:
      unknown;
    amount:
      number;
    currency:
      string;
    reason:
      string;
    idempotencyKey:
      string;
    actorLabel:
      string;
  },
): Promise<InvoiceProviderRefundResult> {
  const transactionId =
    requireProviderTransactionId(
      input.providerTransactionId,
    );
  const currency =
    input.currency
      .trim()
      .toUpperCase();

  if (
    input.provider ===
      'stripe'
  ) {
    if (
      !input.secrets.secretKey
    ) {
      throw new Error(
        'Stripe secret key is unavailable.',
      );
    }

    const stripe =
      new Stripe(
        input.secrets.secretKey,
      );

    const refund =
      await stripe.refunds.create(
        {
          payment_intent:
            transactionId,
          amount:
            toMinorUnits(
              input.amount,
              currency,
            ),
          reason:
            'requested_by_customer',
          metadata: {
            samiRefundKey:
              input.idempotencyKey,
          },
        },
        {
          idempotencyKey:
            input.idempotencyKey,
        },
      );

    return {
      provider:
        input.provider,
      status:
        normalizeStripeStatus(
          refund.status,
        ),
      externalRefundId:
        refund.id,
      providerReference:
        refund.id,
      message:
        refund.status ===
          'succeeded'
          ? 'Stripe completed the refund.'
          : 'Stripe accepted the refund and is still processing it.',
    };
  }

  if (
    input.provider ===
      'paypal'
  ) {
    const token =
      await paypalToken(
        input.secrets,
      );

    const response =
      await fetchWithTimeout(
        providerBase(
          'paypal',
          input.secrets
            .environment,
        ) +
          '/v2/payments/captures/' +
          encodeURIComponent(
            transactionId,
          ) +
          '/refund',
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
            'PayPal-Request-Id':
              input.idempotencyKey
                .replace(
                  /[^A-Za-z0-9-]/g,
                  '',
                )
                .slice(
                  0,
                  38,
                ),
            Prefer:
              'return=representation',
          },
          body:
            JSON.stringify({
              amount: {
                value:
                  amountString(
                    input.amount,
                    currency,
                  ),
                currency_code:
                  currency,
              },
              note_to_payer:
                input.reason
                  .slice(
                    0,
                    255,
                  ),
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
          body.message,
          500,
        ) ||
        'PayPal rejected the refund request.',
      );
    }

    const externalRefundId =
      cleanString(
        body.id,
        255,
      );

    if (
      !externalRefundId
    ) {
      throw new Error(
        'PayPal did not return a refund reference.',
      );
    }

    return {
      provider:
        input.provider,
      status:
        normalizePayPalStatus(
          body.status,
        ),
      externalRefundId,
      providerReference:
        externalRefundId,
      message:
        cleanString(
          body.status_details,
          500,
        ) ||
        'PayPal accepted the refund request.',
    };
  }

  if (
    input.provider ===
      'paystack'
  ) {
    if (
      !input.secrets.secretKey
    ) {
      throw new Error(
        'Paystack secret key is unavailable.',
      );
    }

    const response =
      await fetchWithTimeout(
        'https://api.paystack.co/refund',
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
              input.secrets
                .secretKey,
          },
          body:
            JSON.stringify({
              transaction:
                transactionId,
              amount:
                toMinorUnits(
                  input.amount,
                  currency,
                ),
              currency,
              customer_note:
                input.reason
                  .slice(
                    0,
                    500,
                  ),
              merchant_note:
                (
                  'SaMi refund: ' +
                  input.reason
                ).slice(
                  0,
                  500,
                ),
            }),
        },
      );

    const body =
      await jsonBody(
        response,
      );
    const data =
      safeObject(
        body.data,
      );

    if (
      !response.ok ||
      body.status !==
        true
    ) {
      throw new Error(
        cleanString(
          body.message,
          500,
        ) ||
        'Paystack rejected the refund request.',
      );
    }

    const externalRefundId =
      cleanString(
        data.id,
        255,
      );

    if (
      !externalRefundId
    ) {
      throw new Error(
        'Paystack did not return a refund reference.',
      );
    }

    return {
      provider:
        input.provider,
      status:
        normalizePaystackStatus(
          data.status,
        ),
      externalRefundId,
      providerReference:
        externalRefundId,
      message:
        cleanString(
          body.message,
          500,
        ) ||
        'Paystack accepted the refund request.',
    };
  }

  if (
    input.provider ===
      'flutterwave'
  ) {
    if (
      !input.secrets.secretKey
    ) {
      throw new Error(
        'Flutterwave secret key is unavailable.',
      );
    }

    const response =
      await fetchWithTimeout(
        'https://api.flutterwave.com/v3/transactions/' +
          encodeURIComponent(
            transactionId,
          ) +
          '/refund',
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
              input.secrets
                .secretKey,
          },
          body:
            JSON.stringify({
              amount:
                input.amount,
              comments:
                input.reason
                  .slice(
                    0,
                    500,
                  ),
            }),
        },
      );

    const body =
      await jsonBody(
        response,
      );
    const data =
      safeObject(
        body.data,
      );

    if (
      !response.ok ||
      cleanString(
        body.status,
        40,
      ).toLowerCase() !==
        'success'
    ) {
      throw new Error(
        cleanString(
          body.message,
          500,
        ) ||
        'Flutterwave rejected the refund request.',
      );
    }

    const providerReference =
      cleanString(
        data.flw_ref,
        255,
      ) ||
      cleanString(
        data.id,
        255,
      );

    if (
      !providerReference
    ) {
      throw new Error(
        'Flutterwave did not return a refund reference.',
      );
    }

    return {
      provider:
        input.provider,
      status:
        normalizeFlutterwaveStatus(
          data.status,
        ),
      externalRefundId:
        providerReference,
      providerReference,
      message:
        cleanString(
          body.message,
          500,
        ) ||
        'Flutterwave accepted the refund request.',
    };
  }

  const token =
    await pesapalToken(
      input.secrets,
    );

  const response =
    await fetchWithTimeout(
      providerBase(
        'pesapal',
        input.secrets
          .environment,
      ) +
        '/api/Transactions/RefundRequest',
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
            confirmation_code:
              transactionId,
            amount:
              amountString(
                input.amount,
                currency,
              ),
            username:
              input.actorLabel
                .slice(
                  0,
                  120,
                ),
            remarks:
              input.reason
                .slice(
                  0,
                  500,
                ),
          }),
      },
    );

  const body =
    await jsonBody(
      response,
    );
  const accepted =
    response.ok &&
    [
      '200',
      'success',
    ].includes(
      cleanString(
        body.status,
        40,
      ).toLowerCase(),
    );

  if (
    !accepted
  ) {
    throw new Error(
      cleanString(
        body.message,
        500,
      ) ||
      'Pesapal rejected the refund request.',
    );
  }

  return {
    provider:
      input.provider,
    status:
      'pending',
    externalRefundId:
      null,
    providerReference:
      transactionId,
    message:
      cleanString(
        body.message,
        500,
      ) ||
      'Pesapal accepted the refund request for processing.',
    manualConfirmationRequired:
      true,
  };
}

export async function getInvoiceProviderRefundRemote(
  input: {
    provider:
      InvoiceRefundProvider;
    secrets:
      InvoicePaymentProviderSecrets;
    externalRefundId:
      unknown;
    providerReference?:
      unknown;
    originalTransactionId:
      unknown;
  },
): Promise<InvoiceProviderRefundResult> {
  const externalRefundId =
    cleanString(
      input.externalRefundId,
      255,
    );

  if (
    input.provider ===
      'pesapal'
  ) {
    return {
      provider:
        input.provider,
      status:
        'pending',
      externalRefundId:
        externalRefundId ||
        null,
      providerReference:
        cleanString(
          input.providerReference,
          255,
        ) ||
        null,
      message:
        'Pesapal refund completion must be confirmed from the merchant account before SaMi posts the financial refund.',
      manualConfirmationRequired:
        true,
    };
  }

  if (
    !externalRefundId
  ) {
    throw new Error(
      'Provider refund reference is unavailable.',
    );
  }

  if (
    input.provider ===
      'stripe'
  ) {
    if (
      !input.secrets.secretKey
    ) {
      throw new Error(
        'Stripe secret key is unavailable.',
      );
    }

    const stripe =
      new Stripe(
        input.secrets.secretKey,
      );
    const refund =
      await stripe.refunds.retrieve(
        externalRefundId,
      );

    return {
      provider:
        input.provider,
      status:
        normalizeStripeStatus(
          refund.status,
        ),
      externalRefundId:
        refund.id,
      providerReference:
        refund.id,
      message:
        'Stripe refund status: ' +
        String(
          refund.status ||
          'unknown',
        ) +
        '.',
    };
  }

  if (
    input.provider ===
      'paypal'
  ) {
    const token =
      await paypalToken(
        input.secrets,
      );
    const response =
      await fetchWithTimeout(
        providerBase(
          'paypal',
          input.secrets
            .environment,
        ) +
          '/v2/payments/refunds/' +
          encodeURIComponent(
            externalRefundId,
          ),
        {
          method:
            'GET',
          headers: {
            Accept:
              'application/json',
            Authorization:
              'Bearer ' +
              token,
          },
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
          body.message,
          500,
        ) ||
        'PayPal refund status could not be retrieved.',
      );
    }

    return {
      provider:
        input.provider,
      status:
        normalizePayPalStatus(
          body.status,
        ),
      externalRefundId:
        cleanString(
          body.id,
          255,
        ) ||
        externalRefundId,
      providerReference:
        cleanString(
          body.id,
          255,
        ) ||
        externalRefundId,
      message:
        'PayPal refund status: ' +
        (
          cleanString(
            body.status,
            80,
          ) ||
          'unknown'
        ) +
        '.',
    };
  }

  if (
    input.provider ===
      'paystack'
  ) {
    if (
      !input.secrets.secretKey
    ) {
      throw new Error(
        'Paystack secret key is unavailable.',
      );
    }

    const response =
      await fetchWithTimeout(
        'https://api.paystack.co/refund/' +
          encodeURIComponent(
            externalRefundId,
          ),
        {
          method:
            'GET',
          headers: {
            Accept:
              'application/json',
            Authorization:
              'Bearer ' +
              input.secrets
                .secretKey,
          },
        },
      );

    const body =
      await jsonBody(
        response,
      );
    const data =
      safeObject(
        body.data,
      );

    if (
      !response.ok ||
      body.status !==
        true
    ) {
      throw new Error(
        cleanString(
          body.message,
          500,
        ) ||
        'Paystack refund status could not be retrieved.',
      );
    }

    return {
      provider:
        input.provider,
      status:
        normalizePaystackStatus(
          data.status,
        ),
      externalRefundId:
        cleanString(
          data.id,
          255,
        ) ||
        externalRefundId,
      providerReference:
        cleanString(
          data.id,
          255,
        ) ||
        externalRefundId,
      message:
        cleanString(
          body.message,
          500,
        ) ||
        'Paystack refund status retrieved.',
    };
  }

  if (
    !input.secrets.secretKey
  ) {
    throw new Error(
      'Flutterwave secret key is unavailable.',
    );
  }

  const refundReference =
    cleanString(
      input.providerReference,
      255,
    ) ||
    externalRefundId;

  const response =
    await fetchWithTimeout(
      'https://api.flutterwave.com/v3/refunds?flw_ref=' +
        encodeURIComponent(
          refundReference,
        ),
      {
        method:
          'GET',
        headers: {
          Accept:
            'application/json',
          Authorization:
            'Bearer ' +
            input.secrets
              .secretKey,
        },
      },
    );

  const body =
    await jsonBody(
      response,
    );
  const rows =
    safeArray(
      body.data,
    );
  const found =
    rows
      .map(
        safeObject,
      )
      .find(
        row =>
          cleanString(
            row.flw_ref,
            255,
          ) ===
            refundReference ||
          cleanString(
            row.id,
            255,
          ) ===
            externalRefundId,
      ) ||
    safeObject(
      rows[0],
    );

  if (
    !response.ok ||
    cleanString(
      body.status,
      40,
    ).toLowerCase() !==
      'success' ||
    Object.keys(
      found,
    ).length ===
      0
  ) {
    throw new Error(
      cleanString(
        body.message,
        500,
      ) ||
      'Flutterwave refund status could not be retrieved.',
    );
  }

  return {
    provider:
      input.provider,
    status:
      normalizeFlutterwaveStatus(
        found.status,
      ),
    externalRefundId:
      cleanString(
        found.id,
        255,
      ) ||
      externalRefundId,
    providerReference:
      cleanString(
        found.flw_ref,
        255,
      ) ||
      refundReference,
    message:
      'Flutterwave refund status: ' +
      (
        cleanString(
          found.status,
          80,
        ) ||
        'unknown'
      ) +
      '.',
  };
}

export function providerRefundCapability(
  storageKey: unknown,
) {
  const provider =
    providerFromStorageKey(
      storageKey,
    );

  if (
    provider
  ) {
    return {
      supported:
        true,
      provider,
      automaticStatus:
        provider !==
          'pesapal',
    };
  }

  return {
    supported:
      false,
    provider:
      null,
    automaticStatus:
      false,
  };
}

export function providerRefundOperationKey(
  input: {
    provider:
      InvoiceRefundProvider;
    companyId:
      string;
    paymentId:
      string;
    sourceKind:
      'payment' |
      'credit_note';
    sourceId:
      string;
    amount:
      number;
    nonce:
      string;
  },
) {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      [
        'invoice-provider-refund',
        input.provider,
        input.companyId,
        input.paymentId,
        input.sourceKind,
        input.sourceId,
        input.amount.toFixed(
          4,
        ),
        input.nonce,
      ].join(
        ':',
      ),
    )
    .digest(
      'hex',
    )
    .slice(
      0,
      64,
    );
}
