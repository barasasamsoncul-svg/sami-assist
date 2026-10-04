import 'server-only';

import crypto from 'node:crypto';
import Stripe from 'stripe';

import type {
  InvoicePaymentEnvironment,
  InvoicePaymentProviderKey,
} from '@/lib/apps/invoicing/payment-provider-catalog';

const REQUEST_TIMEOUT_MS = 15_000;

export type InvoicePaymentProviderSecrets = {
  provider: InvoicePaymentProviderKey;
  environment: InvoicePaymentEnvironment;
  consumerKey?: string;
  consumerSecret?: string;
  shortCode?: string;
  secretKey?: string;
  webhookSecret?: string;
  clientId?: string;
  clientSecret?: string;
  providerWebhookId?: string;
  pesapalIpnId?: string;
};

export type InvoicePaymentProviderConnectionResult = {
  secrets: InvoicePaymentProviderSecrets;
  externalAccountId: string | null;
  externalAccountName: string | null;
  manualSetup: null | {
    callbackUrl: string;
    verificationValue?: string;
    instructions: string;
  };
};

export type NormalizedInvoicePayment = {
  externalEventId: string;
  invoiceId?: string;
  invoiceNumber?: string;
  status: 'succeeded';
  amount: number;
  currency: string;
  providerReference: string;
  method: string;
  paymentDate?: string;
  notes?: string;
};

function cleanString(value: unknown, max = 1_000) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
    : '';
}

function safeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function required(
  values: Record<string, unknown>,
  key: string,
  label: string,
  max = 2_000,
) {
  const value = cleanString(values[key], max);
  if (!value) throw new Error(label + ' is required.');
  return value;
}

function providerBase(
  provider: InvoicePaymentProviderKey,
  environment: InvoicePaymentEnvironment,
) {
  if (provider === 'pesapal') {
    return environment === 'live'
      ? 'https://pay.pesapal.com/v3'
      : 'https://cybqa.pesapal.com/pesapalv3';
  }
  if (provider === 'mpesa') {
    return environment === 'live'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }
  if (provider === 'paypal') {
    return environment === 'live'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }
  return '';
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );
  try {
    return await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function jsonBody(response: Response) {
  return safeObject(
    await response.json().catch(() => ({})),
  );
}

async function pesapalToken(
  environment: InvoicePaymentEnvironment,
  consumerKey: string,
  consumerSecret: string,
) {
  const response = await fetchWithTimeout(
    providerBase('pesapal', environment) + '/api/Auth/RequestToken',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: consumerKey,
        consumer_secret: consumerSecret,
      }),
    },
  );
  const body = await jsonBody(response);
  const token = cleanString(body.token, 8_000);
  if (!response.ok || !token) {
    throw new Error(
      cleanString(body.message, 400) ||
      'Pesapal could not verify these merchant credentials.',
    );
  }
  return token;
}

async function mpesaToken(
  environment: InvoicePaymentEnvironment,
  consumerKey: string,
  consumerSecret: string,
) {
  const authorization = Buffer.from(
    consumerKey + ':' + consumerSecret,
    'utf8',
  ).toString('base64');
  const response = await fetchWithTimeout(
    providerBase('mpesa', environment) +
      '/oauth/v1/generate?grant_type=client_credentials',
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Basic ' + authorization,
      },
    },
  );
  const body = await jsonBody(response);
  const token = cleanString(body.access_token, 8_000);
  if (!response.ok || !token) {
    throw new Error(
      cleanString(body.errorMessage, 400) ||
      'Safaricom Daraja could not verify these app credentials.',
    );
  }
  return token;
}

async function paypalToken(
  environment: InvoicePaymentEnvironment,
  clientId: string,
  clientSecret: string,
) {
  const authorization = Buffer.from(
    clientId + ':' + clientSecret,
    'utf8',
  ).toString('base64');
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');
  const response = await fetchWithTimeout(
    providerBase('paypal', environment) + '/v1/oauth2/token',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + authorization,
      },
      body,
    },
  );
  const payload = await jsonBody(response);
  const token = cleanString(payload.access_token, 8_000);
  if (!response.ok || !token) {
    throw new Error(
      cleanString(payload.error_description, 400) ||
      'PayPal could not verify this REST app.',
    );
  }
  return token;
}

