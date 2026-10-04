import 'server-only';

import crypto from 'node:crypto';
import Stripe from 'stripe';

import type {
  InvoicePaymentProviderKey,
} from '@/lib/apps/invoicing/payment-provider-catalog';
import type {
  InvoicePaymentProviderSecrets,
  NormalizedInvoicePayment,
} from '@/lib/apps/invoicing/payment-provider-adapters';

export type HostedInvoicePaymentProviderKey =
  Exclude<InvoicePaymentProviderKey, 'mpesa'>;

export const HOSTED_INVOICE_PAYMENT_PROVIDERS:
  readonly HostedInvoicePaymentProviderKey[] = [
    'pesapal',
    'stripe',
    'paystack',
    'flutterwave',
    'paypal',
  ];

export type InvoiceCheckoutCustomer = {
  name: string;
  email: string | null;
  phone: string | null;
  billingAddress: string | null;
};

export type InvoiceCheckoutRemoteInput = {
  provider: HostedInvoicePaymentProviderKey;
  secrets: InvoicePaymentProviderSecrets;
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  companyName: string;
  customer: InvoiceCheckoutCustomer;
  returnUrl: string;
  cancelUrl: string;
};

export type InvoiceCheckoutRemoteResult = {
  checkoutUrl: string;
  externalCheckoutId: string;
  externalReference: string;
};

const REQUEST_TIMEOUT_MS = 15_000;

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

function safeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function jsonObject(value: unknown) {
  if (typeof value === 'string') {
    try {
      return safeObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return safeObject(value);
}

function providerBase(
  provider: InvoicePaymentProviderKey,
  environment: InvoicePaymentProviderSecrets['environment'],
) {
  if (provider === 'pesapal') {
    return environment === 'live'
      ? 'https://pay.pesapal.com/v3'
      : 'https://cybqa.pesapal.com/pesapalv3';
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
  secrets: InvoicePaymentProviderSecrets,
) {
  const response = await fetchWithTimeout(
    providerBase('pesapal', secrets.environment) +
      '/api/Auth/RequestToken',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        consumer_key: secrets.consumerKey,
        consumer_secret: secrets.consumerSecret,
      }),
    },
  );
  const body = await jsonBody(response);
  const token = cleanString(body.token, 8_000);
  if (!response.ok || !token) {
    throw new Error(
      cleanString(body.message, 400) ||
      'Pesapal could not authorize this checkout.',
    );
  }
  return token;
}

async function paypalToken(
  secrets: InvoicePaymentProviderSecrets,
) {
  const authorization = Buffer.from(
    String(secrets.clientId || '') +
      ':' +
      String(secrets.clientSecret || ''),
    'utf8',
  ).toString('base64');
  const body = new URLSearchParams();
  body.set('grant_type', 'client_credentials');

  const response = await fetchWithTimeout(
    providerBase('paypal', secrets.environment) +
      '/v1/oauth2/token',
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
      'PayPal could not authorize this checkout.',
    );
  }
  return token;
}

function currencyExponent(currency: string) {
  const code = currency.trim().toUpperCase();
  if (
    [
      'BIF',
      'CLP',
      'DJF',
      'GNF',
      'JPY',
      'KMF',
      'KRW',
      'MGA',
      'PYG',
      'RWF',
      'UGX',
      'VND',
      'VUV',
      'XAF',
      'XOF',
      'XPF',
    ].includes(code)
  ) {
    return 0;
  }
  if (
    [
      'BHD',
      'IQD',
      'JOD',
      'KWD',
      'LYD',
      'OMR',
      'TND',
    ].includes(code)
  ) {
    return 3;
  }
  return 2;
}

function toMinorUnits(
  amount: number,
  currency: string,
) {
  const exponent = currencyExponent(currency);
  return Math.round(amount * 10 ** exponent);
}

function amountString(
  amount: number,
  currency: string,
) {
  return amount.toFixed(currencyExponent(currency));
}

function checkoutReference(prefix: string) {
  return (
    prefix +
    '-' +
    crypto.randomBytes(10).toString('hex')
  ).slice(0, 50);
}

function paypalRequestId(prefix: string) {
  return (
    prefix.replace(/[^A-Za-z0-9]/g, '').slice(0, 4) +
    crypto.randomBytes(10).toString('hex')
  ).slice(0, 24);
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] || 'Customer',
    lastName: parts.slice(1).join(' ') || '',
  };
}

function metadataReference(value: unknown) {
  const object = jsonObject(value);
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

function parsePesapalMerchantReference(reference: string) {
  const first = reference.split(':')[0] || '';
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      first,
    )
  ) {
    return {
      invoiceId: first,
      invoiceNumber: undefined,
    };
  }
  return {
    invoiceId: undefined,
    invoiceNumber: reference || undefined,
  };
}

