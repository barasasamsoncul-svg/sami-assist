import 'server-only';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  getWorkspaceSubscriptionAccessState,
  getWorkspaceSubscriptionAccessStateWithClient,
} from '@/lib/billing/access';

import type {
  SamiPlanKey,
  SamiPlanPolicy,
} from '@/lib/billing/plan-policy';


export type WorkspaceUsageMetric =
  | 'ai_queries_user_month'
  | 'storage_bytes_workspace'
  | 'automation_runs_workspace_month'
  | 'api_requests_workspace_month'
  | 'active_internal_users'
  | 'installed_business_apps';


export type UsageLimitMode =
  | 'fixed'
  | 'cost_controlled'
  | 'platform_controlled'
  | 'not_applicable';


export class WorkspaceUsageError
  extends Error {
  readonly code:
    | 'USAGE_SUBSCRIPTION_UNAVAILABLE'
    | 'USAGE_WORKSPACE_SUSPENDED'
    | 'AI_MONTHLY_LIMIT_REACHED'
    | 'STORAGE_QUOTA_EXCEEDED'
    | 'INTERNAL_SEAT_LIMIT_REACHED';

  readonly details:
    Record<string, unknown>;

  constructor(
    code:
      WorkspaceUsageError['code'],
    message:
      string,
    details:
      Record<string, unknown> = {},
  ) {
    super(
      message,
    );

    this.name =
      'WorkspaceUsageError';

    this.code =
      code;

    this.details =
      details;
  }
}


function monthWindow(
  now =
    new Date(),
) {
  const start =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        1,
      ),
    );

  const end =
    new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
        1,
      ),
    );

  return {
    start,
    end,
  };
}


function positiveIntegerEnv(
  key:
    string,
) {
  const raw =
    process.env[
      key
    ]
      ?.trim();

  if (
    !raw
  ) {
    return null;
  }

  const parsed =
    Number.parseInt(
      raw,
      10,
    );

  if (
    !Number.isSafeInteger(
      parsed,
    ) ||
    parsed <= 0
  ) {
    return null;
  }

  return parsed;
}


function storageLimitEnvKey(
  planKey:
    SamiPlanKey,
) {
  return (
    planKey ===
      'free'
      ? 'SAMI_USAGE_FREE_STORAGE_BYTES'
      : planKey ===
          'standard'
        ? 'SAMI_USAGE_STANDARD_STORAGE_BYTES'
        : 'SAMI_USAGE_CUSTOM_STORAGE_BYTES'
  );
}


function resolveAiQueryLimit(
  policy:
    SamiPlanPolicy,
) {
  const quota =
    policy.ai
      .monthlyQueriesPerUser;

  if (
    quota.mode ===
      'fixed'
  ) {
    return {
      mode:
        'fixed' as const,
      limit:
        quota.limit,
      label:
        quota.unit,
      enforced:
        true,
    };
  }

  if (
    quota.mode ===
      'cost_controlled'
  ) {
    const configured =
      positiveIntegerEnv(
        'SAMI_USAGE_CUSTOM_AI_MONTHLY_QUERIES_PER_USER',
      );

    return {
      mode:
        'cost_controlled' as const,
      limit:
        configured,
      label:
        quota.label,
      enforced:
        configured !==
        null,
    };
  }

  return {
    mode:
      'platform_controlled' as const,
    limit:
      null,
    label:
      quota.label,
    enforced:
      false,
  };
}


function resolveStorageLimit(
  policy:
    SamiPlanPolicy,
) {
  const configured =
    positiveIntegerEnv(
      storageLimitEnvKey(
        policy.key,
      ),
    );

  return {
    mode:
      configured ===
        null
        ? 'platform_controlled' as const
        : 'fixed' as const,
    limit:
      configured,
    label:
      configured ===
        null
        ? policy.storage
            .allowance
            .mode ===
            'plan_controlled'
          ? policy.storage
              .allowance
              .label
          : 'Storage is metered by SaMi.'
        : 'Workspace cloud storage bytes.',
    enforced:
      configured !==
      null,
  };
}


function usagePercent(
  used:
    number,
  limit:
    number | null,
) {
  if (
    !limit ||
    limit <= 0
  ) {
    return null;
  }

  return Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (
          used /
          limit
        ) *
        100,
      ),
    ),
  );
}


