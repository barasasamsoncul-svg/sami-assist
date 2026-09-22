import 'server-only';

import {
  getPermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getEffectiveSubscriptionStatus,
  getSamiPlanPolicy,
  normalizeSamiPlanKey,
} from '@/lib/billing/plan-policy';

import {
  getActiveBillingProvider,
  getBillingProvider,
  getBillingProviderCatalog,
} from '@/lib/billing/registry';

import {
  createSubscriptionBillingProfile,
  getActiveSubscriptionBillingProfile,
  updateActiveSubscriptionBillingProfile,
} from '@/lib/billing/profiles';

import {
  getSamiBillingPriceSource,
  getSamiMonthlyAmount,
  getSamiPricePerUserMonthly,
  SAMI_BILLING_CURRENCY,
} from '@/lib/billing/pricing';

import {
  applyDueScheduledPlanChanges,
} from '@/lib/billing/plan-transition';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';


export type WorkspaceBillingErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'BILLING_VIEW_REQUIRED'
  | 'BILLING_MANAGE_REQUIRED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'PLAN_NOT_SUPPORTED'
  | 'PAYMENT_NOT_DUE'
  | 'PAYMENT_ALREADY_PENDING'
  | 'PAYMENT_PROVIDER_FAILED'
  | 'PAYMENT_SETUP_UNSUPPORTED'
  | 'PAYMENT_SETUP_FAILED'
  | 'PAYMENT_SETUP_INCOMPLETE'
  | 'BILLING_PROVIDER_MIGRATION_REQUIRED'
  | 'PLAN_CHANGE_BLOCKED'
  | 'PLAN_CHANGE_PROVIDER_UNSUPPORTED'
  | 'PLAN_CHANGE_ALREADY_SCHEDULED';

export class WorkspaceBillingError
  extends Error {
  constructor(
    public readonly code:
      WorkspaceBillingErrorCode,
    message:
      string,
    public readonly details:
      Record<
        string,
        unknown
      > = {},
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceBillingError';
  }
}

type BillingContext = {
  userId:
    string;
  tenantId:
    string;
  canManage:
    boolean;
};

function toIso(
  value:
    unknown,
) {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(
          String(
            value,
          ),
        );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}

async function resolveBillingContext(
  required:
    'view' |
    'manage' =
    'view',
): Promise<BillingContext> {
  const [
    permissions,
    session,
  ] =
    await Promise.all([
      getPermissionContext(),
      getSession(),
    ]);

  if (
    !session
  ) {
    throw new WorkspaceBillingError(
      'UNAUTHENTICATED',
      'Sign in to view billing.',
    );
  }

  if (
    session.sessionId !==
      permissions.sessionId ||
    session.user.id !==
      permissions.userId ||
    session.currentTenantId !==
      permissions.tenantId
  ) {
    throw new WorkspaceBillingError(
      'WORKSPACE_CONTEXT_CHANGED',
      'Your selected workspace changed. Please try again.',
    );
  }

  const canView =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_VIEW,
    ) ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );

  const canManage =
    permissions.isOwner ||
    permissions.permissionSet.has(
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
    );

  if (
    !canView
  ) {
    throw new WorkspaceBillingError(
      'BILLING_VIEW_REQUIRED',
      'You do not have permission to view workspace billing.',
    );
  }

  if (
    required ===
      'manage' &&
    !canManage
  ) {
    throw new WorkspaceBillingError(
      'BILLING_MANAGE_REQUIRED',
      'You do not have permission to manage workspace billing.',
    );
  }

  return {
    userId:
      permissions.userId,
    tenantId:
      permissions.tenantId,
    canManage,
  };
}

async function loadSubscription(
  tenantId:
    string,
) {
  await applyDueScheduledPlanChanges(
    tenantId,
  );

  const result =
    await queryControl(
      `
        SELECT
          s.id,
          s.status,
          s.billing_cycle,
          s.started_at,
          s.trial_ends_at,
          s.current_period_start,
          s.current_period_end,
          s.cancelled_at,
          s.scheduled_plan_id,
          s.scheduled_plan_effective_at,
          s.scheduled_plan_requested_at,
          sp.key
            AS scheduled_plan_key,
          sp.name
            AS scheduled_plan_name,
          p.id
            AS plan_id,
          p.key
            AS plan_key,
          p.name
            AS plan_name
        FROM subscriptions s
        INNER JOIN plans p
          ON p.id =
             s.plan_id
         AND p.deleted_at
             IS NULL
         AND p.is_active =
             TRUE
        LEFT JOIN plans sp
          ON sp.id =
             s.scheduled_plan_id
         AND sp.deleted_at
             IS NULL
         AND sp.is_active =
             TRUE
        WHERE s.tenant_id = $1
          AND s.deleted_at
              IS NULL
        ORDER BY
          s.created_at DESC
        LIMIT 1
      `,
      [
        tenantId,
      ],
    );

  if (
    result.rows.length !==
      1
  ) {
    throw new WorkspaceBillingError(
      'SUBSCRIPTION_NOT_FOUND',
      'This workspace does not have a billing subscription.',
    );
  }

  return result.rows[0];
}

async function getBillableUsers(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM tenant_users
        WHERE tenant_id = $1
          AND deleted_at
              IS NULL
          AND LOWER(
                COALESCE(
                  status,
                  ''
                )
              ) =
              'active'
          AND LOWER(
                COALESCE(
                  member_type,
                  ''
                )
              ) =
              'internal'
      `,
      [
        tenantId,
      ],
    );

  return Math.max(
    1,
    Number(
      result.rows[0]
        ?.count ||
      0,
    ),
  );
}

async function getActiveBusinessAppCount(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM tenant_modules tm
        INNER JOIN modules m
          ON m.id =
             tm.module_id
        WHERE tm.tenant_id = $1
          AND tm.deleted_at
              IS NULL
          AND m.deleted_at
              IS NULL
          AND COALESCE(
                m.is_core,
                FALSE
              ) =
              FALSE
          AND LOWER(
                COALESCE(
                  tm.status,
                  ''
                )
              ) IN (
                'installed',
                'active',
                'enabled'
              )
      `,
      [
        tenantId,
      ],
    );

  return Number(
    result.rows[0]
      ?.count ||
    0,
  );
}