export function canProviderCreateHostedCheckout(
  provider: InvoicePaymentProviderKey,
): provider is HostedInvoicePaymentProviderKey {
  return HOSTED_INVOICE_PAYMENT_PROVIDERS.includes(
    provider as HostedInvoicePaymentProviderKey,
  );
}

export function checkoutCustomerRequirement(
  provider: HostedInvoicePaymentProviderKey,
  customer: InvoiceCheckoutCustomer,
) {
  if (
    ['paystack', 'flutterwave'].includes(provider) &&
    !customer.email
  ) {
    return 'Customer email is required for this payment provider.';
  }
  return null;
}

export async function createInvoicePaymentCheckoutRemote(
  input: InvoiceCheckoutRemoteInput,
): Promise<InvoiceCheckoutRemoteResult> {
  const currency = input.currency.trim().toUpperCase();
  const description = (
    'Invoice ' +
    input.invoiceNumber +
    ' payment to ' +
    input.companyName
  ).slice(0, 100);

  if (input.provider === 'pesapal') {
    if (!input.secrets.pesapalIpnId) {
      throw new Error(
        'Pesapal payment notifications are not configured for this account.',
      );
    }
    const token = await pesapalToken(input.secrets);
    const merchantReference =
      input.invoiceId +
      ':' +
      crypto.randomBytes(5).toString('hex');
    const name = splitName(input.customer.name);
    const response = await fetchWithTimeout(
      providerBase('pesapal', input.secrets.environment) +
        '/api/Transactions/SubmitOrderRequest',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
        },
        body: JSON.stringify({
          id: merchantReference,
          currency,
          amount: input.amount,
          description,
          callback_url: input.returnUrl,
          cancellation_url: input.cancelUrl,
          redirect_mode: 'TOP_WINDOW',
          notification_id: input.secrets.pesapalIpnId,
          billing_address: {
            email_address: input.customer.email || '',
            phone_number: input.customer.phone || '',
            country_code: '',
            first_name: name.firstName,
            middle_name: '',
            last_name: name.lastName,
            line_1: input.customer.billingAddress || '',
            line_2: '',
            city: '',
            state: '',
            postal_code: '',
            zip_code: '',
          },
        }),
      },
    );
    const body = await jsonBody(response);
    const checkoutUrl = cleanString(body.redirect_url, 4_000);
    const checkoutId = cleanString(body.order_tracking_id, 255);
    if (!response.ok || !checkoutUrl || !checkoutId) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Pesapal could not create the invoice checkout.',
      );
    }
    return {
      checkoutUrl,
      externalCheckoutId: checkoutId,
      externalReference:
        cleanString(body.merchant_reference, 255) ||
        merchantReference,
    };
  }

  if (input.provider === 'stripe') {
    const stripe = new Stripe(input.secrets.secretKey!);
    const successUrl =
      input.returnUrl +
      (input.returnUrl.includes('?') ? '&' : '?') +
      'session_id={CHECKOUT_SESSION_ID}';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: input.invoiceNumber,
      customer_email: input.customer.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: currency.toLowerCase(),
            unit_amount: toMinorUnits(input.amount, currency),
            product_data: {
              name: 'Invoice ' + input.invoiceNumber,
              description: (
                'Payment to ' + input.companyName
              ).slice(0, 500),
            },
          },
        },
      ],
      metadata: {
        invoiceId: input.invoiceId,
        invoiceNumber: input.invoiceNumber,
      },
      payment_intent_data: {
        metadata: {
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
        },
      },
    });
    if (!session.url) {
      throw new Error(
        'Stripe did not return a hosted checkout URL.',
      );
    }
    return {
      checkoutUrl: session.url,
      externalCheckoutId: session.id,
      externalReference: session.id,
    };
  }

  if (input.provider === 'paystack') {
    if (!input.customer.email) {
      throw new Error(
        'Customer email is required before Paystack checkout can start.',
      );
    }
    const reference = checkoutReference('sami');
    const response = await fetchWithTimeout(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization:
            'Bearer ' + input.secrets.secretKey,
        },
        body: JSON.stringify({
          email: input.customer.email,
          amount: String(
            toMinorUnits(input.amount, currency),
          ),
          currency,
          reference,
          callback_url: input.returnUrl,
          metadata: JSON.stringify({
            invoiceId: input.invoiceId,
            invoiceNumber: input.invoiceNumber,
          }),
        }),
      },
    );
    const body = await jsonBody(response);
    const data = safeObject(body.data);
    const checkoutUrl = cleanString(
      data.authorization_url,
      4_000,
    );
    const accessCode = cleanString(data.access_code, 255);
    if (
      !response.ok ||
      body.status !== true ||
      !checkoutUrl ||
      !accessCode
    ) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Paystack could not create the invoice checkout.',
      );
    }
    return {
      checkoutUrl,
      externalCheckoutId: accessCode,
      externalReference:
        cleanString(data.reference, 255) ||
        reference,
    };
  }

  if (input.provider === 'flutterwave') {
    if (!input.customer.email) {
      throw new Error(
        'Customer email is required before Flutterwave checkout can start.',
      );
    }
    const reference = checkoutReference('sami');
    const response = await fetchWithTimeout(
      'https://api.flutterwave.com/v3/payments',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization:
            'Bearer ' + input.secrets.secretKey,
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount: input.amount,
          currency,
          redirect_url: input.returnUrl,
          customer: {
            email: input.customer.email,
            name: input.customer.name,
            phonenumber: input.customer.phone || '',
          },
          customizations: {
            title: 'Invoice ' + input.invoiceNumber,
            description,
          },
          meta: {
            invoiceId: input.invoiceId,
            invoiceNumber: input.invoiceNumber,
          },
          configurations: {
            session_duration: 30,
            max_retry_attempt: 5,
          },
        }),
      },
    );
    const body = await jsonBody(response);
    const data = safeObject(body.data);
    const checkoutUrl = cleanString(data.link, 4_000);
    if (
      !response.ok ||
      cleanString(body.status, 40).toLowerCase() !==
        'success' ||
      !checkoutUrl
    ) {
      throw new Error(
        cleanString(body.message, 400) ||
        'Flutterwave could not create the invoice checkout.',
      );
    }
    return {
      checkoutUrl,
      externalCheckoutId:
        cleanString(data.id, 255) ||
        reference,
      externalReference: reference,
    };
  }

  const token = await paypalToken(input.secrets);
  const response = await fetchWithTimeout(
    providerBase('paypal', input.secrets.environment) +
      '/v2/checkout/orders',
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token,
        'PayPal-Request-Id': paypalRequestId('sami'),
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.invoiceId,
            custom_id: input.invoiceId,
            invoice_id: input.invoiceNumber,
            description,
            amount: {
              currency_code: currency,
              value: amountString(
                input.amount,
                currency,
              ),
            },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              payment_method_preference:
                'IMMEDIATE_PAYMENT_REQUIRED',
              brand_name:
                input.companyName.slice(0, 127),
              landing_page: 'LOGIN',
              shipping_preference:
                'NO_SHIPPING',
              user_action: 'PAY_NOW',
              return_url: input.returnUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      }),
    },
  );
  const body = await jsonBody(response);
  const orderId = cleanString(body.id, 255);
  const links = safeArray(body.links)
    .map(safeObject);
  const checkoutUrl =
    cleanString(
      links.find(
        link =>
          ['payer-action', 'approve'].includes(
            cleanString(link.rel, 80),
          ),
      )?.href,
      4_000,
    );
  if (!response.ok || !orderId || !checkoutUrl) {
    throw new Error(
      cleanString(body.message, 400) ||
      'PayPal could not create the invoice checkout.',
    );
  }
  return {
    checkoutUrl,
    externalCheckoutId: orderId,
    externalReference: orderId,
  };
}