function inferKeyEnvironment(
  key: string,
  requested: InvoicePaymentEnvironment,
  provider: 'stripe' | 'paystack' | 'flutterwave',
) {
  const lower = key.toLowerCase();
  const inferred =
    provider === 'flutterwave'
      ? lower.includes('_test-') || lower.includes('test')
        ? 'sandbox'
        : 'live'
      : lower.includes('_test_') || lower.startsWith('sk_test_')
        ? 'sandbox'
        : lower.includes('_live_') || lower.startsWith('sk_live_')
          ? 'live'
          : requested;

  if (inferred !== requested) {
    throw new Error(
      'The selected environment does not match the supplied ' +
      provider +
      ' key.',
    );
  }
}

export function sanitizeInvoicePaymentCredentials(
  provider: InvoicePaymentProviderKey,
  environment: InvoicePaymentEnvironment,
  input: Record<string, unknown>,
): InvoicePaymentProviderSecrets {
  if (provider === 'pesapal') {
    return {
      provider,
      environment,
      consumerKey: required(input, 'consumerKey', 'Consumer Key'),
      consumerSecret: required(input, 'consumerSecret', 'Consumer Secret'),
    };
  }
  if (provider === 'mpesa') {
    const shortCode = required(input, 'shortCode', 'Paybill / Till number', 40);
    if (!/^[0-9]{5,12}$/.test(shortCode)) {
      throw new Error('Enter a valid M-PESA Paybill or Till number.');
    }
    return {
      provider,
      environment,
      consumerKey: required(input, 'consumerKey', 'Consumer Key'),
      consumerSecret: required(input, 'consumerSecret', 'Consumer Secret'),
      shortCode,
    };
  }
  if (provider === 'stripe') {
    const secretKey = required(input, 'secretKey', 'Secret Key', 500);
    inferKeyEnvironment(secretKey, environment, 'stripe');
    return { provider, environment, secretKey };
  }
  if (provider === 'paystack') {
    const secretKey = required(input, 'secretKey', 'Secret Key', 500);
    inferKeyEnvironment(secretKey, environment, 'paystack');
    return { provider, environment, secretKey };
  }
  if (provider === 'flutterwave') {
    const secretKey = required(input, 'secretKey', 'Secret Key', 500);
    inferKeyEnvironment(secretKey, environment, 'flutterwave');
    return {
      provider,
      environment,
      secretKey,
      webhookSecret: crypto.randomBytes(32).toString('base64url'),
    };
  }
  return {
    provider,
    environment,
    clientId: required(input, 'clientId', 'Client ID', 1_000),
    clientSecret: required(input, 'clientSecret', 'Client Secret', 2_000),
  };
}