async function getActiveCompanyCount(
  tenantId:
    string,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          COUNT(*)::int
            AS count
        FROM companies
        WHERE is_active =
              TRUE
          AND archived_at
              IS NULL
      `,
    );

  return Number(
    result.rows[0]
      ?.count ||
    0,
  );
}

async function assertPlanCapacity(
  tenantId:
    string,
  targetPlan:
    string,
) {
  const policy =
    getSamiPlanPolicy(
      targetPlan,
    );

  if (
    !policy
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'The requested SaMi plan is not supported.',
    );
  }

  const [
    users,
    apps,
    companies,
  ] =
    await Promise.all([
      getBillableUsers(
        tenantId,
      ),
      getActiveBusinessAppCount(
        tenantId,
      ),
      getActiveCompanyCount(
        tenantId,
      ),
    ]);

  const blockers:
    string[] =
    [];

  if (
    policy.users
      .maxActiveInternalUsers !==
      null &&
    users >
      policy.users
        .maxActiveInternalUsers
  ) {
    blockers.push(
      `Reduce active internal users to ${policy.users.maxActiveInternalUsers} before switching to ${policy.name}.`,
    );
  }

  if (
    policy.apps
      .maxInstalledBusinessApps !==
      null &&
    apps >
      policy.apps
        .maxInstalledBusinessApps
  ) {
    blockers.push(
      `Reduce installed business apps to ${policy.apps.maxInstalledBusinessApps} before switching to ${policy.name}. Required app dependencies count toward this allowance.`,
    );
  }

  if (
    !policy.companies
      .multiCompany &&
    companies >
      1
  ) {
    blockers.push(
      `Archive extra companies before switching to ${policy.name}. Multi-company is available only on Custom.`,
    );
  }

  if (
    blockers.length >
      0
  ) {
    throw new WorkspaceBillingError(
      'PLAN_CHANGE_BLOCKED',
      blockers[0],
      {
        blockers,
        users,
        apps,
        companies,
        targetPlan:
          policy.key,
      },
    );
  }

  return {
    users,
    apps,
    companies,
  };
}

async function auditPlanChange(
  input: {
    tenantId:
      string;
    userId:
      string;
    subscriptionId:
      string;
    eventType:
      string;
    metadata:
      Record<
        string,
        unknown
      >;
  },
) {
  try {
    await queryControl(
      `
        INSERT INTO audit_logs (
          tenant_id,
          user_id,
          actor_type,
          event_type,
          entity_type,
          entity_id,
          metadata,
          created_at
        )
        VALUES (
          $1,
          $2,
          'human',
          $3,
          'subscription',
          $4,
          $5::jsonb,
          NOW()
        )
      `,
      [
        input.tenantId,
        input.userId,
        input.eventType,
        input.subscriptionId,
        JSON.stringify(
          input.metadata,
        ),
      ],
    );
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Plan-change audit failed:',
      error,
    );
  }
}


async function getPlans() {
  const result =
    await queryControl(
      `
        SELECT
          id,
          key,
          name,
          description,
          billing_interval
        FROM plans
        WHERE deleted_at
              IS NULL
          AND is_active =
              TRUE
          AND LOWER(key) =
              ANY(
                $1::text[]
              )
        ORDER BY
          CASE LOWER(key)
            WHEN 'free'
              THEN 0
            WHEN 'standard'
              THEN 1
            WHEN 'custom'
              THEN 2
            ELSE 99
          END
      `,
      [
        [
          'free',
          'standard',
          'custom',
        ],
      ],
    );

  return result.rows
    .map(
      row => {
        const key =
          normalizeSamiPlanKey(
            row.key,
          );

        if (
          !key
        ) {
          return null;
        }

        const policy =
          getSamiPlanPolicy(
            key,
          );

        if (
          !policy
        ) {
          return null;
        }

        return {
          id:
            String(
              row.id,
            ),
          key,
          name:
            String(
              row.name ||
              policy.name,
            ),
          description:
            typeof row.description ===
              'string'
              ? row.description
              : '',
          currency:
            SAMI_BILLING_CURRENCY,
          billingInterval:
            'monthly',
          pricePerUserMonthly:
            getSamiPricePerUserMonthly(
              key,
            ),
          priceSource:
            getSamiBillingPriceSource(
              key,
            ),
          firstMonthFree:
            policy.billing
              .firstMonthFree,
          billingBasis:
            policy.billing
              .billingBasis,
          entitlements: {
            allBusinessApps:
              policy.apps
                .allBusinessApps,
            maxInstalledBusinessApps:
              policy.apps
                .maxInstalledBusinessApps,
            users:
              policy.users,
            ai:
              policy.ai,
            automation:
              policy.automation,
            integrations:
              policy.integrations,
            developerApi:
              policy.developerApi,
            companies:
              policy.companies,
            customization:
              policy.customization,
            storage:
              policy.storage,
          },
        };
      },
    )
    .filter(
      Boolean,
    );
}

async function getPayments(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          id,
          provider,
          provider_transaction_id,
          amount,
          currency,
          status,
          description,
          type,
          metadata,
          created_at,
          updated_at
        FROM payment_transactions
        WHERE tenant_id = $1
        ORDER BY
          created_at DESC,
          id DESC
        LIMIT 50
      `,
      [
        tenantId,
      ],
    );

  return result.rows.map(
    row => {
      const metadata =
        row.metadata &&
        typeof row.metadata ===
          'object' &&
        !Array.isArray(
          row.metadata,
        )
          ? row.metadata as
              Record<
                string,
                unknown
              >
          : {};

      return {
        id:
          String(
            row.id,
          ),
        provider:
          typeof row.provider ===
            'string'
            ? row.provider
            : null,
        providerTransactionId:
          typeof row.provider_transaction_id ===
            'string'
            ? row.provider_transaction_id
            : null,
        amount:
          Number(
            row.amount ||
            0,
          ),
        currency:
          String(
            row.currency ||
            SAMI_BILLING_CURRENCY,
          ),
        status:
          String(
            row.status ||
            'unknown',
          ),
        description:
          typeof row.description ===
            'string'
            ? row.description
            : null,
        type:
          typeof row.type ===
            'string'
            ? row.type
            : null,
        billingPurpose:
          typeof metadata.billingPurpose ===
            'string'
            ? metadata.billingPurpose
            : null,
        paymentMethod:
          typeof (
            metadata
              .lastPesapalStatus as
                Record<
                  string,
                  unknown
                > |
                undefined
          )
            ?.paymentMethod ===
            'string'
            ? String(
                (
                  metadata
                    .lastPesapalStatus as
                      Record<
                        string,
                        unknown
                      >
                ).paymentMethod,
              )
            : typeof (
                metadata
                  .pesapalStatus as
                    Record<
                      string,
                      unknown
                    > |
                    undefined
              )
                ?.paymentMethod ===
                'string'
              ? String(
                  (
                    metadata
                      .pesapalStatus as
                        Record<
                          string,
                          unknown
                        >
                  ).paymentMethod,
                )
              : null,
        createdAt:
          toIso(
            row.created_at,
          ),
        updatedAt:
          toIso(
            row.updated_at,
          ),
      };
    },
  );
}

