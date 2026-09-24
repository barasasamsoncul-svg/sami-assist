export type SamiPlanKey =
  | 'free'
  | 'standard'
  | 'custom';

export type SamiQuotaPolicy =
  | {
      mode:
        'fixed';
      limit:
        number;
      unit:
        string;
    }
  | {
      mode:
        'cost_controlled';
      limit:
        null;
      unit:
        string;
      label:
        string;
    }
  | {
      mode:
        'plan_controlled';
      limit:
        null;
      unit:
        string;
      label:
        string;
    };

export type SamiPlanPolicy = {
  key:
    SamiPlanKey;

  name:
    string;

  paid:
    boolean;

  billing: {
    currency:
      'KES';
    interval:
      'monthly';
    firstMonthFree:
      boolean;
    billingBasis:
      'per_active_internal_user';
  };

  apps: {
    allBusinessApps:
      boolean;
    maxInstalledBusinessApps:
      number | null;
  };

  users: {
    maxActiveInternalUsers:
      number | null;
  };

  ai: {
    enabled:
      boolean;
    monthlyQueriesPerUser:
      SamiQuotaPolicy;
  };

  automation: {
    enabled:
      boolean;
  };

  integrations: {
    enabled:
      boolean;
    customIntegrations:
      boolean;
  };

  developerApi: {
    enabled:
      boolean;
  };

  companies: {
    multiCompany:
      boolean;
  };

  customization: {
    enabled:
      boolean;
  };

  storage: {
    cloudHosted:
      true;
    allowance:
      SamiQuotaPolicy;
  };
};

/*
 * Category 22 commercial contract.
 *
 * IMPORTANT:
 * - Price resolution lives in lib/billing/pricing.ts and is server-authoritative.
 * - This file owns plan feature semantics, not payment-provider state.
 * - Category 23 owns measured usage, counters and hard quota enforcement.
 * - null never means "unlimited" for costly resources. The quota mode
 *   explains whether the value is fixed, cost-controlled or awaiting
 *   explicit plan configuration.
 */
export const SAMI_PLAN_POLICIES:
  Readonly<
    Record<
      SamiPlanKey,
      SamiPlanPolicy
    >
  > = {
    free: {
      key:
        'free',
      name:
        'Free',
      paid:
        false,
      billing: {
        currency:
          'KES',
        interval:
          'monthly',
        firstMonthFree:
          false,
        billingBasis:
          'per_active_internal_user',
      },
      apps: {
        allBusinessApps:
          false,
        maxInstalledBusinessApps:
          1,
      },
      users: {
        maxActiveInternalUsers:
          1,
      },
      ai: {
        enabled:
          true,
        monthlyQueriesPerUser: {
          mode:
            'fixed',
          limit:
            100,
          unit:
            'queries/user/month',
        },
      },
      automation: {
        enabled:
          true,
      },
      integrations: {
        enabled:
          true,
        customIntegrations:
          false,
      },
      developerApi: {
        enabled:
          false,
      },
      companies: {
        multiCompany:
          false,
      },
      customization: {
        enabled:
          false,
      },
      storage: {
        cloudHosted:
          true,
        allowance: {
          mode:
            'plan_controlled',
          limit:
            null,
          unit:
            'bytes/workspace',
          label:
            'Cloud storage allowance is plan-controlled and enforced by Usage & Entitlements.',
        },
      },
    },

    standard: {
      key:
        'standard',
      name:
        'Standard',
      paid:
        true,
      billing: {
        currency:
          'KES',
        interval:
          'monthly',
        firstMonthFree:
          true,
        billingBasis:
          'per_active_internal_user',
      },
      apps: {
        allBusinessApps:
          true,
        maxInstalledBusinessApps:
          null,
      },
      users: {
        maxActiveInternalUsers:
          null,
      },
      ai: {
        enabled:
          true,
        monthlyQueriesPerUser: {
          mode:
            'fixed',
          limit:
            1000,
          unit:
            'queries/user/month',
        },
      },
      automation: {
        enabled:
          true,
      },
      integrations: {
        enabled:
          true,
        customIntegrations:
          false,
      },
      developerApi: {
        enabled:
          false,
      },
      companies: {
        multiCompany:
          false,
      },
      customization: {
        enabled:
          false,
      },
      storage: {
        cloudHosted:
          true,
        allowance: {
          mode:
            'plan_controlled',
          limit:
            null,
          unit:
            'bytes/workspace',
          label:
            'Cloud storage allowance is plan-controlled and enforced by Usage & Entitlements.',
        },
      },
    },

    custom: {
      key:
        'custom',
      name:
        'Custom',
      paid:
        true,
      billing: {
        currency:
          'KES',
        interval:
          'monthly',
        firstMonthFree:
          true,
        billingBasis:
          'per_active_internal_user',
      },
      apps: {
        allBusinessApps:
          true,
        maxInstalledBusinessApps:
          null,
      },
      users: {
        maxActiveInternalUsers:
          null,
      },
      ai: {
        enabled:
          true,
        monthlyQueriesPerUser: {
          mode:
            'cost_controlled',
          limit:
            null,
          unit:
            'queries/user/month',
          label:
            'No monthly plan cap. Usage is metered for service protection and cost visibility.',
        },
      },
      automation: {
        enabled:
          true,
      },
      integrations: {
        enabled:
          true,
        customIntegrations:
          true,
      },
      developerApi: {
        enabled:
          true,
      },
      companies: {
        multiCompany:
          true,
      },
      customization: {
        enabled:
          true,
      },
      storage: {
        cloudHosted:
          true,
        allowance: {
          mode:
            'plan_controlled',
          limit:
            null,
          unit:
            'bytes/workspace',
          label:
            'Cloud storage allowance is plan-controlled and enforced by Usage & Entitlements.',
        },
      },
    },
  };

