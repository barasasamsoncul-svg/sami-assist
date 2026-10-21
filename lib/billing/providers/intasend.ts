import 'server-only';

import crypto from 'node:crypto';

import type {
  SamiBillingProvider,
  SamiBillingRecurringResult,
  SamiBillingSetupInput,
  SamiBillingSetupResult,
  SamiBillingSetupStatus,
} from '@/lib/billing/provider';

const API_BASE =
  'https://api.intasend.com/api/v1';

type JsonRecord =
  Record<string, unknown>;

function record(
  value: unknown,
): JsonRecord {
  return value &&
    typeof value === 'object' &&
    !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function unwrap(
  value: unknown,
): JsonRecord {
  const root = record(value);
  const nested =
    record(root.data);
  if (Object.keys(nested).length > 0) {
    return nested;
  }

  const result =
    record(root.result);
  if (Object.keys(result).length > 0) {
    return result;
  }

  return root;
}

function stringValue(
  ...values: unknown[]
) {
  for (const value of values) {
    if (
      typeof value === 'string' &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return '';
}

function requiredSecretKey() {
  const value =
    process.env.INTASEND_SECRET_KEY
      ?.trim();

  if (!value) {
    throw new Error(
      'INTASEND_SECRET_KEY is not configured.',
    );
  }

  return value;
}

function requiredPublishableKey() {
  const value =
    process.env.INTASEND_PUBLISHABLE_KEY
      ?.trim();

  if (!value) {
    throw new Error(
      'INTASEND_PUBLISHABLE_KEY is not configured.',
    );
  }

  return value;
}

function originOrThrow(
  origin: string | null | undefined,
) {
  const value = (
    origin ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    ''
  )
    .trim()
    .replace(/\/+$/, '');

  if (!value) {
    throw new Error(
      'SaMi application URL is not configured.',
    );
  }

  return value;
}

async function apiRequest(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT';
    body?: JsonRecord;
    auth?: 'secret' | 'publishable';
  } = {},
): Promise<JsonRecord> {
  const method =
    options.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (options.auth === 'publishable') {
    headers['X-IntaSend-Public-API-Key'] =
      requiredPublishableKey();
  } else {
    headers.Authorization =
      `Bearer ${requiredSecretKey()}`;
  }

  const response = await fetch(
    `${API_BASE}/${path.replace(/^\/+/, '')}`,
    {
      method,
      headers,
      ...(options.body
        ? { body: JSON.stringify(options.body) }
        : {}),
      cache: 'no-store',
    },
  );

  const responseText =
    await response.text();
  let payload: unknown = {};

  if (responseText) {
    try {
      payload = JSON.parse(responseText);
    } catch {
      payload = {
        message: 'IntaSend returned an invalid JSON response.',
      };
    }
  }

  if (!response.ok) {
    const body = unwrap(payload);
    const message = stringValue(
      body.message,
      body.detail,
      body.error,
      record(body.errors).message,
    );

    throw new Error(
      message
        ? `IntaSend request failed (${response.status}): ${message.slice(0, 300)}`
        : `IntaSend request failed with HTTP ${response.status}.`,
    );
  }

  return unwrap(payload);
}

function dateInNairobi(
  value: Date | string,
) {
  const date =
    value instanceof Date
      ? value
      : new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(
      'A valid first-charge date is required for IntaSend subscriptions.',
    );
  }

  const parts =
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

  const part = (type: string) =>
    parts.find(item => item.type === type)?.value || '';

  const result =
    `${part('year')}-${part('month')}-${part('day')}`;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) {
    throw new Error(
      'Could not determine the IntaSend subscription start date.',
    );
  }

  return result;
}

function normalizedStatus(
  value: unknown,
) {
  const status =
    stringValue(value).toLowerCase();

  if (status === 'active') return 'active';
  if (status === 'pending') return 'pending';
  if (status === 'canceled' || status === 'cancelled') return 'cancelled';
  if (status === 'complete' || status === 'completed') return 'complete';
  if (status === 'failed') return 'failed';

  return status || 'unknown';
}