async function persistProviderCheckout({
  tenantId,
  subscriptionId,
  provider,
  providerReference,
  amount,
  currency,
  plan,
  billableUsers,
  pricePerUserMonthly,
  checkoutUrl,
}: {
  tenantId:
    string;
  subscriptionId:
    string;
  provider:
    string;
  providerReference:
    string;
  amount:
    number;
  currency:
    string;
  plan:
    string;
  billableUsers:
    number;
  pricePerUserMonthly:
    number;
  checkoutUrl:
    string;
}) {
  if (
    provider ===
      'pesapal'
  ) {
    /*
     * Legacy PesaPal service already stores the transaction.
     * Keep this compatibility path until its callback is
     * fully moved behind the generic provider webhook layer.
     */
    return;
  }

  await queryControl(
    `
      INSERT INTO payment_transactions (
        tenant_id,
        subscription_id,
        provider,
        provider_transaction_id,
        amount,
        currency,
        status,
        description,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        'pending',
        $7,
        $8::jsonb,
        NOW(),
        NOW()
      )
    `,
    [
      tenantId,
      subscriptionId,
      provider,
      providerReference,
      amount,
      currency,
      `SaMi ${plan} subscription payment`,
      JSON.stringify({
        checkoutUrl,
        billingPurpose:
          'subscription_payment',
        plan,
        billableUsers,
        pricePerUserMonthly,
        createdAt:
          new Date()
            .toISOString(),
      }),
    ],
  );
}


async function persistPastDueIfNeeded(
  subscriptionId:
    string,
  storedStatus:
    string,
  effectiveStatus:
    string,
) {
  if (
    effectiveStatus !==
      'past_due' ||
    storedStatus
      .trim()
      .toLowerCase() ===
      'past_due'
  ) {
    return;
  }

  await queryControl(
    `
      UPDATE subscriptions
      SET
        status =
          'past_due',
        updated_at =
          NOW()
      WHERE id = $1
        AND deleted_at
            IS NULL
        AND status IN (
          'trial',
          'trialing',
          'active'
        )
    `,
    [
      subscriptionId,
    ],
  );
}

export async function getWorkspaceBillingState() {
  const context =
    await resolveBillingContext(
      'view',
    );

  const subscription =
    await loadSubscription(
      context.tenantId,
    );

  const planKey =
    normalizeSamiPlanKey(
      subscription.plan_key,
    );

  if (
    !planKey
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'This workspace subscription plan is not supported.',
    );
  }

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        subscription.status,
      planKey,
      trialEndsAt:
        subscription.trial_ends_at,
      currentPeriodEnd:
        subscription.current_period_end,
    });

  await persistPastDueIfNeeded(
    String(
      subscription.id,
    ),
    String(
      subscription.status ||
      '',
    ),
    effectiveStatus,
  );

  const [
    billableUsers,
    plans,
    payments,
    billingProfile,
  ] =
    await Promise.all([
      getBillableUsers(
        context.tenantId,
      ),
      getPlans(),
      getPayments(
        context.tenantId,
      ),
      getActiveSubscriptionBillingProfile(
        String(
          subscription.id,
        ),
      ),
    ]);

  const policy =
    getSamiPlanPolicy(
      planKey,
    );

  if (
    !policy
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'This workspace subscription plan is not supported.',
    );
  }

  const pricePerUserMonthly =
    getSamiPricePerUserMonthly(
      planKey,
    );

  const monthlyAmount =
    policy.paid
      ? getSamiMonthlyAmount(
          planKey,
          billableUsers,
        )
      : 0;

  const paymentDue =
    policy.paid &&
    effectiveStatus ===
      'past_due';

  return {
    canManage:
      context.canManage,

    currency:
      SAMI_BILLING_CURRENCY,

    billableUsers,

    subscription: {
      id:
        String(
          subscription.id,
        ),
      status:
        effectiveStatus,
      storedStatus:
        String(
          subscription.status ||
          'unknown',
        ),
      planKey,
      planName:
        String(
          subscription.plan_name ||
          policy.name,
        ),
      billingCycle:
        subscription.billing_cycle
          ? String(
              subscription.billing_cycle,
            )
          : null,
      startedAt:
        toIso(
          subscription.started_at,
        ),
      trialEndsAt:
        toIso(
          subscription.trial_ends_at,
        ),
      currentPeriodStart:
        toIso(
          subscription.current_period_start,
        ),
      currentPeriodEnd:
        toIso(
          subscription.current_period_end,
        ),
      cancelledAt:
        toIso(
          subscription.cancelled_at,
        ),
      scheduledPlan:
        subscription.scheduled_plan_key
          ? {
              key:
                String(
                  subscription.scheduled_plan_key,
                ),
              name:
                String(
                  subscription.scheduled_plan_name ||
                  subscription.scheduled_plan_key,
                ),
              effectiveAt:
                toIso(
                  subscription.scheduled_plan_effective_at,
                ),
              requestedAt:
                toIso(
                  subscription.scheduled_plan_requested_at,
                ),
            }
          : null,
      firstMonthFree:
        policy.billing
          .firstMonthFree,
      pricePerUserMonthly,
      monthlyAmount,
      paymentDue,
      amountDue:
        paymentDue
          ? monthlyAmount
          : 0,
    },

    plans,

    payments,

    billingProfile:
      billingProfile
        ? {
            provider:
              billingProfile.provider,
            recurringStatus:
              billingProfile.recurringStatus,
            providerCustomerId:
              billingProfile.providerCustomerId
                ? 'configured'
                : null,
            providerSubscriptionId:
              billingProfile.providerSubscriptionId
                ? 'configured'
                : null,
            providerPaymentMethodId:
              billingProfile.providerPaymentMethodId
                ? 'configured'
                : null,
            pricePerUserMonthly:
              billingProfile.pricePerUserMonthly,
            seatQuantity:
              billingProfile.seatQuantity,
          }
        : null,

    collection: (() => {
      const provider =
        getBillingProvider();

      const configured =
        provider
          .isConfigured();

      return {
        provider:
          provider.key,
        providerName:
          provider.name,
        configured,
        mode:
          provider.capabilities
            .automaticRecurring &&
          provider.capabilities
            .variableRecurringAmount
            ? 'recurring_capable'
            : 'monthly_checkout',
        automaticRecurring:
          configured &&
          provider.capabilities
            .automaticRecurring,
        capabilities:
          provider.capabilities,
        providerCatalog:
          getBillingProviderCatalog(),
        explanation:
          !configured
            ? `${provider.name} is selected for SaMi billing but is not configured yet.`
            : provider.capabilities
                .automaticRecurring &&
              provider.capabilities
                .variableRecurringAmount
              ? `SaMi can use ${provider.name} for recurring billing while recalculating live seats and server-configured prices.`
              : `SaMi recalculates each monthly bill from the current active-user count and server-configured plan price before opening ${provider.name}.`,
      };
    })(),
  };
}

