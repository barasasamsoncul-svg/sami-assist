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
  type SamiPlanKey,
} from '@/lib/billing/plan-policy';

import {
  getSamiBillingPriceSource,
  getSamiMonthlyAmount,
  getSamiPricePerUserMonthly,
  SAMI_BILLING_CURRENCY,
} from '@/lib/billing/pricing';

import {
  queryControl,
} from '@/lib/db/control';

import {
  createPesaPalOrder,
} from '@/lib/services/pesapal';

export type WorkspaceBillingErrorCode =
  | 'UNAUTHENTICATED'
  | 'WORKSPACE_CONTEXT_CHANGED'
  | 'BILLING_VIEW_REQUIRED'
  | 'BILLING_MANAGE_REQUIRED'
  | 'SUBSCRIPTION_NOT_FOUND'
  | 'PLAN_NOT_SUPPORTED'
  | 'PAYMENT_NOT_DUE'
  | 'PAYMENT_ALREADY_PENDING'
  | 'PAYMENT_PROVIDER_FAILED';

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
  ] =
    await Promise.all([
      getBillableUsers(
        context.tenantId,
      ),
      getPlans(),
      getPayments(
        context.tenantId,
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

    collection: {
      provider:
        'pesapal',
      mode:
        'monthly_checkout',
      automaticRecurring:
        false,
      explanation:
        'SaMi recalculates each monthly bill from the current active-user count and server-configured plan price before opening PesaPal.',
    },
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

  const recentPending =
    await queryControl(
      `
        SELECT
          metadata
        FROM payment_transactions
        WHERE tenant_id = $1
          AND subscription_id = $2
          AND provider =
              'pesapal'
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
      'A PesaPal checkout was created recently for this subscription.',
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
    const order =
      await createPesaPalOrder({
        tenantId:
          context.tenantId,
        subscriptionId:
          String(
            subscription.id,
          ),
        amount,
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
        plan:
          planKey,
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
          undefined,
        currency:
          SAMI_BILLING_CURRENCY,
      });

    return {
      checkoutUrl:
        order.redirectUrl,
      orderTrackingId:
        order.orderTrackingId,
      amount:
        order.amount,
      currency:
        order.currency,
      billableUsers,
      pricePerUserMonthly:
        getSamiPricePerUserMonthly(
          planKey,
        ),
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
      '[SaMi Billing] PesaPal checkout failed:',
      error,
    );

    throw new WorkspaceBillingError(
      'PAYMENT_PROVIDER_FAILED',
      'SaMi could not start PesaPal checkout. Please try again.',
    );
  }
}
