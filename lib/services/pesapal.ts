import crypto from 'crypto';
import { queryControl } from '@/lib/db/control';

interface PesaPalOrder {
  tenantId: string;
  subscriptionId: string | null;
  amount: number;
  email: string;
  firstName: string;
  lastName: string;
  businessName: string;
  plan: string;
  selectedApps: string[];
  origin?: string;
}

interface PesaPalTokenResponse {
  token?: string;
  expiryDate?: string;
  error?: string;
  message?: string;
}

interface PesaPalSubmitOrderResponse {
  order_tracking_id?: string;
  merchant_reference?: string;
  redirect_url?: string;
  error?: unknown;
  message?: string;
  status?: string | number;
}

interface PesaPalTransactionStatusResponse {
  payment_status_description?: string;
  payment_status_code?: number;
  status_code?: number;
  order_tracking_id?: string;
  merchant_reference?: string;
  amount?: number;
  currency?: string;
  payment_method?: string;
  confirmation_code?: string;
  created_date?: string;
  payment_account?: string;
  error?: unknown;
  message?: string;
  [key: string]: unknown;
}

function getPesaPalConfig() {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET;
  const environment = (process.env.PESAPAL_ENV || 'sandbox').trim().toLowerCase();

  if (!consumerKey) {
    throw new Error('PESAPAL_CONSUMER_KEY is not configured.');
  }

  if (!consumerSecret) {
    throw new Error('PESAPAL_CONSUMER_SECRET is not configured.');
  }

  const baseUrl =
    environment === 'production'
      ? 'https://pay.pesapal.com/v3/api'
      : 'https://cybqa.pesapal.com/pesapalv3/api';

  return {
    consumerKey,
    consumerSecret,
    environment,
    baseUrl,
  };
}

export async function getPesaPalAccessToken(): Promise<string> {
  const { consumerKey, consumerSecret, baseUrl } = getPesaPalConfig();

  const response = await fetch(`${baseUrl}/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
    }),
    cache: 'no-store',
  });

  const responseText = await response.text();
  let data: PesaPalTokenResponse = {};

  try {
    data = JSON.parse(responseText);
  } catch {
    console.error('Invalid PesaPal authentication response:', responseText);
  }

  if (!response.ok) {
    console.error('PesaPal authentication failed:', {
      status: response.status,
      response: responseText,
    });
    throw new Error('Unable to authenticate with PesaPal.');
  }

  if (!data.token) {
    console.error('PesaPal authentication returned no token:', data);
    throw new Error('PesaPal did not return an access token.');
  }

  return data.token;
}

function cryptoRandomUUID(): string {
  return crypto.randomUUID();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.substring(0, maxLength).trim();
}

export async function createPesaPalOrder(data: PesaPalOrder) {
  const { baseUrl } = getPesaPalConfig();
  const token = await getPesaPalAccessToken();

  const ipnId = process.env.PESAPAL_IPN_ID;

  if (!ipnId) {
    throw new Error('PESAPAL_IPN_ID is not configured.');
  }

  const appUrl = data.origin || 'http://localhost:3000';
  const merchantReference = cryptoRandomUUID();

  const callbackUrl = `${appUrl.replace(/\/+$/, '')}/api/auth/pesapal-callback`;
  const cancellationUrl = `${appUrl.replace(/\/+$/, '')}/auth/payment-cancelled`;

  const email = data.email.trim().toLowerCase();
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();
  const businessName = data.businessName.trim();

  const postData = {
    id: merchantReference,
    currency: 'KES',
    amount: Number(data.amount),
    description: truncate(`SaMi ${data.plan} Plan - ${businessName}`, 100),
    callback_url: callbackUrl,
    cancellation_url: cancellationUrl,
    notification_id: ipnId,
    billing_address: {
      email_address: email,
      phone_number: '',
      country_code: 'KE',
      first_name: firstName,
      middle_name: '',
      last_name: lastName,
      line_1: '',
      line_2: '',
      city: '',
      state: '',
      postal_code: '',
      zip_code: '',
    },
  };

  const response = await fetch(`${baseUrl}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(postData),
    cache: 'no-store',
  });

  const responseText = await response.text();
  let result: PesaPalSubmitOrderResponse = {};

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error('Invalid PesaPal order response:', responseText);
  }

  if (!response.ok) {
    console.error('PesaPal order creation failed:', {
      status: response.status,
      response: responseText,
    });
    throw new Error(`PesaPal order creation failed: ${result.message || responseText || 'Unknown error'}`);
  }

  if (!result.order_tracking_id || !result.redirect_url) {
    console.error('PesaPal returned an incomplete order:', result);
    throw new Error(result.message || 'PesaPal did not return a valid payment order.');
  }

  // Store transaction
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
      )
    `,
    [
      data.tenantId,
      data.subscriptionId,
      'pesapal',
      result.order_tracking_id,
      Number(data.amount),
      'KES',
      'pending',
      `SaMi ${data.plan} Plan - ${businessName}`,
      JSON.stringify({
        merchantReference,
        plan: data.plan,
        apps: data.selectedApps,
        businessName,
        email,
        firstName,
        lastName,
        createdAt: new Date().toISOString(),
      }),
    ]
  );

  return {
    orderTrackingId: result.order_tracking_id,
    merchantReference: result.merchant_reference || merchantReference,
    redirectUrl: result.redirect_url,
  };
}

export async function getPesaPalTransactionStatus(orderTrackingId: string) {
  if (!orderTrackingId || !orderTrackingId.trim()) {
    throw new Error('PesaPal order tracking ID is required.');
  }

  const { baseUrl } = getPesaPalConfig();
  const token = await getPesaPalAccessToken();

  const response = await fetch(
    `${baseUrl}/Transactions/GetTransactionStatus?` +
      new URLSearchParams({
        orderTrackingId: orderTrackingId.trim(),
      }).toString(),
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    }
  );

  const responseText = await response.text();
  let result: PesaPalTransactionStatusResponse = {};

  try {
    result = JSON.parse(responseText);
  } catch {
    console.error('Invalid PesaPal transaction status response:', responseText);
  }

  if (!response.ok) {
    console.error('PesaPal transaction status request failed:', {
      status: response.status,
      orderTrackingId,
      response: responseText,
    });
    throw new Error('Unable to verify payment status with PesaPal.');
  }

  const status = String(result.payment_status_description || '').trim().toUpperCase();

  return {
    status,
    orderTrackingId: result.order_tracking_id || orderTrackingId,
    merchantReference: result.merchant_reference || null,
    amount: result.amount ?? null,
    currency: result.currency || null,
    paymentMethod: result.payment_method || null,
    confirmationCode: result.confirmation_code || null,
    paymentStatusCode: result.payment_status_code ?? result.status_code ?? null,
    createdDate: result.created_date || null,
    paymentAccount: result.payment_account || null,
    raw: result,
  };
}