async function verifyPesapalReturn(
  secrets: InvoicePaymentProviderSecrets,
  query: URLSearchParams,
): Promise<NormalizedInvoicePayment | null> {
  const trackingId =
    cleanString(query.get('OrderTrackingId'), 255);
  const merchantReference =
    cleanString(
      query.get('OrderMerchantReference'),
      255,
    );
  if (!trackingId || !merchantReference) {
    return null;
  }

  const token = await pesapalToken(secrets);
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
    throw new Error(
      'Pesapal transaction verification failed.',
    );
  }
  if (
    cleanString(
      body.payment_status_description,
      40,
    ).toUpperCase() !== 'COMPLETED'
  ) {
    return null;
  }
  const reference =
    parsePesapalMerchantReference(
      merchantReference,
    );
  return {
    externalEventId:
      trackingId + ':COMPLETED',
    ...reference,
    status: 'succeeded',
    amount: Number(body.amount),
    currency:
      cleanString(body.currency, 12).toUpperCase(),
    providerReference:
      cleanString(body.confirmation_code, 255) ||
      trackingId,
    method:
      cleanString(body.payment_method, 50) ||
      'Pesapal',
    paymentDate:
      cleanString(body.created_date, 80) ||
      undefined,
  };
}

async function verifyStripeReturn(
  secrets: InvoicePaymentProviderSecrets,
  query: URLSearchParams,
): Promise<NormalizedInvoicePayment | null> {
  const sessionId =
    cleanString(query.get('session_id'), 255);
  if (!sessionId) return null;

  const stripe = new Stripe(secrets.secretKey!);
  const session =
    await stripe.checkout.sessions.retrieve(
      sessionId,
    );
  if (session.payment_status !== 'paid') {
    return null;
  }
  const reference =
    metadataReference(session.metadata);
  if (
    !reference.invoiceId &&
    !reference.invoiceNumber &&
    session.client_reference_id
  ) {
    reference.invoiceNumber =
      session.client_reference_id;
  }
  if (
    !reference.invoiceId &&
    !reference.invoiceNumber
  ) {
    throw new Error(
      'Stripe checkout is missing the SaMi invoice reference.',
    );
  }
  return {
    externalEventId: session.id,
    ...reference,
    status: 'succeeded',
    amount:
      fromMinorUnits(
        session.amount_total,
        cleanString(
          session.currency,
          12,
        ).toUpperCase(),
      ),
    currency:
      cleanString(
        session.currency,
        12,
      ).toUpperCase(),
    providerReference:
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.id,
    method: 'Stripe',
  };
}

