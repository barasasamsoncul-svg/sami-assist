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
 * - Prices are loaded from the control database plans table.
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
            'Advanced AI allowance with cost controls.',
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
