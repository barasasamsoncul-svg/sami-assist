import 'server-only';

import crypto from 'node:crypto';

import type {
  SamiBillingProvider,
} from '@/lib/billing/provider';

function secretKey() {
  const value =
    process.env
      .PAYSTACK_SECRET_KEY
      ?.trim();

  if (
    !value
  ) {
    throw new Error(
      'PAYSTACK_SECRET_KEY is not configured.',
    );
  }

  return value;
}

function originOrThrow(
  origin:
    string | null | undefined,
) {
  const value =
    (
      origin ||
      process.env
        .NEXT_PUBLIC_APP_URL ||
      process.env
        .APP_URL ||
      ''
    )
      .trim()
      .replace(
        /\/+$/,
        '',
      );

  if (
    !value
  ) {
    throw new Error(
      'SaMi application URL is not configured.',
    );
  }

  return value;
}

export const paystackBillingProvider:
  SamiBillingProvider = {
  key:
    'paystack',

  name:
    'Paystack',

  capabilities: {
    checkout:
      true,
    savePaymentMethodWithoutCharge:
      false,
    automaticRecurring:
      false,
    variableRecurringAmount:
      true,
    updateRecurringQuantity:
      false,
    customerPortal:
      false,
    mpesaCheckout:
      true,
  },

  isConfigured() {
    return Boolean(
      process.env
        .PAYSTACK_SECRET_KEY
        ?.trim(),
    );
  },

  async createCheckout(
    input,
  ) {
    const origin =
      originOrThrow(
        input.origin,
      );

    const reference =
      `sami_${crypto
        .randomBytes(
          16,
        )
        .toString(
          'hex',
        )}`;

    const response =
      await fetch(
        'https://api.paystack.co/transaction/initialize',
        {
          method:
            'POST',
          headers: {
            Authorization:
              `Bearer ${secretKey()}`,
            'Content-Type':
              'application/json',
            Accept:
              'application/json',
          },
          body:
            JSON.stringify({
              email:
                input.customer
                  .email,
              amount:
                Math.round(
                  input.amount *
                  100,
                ),
              currency:
                input.currency,
              reference,
              callback_url:
                `${origin}/api/billing/paystack/callback`,
              channels: [
                'card',
                'mobile_money',
              ],
              metadata: {
                sami_tenant_id:
                  input.customer
                    .tenantId,
                sami_subscription_id:
                  input.customer
                    .subscriptionId,
                sami_plan:
                  input.plan,
                sami_billable_users:
                  input.billableUsers,
                sami_price_per_user:
                  input.pricePerUserMonthly,
                sami_billing_purpose:
                  'subscription_payment',
                cancel_action:
                  `${origin}/settings?tab=billing&payment=cancelled&provider=paystack`,
              },
            }),
        },
      );

    const body =
      await response.json() as {
        status?:
          boolean;
        message?:
          string;
        data?: {
          authorization_url?:
            string;
          reference?:
            string;
        };
      };

    if (
      !response.ok ||
      body.status !==
        true ||
      !body.data
        ?.authorization_url
    ) {
      throw new Error(
        body.message ||
        'Paystack could not create checkout.',
      );
    }

    return {
      provider:
        'paystack',
      checkoutUrl:
        body.data
          .authorization_url,
      providerReference:
        body.data
          .reference ||
        reference,
    };
  },
};