async function readControlUsage(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM tenant_users tu
            WHERE tu.tenant_id = $1
              AND tu.deleted_at IS NULL
              AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) = 'active'
              AND LOWER(
                COALESCE(
                  tu.member_type,
                  'internal'
                )
              ) = 'internal'
          ) AS active_internal_users,

          (
            SELECT COUNT(*)::int
            FROM tenant_modules tm
            INNER JOIN modules m
              ON m.id =
                 tm.module_id
            WHERE tm.tenant_id = $1
              AND tm.deleted_at IS NULL
              AND m.deleted_at IS NULL
              AND COALESCE(
                m.is_core,
                FALSE
              ) = FALSE
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
          ) AS installed_business_apps
      `,
      [
        tenantId,
      ],
    );

  return {
    activeInternalUsers:
      Number(
        result.rows[0]
          ?.active_internal_users ||
        0,
      ),

    installedBusinessApps:
      Number(
        result.rows[0]
          ?.installed_business_apps ||
        0,
      ),
  };
}


async function readTenantUsage(
  tenantId:
    string,
  userId:
    string,
  periodStart:
    Date,
  periodEnd:
    Date,
) {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );

  const result =
    await pool.query(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM ai_runs ar
            WHERE ar.user_id = $1
              AND ar.created_at >= $2
              AND ar.created_at < $3
          ) AS ai_queries_user_month,

          (
            SELECT COALESCE(
              SUM(
                CASE
                  WHEN f.size_bytes > 0
                    THEN f.size_bytes
                  ELSE 0
                END
              ),
              0
            )::bigint
            FROM files f
            WHERE f.deleted_at IS NULL
              AND LOWER(
                COALESCE(
                  f.status,
                  ''
                )
              ) = 'active'
          ) AS storage_bytes_workspace,

          (
            SELECT COUNT(*)::int
            FROM automation_runs aur
            WHERE aur.created_at >= $2
              AND aur.created_at < $3
          ) AS automation_runs_workspace_month,

          (
            SELECT COUNT(*)::int
            FROM api_request_logs apr
            WHERE apr.created_at >= $2
              AND apr.created_at < $3
          ) AS api_requests_workspace_month
      `,
      [
        userId,
        periodStart,
        periodEnd,
      ],
    );

  const row =
    result.rows[0] ||
    {};

  return {
    aiQueriesUserMonth:
      Number(
        row
          .ai_queries_user_month ||
        0,
      ),

    storageBytesWorkspace:
      Number(
        row
          .storage_bytes_workspace ||
        0,
      ),

    automationRunsWorkspaceMonth:
      Number(
        row
          .automation_runs_workspace_month ||
        0,
      ),

    apiRequestsWorkspaceMonth:
      Number(
        row
          .api_requests_workspace_month ||
        0,
      ),
  };
}