export async function connectInvoicePaymentProviderRemote(input: {
  provider: InvoicePaymentProviderKey;
  environment: InvoicePaymentEnvironment;
  credentials: Record<string, unknown>;
  callbackUrl: string;
}): Promise<InvoicePaymentProviderConnectionResult> {
  const secrets = sanitizeInvoicePaymentCredentials(
    input.provider,
    input.environment,
    input.credentials,
  );

  if (input.provider === 'pesapal') {
    const token = await pesapalToken(
      input.environment,
      secrets.consumerKey!,
      secrets.consumerSecret!,
    );
    const response = await fetchWithTimeout(
      providerBase('pesapal', input.environment) + '/api/URLSetup/RegisterIPN',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          url: input.callbackUrl,
          ipn_notification_type: 'GET',
        }),
      },
    );
    const body = await jsonBody(response);
    const ipnId = cleanString(body.ipn_id, 200);
    if (!response.ok || !ipnId) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Pesapal accepted the credentials but the payment notification URL could not be registered.',
      );
    }
    return {
      secrets: { ...secrets, pesapalIpnId: ipnId },
      externalAccountId: null,
      externalAccountName: 'Pesapal merchant',
      manualSetup: null,
    };
  }

  if (input.provider === 'mpesa') {
    const token = await mpesaToken(
      input.environment,
      secrets.consumerKey!,
      secrets.consumerSecret!,
    );
    const response = await fetchWithTimeout(
      providerBase('mpesa', input.environment) + '/mpesa/c2b/v2/registerurl',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          ShortCode: secrets.shortCode,
          ResponseType: 'Completed',
          ConfirmationURL: input.callbackUrl,
          ValidationURL: input.callbackUrl,
        }),
      },
    );
    const body = await jsonBody(response);
    if (!response.ok || cleanString(body.ResponseCode, 20) !== '0') {
      throw new Error(
        cleanString(body.ResponseDescription, 400) ||
        cleanString(body.errorMessage, 400) ||
        'Safaricom Daraja could not register the C2B payment URLs.',
      );
    }
    return {
      secrets,
      externalAccountId: secrets.shortCode || null,
      externalAccountName: secrets.shortCode
        ? 'M-PESA ' + secrets.shortCode
        : 'M-PESA merchant',
      manualSetup: null,
    };
  }

  if (input.provider === 'stripe') {
    const stripe = new Stripe(secrets.secretKey!);
    const webhook = await stripe.webhookEndpoints.create({
      url: input.callbackUrl,
      enabled_events: ['checkout.session.completed'],
      description: 'SaMi automatic invoice reconciliation',
      metadata: {
        sami_purpose: 'invoice_payment_reconciliation',
      },
    });
    if (!webhook.secret) {
      throw new Error('Stripe did not return a webhook signing secret.');
    }
    return {
      secrets: {
        ...secrets,
        webhookSecret: webhook.secret,
        providerWebhookId: webhook.id,
      },
      externalAccountId: null,
      externalAccountName: 'Stripe account',
      manualSetup: null,
    };
  }

  if (input.provider === 'paystack') {
    const response = await fetchWithTimeout(
      'https://api.paystack.co/transaction?perPage=1&page=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + secrets.secretKey,
        },
      },
    );
    const body = await jsonBody(response);
    if (!response.ok || body.status !== true) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Paystack could not verify this secret key.',
      );
    }
    return {
      secrets,
      externalAccountId: null,
      externalAccountName: 'Paystack account',
      manualSetup: {
        callbackUrl: input.callbackUrl,
        instructions:
          'Open Paystack → API Keys & Webhooks and paste this URL into the Webhook URL field, then save.',
      },
    };
  }

  if (input.provider === 'flutterwave') {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const response = await fetchWithTimeout(
      'https://api.flutterwave.com/v3/transactions?from=' +
        encodeURIComponent(date) +
        '&to=' +
        encodeURIComponent(date) +
        '&page=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + secrets.secretKey,
        },
      },
    );
    const body = await jsonBody(response);
    if (!response.ok || cleanString(body.status, 40).toLowerCase() === 'error') {
      throw new Error(
        cleanString(body.message, 400) ||
        'Flutterwave could not verify this secret key.',
      );
    }
    return {
      secrets,
      externalAccountId: null,
      externalAccountName: 'Flutterwave account',
      manualSetup: {
        callbackUrl: input.callbackUrl,
        verificationValue: secrets.webhookSecret,
        instructions:
          'Open Flutterwave → Settings → Webhooks, paste the SaMi URL, set the verification/secret hash to the value shown by SaMi, and save.',
      },
    };
  }

  const token = await paypalToken(
    input.environment,
    secrets.clientId!,
    secrets.clientSecret!,
  );
  const response = await fetchWithTimeout(
    providerBase('paypal', input.environment) + '/v1/notifications/webhooks',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        url: input.callbackUrl,
        event_types: [
          { name: 'PAYMENT.CAPTURE.COMPLETED' },
        ],
      }),
    },
  );
  const body = await jsonBody(response);
  const webhookId = cleanString(body.id, 200);
  if (!response.ok || !webhookId) {
    throw new Error(
      cleanString(body.message, 400) ||
      'PayPal accepted the app credentials but the webhook could not be registered.',
    );
  }
  return {
    secrets: {
      ...secrets,
      providerWebhookId: webhookId,
    },
    externalAccountId: cleanString(body.id, 200) || null,
    externalAccountName: 'PayPal REST app',
    manualSetup: null,
  };
}

