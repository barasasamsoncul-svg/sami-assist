export type InvoicePaymentProviderKey =
  | 'pesapal'
  | 'mpesa'
  | 'stripe'
  | 'paystack'
  | 'flutterwave'
  | 'paypal';

export type InvoicePaymentEnvironment =
  | 'sandbox'
  | 'live';

export type InvoicePaymentProviderField = {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder?: string;
  help: string;
  required: boolean;
};

export type InvoicePaymentProviderDefinition = {
  key: InvoicePaymentProviderKey;
  name: string;
  description: string;
  countries: string[];
  environments: InvoicePaymentEnvironment[];
  setupMode: 'automatic' | 'guided';
  setupNote: string;
  fields: InvoicePaymentProviderField[];
};

export const INVOICE_PAYMENT_PROVIDERS: readonly InvoicePaymentProviderDefinition[] = [
  {
    key: 'pesapal',
    name: 'Pesapal',
    description: 'Accept Pesapal-supported payment methods and reconcile successful invoice payments automatically.',
    countries: ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Zambia'],
    environments: ['sandbox', 'live'],
    setupMode: 'automatic',
    setupNote: 'SaMi verifies your merchant credentials and registers the payment notification URL for you.',
    fields: [
      {
        key: 'consumerKey',
        label: 'Consumer Key',
        type: 'text',
        help: 'Copy the Consumer Key from your Pesapal merchant account.',
        required: true,
      },
      {
        key: 'consumerSecret',
        label: 'Consumer Secret',
        type: 'password',
        help: 'Copy the Consumer Secret from your Pesapal merchant account.',
        required: true,
      },
    ],
  },
  {
    key: 'mpesa',
    name: 'M-PESA (Daraja)',
    description: 'Receive Paybill or Till C2B payments and match the account/reference number to SaMi invoices.',
    countries: ['Kenya'],
    environments: ['sandbox', 'live'],
    setupMode: 'automatic',
    setupNote: 'SaMi verifies the Daraja app and registers the C2B confirmation and validation URLs.',
    fields: [
      {
        key: 'consumerKey',
        label: 'Consumer Key',
        type: 'text',
        help: 'Copy the Consumer Key from your Safaricom Daraja app.',
        required: true,
      },
      {
        key: 'consumerSecret',
        label: 'Consumer Secret',
        type: 'password',
        help: 'Copy the Consumer Secret from your Safaricom Daraja app.',
        required: true,
      },
      {
        key: 'shortCode',
        label: 'Paybill / Till number',
        type: 'text',
        help: 'Enter the business short code that receives customer payments.',
        required: true,
      },
    ],
  },
  {
    key: 'stripe',
    name: 'Stripe',
    description: 'Accept Stripe Checkout payments and reconcile completed invoice checkout sessions automatically.',
    countries: ['International'],
    environments: ['sandbox', 'live'],
    setupMode: 'automatic',
    setupNote: 'SaMi verifies the Stripe account and creates the webhook endpoint automatically.',
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        type: 'password',
        placeholder: 'sk_test_… or sk_live_…',
        help: 'Copy the secret key for the Stripe account that should receive invoice payments.',
        required: true,
      },
    ],
  },
  {
    key: 'paystack',
    name: 'Paystack',
    description: 'Receive card, bank and mobile-money payment events and reconcile successful invoice transactions.',
    countries: ['Africa'],
    environments: ['sandbox', 'live'],
    setupMode: 'guided',
    setupNote: 'After SaMi verifies the key, you will copy one SaMi payment-notification URL into Paystack.',
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        type: 'password',
        placeholder: 'sk_test_… or sk_live_…',
        help: 'Copy the secret key from Paystack API Keys & Webhooks.',
        required: true,
      },
    ],
  },
  {
    key: 'flutterwave',
    name: 'Flutterwave',
    description: 'Receive Flutterwave payment events and reconcile verified successful invoice transactions.',
    countries: ['Africa', 'International'],
    environments: ['sandbox', 'live'],
    setupMode: 'guided',
    setupNote: 'SaMi creates a secure verification value; paste the URL and verification value into Flutterwave Webhooks.',
    fields: [
      {
        key: 'secretKey',
        label: 'Secret Key',
        type: 'password',
        help: 'Copy the Flutterwave secret key for this account.',
        required: true,
      },
    ],
  },
  {
    key: 'paypal',
    name: 'PayPal',
    description: 'Receive completed PayPal captures and reconcile them to SaMi invoices.',
    countries: ['International'],
    environments: ['sandbox', 'live'],
    setupMode: 'automatic',
    setupNote: 'SaMi exchanges the app credentials for temporary access tokens and registers the webhook automatically.',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        type: 'text',
        help: 'Copy the Client ID from your PayPal REST app.',
        required: true,
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        help: 'Copy the Client Secret from your PayPal REST app.',
        required: true,
      },
    ],
  },
] as const;

export function getInvoicePaymentProviderDefinition(
  key: string,
) {
  return INVOICE_PAYMENT_PROVIDERS.find(
    provider => provider.key === key,
  ) || null;
}
