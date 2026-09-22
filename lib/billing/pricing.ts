import 'server-only';

import {
  normalizeSamiPlanKey,
  type SamiPlanKey,
} from '@/lib/billing/plan-policy';

export const SAMI_BILLING_CURRENCY =
  'KES' as const;

const DEFAULT_PRICE_PER_USER_MONTHLY:
  Readonly<
    Record<
      SamiPlanKey,
      number
    >
  > = {
    free:
      0,
    standard:
      2500,
    custom:
      4500,
  };

function positiveMoney(
  value:
    string | undefined,
) {
  if (
    !value
  ) {
    return null;
  }

  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    ) ||
    parsed <=
      0
  ) {
    return null;
  }

  return Math.round(
    parsed *
    100,
  ) /
    100;
}

function envPrice(
  plan:
    SamiPlanKey,
) {
  if (
    plan ===
      'standard'
  ) {
    return positiveMoney(
      process.env
        .SAMI_BILLING_STANDARD_PRICE_PER_USER_MONTHLY,
    );
  }

  if (
    plan ===
      'custom'
  ) {
    return positiveMoney(
      process.env
        .SAMI_BILLING_CUSTOM_PRICE_PER_USER_MONTHLY,
    );
  }

  return 0;
}

/**
 * Server-authoritative subscription price.
 *
 * Priority:
 * 1. Canonical SaMi billing env variable.
 * 2. SaMi launch default.
 *
 * Provider-specific price variables are deliberately ignored so
 * changing payment providers can never silently change SaMi pricing.
 *
 * Never accept a billing amount from browser input.
 */
export function getSamiPricePerUserMonthly(
  planInput:
    string | null | undefined,
) {
  const plan =
    normalizeSamiPlanKey(
      planInput,
    );

  if (
    !plan
  ) {
    throw new Error(
      'Unknown SaMi billing plan.',
    );
  }

  if (
    plan ===
      'free'
  ) {
    return 0;
  }

  return (
    envPrice(
      plan,
    ) ??
    DEFAULT_PRICE_PER_USER_MONTHLY[
      plan
    ]
  );
}

export function getSamiMonthlyAmount(
  planInput:
    string | null | undefined,
  billableUsersInput:
    number,
) {
  const users =
    Math.max(
      1,
      Math.floor(
        Number(
          billableUsersInput,
        ) ||
        1,
      ),
    );

  return (
    getSamiPricePerUserMonthly(
      planInput,
    ) *
    users
  );
}

export function getSamiBillingPriceSource(
  planInput:
    string | null | undefined,
) {
  const plan =
    normalizeSamiPlanKey(
      planInput,
    );

  if (
    !plan ||
    plan ===
      'free'
  ) {
    return 'fixed';
  }

  if (
    plan ===
      'standard' &&
    process.env
      .SAMI_BILLING_STANDARD_PRICE_PER_USER_MONTHLY
  ) {
    return 'env';
  }

  if (
    plan ===
      'custom' &&
    process.env
      .SAMI_BILLING_CUSTOM_PRICE_PER_USER_MONTHLY
  ) {
    return 'env';
  }

  return 'default';
}