export async function testInvoicePaymentProviderRemote(
  secrets: InvoicePaymentProviderSecrets,
) {
  if (secrets.provider === 'pesapal') {
    await pesapalToken(
      secrets.environment,
      secrets.consumerKey!,
      secrets.consumerSecret!,
    );
    return;
  }
  if (secrets.provider === 'mpesa') {
    await mpesaToken(
      secrets.environment,
      secrets.consumerKey!,
      secrets.consumerSecret!,
    );
    return;
  }
  if (secrets.provider === 'stripe') {
    const stripe = new Stripe(secrets.secretKey!);
    await stripe.webhookEndpoints.list({ limit: 1 });
    return;
  }
  if (secrets.provider === 'paystack') {
    const response = await fetchWithTimeout(
      'https://api.paystack.co/transaction?perPage=1&page=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + secrets.secretKey,
        },
      },
    );
    const body = await jsonBody(response);
    if (!response.ok || body.status !== true) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Paystack connection check failed.',
      );
    }
    return;
  }
  if (secrets.provider === 'flutterwave') {
    const date = new Date().toISOString().slice(0, 10);
    const response = await fetchWithTimeout(
      'https://api.flutterwave.com/v3/transactions?from=' +
        encodeURIComponent(date) +
        '&to=' +
        encodeURIComponent(date) +
        '&page=1',
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer ' + secrets.secretKey,
        },
      },
    );
    if (!response.ok) throw new Error('Flutterwave connection check failed.');
    return;
  }
  await paypalToken(
    secrets.environment,
    secrets.clientId!,
    secrets.clientSecret!,
  );
}

