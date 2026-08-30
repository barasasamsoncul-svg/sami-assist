import crypto from 'crypto';

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
}

export async function createPesaPalOrder(data: PesaPalOrder) {
  const consumerKey = process.env.PESAPAL_CONSUMER_KEY!;
  const consumerSecret = process.env.PESAPAL_CONSUMER_SECRET!;
  const environment = process.env.PESAPAL_ENV || 'sandbox';
  
  const baseUrl = environment === 'sandbox' 
    ? 'https://cybqa.pesapal.com/pesapalv3/api' 
    : 'https://pay.pesapal.com/v3/api';

  // Generate timestamp and signature
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/payment-callback`;
  const ipnId = process.env.PESAPAL_IPN_ID!;

  const postData = {
    id: crypto.randomUUID(),
    currency: 'KES',
    amount: data.amount,
    description: `SaMi ${data.plan} Plan - ${data.businessName}`,
    callback_url: callbackUrl,
    notification_id: ipnId,
    billing_address: {
      email_address: data.email,
      phone_number: '',
      first_name: data.firstName,
      last_name: data.lastName,
      line1: '',
      line2: '',
      city: '',
      state: '',
      postal_code: '',
      country: ''
    },
    line_items: [
      {
        name: `SaMi ${data.plan} Plan - 15 Day Trial`,
        quantity: 1,
        unit_price: data.amount,
        subtotal: data.amount
      }
    ]
  };

  // Create signature
  const signatureString = `${consumerKey}${postData.id}${timestamp}`;
  const signature = crypto
    .createHmac('sha256', consumerSecret)
    .update(signatureString)
    .digest('base64');

  const response = await fetch(`${baseUrl}/Transactions/SubmitOrderRequest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${consumerKey}`,
      'Signature': signature,
      'Timestamp': timestamp,
    },
    body: JSON.stringify(postData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`PesaPal error: ${error}`);
  }

  const result = await response.json();
  
  // Store order reference
  await queryControl(
    `INSERT INTO payment_transactions (
      tenant_id, 
      subscription_id, 
      provider, 
      provider_transaction_id, 
      type, 
      amount, 
      currency, 
      status, 
      metadata, 
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [
      data.tenantId,
      data.subscriptionId,
      'pesapal',
      result.order_tracking_id,
      'subscription',
      data.amount,
      'KES',
      'pending',
      JSON.stringify({ plan: data.plan, apps: data.selectedApps })
    ]
  );

  return {
    orderTrackingId: result.order_tracking_id,
    merchantReference: result.merchant_reference,
    redirectUrl: result.redirect_url,
  };
}

// Import queryControl at the top
import { queryControl } from '@/lib/db/control';