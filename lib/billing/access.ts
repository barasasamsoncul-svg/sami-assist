import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
} from '@/lib/db/control';

import {
  getEffectiveSubscriptionStatus,
  getSamiPlanPolicy,
  isSubscriptionEntitledNow,
} from '@/lib/billing/plan-policy';

const DEFAULT_PAST_DUE_GRACE_DAYS =
  14;

export function getSamiPastDueGraceDays() {
  const raw =
    process.env
      .SAMI_BILLING_PAST_DUE_GRACE_DAYS
      ?.trim();

  if (
    !raw
  ) {
    return DEFAULT_PAST_DUE_GRACE_DAYS;
  }

  const parsed =
    Number.parseInt(
      raw,
      10,
    );

  if (
    !Number.isInteger(
      parsed,
    ) ||
    parsed < 0 ||
    parsed > 90
  ) {
    return DEFAULT_PAST_DUE_GRACE_DAYS;
  }

  return parsed;
}

function toDate(
  value:
    unknown,
) {
  if (
    !value
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
    : date;
}

export function getSubscriptionSuspensionWindow({
  effectiveStatus,
  trialEndsAt,
  currentPeriodEnd,
  now =
    new Date(),
}: {
  effectiveStatus:
    string;
  trialEndsAt?:
    unknown;
  currentPeriodEnd?:
    unknown;
  now?:
    Date;
}) {
  const pastDue =
    effectiveStatus ===
    'past_due';

  if (
    !pastDue
  ) {
    return {
      pastDue:
        false,
      suspended:
        false,
      dueAt:
        null as string | null,
      graceEndsAt:
        null as string | null,
      daysPastDue:
        0,
      graceDays:
        getSamiPastDueGraceDays(),
    };
  }

  const dueDate =
    toDate(
      currentPeriodEnd,
    ) ||
    toDate(
      trialEndsAt,
    );

  const graceDays =
    getSamiPastDueGraceDays();

  if (
    !dueDate
  ) {
    return {
      pastDue:
        true,
      suspended:
        true,
      dueAt:
        null as string | null,
      graceEndsAt:
        null as string | null,
      daysPastDue:
        null as number | null,
      graceDays,
    };
  }

  const graceEnds =
    new Date(
      dueDate.getTime() +
      graceDays *
        24 *
        60 *
        60 *
        1000,
    );

  const elapsedMs =
    Math.max(
      0,
      now.getTime() -
      dueDate.getTime(),
    );

  return {
    pastDue:
      true,
    suspended:
      now.getTime() >=
      graceEnds.getTime(),
    dueAt:
      dueDate.toISOString(),
    graceEndsAt:
      graceEnds.toISOString(),
    daysPastDue:
      Math.floor(
        elapsedMs /
        (
          24 *
          60 *
          60 *
          1000
        ),
      ),
    graceDays,
  };
}

export const SAMI_PAST_DUE_ACCESS_POLICY = {
  allowed: [
    'sign_in',
    'personal_account',
    'security',
    'billing',
    'payment_recovery',
    'help',
    'logout',
  ],
  restricted: [
    'dashboard_work',
    'business_apps',
    'business_records',
    'files',
    'search',
    'activity',
    'messages',
    'notifications_center',
    'ai_execution',
    'automation',
    'integrations',
    'developer_api',
    'install_or_enable_apps',
    'add_or_reactivate_internal_users',
    'create_or_reactivate_companies',
  ],
} as const;

async function readState(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  tenantId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          s.status,
          s.trial_ends_at,
          s.current_period_end,
          s.cancelled_at,
          p.key
            AS plan_key,
          sp.key
            AS scheduled_plan_key
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
          s.updated_at DESC,
          s.created_at DESC,
          s.id DESC
        LIMIT 1
      `,
      [
        tenantId,
      ],
    );

  const row =
    result.rows[0];

  if (
    !row
  ) {
    return {
      planKey:
        null,
      effectiveStatus:
        'missing',
      entitled:
        false,
      pastDue:
        false,
      suspended:
        false,
      dueAt:
        null,
      graceEndsAt:
        null,
      daysPastDue:
        0,
      graceDays:
        getSamiPastDueGraceDays(),
      policy:
        null,
      scheduledPlanKey:
        null,
      scheduledPolicy:
        null,
    };
  }

  const policy =
    getSamiPlanPolicy(
      row.plan_key,
    );

  const scheduledPolicy =
    getSamiPlanPolicy(
      row.scheduled_plan_key,
    );

  const effectiveStatus =
    getEffectiveSubscriptionStatus({
      status:
        row.status,
      planKey:
        row.plan_key,
      trialEndsAt:
        row.trial_ends_at,
      currentPeriodEnd:
        row.current_period_end,
      cancelledAt:
        row.cancelled_at,
    });

  const suspension =
    getSubscriptionSuspensionWindow({
      effectiveStatus,
      trialEndsAt:
        row.trial_ends_at,
      currentPeriodEnd:
        row.current_period_end,
    });

  return {
    planKey:
      policy?.key ||
      null,
    effectiveStatus,
    entitled:
      isSubscriptionEntitledNow(
        effectiveStatus,
      ) ||
      (
        suspension.pastDue &&
        !suspension.suspended
      ),
    ...suspension,
    policy,
    scheduledPlanKey:
      scheduledPolicy?.key ||
      null,
    scheduledPolicy,
  };
}

export async function getWorkspaceSubscriptionAccessState(
  tenantId:
    string,
) {
  const client =
    await getControlPool()
      .connect();

  try {
    return await readState(
      client,
      tenantId,
    );
  } finally {
    client.release();
  }
}

export async function getWorkspaceSubscriptionAccessStateWithClient(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  tenantId:
    string,
) {
  return readState(
    client,
    tenantId,
  );
}