function addCalendarMonths(
  input:
    Date,
  months:
    number,
) {
  const copy =
    new Date(
      input,
    );

  const originalDay =
    copy.getUTCDate();

  copy.setUTCDate(
    1,
  );

  copy.setUTCMonth(
    copy.getUTCMonth() +
    months,
  );

  const endOfTargetMonth =
    new Date(
      Date.UTC(
        copy.getUTCFullYear(),
        copy.getUTCMonth() +
          1,
        0,
      ),
    )
      .getUTCDate();

  copy.setUTCDate(
    Math.min(
      originalDay,
      endOfTargetMonth,
    ),
  );

  return copy;
}

export async function startWorkspaceBillingCheckout(
  input: {
    origin?:
      string | null;
  } = {},
) {
  const context =
    await resolveBillingContext(
      'manage',
    );

  const subscription =
    await loadSubscription(
      context.tenantId,
    );

  const planKey =
    normalizeSamiPlanKey(
      subscription.plan_key,
    );

  const policy =
    planKey
      ? getSamiPlanPolicy(
          planKey,
        )
      : null;

  if (
    !planKey ||
    !policy ||
    !policy.paid
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'This plan does not require a paid checkout.',
    );
  }

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        subscription.status,
      planKey,
      trialEndsAt:
        subscription.trial_ends_at,
      currentPeriodEnd:
        subscription.current_period_end,
    });

  if (
    effectiveStatus !==
      'past_due'
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_NOT_DUE',
      'No subscription payment is due yet.',
      {
        status:
          effectiveStatus,
        trialEndsAt:
          toIso(
            subscription.trial_ends_at,
          ),
        currentPeriodEnd:
          toIso(
            subscription.current_period_end,
          ),
      },
    );
  }

  const provider =
    getActiveBillingProvider();

  const recentPending =
    await queryControl(
      `
        SELECT
          metadata
        FROM payment_transactions
        WHERE tenant_id = $1
          AND subscription_id = $2
          AND provider = $3
          AND status =
              'pending'
          AND created_at >
              NOW() -
              INTERVAL '15 minutes'
        ORDER BY
          created_at DESC
        LIMIT 1
      `,
      [
        context.tenantId,
        subscription.id,
        provider.key,
      ],
    );

  if (
    recentPending.rows.length >
      0
  ) {
    const metadata =
      recentPending.rows[0]
        .metadata;

    const checkoutUrl =
      metadata &&
      typeof metadata ===
        'object' &&
      !Array.isArray(
        metadata,
      ) &&
      typeof metadata
        .checkoutUrl ===
        'string'
        ? metadata
            .checkoutUrl
        : null;

    throw new WorkspaceBillingError(
      'PAYMENT_ALREADY_PENDING',
      `A ${provider.name} checkout was created recently for this subscription.`,
      {
        checkoutUrl,
      },
    );
  }

  const [
    billableUsers,
    identity,
    apps,
  ] =
    await Promise.all([
      getBillableUsers(
        context.tenantId,
      ),

      queryControl(
        `
          SELECT
            u.email,
            u.first_name,
            u.last_name,
            t.name
              AS business_name
          FROM users u
          INNER JOIN tenants t
            ON t.id = $2
           AND t.deleted_at
               IS NULL
          WHERE u.id = $1
            AND u.deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          context.userId,
          context.tenantId,
        ],
      ),

      queryControl(
        `
          SELECT
            LOWER(
              m.key
            )
              AS key
          FROM tenant_modules tm
          INNER JOIN modules m
            ON m.id =
               tm.module_id
          WHERE tm.tenant_id = $1
            AND tm.deleted_at
                IS NULL
            AND m.deleted_at
                IS NULL
            AND LOWER(
                  COALESCE(
                    tm.status,
                    ''
                  )
                ) IN (
                  'installed',
                  'active',
                  'enabled'
                )
          ORDER BY
            LOWER(
              m.key
            )
        `,
        [
          context.tenantId,
        ],
      ),
    ]);

  const user =
    identity.rows[0];

  if (
    !user ||
    typeof user.email !==
      'string'
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_PROVIDER_FAILED',
      'SaMi could not resolve the billing contact for this workspace.',
    );
  }

  const amount =
    getSamiMonthlyAmount(
      planKey,
      billableUsers,
    );

  try {
    const pricePerUserMonthly =
      getSamiPricePerUserMonthly(
        planKey,
      );

    const order =
      await provider.createCheckout({
        customer: {
          tenantId:
            context.tenantId,
          subscriptionId:
            String(
              subscription.id,
            ),
          email:
            user.email,
          firstName:
            typeof user.first_name ===
              'string'
              ? user.first_name
              : '',
          lastName:
            typeof user.last_name ===
              'string'
              ? user.last_name
              : '',
          businessName:
            typeof user.business_name ===
              'string'
              ? user.business_name
              : 'SaMi Workspace',
          phone:
            null,
        },
        amount,
        plan:
          planKey,
        billableUsers,
        pricePerUserMonthly,
        selectedApps:
          apps.rows
            .map(
              row =>
                String(
                  row.key ||
                  '',
                ),
            )
            .filter(
              Boolean,
            ),
        origin:
          input.origin ||
          null,
        currency:
          SAMI_BILLING_CURRENCY,
      });

    await persistProviderCheckout({
      tenantId:
        context.tenantId,
      subscriptionId:
        String(
          subscription.id,
        ),
      provider:
        order.provider,
      providerReference:
        order.providerReference,
      amount,
      currency:
        SAMI_BILLING_CURRENCY,
      plan:
        planKey,
      billableUsers,
      pricePerUserMonthly,
      checkoutUrl:
        order.checkoutUrl,
    });

    return {
      provider:
        order.provider,
      checkoutUrl:
        order.checkoutUrl,
      providerReference:
        order.providerReference,
      amount,
      currency:
        SAMI_BILLING_CURRENCY,
      billableUsers,
      pricePerUserMonthly,
      nextPeriodEnd:
        addCalendarMonths(
          new Date(),
          1,
        )
          .toISOString(),
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Provider checkout failed:',
      {
        provider:
          provider.key,
        error,
      },
    );

    throw new WorkspaceBillingError(
      'PAYMENT_PROVIDER_FAILED',
      `SaMi could not start ${provider.name} checkout. Please try again.`,
      {
        provider:
          provider.key,
      },
    );
  }
}

export async function startWorkspaceRecurringBillingSetup(
  input: {
    origin?:
      string | null;
  } = {},
) {
  const context =
    await resolveBillingContext(
      'manage',
    );

  const subscription =
    await loadSubscription(
      context.tenantId,
    );

  const planKey =
    normalizeSamiPlanKey(
      subscription.plan_key,
    );

  const policy =
    planKey
      ? getSamiPlanPolicy(
          planKey,
        )
      : null;

  if (
    !planKey ||
    !policy ||
    !policy.paid
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'Recurring billing setup is only available on paid plans.',
    );
  }

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        subscription.status,
      planKey,
      trialEndsAt:
        subscription.trial_ends_at,
      currentPeriodEnd:
        subscription.current_period_end,
    });

  if (
    ![
      'trial',
      'trialing',
      'active',
    ].includes(
      effectiveStatus,
    )
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      'Settle the current subscription bill before enabling automatic billing.',
      {
        status:
          effectiveStatus,
      },
    );
  }

  const noChargeUntil =
    (
      effectiveStatus ===
        'trial' ||
      effectiveStatus ===
        'trialing'
    )
      ? subscription
          .trial_ends_at
      : subscription
          .current_period_end;

  const noChargeUntilDate =
    noChargeUntil
      ? new Date(
          noChargeUntil,
        )
      : null;

  if (
    !noChargeUntilDate ||
    Number.isNaN(
      noChargeUntilDate
        .getTime(),
    ) ||
    noChargeUntilDate
      .getTime() <=
      Date.now()
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      'SaMi cannot guarantee a zero-charge setup before the next billing boundary.',
      {
        status:
          effectiveStatus,
      },
    );
  }

  const provider =
    getActiveBillingProvider();

  if (
    !provider.capabilities
      .savePaymentMethodWithoutCharge ||
    !provider
      .createPaymentMethodSetup
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_UNSUPPORTED',
      `${provider.name} does not support SaMi's no-charge recurring setup flow.`,
      {
        provider:
          provider.key,
      },
    );
  }

  const existing =
    await getActiveSubscriptionBillingProfile(
      String(
        subscription.id,
      ),
    );

  if (
    existing &&
    existing.provider !==
      provider.key &&
    (
      existing
        .providerSubscriptionId ||
      [
        'trialing',
        'active',
      ].includes(
        existing
          .recurringStatus,
      )
    )
  ) {
    throw new WorkspaceBillingError(
      'BILLING_PROVIDER_MIGRATION_REQUIRED',
      'This subscription already has an active recurring profile with another provider. Migrate or cancel that mandate before changing providers.',
      {
        currentProvider:
          existing.provider,
        configuredProvider:
          provider.key,
      },
    );
  }

  if (
    existing &&
    existing.provider ===
      provider.key &&
    [
      'trialing',
      'active',
    ].includes(
      existing
        .recurringStatus,
    )
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      'Automatic billing is already configured for this subscription.',
      {
        provider:
          provider.key,
      },
    );
  }

  const identity =
    await queryControl(
      `
        SELECT
          u.email,
          u.first_name,
          u.last_name,
          t.name
            AS business_name
        FROM users u
        INNER JOIN tenants t
          ON t.id = $2
         AND t.deleted_at
             IS NULL
        WHERE u.id = $1
          AND u.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        context.userId,
        context.tenantId,
      ],
    );

  const user =
    identity.rows[0];

  if (
    !user ||
    typeof user.email !==
      'string'
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      'SaMi could not resolve the billing contact for this workspace.',
    );
  }

  try {
    const setup =
      await provider
        .createPaymentMethodSetup({
          customer: {
            tenantId:
              context.tenantId,
            subscriptionId:
              String(
                subscription.id,
              ),
            email:
              user.email,
            firstName:
              typeof user.first_name ===
                'string'
                ? user.first_name
                : '',
            lastName:
              typeof user.last_name ===
                'string'
                ? user.last_name
                : '',
            businessName:
              typeof user.business_name ===
                'string'
                ? user.business_name
                : 'SaMi Workspace',
            phone:
              null,
          },
          origin:
            input.origin ||
            null,
        });

    const billableUsers =
      await getBillableUsers(
        context.tenantId,
      );

    await createSubscriptionBillingProfile({
      tenantId:
        context.tenantId,
      subscriptionId:
        String(
          subscription.id,
        ),
      provider:
        provider.key,
      providerCustomerId:
        setup.providerCustomerId,
      recurringStatus:
        'setup_pending',
      currency:
        SAMI_BILLING_CURRENCY,
      pricePerUserMonthly:
        getSamiPricePerUserMonthly(
          planKey,
        ),
      seatQuantity:
        billableUsers,
      metadata: {
        setupReference:
          setup.setupReference,
        setupCreatedAt:
          new Date()
            .toISOString(),
        selectedByEnv:
          true,
      },
    });

    const publicKey =
      provider.key ===
        'stripe'
        ? (
            process.env
              .NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
            process.env
              .STRIPE_PUBLISHABLE_KEY ||
            ''
          )
            .trim() ||
          null
        : null;

    if (
      provider.key ===
        'stripe' &&
      !publicKey
    ) {
      throw new WorkspaceBillingError(
        'PAYMENT_SETUP_FAILED',
        'Stripe publishable key is not configured.',
      );
    }

    return {
      provider:
        provider.key,
      providerName:
        provider.name,
      setupReference:
        setup.setupReference,
      clientSecret:
        setup.clientSecret,
      redirectUrl:
        setup.redirectUrl,
      publicKey,
      chargedToday:
        false,
    };
  } catch (
    error
  ) {
    if (
      error instanceof
        WorkspaceBillingError
    ) {
      throw error;
    }

    console.error(
      '[SaMi Billing] Payment-method setup failed:',
      {
        provider:
          provider.key,
        error,
      },
    );

    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      `SaMi could not start ${provider.name} automatic billing setup.`,
      {
        provider:
          provider.key,
      },
    );
  }
}


export async function completeWorkspaceRecurringBillingSetup() {
  const context =
    await resolveBillingContext(
      'manage',
    );

  const subscription =
    await loadSubscription(
      context.tenantId,
    );

  const planKey =
    normalizeSamiPlanKey(
      subscription.plan_key,
    );

  const policy =
    planKey
      ? getSamiPlanPolicy(
          planKey,
        )
      : null;

  if (
    !planKey ||
    !policy ||
    !policy.paid
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'Recurring billing setup is only available on paid plans.',
    );
  }

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        subscription.status,
      planKey,
      trialEndsAt:
        subscription.trial_ends_at,
      currentPeriodEnd:
        subscription.current_period_end,
    });

  const noChargeUntil =
    (
      effectiveStatus ===
        'trial' ||
      effectiveStatus ===
        'trialing'
    )
      ? subscription
          .trial_ends_at
      : effectiveStatus ===
          'active'
        ? subscription
            .current_period_end
        : null;

  const noChargeUntilDate =
    noChargeUntil
      ? new Date(
          noChargeUntil,
        )
      : null;

  if (
    !noChargeUntilDate ||
    Number.isNaN(
      noChargeUntilDate
        .getTime(),
    ) ||
    noChargeUntilDate
      .getTime() <=
      Date.now()
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_INCOMPLETE',
      'The zero-charge billing setup window has expired. Settle any due bill first.',
      {
        status:
          effectiveStatus,
      },
    );
  }

  const profile =
    await getActiveSubscriptionBillingProfile(
      String(
        subscription.id,
      ),
    );

  if (
    !profile
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_INCOMPLETE',
      'Start automatic billing setup before completing it.',
    );
  }

  const provider =
    getBillingProvider(
      profile.provider,
    );

  if (
    !provider
      .getPaymentMethodSetupStatus ||
    !provider
      .createRecurringSubscription
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_UNSUPPORTED',
      `${provider.name} cannot complete this recurring billing setup.`,
      {
        provider:
          provider.key,
      },
    );
  }

  const setupReference =
    typeof profile
      .metadata
      .setupReference ===
      'string'
      ? profile
          .metadata
          .setupReference
      : '';

  if (
    !setupReference
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_INCOMPLETE',
      'The recurring billing setup reference is missing.',
    );
  }

  const setup =
    await provider
      .getPaymentMethodSetupStatus(
        setupReference,
      );

  if (
    setup.status !==
      'succeeded' ||
    !setup
      .providerPaymentMethodId
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_INCOMPLETE',
      'Payment method setup has not been completed successfully yet.',
      {
        provider:
          provider.key,
        setupStatus:
          setup.status,
      },
    );
  }

  const identity =
    await queryControl(
      `
        SELECT
          u.email,
          u.first_name,
          u.last_name,
          t.name
            AS business_name
        FROM users u
        INNER JOIN tenants t
          ON t.id = $2
         AND t.deleted_at
             IS NULL
        WHERE u.id = $1
          AND u.deleted_at
              IS NULL
        LIMIT 1
      `,
      [
        context.userId,
        context.tenantId,
      ],
    );

  const user =
    identity.rows[0];

  if (
    !user ||
    typeof user.email !==
      'string'
  ) {
    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      'SaMi could not resolve the billing contact for this workspace.',
    );
  }

  const billableUsers =
    await getBillableUsers(
      context.tenantId,
    );

  try {
    const recurring =
      await provider
        .createRecurringSubscription({
          customer: {
            tenantId:
              context.tenantId,
            subscriptionId:
              String(
                subscription.id,
              ),
            email:
              user.email,
            firstName:
              typeof user.first_name ===
                'string'
                ? user.first_name
                : '',
            lastName:
              typeof user.last_name ===
                'string'
                ? user.last_name
                : '',
            businessName:
              typeof user.business_name ===
                'string'
                ? user.business_name
                : 'SaMi Workspace',
            phone:
              null,
          },
          providerCustomerId:
            setup.providerCustomerId,
          providerPaymentMethodId:
            setup.providerPaymentMethodId,
          plan:
            planKey,
          currency:
            SAMI_BILLING_CURRENCY,
          pricePerUserMonthly:
            getSamiPricePerUserMonthly(
              planKey,
            ),
          billableUsers,
          trialEndsAt:
            noChargeUntilDate,
        });

    await updateActiveSubscriptionBillingProfile(
      String(
        subscription.id,
      ),
      {
        providerCustomerId:
          recurring
            .providerCustomerId,
        providerSubscriptionId:
          recurring
            .providerSubscriptionId,
        providerPaymentMethodId:
          recurring
            .providerPaymentMethodId,
        recurringStatus:
          recurring.status ===
            'trialing'
            ? 'trialing'
            : recurring.status ===
                'active'
              ? 'active'
              : 'setup_pending',
        pricePerUserMonthly:
          getSamiPricePerUserMonthly(
            planKey,
          ),
        seatQuantity:
          billableUsers,
        metadata: {
          setupCompletedAt:
            new Date()
              .toISOString(),
          providerStatus:
            recurring.status,
        },
      },
    );

    return {
      provider:
        provider.key,
      providerName:
        provider.name,
      recurringStatus:
        recurring.status,
      chargedToday:
        false,
      trialEndsAt:
        toIso(
          subscription.trial_ends_at,
        ),
      billableUsers,
      pricePerUserMonthly:
        getSamiPricePerUserMonthly(
          planKey,
        ),
    };
  } catch (
    error
  ) {
    console.error(
      '[SaMi Billing] Recurring subscription creation failed:',
      {
        provider:
          provider.key,
        error,
      },
    );

    throw new WorkspaceBillingError(
      'PAYMENT_SETUP_FAILED',
      `SaMi could not activate ${provider.name} automatic billing.`,
      {
        provider:
          provider.key,
      },
    );
  }
}

async function synchronizeRecurringPlanChange(
  input: {
    subscriptionId:
      string;
    targetPlan:
      string;
    seats:
      number;
    cancellationMode:
      'immediate' |
      'period_end' |
      null;
  },
) {
  const profile =
    await getActiveSubscriptionBillingProfile(
      input.subscriptionId,
    );

  if (
    !profile ||
    !profile.providerSubscriptionId ||
    ![
      'trialing',
      'active',
    ].includes(
      profile.recurringStatus,
    )
  ) {
    return;
  }

  const provider =
    getBillingProvider(
      profile.provider,
    );

  if (
    !provider
      .isConfigured()
  ) {
    throw new WorkspaceBillingError(
      'PLAN_CHANGE_PROVIDER_UNSUPPORTED',
      `${provider.name} is not configured, so SaMi cannot safely change this recurring subscription.`,
      {
        provider:
          provider.key,
      },
    );
  }

  if (
    input.cancellationMode
  ) {
    if (
      input.cancellationMode ===
        'immediate'
    ) {
      if (
        !provider
          .cancelRecurringSubscription
      ) {
        throw new WorkspaceBillingError(
          'PLAN_CHANGE_PROVIDER_UNSUPPORTED',
          `${provider.name} cannot safely cancel this recurring subscription.`,
          {
            provider:
              provider.key,
          },
        );
      }

      await provider
        .cancelRecurringSubscription(
          profile.providerSubscriptionId,
        );

      await updateActiveSubscriptionBillingProfile(
        input.subscriptionId,
        {
          recurringStatus:
            'cancelled',
          metadata: {
            cancelledForPlanChangeAt:
              new Date()
                .toISOString(),
          },
        },
      );

      return;
    }

    if (
      !provider
        .scheduleRecurringCancellation
    ) {
      throw new WorkspaceBillingError(
        'PLAN_CHANGE_PROVIDER_UNSUPPORTED',
        `${provider.name} cannot safely schedule cancellation for this recurring subscription.`,
        {
          provider:
            provider.key,
        },
      );
    }

    await provider
      .scheduleRecurringCancellation(
        profile.providerSubscriptionId,
      );

    await updateActiveSubscriptionBillingProfile(
      input.subscriptionId,
      {
        metadata: {
          cancellationScheduledAt:
            new Date()
              .toISOString(),
        },
      },
    );

    return;
  }

  if (
    !provider.capabilities
      .updateRecurringQuantity ||
    !provider
      .updateRecurringSubscription
  ) {
    throw new WorkspaceBillingError(
      'PLAN_CHANGE_PROVIDER_UNSUPPORTED',
      `${provider.name} cannot safely update the recurring amount for this plan change.`,
      {
        provider:
          provider.key,
      },
    );
  }

  const price =
    getSamiPricePerUserMonthly(
      input.targetPlan,
    );

  const updated =
    await provider
      .updateRecurringSubscription({
        providerSubscriptionId:
          profile.providerSubscriptionId,
        pricePerUserMonthly:
          price,
        billableUsers:
          input.seats,
        currency:
          SAMI_BILLING_CURRENCY,
      });

  await updateActiveSubscriptionBillingProfile(
    input.subscriptionId,
    {
      recurringStatus:
        updated.status ===
          'active'
          ? 'active'
          : updated.status ===
              'trialing'
            ? 'trialing'
            : profile.recurringStatus,
      pricePerUserMonthly:
        price,
      seatQuantity:
        input.seats,
      metadata: {
        planChangeProviderSyncedAt:
          new Date()
            .toISOString(),
        nextPlan:
          input.targetPlan,
      },
    },
  );
}

export async function changeWorkspaceSubscriptionPlan(
  targetPlanInput:
    unknown,
) {
  const context =
    await resolveBillingContext(
      'manage',
    );

  const targetPlan =
    normalizeSamiPlanKey(
      typeof targetPlanInput ===
        'string'
        ? targetPlanInput
        : null,
    );

  if (
    !targetPlan
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'Choose a valid SaMi plan.',
    );
  }

  const subscription =
    await loadSubscription(
      context.tenantId,
    );

  const currentPlan =
    normalizeSamiPlanKey(
      subscription.plan_key,
    );

  if (
    !currentPlan
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'The current SaMi plan is not supported.',
    );
  }

  if (
    subscription.scheduled_plan_id
  ) {
    throw new WorkspaceBillingError(
      'PLAN_CHANGE_ALREADY_SCHEDULED',
      'A plan change is already scheduled for this subscription.',
      {
        scheduledPlan:
          subscription.scheduled_plan_key ||
          null,
        effectiveAt:
          toIso(
            subscription.scheduled_plan_effective_at,
          ),
      },
    );
  }

  if (
    currentPlan ===
      targetPlan
  ) {
    return {
      mode:
        'unchanged',
      currentPlan,
      targetPlan,
    };
  }

  const capacity =
    await assertPlanCapacity(
      context.tenantId,
      targetPlan,
    );

  const currentPolicy =
    getSamiPlanPolicy(
      currentPlan,
    );

  const targetPolicy =
    getSamiPlanPolicy(
      targetPlan,
    );

  if (
    !currentPolicy ||
    !targetPolicy
  ) {
    throw new WorkspaceBillingError(
      'PLAN_NOT_SUPPORTED',
      'The requested plan change is not supported.',
    );
  }

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        subscription.status,
      planKey:
        currentPlan,
      trialEndsAt:
        subscription.trial_ends_at,
      currentPeriodEnd:
        subscription.current_period_end,
    });

  const subscriptionId =
    String(
      subscription.id,
    );

  /*
   * Free -> paid:
   * The first paid upgrade gets the one calendar-month free trial.
   * A workspace that already had a paid trial does not receive
   * another free month by cycling through Free.
   */
  if (
    !currentPolicy.paid &&
    targetPolicy.paid
  ) {
    const firstPaidTrial =
      !subscription
        .trial_ends_at;

    const target =
      await queryControl(
        `
          SELECT id
          FROM plans
          WHERE LOWER(key) = $1
            AND is_active =
                TRUE
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          targetPlan,
        ],
      );

    if (
      target.rows.length !==
        1
    ) {
      throw new WorkspaceBillingError(
        'PLAN_NOT_SUPPORTED',
        'The requested SaMi plan is unavailable.',
      );
    }

    await queryControl(
      firstPaidTrial
        ? `
            UPDATE subscriptions
            SET
              plan_id = $2,
              status =
                'trialing',
              billing_cycle =
                'monthly',
              started_at =
                NOW(),
              trial_ends_at =
                NOW() +
                INTERVAL '1 month',
              current_period_start =
                NULL,
              current_period_end =
                NULL,
              cancelled_at =
                NULL,
              updated_at =
                NOW()
            WHERE id = $1
              AND deleted_at
                  IS NULL
          `
        : `
            UPDATE subscriptions
            SET
              plan_id = $2,
              status =
                'past_due',
              billing_cycle =
                'monthly',
              current_period_start =
                NULL,
              current_period_end =
                NULL,
              cancelled_at =
                NULL,
              updated_at =
                NOW()
            WHERE id = $1
              AND deleted_at
                  IS NULL
          `,
      [
        subscriptionId,
        target.rows[0]
          .id,
      ],
    );

    await auditPlanChange({
      tenantId:
        context.tenantId,
      userId:
        context.userId,
      subscriptionId,
      eventType:
        'SUBSCRIPTION_PLAN_CHANGED',
      metadata: {
        from:
          currentPlan,
        to:
          targetPlan,
        mode:
          'immediate',
        firstPaidTrial,
      },
    });

    return {
      mode:
        'immediate',
      currentPlan:
        targetPlan,
      targetPlan,
      status:
        firstPaidTrial
          ? 'trialing'
          : 'past_due',
      billingSetupRecommended:
        firstPaidTrial,
      paymentRequired:
        !firstPaidTrial,
    };
  }

  /*
   * During the free paid trial, moving between Standard/Custom
   * is immediate and does not reset the original trial end.
   * Moving to Free is also immediate because nothing has been
   * charged yet.
   */
  if (
    effectiveStatus ===
      'trial' ||
    effectiveStatus ===
      'trialing'
  ) {
    const target =
      await queryControl(
        `
          SELECT id
          FROM plans
          WHERE LOWER(key) = $1
            AND is_active =
                TRUE
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          targetPlan,
        ],
      );

    if (
      target.rows.length !==
        1
    ) {
      throw new WorkspaceBillingError(
        'PLAN_NOT_SUPPORTED',
        'The requested SaMi plan is unavailable.',
      );
    }

    if (
      targetPolicy.paid
    ) {
      await synchronizeRecurringPlanChange({
        subscriptionId,
        targetPlan,
        seats:
          capacity.users,
        cancellationMode:
          null,
      });
    } else {
      await synchronizeRecurringPlanChange({
        subscriptionId,
        targetPlan,
        seats:
          capacity.users,
        cancellationMode:
          'immediate',
      });
    }

    await queryControl(
      `
        UPDATE subscriptions
        SET
          plan_id = $2,
          status = $3,
          billing_cycle =
            CASE
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE 'monthly'
            END,
          current_period_start =
            CASE
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE current_period_start
            END,
          current_period_end =
            CASE
              WHEN $3 =
                   'active'
              THEN NULL
              ELSE current_period_end
            END,
          cancelled_at =
            NULL,
          updated_at =
            NOW()
        WHERE id = $1
          AND deleted_at
              IS NULL
      `,
      [
        subscriptionId,
        target.rows[0]
          .id,
        targetPolicy.paid
          ? 'trialing'
          : 'active',
      ],
    );

    await auditPlanChange({
      tenantId:
        context.tenantId,
      userId:
        context.userId,
      subscriptionId,
      eventType:
        'SUBSCRIPTION_PLAN_CHANGED',
      metadata: {
        from:
          currentPlan,
        to:
          targetPlan,
        mode:
          'trial_immediate',
      },
    });

    return {
      mode:
        'immediate',
      currentPlan:
        targetPlan,
      targetPlan,
      status:
        targetPolicy.paid
          ? 'trialing'
          : 'active',
    };
  }

  /*
   * Once a paid period has started, every plan change is
   * scheduled for the paid-period boundary. This avoids both
   * free mid-cycle upgrades and premature downgrades.
   */
  if (
    currentPolicy.paid &&
    effectiveStatus ===
      'active'
  ) {
    const effectiveAt =
      subscription
        .current_period_end
        ? new Date(
            subscription
              .current_period_end,
          )
        : null;

    if (
      !effectiveAt ||
      Number.isNaN(
        effectiveAt
          .getTime(),
      ) ||
      effectiveAt
        .getTime() <=
        Date.now()
    ) {
      throw new WorkspaceBillingError(
        'PLAN_CHANGE_BLOCKED',
        'The current paid period must be resolved before changing plans.',
      );
    }

    const target =
      await queryControl(
        `
          SELECT id
          FROM plans
          WHERE LOWER(key) = $1
            AND is_active =
                TRUE
            AND deleted_at
                IS NULL
          LIMIT 1
        `,
        [
          targetPlan,
        ],
      );

    if (
      target.rows.length !==
        1
    ) {
      throw new WorkspaceBillingError(
        'PLAN_NOT_SUPPORTED',
        'The requested SaMi plan is unavailable.',
      );
    }

    await synchronizeRecurringPlanChange({
      subscriptionId,
      targetPlan,
      seats:
        capacity.users,
      cancellationMode:
        targetPolicy.paid
          ? null
          : 'period_end',
    });

    await queryControl(
      `
        UPDATE subscriptions
        SET
          scheduled_plan_id =
            $2,
          scheduled_plan_effective_at =
            $3,
          scheduled_plan_requested_by =
            $4,
          scheduled_plan_requested_at =
            NOW(),
          updated_at =
            NOW()
        WHERE id = $1
          AND deleted_at
              IS NULL
      `,
      [
        subscriptionId,
        target.rows[0]
          .id,
        effectiveAt,
        context.userId,
      ],
    );

    await auditPlanChange({
      tenantId:
        context.tenantId,
      userId:
        context.userId,
      subscriptionId,
      eventType:
        'SUBSCRIPTION_PLAN_CHANGE_SCHEDULED',
      metadata: {
        from:
          currentPlan,
        to:
          targetPlan,
        effectiveAt:
          effectiveAt
            .toISOString(),
      },
    });

    return {
      mode:
        'scheduled',
      currentPlan,
      targetPlan,
      effectiveAt:
        effectiveAt
          .toISOString(),
    };
  }

  throw new WorkspaceBillingError(
    'PLAN_CHANGE_BLOCKED',
    'Resolve the current subscription billing state before changing plans.',
    {
      status:
        effectiveStatus,
    },
  );
}

