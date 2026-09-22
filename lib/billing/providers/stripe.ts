import 'server-only';

import Stripe from 'stripe';

import type {
  SamiBillingProvider,
  SamiBillingRecurringResult,
} from '@/lib/billing/provider';

function stripeClient() {
  const secret =
    process.env
      .STRIPE_SECRET_KEY
      ?.trim();

  if (
    !secret
  ) {
    throw new Error(
      'STRIPE_SECRET_KEY is not configured.',
    );
  }

  return new Stripe(
    secret,
  );
}

function toMinorUnits(
  amount:
    number,
) {
  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <=
      0
  ) {
    throw new Error(
      'Stripe billing amount must be positive.',
    );
  }

  return Math.round(
    amount *
    100,
  );
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

async function findOrCreateCustomer(
  input: {
    tenantId:
      string;
    email:
      string;
    firstName:
      string;
    lastName:
      string;
    businessName:
      string;
  },
) {
  const stripe =
    stripeClient();

  const search =
    await stripe.customers.search({
      query:
        `metadata['sami_tenant_id']:'${input.tenantId.replace(
          /'/g,
          "\\'",
        )}'`,
      limit:
        1,
    });

  if (
    search.data[0]
  ) {
    return search.data[0];
  }

  return stripe.customers.create({
    email:
      input.email,
    name:
      [
        input.firstName,
        input.lastName,
      ]
        .filter(
          Boolean,
        )
        .join(
          ' ',
        ) ||
      input.businessName,
    metadata: {
      sami_tenant_id:
        input.tenantId,
      sami_business_name:
        input.businessName,
    },
  });
}