function timingSafeTextEqual(a: string, b: string) {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function metadataReference(value: unknown) {
  const object = safeObject(value);
  return {
    invoiceId:
      cleanString(object.invoiceId, 100) ||
      cleanString(object.invoice_id, 100) ||
      undefined,
    invoiceNumber:
      cleanString(object.invoiceNumber, 160) ||
      cleanString(object.invoice_number, 160) ||
      undefined,
  };
}

export async function verifyAndNormalizeInvoicePaymentWebhook(input: {
  secrets: InvoicePaymentProviderSecrets;
  rawBody: string;
  headers: Headers;
  query: URLSearchParams;
}): Promise<NormalizedInvoicePayment | null> {
  const { secrets } = input;

  if (secrets.provider === 'pesapal') {
    const trackingId =
      cleanString(input.query.get('OrderTrackingId'), 200) ||
      cleanString(safeObject(JSON.parse(input.rawBody || '{}')).OrderTrackingId, 200);
    const merchantReference =
      cleanString(input.query.get('OrderMerchantReference'), 160) ||
      cleanString(safeObject(JSON.parse(input.rawBody || '{}')).OrderMerchantReference, 160);
    if (!trackingId || !merchantReference) return null;
    const token = await pesapalToken(
      secrets.environment,
      secrets.consumerKey!,
      secrets.consumerSecret!,
    );
    const response = await fetchWithTimeout(
      providerBase('pesapal', secrets.environment) +
        '/api/Transactions/GetTransactionStatus?orderTrackingId=' +
        encodeURIComponent(trackingId),
      {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
      },
    );
    const body = await jsonBody(response);
    if (!response.ok) {
      throw new Error('Pesapal transaction verification failed.');
    }
    const status = cleanString(body.payment_status_description, 40).toUpperCase();
    if (status !== 'COMPLETED') return null;
    return {
      externalEventId: trackingId + ':' + status,
      invoiceNumber: merchantReference,
      status: 'succeeded',
      amount: Number(body.amount),
      currency: cleanString(body.currency, 12).toUpperCase(),
      providerReference:
        cleanString(body.confirmation_code, 255) || trackingId,
      method: cleanString(body.payment_method, 50) || 'Pesapal',
      paymentDate: cleanString(body.created_date, 80) || undefined,
    };
  }

  if (secrets.provider === 'stripe') {
    const signature = cleanString(input.headers.get('stripe-signature'), 8_000);
    if (!signature || !secrets.webhookSecret) {
      throw new Error('Stripe webhook signature is missing.');
    }
    const stripe = new Stripe(secrets.secretKey!);
    const event = stripe.webhooks.constructEvent(
      input.rawBody,
      signature,
      secrets.webhookSecret,
    );
    if (event.type !== 'checkout.session.completed') return null;
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== 'paid') return null;
    const reference = metadataReference(session.metadata);
    const clientReference = cleanString(session.client_reference_id, 160);
    if (!reference.invoiceId && !reference.invoiceNumber && clientReference) {
      reference.invoiceNumber = clientReference;
    }
    if (!reference.invoiceId && !reference.invoiceNumber) return null;
    return {
      externalEventId: event.id,
      ...reference,
      status: 'succeeded',
      amount: Number(session.amount_total || 0) / 100,
      currency: cleanString(session.currency, 12).toUpperCase(),
      providerReference:
        typeof session.payment_intent === 'string'
          ? session.payment_intent
          : event.id,
      method: 'Stripe',
      paymentDate: new Date(event.created * 1000).toISOString(),
    };
  }

  if (secrets.provider === 'paystack') {
    const signature = cleanString(input.headers.get('x-paystack-signature'), 500);
    const expected = crypto
      .createHmac('sha512', secrets.secretKey!)
      .update(input.rawBody, 'utf8')
      .digest('hex');
    if (!signature || !timingSafeTextEqual(signature, expected)) {
      throw new Error('Paystack webhook signature is invalid.');
    }
    const event = safeObject(JSON.parse(input.rawBody || '{}'));
    if (cleanString(event.event, 100) !== 'charge.success') return null;
    const data = safeObject(event.data);
    const reference = metadataReference(data.metadata);
    if (!reference.invoiceId && !reference.invoiceNumber) return null;
    return {
      externalEventId:
        cleanString(data.id, 100) ||
        cleanString(data.reference, 255),
      ...reference,
      status: 'succeeded',
      amount: Number(data.amount || 0) / 100,
      currency: cleanString(data.currency, 12).toUpperCase(),
      providerReference: cleanString(data.reference, 255),
      method: cleanString(data.channel, 50) || 'Paystack',
      paymentDate: cleanString(data.paid_at, 80) || undefined,
    };
  }

  if (secrets.provider === 'flutterwave') {
    const legacy = cleanString(input.headers.get('verif-hash'), 1_000);
    const modern = cleanString(input.headers.get('flutterwave-signature'), 2_000);
    let verified = false;
    if (modern && secrets.webhookSecret) {
      const expected = crypto
        .createHmac('sha256', secrets.webhookSecret)
        .update(input.rawBody, 'utf8')
        .digest('base64');
      verified = timingSafeTextEqual(modern, expected);
    } else if (legacy && secrets.webhookSecret) {
      verified = timingSafeTextEqual(legacy, secrets.webhookSecret);
    }
    if (!verified) throw new Error('Flutterwave webhook signature is invalid.');
    const event = safeObject(JSON.parse(input.rawBody || '{}'));
    const data = safeObject(event.data);
    const status = cleanString(data.status, 40).toLowerCase();
    const eventName =
      cleanString(event.type, 100).toLowerCase() ||
      cleanString(event.event, 100).toLowerCase();
    if (
      !['successful', 'succeeded'].includes(status) ||
      !eventName.includes('charge')
    ) {
      return null;
    }
    const reference = metadataReference(data.meta || data.metadata);
    const txRef = cleanString(data.tx_ref, 160);
    if (!reference.invoiceId && !reference.invoiceNumber && txRef) {
      reference.invoiceNumber = txRef;
    }
    if (!reference.invoiceId && !reference.invoiceNumber) return null;
    return {
      externalEventId:
        cleanString(data.id, 100) ||
        cleanString(data.flw_ref, 255) ||
        txRef,
      ...reference,
      status: 'succeeded',
      amount: Number(data.amount || data.charged_amount || 0),
      currency: cleanString(data.currency, 12).toUpperCase(),
      providerReference:
        cleanString(data.flw_ref, 255) ||
        txRef,
      method: cleanString(data.payment_type, 50) || 'Flutterwave',
      paymentDate: cleanString(data.created_at, 80) || undefined,
    };
  }

  if (secrets.provider === 'mpesa') {
    const body = safeObject(JSON.parse(input.rawBody || '{}'));
    const transId = cleanString(body.TransID, 100);
    const invoiceNumber = cleanString(body.BillRefNumber, 160);
    const shortCode = cleanString(body.BusinessShortCode, 40);
    if (!transId) return null;
    if (
      secrets.shortCode &&
      shortCode &&
      secrets.shortCode !== shortCode
    ) {
      throw new Error('M-PESA callback short code does not match this connection.');
    }
    if (!invoiceNumber) return null;
    return {
      externalEventId: transId,
      invoiceNumber,
      status: 'succeeded',
      amount: Number(body.TransAmount || 0),
      currency: 'KES',
      providerReference: transId,
      method: 'M-PESA',
      paymentDate: cleanString(body.TransTime, 80) || undefined,
      notes: 'Verified through the registered M-PESA C2B callback URL.',
    };
  }

  const event = safeObject(JSON.parse(input.rawBody || '{}'));
  const eventType = cleanString(event.event_type, 120);
  if (eventType !== 'PAYMENT.CAPTURE.COMPLETED') return null;
  const token = await paypalToken(
    secrets.environment,
    secrets.clientId!,
    secrets.clientSecret!,
  );
  const verificationResponse = await fetchWithTimeout(
    providerBase('paypal', secrets.environment) +
      '/v1/notifications/verify-webhook-signature',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
      },
      body: JSON.stringify({
        transmission_id: input.headers.get('paypal-transmission-id'),
        transmission_time: input.headers.get('paypal-transmission-time'),
        cert_url: input.headers.get('paypal-cert-url'),
        auth_algo: input.headers.get('paypal-auth-algo'),
        transmission_sig: input.headers.get('paypal-transmission-sig'),
        webhook_id: secrets.providerWebhookId,
        webhook_event: event,
      }),
    },
  );
  const verification = await jsonBody(verificationResponse);
  if (
    !verificationResponse.ok ||
    cleanString(verification.verification_status, 40).toUpperCase() !== 'SUCCESS'
  ) {
    throw new Error('PayPal webhook signature verification failed.');
  }
  const resource = safeObject(event.resource);
  const amount = safeObject(resource.amount);
  const invoiceId = cleanString(resource.custom_id, 100) || undefined;
  const invoiceNumber = cleanString(resource.invoice_id, 160) || undefined;
  if (!invoiceId && !invoiceNumber) return null;
  return {
    externalEventId: cleanString(event.id, 255),
    invoiceId,
    invoiceNumber,
    status: 'succeeded',
    amount: Number(amount.value || 0),
    currency: cleanString(amount.currency_code, 12).toUpperCase(),
    providerReference: cleanString(resource.id, 255),
    method: 'PayPal',
    paymentDate: cleanString(resource.create_time, 80) || undefined,
  };
}

export async function disconnectInvoicePaymentProviderRemote(
  secrets: InvoicePaymentProviderSecrets,
) {
  try {
    if (
      secrets.provider === 'stripe' &&
      secrets.providerWebhookId &&
      secrets.secretKey
    ) {
      const stripe = new Stripe(secrets.secretKey);
      await stripe.webhookEndpoints.del(secrets.providerWebhookId);
      return;
    }
    if (
      secrets.provider === 'paypal' &&
      secrets.providerWebhookId &&
      secrets.clientId &&
      secrets.clientSecret
    ) {
      const token = await paypalToken(
        secrets.environment,
        secrets.clientId,
        secrets.clientSecret,
      );
      await fetchWithTimeout(
        providerBase('paypal', secrets.environment) +
          '/v1/notifications/webhooks/' +
          encodeURIComponent(secrets.providerWebhookId),
        {
          method: 'DELETE',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + token,
          },
        },
      );
    }
  } catch (error) {
    console.error('[SaMi Invoicing] Provider webhook cleanup failed:', error);
  }
}