function makePlanName(input: {
  plan: string;
  currency: string;
  pricePerUserMonthly: number;
  billableUsers: number;
}) {
  // IntaSend plan names are unique/upsert keys. Include server-calculated
  // unit pricing and seats so a price or seat change cannot silently reuse
  // a plan with a different amount.
  const plan =
    input.plan
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '')
      .slice(0, 7) || 'PAID';
  const unitMinor =
    Math.round(input.pricePerUserMonthly * 100);
  const currency =
    input.currency
      .trim()
      .toUpperCase();

  return `SM-${plan}-${unitMinor}-${input.billableUsers}-${currency}`
    .slice(0, 32);
}

async function ensurePlan(input: {
  plan: string;
  currency: string;
  pricePerUserMonthly: number;
  billableUsers: number;
}) {
  if (
    !Number.isFinite(input.pricePerUserMonthly) ||
    input.pricePerUserMonthly <= 0 ||
    !Number.isInteger(input.billableUsers) ||
    input.billableUsers < 1
  ) {
    throw new Error(
      'SaMi supplied an invalid recurring price or active-seat count.',
    );
  }

  const currency =
    input.currency.trim().toUpperCase();

  if (currency !== 'KES') {
    throw new Error(
      'SaMi IntaSend subscriptions currently require KES pricing.',
    );
  }

  const amount =
    Math.round(
      input.pricePerUserMonthly *
      input.billableUsers *
      100,
    ) / 100;

  const reference =
    `sami:${input.plan}:${currency}:${input.pricePerUserMonthly}:${input.billableUsers}`;

  const plan =
    await apiRequest(
      'subscriptions-plans/',
      {
        method: 'POST',
        body: {
          name: makePlanName(input),
          amount,
          currency,
          frequency: 1,
          frequency_unit: 'M',
          // IntaSend documents 0 as a valid cycle count. Confirm this
          // indefinite-cycle behavior in sandbox before the live cutover.
          billing_cycles: 0,
          reference,
        },
      },
    );

  const planId =
    stringValue(
      plan.plan_id,
      plan.id,
    );

  if (!planId) {
    throw new Error(
      'IntaSend did not return a subscription plan ID.',
    );
  }

  return {
    id: planId,
    amount,
    currency,
  };
}

async function createOrUpdateCustomer(input: {
  email: string;
  firstName: string;
  lastName: string;
  tenantId: string;
}) {
  const customer =
    await apiRequest(
      'subscriptions-customers/',
      {
        method: 'POST',
        body: {
          email: input.email.trim().toLowerCase(),
          first_name: input.firstName.trim().slice(0, 45),
          last_name: input.lastName.trim().slice(0, 45),
          country: 'KE',
          reference: input.tenantId,
        },
      },
    );

  const customerId =
    stringValue(
      customer.customer_id,
      customer.id,
    );

  if (!customerId) {
    throw new Error(
      'IntaSend did not return a recurring-billing customer ID.',
    );
  }

  return {
    id: customerId,
    raw: customer,
  };
}

export async function getIntaSendSubscription(
  subscriptionId: string,
) {
  if (!subscriptionId.trim()) {
    throw new Error(
      'IntaSend subscription ID is required.',
    );
  }

  const subscription =
    await apiRequest(
      `subscriptions/${encodeURIComponent(subscriptionId)}/`,
    );

  const returnedId =
    stringValue(
      subscription.subscription_id,
      subscription.id,
    );

  if (
    returnedId &&
    returnedId !== subscriptionId
  ) {
    throw new Error(
      'IntaSend returned a different subscription ID than requested.',
    );
  }

  return subscription;
}