async function verifyPaystackReturn(
  secrets: InvoicePaymentProviderSecrets,
  query: URLSearchParams,
): Promise<NormalizedInvoicePayment | null> {
  const reference =
    cleanString(query.get('reference'), 255) ||
    cleanString(query.get('trxref'), 255);
  if (!reference) return null;

  const response = await fetchWithTimeout(
    'https://api.paystack.co/transaction/verify/' +
      encodeURIComponent(reference),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization:
          'Bearer ' + secrets.secretKey,
      },
    },
  );
  const body = await jsonBody(response);
  const data = safeObject(body.data);
  if (!response.ok || body.status !== true) {
    throw new Error(
      cleanString(body.message, 400) ||
      'Paystack transaction verification failed.',
    );
  }
  if (
    cleanString(data.status, 40).toLowerCase() !==
      'success'
  ) {
    return null;
  }
  const invoice =
    metadataReference(data.metadata);
  if (
    !invoice.invoiceId &&
    !invoice.invoiceNumber
  ) {
    throw new Error(
      'Paystack transaction is missing the SaMi invoice reference.',
    );
  }
  return {
    externalEventId:
      cleanString(data.id, 100) ||
      cleanString(data.reference, 255),
    ...invoice,
    status: 'succeeded',
    amount:
      fromMinorUnits(
        data.amount,
        cleanString(
          data.currency,
          12,
        ).toUpperCase(),
      ),
    currency:
      cleanString(
        data.currency,
        12,
      ).toUpperCase(),
    providerReference:
      cleanString(data.reference, 255),
    method:
      cleanString(data.channel, 50) ||
      'Paystack',
    paymentDate:
      cleanString(data.paid_at, 80) ||
      undefined,
  };
}

async function verifyFlutterwaveReturn(
  secrets: InvoicePaymentProviderSecrets,
  query: URLSearchParams,
): Promise<NormalizedInvoicePayment | null> {
  const transactionId =
    cleanString(query.get('transaction_id'), 100);
  const txRef =
    cleanString(query.get('tx_ref'), 255);
  if (!transactionId && !txRef) return null;

  const url = transactionId
    ? 'https://api.flutterwave.com/v3/transactions/' +
      encodeURIComponent(transactionId) +
      '/verify'
    : 'https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=' +
      encodeURIComponent(txRef);

  const response = await fetchWithTimeout(
    url,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization:
          'Bearer ' + secrets.secretKey,
      },
    },
  );
  const body = await jsonBody(response);
  const data = safeObject(body.data);
  if (
    !response.ok ||
    cleanString(
      body.status,
      40,
    ).toLowerCase() !== 'success'
  ) {
    throw new Error(
      cleanString(body.message, 400) ||
      'Flutterwave transaction verification failed.',
    );
  }
  if (
    cleanString(
      data.status,
      40,
    ).toLowerCase() !== 'successful'
  ) {
    return null;
  }

  const invoice =
    metadataReference(
      data.meta || data.metadata,
    );
  if (
    !invoice.invoiceId &&
    !invoice.invoiceNumber
  ) {
    throw new Error(
      'Flutterwave transaction is missing the SaMi invoice reference.',
    );
  }

  return {
    externalEventId:
      cleanString(data.id, 100) ||
      cleanString(data.flw_ref, 255) ||
      cleanString(data.tx_ref, 255),
    ...invoice,
    status: 'succeeded',
    amount:
      Number(
        data.amount ||
        data.charged_amount ||
        0,
      ),
    currency:
      cleanString(
        data.currency,
        12,
      ).toUpperCase(),
    providerReference:
      cleanString(data.flw_ref, 255) ||
      cleanString(data.tx_ref, 255),
    method:
      cleanString(
        data.payment_type,
        50,
      ) ||
      'Flutterwave',
    paymentDate:
      cleanString(
        data.created_at,
        80,
      ) ||
      undefined,
  };
}