export async function assertInternalSeatAvailableWithClient(
  client:
    Pick<
      PoolClient,
      'query'
    >,
  input: {
    tenantId: string;
  },
) {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext(
            $1
          )
        )
    `,
    [
      `sami:usage:internal-seats:${input.tenantId}`,
    ],
  );

  const access =
    await getWorkspaceSubscriptionAccessStateWithClient(
      client,
      input.tenantId,
    );

  const policy =
    access.policy;

  if (
    !policy ||
    !access.entitled
  ) {
    throw new WorkspaceUsageError(
      access.suspended
        ? 'USAGE_WORKSPACE_SUSPENDED'
        : 'USAGE_SUBSCRIPTION_UNAVAILABLE',
      access.suspended
        ? 'This workspace is suspended until its subscription is restored.'
        : 'An active SaMi subscription is required before adding or reactivating internal users.',
    );
  }

  const seatLimits =
    [
      policy.users
        .maxActiveInternalUsers,
      access.scheduledPolicy
        ?.users
        .maxActiveInternalUsers ??
        null,
    ]
      .filter(
        (
          value,
        ): value is number =>
          value !==
          null,
      );

  const limit =
    seatLimits.length >
      0
      ? Math.min(
          ...seatLimits,
        )
      : null;

  if (
    limit ===
      null
  ) {
    return {
      planKey:
        policy.key,
      scheduledPlanKey:
        access.scheduledPlanKey,
      used:
        null,
      limit:
        null,
      remaining:
        null,
    };
  }

  const result =
    await client.query(
      `
        SELECT
          COUNT(*)::int
            AS active_internal_users
        FROM tenant_users
        WHERE tenant_id = $1
          AND deleted_at IS NULL
          AND LOWER(
            COALESCE(
              status,
              ''
            )
          ) = 'active'
          AND LOWER(
            COALESCE(
              member_type,
              'internal'
            )
          ) = 'internal'
      `,
      [
        input.tenantId,
      ],
    );

  const used =
    Number(
      result.rows[0]
        ?.active_internal_users ||
      0,
    );

  if (
    used >=
      limit
  ) {
    throw new WorkspaceUsageError(
      'INTERNAL_SEAT_LIMIT_REACHED',
      'This workspace has reached the active internal-user allowance for its current plan.',
      {
        planKey:
          policy.key,
        scheduledPlanKey:
          access.scheduledPlanKey,
        used,
        limit,
        remaining:
          0,
        billingHref:
          '/settings?tab=billing',
      },
    );
  }

  return {
    planKey:
      policy.key,
    scheduledPlanKey:
      access.scheduledPlanKey,
    used,
    limit,
    remaining:
      Math.max(
        0,
        limit -
        used,
      ),
  };
}


export async function getWorkspaceUsageSnapshot(
  input: {
    tenantId: string;
    userId: string;
    now?: Date;
  },
) {
  const now =
    input.now ||
    new Date();

  const subscription =
    await getWorkspaceSubscriptionAccessState(
      input.tenantId,
    );

  const policy =
    subscription.policy;

  if (
    !policy
  ) {
    throw new WorkspaceUsageError(
      'USAGE_SUBSCRIPTION_UNAVAILABLE',
      'Workspace usage could not be resolved because the subscription plan is unavailable.',
    );
  }

  const window =
    monthWindow(
      now,
    );

  const [
    control,
    tenant,
  ] =
    await Promise.all([
      readControlUsage(
        input.tenantId,
      ),

      readTenantUsage(
        input.tenantId,
        input.userId,
        window.start,
        window.end,
      ),
    ]);

  const aiLimit =
    resolveAiQueryLimit(
      policy,
    );

  const storageLimit =
    resolveStorageLimit(
      policy,
    );

  return {
    period: {
      start:
        window.start
          .toISOString(),
      end:
        window.end
          .toISOString(),
    },

    subscription: {
      planKey:
        policy.key,
      status:
        subscription
          .effectiveStatus,
      entitled:
        subscription
          .entitled,
      pastDue:
        subscription
          .pastDue,
      suspended:
        subscription
          .suspended,
    },

    entitlements: {
      ai:
        policy.ai
          .enabled,
      automation:
        policy.automation
          .enabled,
      integrations:
        policy.integrations
          .enabled,
      customIntegrations:
        policy.integrations
          .customIntegrations,
      developerApi:
        policy.developerApi
          .enabled,
      multiCompany:
        policy.companies
          .multiCompany,
      customization:
        policy.customization
          .enabled,
      allBusinessApps:
        policy.apps
          .allBusinessApps,
    },

    usage: {
      aiQueriesUserMonth: {
        metric:
          'ai_queries_user_month' as const,
        used:
          tenant
            .aiQueriesUserMonth,
        limit:
          aiLimit.limit,
        remaining:
          aiLimit.limit ===
            null
            ? null
            : Math.max(
                0,
                aiLimit.limit -
                tenant
                  .aiQueriesUserMonth,
              ),
        percent:
          usagePercent(
            tenant
              .aiQueriesUserMonth,
            aiLimit.limit,
          ),
        mode:
          aiLimit.mode,
        enforced:
          aiLimit.enforced,
        label:
          aiLimit.label,
      },

      storageBytesWorkspace: {
        metric:
          'storage_bytes_workspace' as const,
        used:
          tenant
            .storageBytesWorkspace,
        limit:
          storageLimit.limit,
        remaining:
          storageLimit.limit ===
            null
            ? null
            : Math.max(
                0,
                storageLimit.limit -
                tenant
                  .storageBytesWorkspace,
              ),
        percent:
          usagePercent(
            tenant
              .storageBytesWorkspace,
            storageLimit.limit,
          ),
        mode:
          storageLimit.mode,
        enforced:
          storageLimit.enforced,
        label:
          storageLimit.label,
      },

      automationRunsWorkspaceMonth: {
        metric:
          'automation_runs_workspace_month' as const,
        used:
          tenant
            .automationRunsWorkspaceMonth,
        limit:
          null,
        remaining:
          null,
        percent:
          null,
        mode:
          'platform_controlled' as const,
        enforced:
          false,
        label:
          'Automation runs this month are metered for platform controls.',
      },

      apiRequestsWorkspaceMonth: {
        metric:
          'api_requests_workspace_month' as const,
        used:
          tenant
            .apiRequestsWorkspaceMonth,
        limit:
          null,
        remaining:
          null,
        percent:
          null,
        mode:
          policy.developerApi
            .enabled
            ? 'platform_controlled' as const
            : 'not_applicable' as const,
        enforced:
          false,
        label:
          policy.developerApi
            .enabled
            ? 'Developer API requests this month are metered for platform controls.'
            : 'Developer API is not included in this plan.',
      },

      activeInternalUsers: {
        metric:
          'active_internal_users' as const,
        used:
          control
            .activeInternalUsers,
        limit:
          policy.users
            .maxActiveInternalUsers,
        remaining:
          policy.users
            .maxActiveInternalUsers ===
            null
            ? null
            : Math.max(
                0,
                policy.users
                  .maxActiveInternalUsers -
                control
                  .activeInternalUsers,
              ),
        percent:
          usagePercent(
            control
              .activeInternalUsers,
            policy.users
              .maxActiveInternalUsers,
          ),
        mode:
          policy.users
            .maxActiveInternalUsers ===
            null
            ? 'platform_controlled' as const
            : 'fixed' as const,
        enforced:
          policy.users
            .maxActiveInternalUsers !==
          null,
        label:
          'Active internal workspace users.',
      },

      installedBusinessApps: {
        metric:
          'installed_business_apps' as const,
        used:
          control
            .installedBusinessApps,
        limit:
          policy.apps
            .maxInstalledBusinessApps,
        remaining:
          policy.apps
            .maxInstalledBusinessApps ===
            null
            ? null
            : Math.max(
                0,
                policy.apps
                  .maxInstalledBusinessApps -
                control
                  .installedBusinessApps,
              ),
        percent:
          usagePercent(
            control
              .installedBusinessApps,
            policy.apps
              .maxInstalledBusinessApps,
          ),
        mode:
          policy.apps
            .maxInstalledBusinessApps ===
            null
            ? 'platform_controlled' as const
            : 'fixed' as const,
        enforced:
          policy.apps
            .maxInstalledBusinessApps !==
          null,
        label:
          'Installed business apps.',
      },
    },
  };
}


export async function assertAiMonthlyUsageAvailable(
  input: {
    tenantId: string;
    userId: string;
  },
) {
  const snapshot =
    await getWorkspaceUsageSnapshot(
      input,
    );

  if (
    snapshot.subscription
      .suspended
  ) {
    throw new WorkspaceUsageError(
      'USAGE_WORKSPACE_SUSPENDED',
      'This workspace is suspended until its subscription is restored.',
    );
  }

  const ai =
    snapshot.usage
      .aiQueriesUserMonth;

  if (
    ai.enforced &&
    ai.limit !==
      null &&
    ai.used >=
      ai.limit
  ) {
    throw new WorkspaceUsageError(
      'AI_MONTHLY_LIMIT_REACHED',
      'Your SaMi AI monthly allowance has been reached. The allowance resets at the start of the next monthly usage period.',
      {
        used:
          ai.used,
        limit:
          ai.limit,
        periodStart:
          snapshot.period
            .start,
        periodEnd:
          snapshot.period
            .end,
      },
    );
  }

  return ai;
}


export async function assertStorageAllocationAvailable(
  input: {
    tenantId: string;
    userId: string;
    incomingBytes: number;
  },
) {
  const snapshot =
    await getWorkspaceUsageSnapshot({
      tenantId:
        input.tenantId,
      userId:
        input.userId,
    });

  if (
    snapshot.subscription
      .suspended
  ) {
    throw new WorkspaceUsageError(
      'USAGE_WORKSPACE_SUSPENDED',
      'This workspace is suspended until its subscription is restored.',
    );
  }

  const storage =
    snapshot.usage
      .storageBytesWorkspace;

  if (
    storage.enforced &&
    storage.limit !==
      null &&
    storage.used +
      input.incomingBytes >
      storage.limit
  ) {
    throw new WorkspaceUsageError(
      'STORAGE_QUOTA_EXCEEDED',
      'This upload would exceed the workspace cloud storage allowance.',
      {
        used:
          storage.used,
        incomingBytes:
          input.incomingBytes,
        limit:
          storage.limit,
        remaining:
          storage.remaining,
      },
    );
  }

  return storage;
}