export async function getIntaSendInvoiceStatus(
  invoiceId: string,
) {
  if (!invoiceId.trim()) {
    throw new Error(
      'IntaSend invoice ID is required.',
    );
  }

  const result =
    await apiRequest(
      'payment/status/',
      {
        method: 'POST',
        body: {
          invoice_id: invoiceId,
        },
      },
    );

  const invoice =
    unwrap(result.invoice || result);

  const returnedId =
    stringValue(invoice.invoice_id);

  if (
    returnedId &&
    returnedId !== invoiceId
  ) {
    throw new Error(
      'IntaSend payment status returned a different invoice ID than requested.',
    );
  }

  return invoice;
}

export const intasendBillingProvider:
  SamiBillingProvider = {
  key: 'intasend',

  name: 'IntaSend',

  capabilities: {
    checkout: true,
    savePaymentMethodWithoutCharge: true,
    automaticRecurring: true,
    variableRecurringAmount: true,
    updateRecurringQuantity: true,
    customerPortal: false,
    mpesaCheckout: false,
  },

  isConfigured() {
    return Boolean(
      process.env.INTASEND_SECRET_KEY?.trim() &&
      process.env.INTASEND_PUBLISHABLE_KEY?.trim() &&
      process.env.INTASEND_WEBHOOK_CHALLENGE?.trim(),
    );
  },

  async createCheckout(input) {
    const origin =
      originOrThrow(input.origin);

    const reference =
      `sami-${input.customer.tenantId}-${input.customer.subscriptionId}-${crypto.randomUUID()}`
        .slice(0, 140);

    const checkout =
      await apiRequest(
        'checkout/',
        {
          method: 'POST',
          auth: 'publishable',
          body: {
            amount: Math.round(input.amount * 100) / 100,
            currency: input.currency.toUpperCase(),
            email: input.customer.email,
            first_name: input.customer.firstName.slice(0, 45),
            last_name: input.customer.lastName.slice(0, 45),
            country: 'KE',
            api_ref: reference,
            unique_api_ref: true,
            host: origin,
            redirect_url:
              `${origin}/settings?tab=billing&payment=returned&provider=intasend`,
          },
        },
      );

    const checkoutId =
      stringValue(
        checkout.invoice_id,
        checkout.id,
      );
    const checkoutUrl =
      stringValue(
        checkout.url,
        checkout.checkout_url,
      );

    if (!checkoutId || !checkoutUrl) {
      throw new Error(
        'IntaSend did not return a checkout ID and hosted payment URL.',
      );
    }

    return {
      provider: 'intasend',
      checkoutUrl,
      providerReference: checkoutId,
    };
  },

  async createPaymentMethodSetup(
    input: SamiBillingSetupInput,
  ): Promise<SamiBillingSetupResult> {
    const origin =
      originOrThrow(input.origin);

    if (
      !input.plan ||
      !input.currency ||
      !input.pricePerUserMonthly ||
      !input.billableUsers ||
      !input.firstChargeAt
    ) {
      throw new Error(
        'SaMi did not provide the plan, price, seat count and first-charge date required for IntaSend recurring setup.',
      );
    }

    const customer =
      await createOrUpdateCustomer({
        email: input.customer.email,
        firstName: input.customer.firstName,
        lastName: input.customer.lastName,
        tenantId: input.customer.tenantId,
      });

    const plan =
      await ensurePlan({
        plan: input.plan,
        currency: input.currency,
        pricePerUserMonthly: input.pricePerUserMonthly,
        billableUsers: input.billableUsers,
      });

    const reference =
      `sami-${input.customer.tenantId}-${input.customer.subscriptionId}`;

    const created =
      await apiRequest(
        'subscriptions/',
        {
          method: 'POST',
          body: {
            customer_id: customer.id,
            plan_id: plan.id,
            reference,
            redirect_url:
              `${origin}/settings?tab=billing&billing_setup=return`,
          },
        },
      );

    const subscriptionId =
      stringValue(
        created.subscription_id,
        created.id,
      );
    const setupUrl =
      stringValue(
        created.setup_url,
        created.url,
      );

    if (!subscriptionId || !setupUrl) {
      throw new Error(
        'IntaSend did not return a subscription ID and card-setup URL.',
      );
    }

    try {
      // The subscription is created before the user is sent to the hosted
      // card form. Shift its first charge to the SaMi trial/paid-period end.
      await apiRequest(
        `subscriptions/${encodeURIComponent(subscriptionId)}/`,
        {
          method: 'PUT',
          body: {
            start_date: dateInNairobi(input.firstChargeAt),
          },
        },
      );
    } catch (error) {
      // Do not leave a possibly chargeable subscription behind if SaMi could
      // not enforce the no-charge-until boundary.
      try {
        await apiRequest(
          `subscriptions/${encodeURIComponent(subscriptionId)}/unsubscribe/`,
          {
            method: 'POST',
            body: {},
          },
        );
      } catch {
        // Preserve the date-setting error for the operator.
      }

      throw error;
    }

    return {
      provider: 'intasend',
      providerCustomerId: customer.id,
      setupReference: subscriptionId,
      providerSubscriptionId: subscriptionId,
      clientSecret: null,
      redirectUrl: setupUrl,
    };
  },

  async getPaymentMethodSetupStatus(
    setupReference: string,
  ): Promise<SamiBillingSetupStatus> {
    const subscription =
      await getIntaSendSubscription(
        setupReference,
      );

    const customer =
      record(subscription.customer);

    const customerId =
      stringValue(
        customer.customer_id,
        customer.id,
        subscription.customer_id,
      );

    if (!customerId) {
      throw new Error(
        'IntaSend subscription does not identify its recurring-billing customer.',
      );
    }

    return {
      provider: 'intasend',
      setupReference,
      status: normalizedStatus(subscription.status),
      providerCustomerId: customerId,
      providerSubscriptionId:
        stringValue(
          subscription.subscription_id,
          subscription.id,
          setupReference,
        ),
      providerPaymentMethodId: null,
      cardMask:
        stringValue(subscription.card_mask) || null,
      cardType:
        stringValue(subscription.card_type) || null,
    };
  },

  async updateRecurringSubscription(input) {
    const current =
      await getIntaSendSubscription(
        input.providerSubscriptionId,
      );

    const existingPlan =
      record(current.plan);

    const existingPlanName =
      stringValue(existingPlan.name);

    const plan =
      await ensurePlan({
        plan:
          existingPlanName || 'RECURRING',
        currency: input.currency,
        pricePerUserMonthly: input.pricePerUserMonthly,
        billableUsers: input.billableUsers,
      });

    const updated =
      await apiRequest(
        `subscriptions/${encodeURIComponent(input.providerSubscriptionId)}/`,
        {
          method: 'PUT',
          body: {
            plan_id: plan.id,
          },
        },
      );

    return {
      provider: 'intasend',
      providerSubscriptionId:
        stringValue(
          updated.subscription_id,
          updated.id,
          input.providerSubscriptionId,
        ),
      providerCustomerId:
        stringValue(
          record(updated.customer).customer_id,
          record(updated.customer).id,
          record(current.customer).customer_id,
          record(current.customer).id,
        ),
      providerPaymentMethodId: null,
      status: normalizedStatus(
        updated.status || current.status,
      ),
    } satisfies SamiBillingRecurringResult;
  },

  async scheduleRecurringCancellation(
    providerSubscriptionId: string,
  ) {
    // IntaSend exposes an unsubscribe operation, not a documented
    // cancel_at_period_end setting. Keep the mandate live until SaMi's
    // effective period boundary; the billing reconciliation worker must
    // unsubscribe at that boundary.
    if (!providerSubscriptionId.trim()) {
      throw new Error(
        'IntaSend subscription ID is required to schedule cancellation.',
      );
    }
  },

  async cancelRecurringSubscription(
    providerSubscriptionId: string,
  ) {
    await apiRequest(
      `subscriptions/${encodeURIComponent(providerSubscriptionId)}/unsubscribe/`,
      {
        method: 'POST',
        body: {},
      },
    );
  },
};