export const stripeBillingProvider:
  SamiBillingProvider = {
  key:
    'stripe',

  name:
    'Stripe',

  capabilities: {
    checkout:
      true,
    savePaymentMethodWithoutCharge:
      true,
    automaticRecurring:
      true,
    variableRecurringAmount:
      true,
    updateRecurringQuantity:
      true,
    customerPortal:
      true,
    mpesaCheckout:
      false,
  },

  isConfigured() {
    return Boolean(
      process.env
        .STRIPE_SECRET_KEY
        ?.trim(),
    );
  },

  async createCheckout(
    input,
  ) {
    const stripe =
      stripeClient();

    const origin =
      originOrThrow(
        input.origin,
      );

    const customer =
      await findOrCreateCustomer(
        input.customer,
      );

    const session =
      await stripe.checkout
        .sessions.create({
          mode:
            'payment',
          customer:
            customer.id,
          success_url:
            `${origin}/settings?tab=billing&payment=success&provider=stripe&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url:
            `${origin}/settings?tab=billing&payment=cancelled&provider=stripe`,
          line_items: [
            {
              quantity:
                1,
              price_data: {
                currency:
                  input.currency
                    .toLowerCase(),
                unit_amount:
                  toMinorUnits(
                    input.amount,
                  ),
                product_data: {
                  name:
                    `SaMi ${input.plan} subscription`,
                  description:
                    `${input.billableUsers} active user${input.billableUsers === 1 ? '' : 's'} × ${input.pricePerUserMonthly} ${input.currency}/month`,
                },
              },
            },
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
              String(
                input.billableUsers,
              ),
            sami_price_per_user:
              String(
                input.pricePerUserMonthly,
              ),
            sami_billing_purpose:
              'subscription_payment',
          },
        });

    if (
      !session.url
    ) {
      throw new Error(
        'Stripe did not return a checkout URL.',
      );
    }

    return {
      provider:
        'stripe',
      checkoutUrl:
        session.url,
      providerReference:
        session.id,
    };
  },

  async createPaymentMethodSetup(
    input,
  ) {
    const stripe =
      stripeClient();

    const customer =
      await findOrCreateCustomer(
        input.customer,
      );

    const setupIntent =
      await stripe.setupIntents
        .create({
          customer:
            customer.id,
          usage:
            'off_session',
          metadata: {
            sami_tenant_id:
              input.customer
                .tenantId,
            sami_subscription_id:
              input.customer
                .subscriptionId,
            sami_billing_purpose:
              'registration_payment_method_setup',
          },
        });

    return {
      provider:
        'stripe',
      providerCustomerId:
        customer.id,
      setupReference:
        setupIntent.id,
      clientSecret:
        setupIntent.client_secret,
      redirectUrl:
        null,
    };
  },

  async createRecurringSubscription(
    input,
  ): Promise<
    SamiBillingRecurringResult
  > {
    const stripe =
      stripeClient();

    const trialEnd =
      input.trialEndsAt
        ? Math.floor(
            new Date(
              input.trialEndsAt,
            )
              .getTime() /
            1000,
          )
        : undefined;

    const subscription =
      await stripe.subscriptions
        .create({
          customer:
            input.providerCustomerId,
          default_payment_method:
            input.providerPaymentMethodId ||
            undefined,
          items: [
            {
              quantity:
                input.billableUsers,
              price_data: {
                currency:
                  input.currency
                    .toLowerCase(),
                unit_amount:
                  toMinorUnits(
                    input.pricePerUserMonthly,
                  ),
                recurring: {
                  interval:
                    'month',
                },
                product_data: {
                  name:
                    `SaMi ${input.plan} plan`,
                },
              },
            },
          ],
          trial_end:
            trialEnd &&
            trialEnd >
              Math.floor(
                Date.now() /
                1000,
              )
              ? trialEnd
              : undefined,
          metadata: {
            sami_tenant_id:
              input.customer
                .tenantId,
            sami_subscription_id:
              input.customer
                .subscriptionId,
            sami_plan:
              input.plan,
          },
        });

    return {
      provider:
        'stripe',
      providerSubscriptionId:
        subscription.id,
      providerCustomerId:
        input.providerCustomerId,
      providerPaymentMethodId:
        input.providerPaymentMethodId ||
        null,
      status:
        subscription.status,
    };
  },

  async updateRecurringSubscription(
    input,
  ) {
    const stripe =
      stripeClient();

    const subscription =
      await stripe.subscriptions
        .retrieve(
          input.providerSubscriptionId,
          {
            expand: [
              'items.data.price.product',
            ],
          },
        );

    const item =
      subscription.items
        .data[0];

    if (
      !item
    ) {
      throw new Error(
        'Stripe subscription has no billable item.',
      );
    }

    let productId:
      string;

    if (
      typeof item.price
        .product ===
        'string'
    ) {
      productId =
        item.price.product;
    } else {
      productId =
        item.price
          .product.id;
    }

    const price =
      await stripe.prices
        .create({
          currency:
            input.currency
              .toLowerCase(),
          unit_amount:
            toMinorUnits(
              input.pricePerUserMonthly,
            ),
          recurring: {
            interval:
              'month',
          },
          product:
            productId,
          metadata: {
            sami_price_source:
              'server_authoritative',
          },
        });

    const updated =
      await stripe.subscriptions
        .update(
          input.providerSubscriptionId,
          {
            items: [
              {
                id:
                  item.id,
                price:
                  price.id,
                quantity:
                  input.billableUsers,
              },
            ],
            proration_behavior:
              'none',
          },
        );

    return {
      provider:
        'stripe',
      providerSubscriptionId:
        updated.id,
      providerCustomerId:
        typeof updated.customer ===
          'string'
          ? updated.customer
          : updated.customer.id,
      providerPaymentMethodId:
        typeof updated
          .default_payment_method ===
          'string'
          ? updated
              .default_payment_method
          : updated
              .default_payment_method
              ?.id ||
            null,
      status:
        updated.status,
    };
  },

  async createCustomerPortal(
    input,
  ) {
    const stripe =
      stripeClient();

    const session =
      await stripe.billingPortal
        .sessions.create({
          customer:
            input.providerCustomerId,
          return_url:
            input.returnUrl,
        });

    return {
      url:
        session.url,
    };
  },

  async cancelRecurringSubscription(
    providerSubscriptionId,
  ) {
    const stripe =
      stripeClient();

    await stripe.subscriptions
      .cancel(
        providerSubscriptionId,
      );
  },
};