function captureFromPayPalOrder(order: Record<string, unknown>) {
  const units = safeArray(order.purchase_units);
  for (const rawUnit of units) {
    const unit = safeObject(rawUnit);
    const payments = safeObject(unit.payments);
    const captures = safeArray(payments.captures);
    for (const rawCapture of captures) {
      const capture = safeObject(rawCapture);
      if (
        cleanString(
          capture.status,
          40,
        ).toUpperCase() !== 'COMPLETED'
      ) {
        continue;
      }
      return {
        unit,
        capture,
      };
    }
  }
  return null;
}

async function verifyPayPalReturn(
  secrets: InvoicePaymentProviderSecrets,
  query: URLSearchParams,
): Promise<NormalizedInvoicePayment | null> {
  const orderId =
    cleanString(query.get('token'), 255) ||
    cleanString(
      query.get('paypal_order_id'),
      255,
    );
  if (!orderId) return null;

  const token = await paypalToken(secrets);
  let order: Record<string, unknown> = {};

  const captureResponse =
    await fetchWithTimeout(
      providerBase('paypal', secrets.environment) +
        '/v2/checkout/orders/' +
        encodeURIComponent(orderId) +
        '/capture',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + token,
          'PayPal-Request-Id':
            paypalRequestId('cap'),
          Prefer: 'return=representation',
        },
        body: '{}',
      },
    );

  if (captureResponse.ok) {
    order = await jsonBody(captureResponse);
  } else if (
    captureResponse.status === 422
  ) {
    const retrieveResponse =
      await fetchWithTimeout(
        providerBase('paypal', secrets.environment) +
          '/v2/checkout/orders/' +
          encodeURIComponent(orderId),
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer ' + token,
          },
        },
      );
    order = await jsonBody(retrieveResponse);
    if (!retrieveResponse.ok) {
      throw new Error(
        'PayPal order verification failed.',
      );
    }
  } else {
    const body = await jsonBody(captureResponse);
    throw new Error(
      cleanString(body.message, 400) ||
      'PayPal could not capture this payment.',
    );
  }

  const found = captureFromPayPalOrder(order);
  if (!found) return null;

  const amount = safeObject(found.capture.amount);
  const invoiceId =
    cleanString(found.unit.custom_id, 100) ||
    cleanString(found.unit.reference_id, 100);
  const invoiceNumber =
    cleanString(found.unit.invoice_id, 160);

  if (!invoiceId && !invoiceNumber) {
    throw new Error(
      'PayPal order is missing the SaMi invoice reference.',
    );
  }

  return {
    externalEventId:
      cleanString(found.capture.id, 255),
    invoiceId: invoiceId || undefined,
    invoiceNumber:
      invoiceNumber || undefined,
    status: 'succeeded',
    amount: Number(amount.value || 0),
    currency:
      cleanString(
        amount.currency_code,
        12,
      ).toUpperCase(),
    providerReference:
      cleanString(found.capture.id, 255),
    method: 'PayPal',
    paymentDate:
      cleanString(
        found.capture.create_time,
        80,
      ) ||
      undefined,
  };
}

export async function verifyInvoicePaymentCheckoutReturn(
  input: {
    provider: HostedInvoicePaymentProviderKey;
    secrets: InvoicePaymentProviderSecrets;
    query: URLSearchParams;
  },
): Promise<NormalizedInvoicePayment | null> {
  if (input.provider === 'pesapal') {
    return verifyPesapalReturn(
      input.secrets,
      input.query,
    );
  }
  if (input.provider === 'stripe') {
    return verifyStripeReturn(
      input.secrets,
      input.query,
    );
  }
  if (input.provider === 'paystack') {
    return verifyPaystackReturn(
      input.secrets,
      input.query,
    );
  }
  if (input.provider === 'flutterwave') {
    return verifyFlutterwaveReturn(
      input.secrets,
      input.query,
    );
  }
  return verifyPayPalReturn(
    input.secrets,
    input.query,
  );
}
