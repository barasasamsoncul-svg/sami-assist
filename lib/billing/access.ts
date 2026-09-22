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
          p.key
            AS plan_key
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
      policy:
        null,
    };
  }

  const policy =
    getSamiPlanPolicy(
      row.plan_key,
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
    });

  return {
    planKey:
      policy?.key ||
      null,
    effectiveStatus,
    entitled:
      isSubscriptionEntitledNow(
        effectiveStatus,
      ),
    pastDue:
      effectiveStatus ===
      'past_due',
    policy,
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