export function normalizeSamiPlanKey(
  value:
    string | null | undefined,
): SamiPlanKey | null {
  const key =
    (
      value ||
      ''
    )
      .trim()
      .toLowerCase();

  if (
    key ===
      'free' ||
    key ===
      'standard' ||
    key ===
      'custom'
  ) {
    return key;
  }

  return null;
}

export function getSamiPlanPolicy(
  value:
    string | null | undefined,
): SamiPlanPolicy | null {
  const key =
    normalizeSamiPlanKey(
      value,
    );

  return key
    ? SAMI_PLAN_POLICIES[
        key
      ]
    : null;
}

function dateReached(
  value:
    Date | string | null | undefined,
  now:
    Date,
) {
  if (
    !value
  ) {
    return false;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          value,
        );

  return (
    !Number.isNaN(
      date.getTime(),
    ) &&
    date.getTime() <=
      now.getTime()
  );
}

export function getEffectiveSubscriptionStatus(
  input: {
    status:
      string | null | undefined;
    planKey:
      string | null | undefined;
    trialEndsAt?:
      Date | string | null;
    currentPeriodEnd?:
      Date | string | null;
    cancelledAt?:
      Date | string | null;
    now?:
      Date;
  },
) {
  const normalized =
    (
      input.status ||
      ''
    )
      .trim()
      .toLowerCase();

  const policy =
    getSamiPlanPolicy(
      input.planKey,
    );

  if (
    !policy ||
    !policy.paid
  ) {
    return normalized;
  }

  const now =
    input.now ||
    new Date();

  const cancellationBoundary =
    (
      normalized ===
        'trial' ||
      normalized ===
        'trialing'
    )
      ? input.trialEndsAt
      : normalized ===
          'active'
        ? input.currentPeriodEnd
        : null;

  if (
    input.cancelledAt &&
    cancellationBoundary &&
    dateReached(
      cancellationBoundary,
      now,
    )
  ) {
    return 'cancelled';
  }

  if (
    (
      normalized ===
        'trial' ||
      normalized ===
        'trialing'
    ) &&
    dateReached(
      input.trialEndsAt,
      now,
    )
  ) {
    return 'past_due';
  }

  if (
    normalized ===
      'active' &&
    dateReached(
      input.currentPeriodEnd,
      now,
    )
  ) {
    return 'past_due';
  }

  return normalized;
}


export function isSubscriptionEntitledNow(
  status:
    string | null | undefined,
) {
  const normalized =
    (
      status ||
      ''
    )
      .trim()
      .toLowerCase();

  return (
    normalized ===
      'active' ||
    normalized ===
      'trial' ||
    normalized ===
      'trialing'
  );
}

export function isSubscriptionRecoverable(
  status:
    string | null | undefined,
) {
  const normalized =
    (
      status ||
      ''
    )
      .trim()
      .toLowerCase();

  return (
    isSubscriptionEntitledNow(
      normalized,
    ) ||
    normalized ===
      'past_due'
  );
}
