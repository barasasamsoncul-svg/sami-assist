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
  const value =
    (
      process.env
        .SAMI_BILLING_PROVIDER ||
      'stripe'
    )
      .trim()
      .toLowerCase();

  if (
    value ===
      'stripe' ||
    value ===
      'paystack' ||
    value ===
      'pesapal'
  ) {
    return value;
  }

  throw new Error(
    'SAMI_BILLING_PROVIDER must be stripe, paystack or pesapal.',
  );
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
    getBillingProvider();

  if (
    !provider
      .isConfigured()
  ) {
    throw new Error(
      `SaMi billing provider "${provider.key}" is not configured.`,
    );
  }

  return provider;
}

export function getBillingProviderCatalog() {
  return (
    Object.values(
      PROVIDERS,
    ) as
      SamiBillingProvider[]
  )
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
          provider.key ===
          getConfiguredBillingProviderKey(),
      }),
    );
}
