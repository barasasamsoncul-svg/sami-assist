import 'server-only';

import type {
  SamiBillingProvider,
  SamiBillingProviderKey,
} from '@/lib/billing/provider';

import {
  paystackBillingProvider,
} from '@/lib/billing/providers/paystack';

import {
  pesapalBillingProvider,
} from '@/lib/billing/providers/pesapal';

import {
  stripeBillingProvider,
} from '@/lib/billing/providers/stripe';

/**
 * Paystack and PesaPal remain available only when resolving historical
 * payment/provider references. New SaMi Platform subscription billing is
 * deliberately Stripe-only.
 */
const PROVIDERS:
  Readonly<
    Record<
      SamiBillingProviderKey,
      SamiBillingProvider
    >
  > = {
    stripe:
      stripeBillingProvider,
    paystack:
      paystackBillingProvider,
    pesapal:
      pesapalBillingProvider,
  };

export function getConfiguredBillingProviderKey():
  SamiBillingProviderKey {
  // Do not let an old Vercel environment setting silently route new
  // platform subscriptions back through a one-time-payment provider.
  return 'stripe';
}

export function getBillingProvider(
  providerKey?:
    string | null,
) {
  const key =
    providerKey
      ? providerKey
          .trim()
          .toLowerCase()
      : getConfiguredBillingProviderKey();

  if (
    key !==
      'stripe' &&
    key !==
      'paystack' &&
    key !==
      'pesapal'
  ) {
    throw new Error(
      'Unsupported SaMi billing provider.',
    );
  }

  return PROVIDERS[
    key
  ];
}

export function getActiveBillingProvider() {
  const provider =
    getBillingProvider(
      'stripe',
    );

  if (
    !provider
      .isConfigured()
  ) {
    throw new Error(
      'SaMi Platform subscription billing is not configured for Stripe. Configure STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY and STRIPE_WEBHOOK_SECRET.',
    );
  }

  return provider;
}

export function getBillingProviderCatalog() {
  // Expose only the provider SaMi Platform subscriptions actually support.
  // The legacy adapters above are intentionally not offered as selectable
  // platform subscription providers.
  return [
    stripeBillingProvider,
  ]
    .map(
      provider => ({
        key:
          provider.key,
        name:
          provider.name,
        configured:
          provider
            .isConfigured(),
        capabilities:
          provider.capabilities,
        active:
          true,
      }),
    );
}
