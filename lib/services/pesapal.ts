const PESAPAL_BASE_URL = process.env.PESAPAL_ENV === 'live' 
  ? 'https://pay.pesapal.com/v3'
  : 'https://cybqa.pesapal.com/pesapalv3';

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
      first_name?: string;
      last_name?: string;
    };
  }
) {
  const body = {
    ...orderData,
    notification_id: process.env.PESAPAL_IPN_ID,
  };

  const response = await fetch(`${PESAPAL_BASE_URL}/api/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    console.error('PesaPal order error:', data);
    throw new Error(data.message || 'Failed to submit order');
  }

  return data;
}

export async function getTransactionStatus(token: string, orderTrackingId: string) {
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