import 'server-only';

import type {
  AccountContext,
} from '@/lib/auth/account-context';

import {
  getActiveSubscriptionBillingProfile,
} from '@/lib/billing/profiles';

import {
  getEffectiveSubscriptionStatus,
  getSamiPlanPolicy,
} from '@/lib/billing/plan-policy';

import {
  getActiveBillingProvider,
} from '@/lib/billing/registry';

export async function getBillingOnboardingNext(
  account:
    AccountContext,
  requestedNext:
    string,
) {
  /*
   * Preserve explicit deep links. Billing onboarding only
   * replaces the ordinary post-login dashboard destination.
   */
  if (
    requestedNext !==
      '/dashboard'
  ) {
    return requestedNext;
  }

  if (
    !account.tenant ||
    !account.membership
      ?.isOwner ||
    !account.subscription
  ) {
    return requestedNext;
  }

  const policy =
    getSamiPlanPolicy(
      account.subscription
        .planKey,
    );

  if (
    !policy ||
    !policy.paid
  ) {
    return requestedNext;
  }

  const status =
    getEffectiveSubscriptionStatus({
      status:
        account.subscription
          .status,
      planKey:
        account.subscription
          .planKey,
      trialEndsAt:
        account.subscription
          .trialEndsAt,
      currentPeriodEnd:
        account.subscription
          .currentPeriodEnd,
    });

  if (
    status !==
      'trial' &&
    status !==
      'trialing'
  ) {
    return requestedNext;
  }

  try {
    const provider =
      getActiveBillingProvider();

    if (
      !provider.capabilities
        .savePaymentMethodWithoutCharge ||
      !provider
        .createPaymentMethodSetup
    ) {
      return requestedNext;
    }

    const profile =
      await getActiveSubscriptionBillingProfile(
        account.subscription
          .id,
      );

    if (
      profile &&
      (
        profile.providerSubscriptionId ||
        profile.recurringStatus ===
          'trialing' ||
        profile.recurringStatus ===
          'active'
      )
    ) {
      return requestedNext;
    }

    return '/settings?tab=billing&setup=1';
  } catch (
    error
  ) {
    /*
     * Login must never fail because a billing provider is
     * temporarily misconfigured. Billing itself still fails
     * closed when the user reaches that surface.
     */
    console.error(
      '[SaMi Billing] Post-login billing onboarding could not be resolved:',
      error,
    );

    return requestedNext;
  }
}
