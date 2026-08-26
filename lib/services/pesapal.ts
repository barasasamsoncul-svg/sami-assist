const PESAPAL_BASE_URL = process.env.PESAPAL_ENV === 'live' 
  ? 'https://pay.pesapal.com/v3'
  : 'https://cybqa.pesapal.com/pesapalv3';

const PESAPAL_IPN_ID = process.env.PESAPAL_IPN_ID || '9ae1a973-9825-4660-b01e-d9fa25751594';

export async function getPesaPalToken(): Promise<string> {
  const response = await fetch(`${PESAPAL_BASE_URL}/api/Auth/RequestToken`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET,
    }),
  });

  const data = await response.json();

  if (!response.ok || !data.token) {
    console.error('PesaPal token error:', data);
    throw new Error(data.message || 'Failed to get PesaPal token');
  }

  return data.token;
}

export async function submitOrderRequest(
  token: string,
  orderData: {
    id: string;
    currency: string;
    amount: number;
    description: string;
    callback_url: string;
    redirect_url: string;
    billing_address: {
      email_address: string;
      phone_number?: string;
      first_name?: string;
      last_name?: string;
    };
  }
) {
  const response = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ...orderData,
      notification_id: PESAPAL_IPN_ID,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('PesaPal order error:', data);
    throw new Error(data.message || 'Failed to submit order');
  }

  return data;
}

export async function getTransactionStatus(
  token: string,
  orderTrackingId: string
) {
  const response = await fetch(
    `${PESAPAL_BASE_URL}/api/Transactions/GetTransactionStatus?orderTrackingId=${orderTrackingId}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error('PesaPal status error:', data);
    throw new Error(data.message || 'Failed to get transaction status');
  }

  return data;
}

export async function createRecurringPaymentPlan(
  token: string,
  planData: {
    name: string;
    amount: number;
    interval: 'MONTHLY' | 'YEARLY';
    trial_period_days: number;
    description: string;
  }
) {
  const response = await fetch(`${PESAPAL_BASE_URL}/api/Payments/CreatePaymentPlan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(planData),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('PesaPal plan creation error:', data);
    throw new Error(data.message || 'Failed to create payment plan');
  }

  return data;
}