import { queryControl } from '@/lib/db/control';

/* ============================================================
   SaMi Platform Admin
   Dashboard Data Layer

   CATEGORY:
   Admin Category 1 — Dashboard

   PURPOSE:
   - Central source of truth for /admin dashboard data.
   - Reads only from the SaMi control database.
   - Does not expose database/internal implementation details
     to the UI.
   - Does not contain client-side code.
   - Does not hardcode module-specific functionality.
   ============================================================ */

/* ============================================================
   TYPES
   ============================================================ */

export type AdminDashboardStatusCount = {
  status: string;
  count: number;
};

export type AdminDashboardActivity = {
  id: string;

  actorType: string | null;

  action: string;

  eventType: string | null;

  resourceType: string | null;

  resourceId: string | null;

  result: string | null;

  tenantId: string | null;

  userId: string | null;

  createdAt: string;
};

export type AdminDashboardSecurityEvent = {
  id: string;

  type:
    | 'login_failure'
    | 'admin_audit';

  adminId: string | null;

  eventType: string | null;

  action: string | null;

  failureReason: string | null;

  ipAddress: string | null;

  createdAt: string;
};

export type AdminDashboardRecentUser = {
  id: string;

  name: string;

  email: string;

  status: string | null;

  emailVerified: boolean;

  twoFactorEnabled: boolean;

  createdAt: string;
};

export type AdminDashboardRecentTenant = {
  id: string;

  name: string;

  slug: string;

  status: string | null;

  createdAt: string;
};

export type AdminDashboardData = {
  generatedAt: string;

  users: {
    total: number;

    active: number;

    unverified: number;

    locked: number;

    twoFactorEnabled: number;

    newLast7Days: number;

    newLast30Days: number;

    statuses: AdminDashboardStatusCount[];

    recent: AdminDashboardRecentUser[];
  };

  tenants: {
    total: number;

    active: number;

    newLast7Days: number;

    newLast30Days: number;

    statuses: AdminDashboardStatusCount[];

    recent: AdminDashboardRecentTenant[];
  };

  subscriptions: {
    total: number;

    active: number;

    trialing: number;

    pastDue: number;

    cancelled: number;

    trialsEndingNext7Days: number;

    statuses: AdminDashboardStatusCount[];
  };

  modules: {
    total: number;

    active: number;

    core: number;

    aiEnabled: number;

    statuses: AdminDashboardStatusCount[];
  };

  security: {
    lockedUsers: number;

    failedUserLoginsLast24Hours: number;

    failedAdminLoginsLast24Hours: number;

    activeAdminSessions: number;
  };

  attention: {
    unverifiedUsers: number;

    lockedUsers: number;

    trialsEndingNext7Days: number;

    pastDueSubscriptions: number;

    failedAdminLoginsLast24Hours: number;
  };

  activity: {
    recentPlatformActivity: AdminDashboardActivity[];

    recentSecurityEvents: AdminDashboardSecurityEvent[];
  };
};

/* ============================================================
   INTERNAL ROW TYPES
   ============================================================ */

type CountRow = {
  count:
    | string
    | number
    | bigint
    | null;
};

type StatusCountRow = {
  status:
    | string
    | null;

  count:
    | string
    | number
    | bigint;
};

type RecentUserRow = {
  id:
    string;

  first_name:
    string | null;

  last_name:
    string | null;

  full_name:
    string | null;

  email:
    string;

  status:
    string | null;

  email_verified:
    boolean | null;

  email_verified_at:
    Date | string | null;

  two_factor_enabled:
    boolean | null;

  created_at:
    Date | string;
};

type RecentTenantRow = {
  id:
    string;

  name:
    string;

  slug:
    string;

  status:
    string | null;

  created_at:
    Date | string;
};

type ActivityRow = {
  id:
    string;

  actor_type:
    string | null;

  action:
    string;

  event_type:
    string | null;

  resource_type:
    string | null;

  resource_id:
    string | null;

  result:
    string | null;

  tenant_id:
    string | null;

  user_id:
    string | null;

  created_at:
    Date | string;
};

type FailedAdminLoginRow = {
  id:
    string;

  admin_id:
    string | null;

  failure_reason:
    string | null;

  ip_address:
    string | null;

  created_at:
    Date | string;
};

type AdminAuditRow = {
  id:
    string;

  admin_id:
    string | null;

  event_type:
    string;

  action:
    string;

  failure_reason:
    string | null;

  ip_address:
    string | null;

  created_at:
    Date | string;
};

/* ============================================================
   HELPERS
   ============================================================ */

function toNumber(
  value:
    unknown
): number {
  if (
    typeof value ===
    'number'
  ) {
    return Number.isFinite(
      value
    )
      ? value
      : 0;
  }

  if (
    typeof value ===
    'bigint'
  ) {
    return Number(
      value
    );
  }

  if (
    typeof value ===
    'string'
  ) {
    const parsed =
      Number(
        value
      );

    return Number.isFinite(
      parsed
    )
      ? parsed
      : 0;
  }

  return 0;
}

function firstCount(
  rows:
    CountRow[] | undefined
): number {
  return toNumber(
    rows?.[0]?.count
  );
}

function normalizeStatus(
  status:
    string | null | undefined
): string {
  const value =
    status
      ?.trim()
      .toLowerCase();

  return value ||
    'unknown';
}

function mapStatusCounts(
  rows:
    StatusCountRow[]
): AdminDashboardStatusCount[] {
  return rows.map(
    (
      row
    ) => ({
      status:
        normalizeStatus(
          row.status
        ),

      count:
        toNumber(
          row.count
        ),
    })
  );
}

function getStatusCount(
  statuses:
    AdminDashboardStatusCount[],
  acceptedStatuses:
    string[]
): number {
  const accepted =
    new Set(
      acceptedStatuses.map(
        (
          status
        ) =>
          normalizeStatus(
            status
          )
      )
    );

  return statuses.reduce(
    (
      total,
      item
    ) => {
      if (
        accepted.has(
          normalizeStatus(
            item.status
          )
        )
      ) {
        return (
          total +
          item.count
        );
      }

      return total;
    },
    0
  );
}

function toIsoString(
  value:
    Date | string
): string {
  if (
    value instanceof
    Date
  ) {
    return value.toISOString();
  }

  const parsed =
    new Date(
      value
    );

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {
    return String(
      value
    );
  }

  return parsed.toISOString();
}

function getUserDisplayName(
  row:
    RecentUserRow
): string {
  const fullName =
    row.full_name?.trim();

  if (
    fullName
  ) {
    return fullName;
  }

  const combined =
    [
      row.first_name,
      row.last_name,
    ]
      .filter(
        Boolean
      )
      .join(
        ' '
      )
      .trim();

  if (
    combined
  ) {
    return combined;
  }

  return row.email;
}

/* ============================================================
   USER DATA
   ============================================================ */

async function getUserDashboardData() {
  const [
    totalResult,
    unverifiedResult,
    lockedResult,
    twoFactorResult,
    new7Result,
    new30Result,
    statusResult,
    recentResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
            AND COALESCE(
              email_verified,
              FALSE
            ) = FALSE
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
            AND locked_until IS NOT NULL
            AND locked_until > NOW()
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
            AND two_factor_enabled = TRUE
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
            AND created_at >= NOW() - INTERVAL '7 days'
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM users
          WHERE deleted_at IS NULL
            AND created_at >= NOW() - INTERVAL '30 days'
        `
      ),

      queryControl(
        `
          SELECT
            COALESCE(
              NULLIF(
                LOWER(
                  TRIM(
                    status
                  )
                ),
                ''
              ),
              'unknown'
            ) AS status,

            COUNT(*)::bigint AS count

          FROM users

          WHERE deleted_at IS NULL

          GROUP BY 1

          ORDER BY count DESC,
                   status ASC
        `
      ),

      queryControl(
        `
          SELECT
            id,
            first_name,
            last_name,
            full_name,
            email,
            status,
            email_verified,
            email_verified_at,
            two_factor_enabled,
            created_at

          FROM users

          WHERE deleted_at IS NULL

          ORDER BY created_at DESC

          LIMIT 8
        `
      ),
    ]);

  const statuses =
    mapStatusCounts(
      statusResult.rows as
        StatusCountRow[]
    );

  const active =
    getStatusCount(
      statuses,
      [
        'active',
      ]
    );

  const recent =
    (
      recentResult.rows as
        RecentUserRow[]
    ).map(
      (
        row
      ): AdminDashboardRecentUser => ({
        id:
          row.id,

        name:
          getUserDisplayName(
            row
          ),

        email:
          row.email,

        status:
          row.status,

        emailVerified:
          Boolean(
            row.email_verified ||
              row.email_verified_at
          ),

        twoFactorEnabled:
          Boolean(
            row.two_factor_enabled
          ),

        createdAt:
          toIsoString(
            row.created_at
          ),
      })
    );

  return {
    total:
      firstCount(
        totalResult.rows
      ),

    active,

    unverified:
      firstCount(
        unverifiedResult.rows
      ),

    locked:
      firstCount(
        lockedResult.rows
      ),

    twoFactorEnabled:
      firstCount(
        twoFactorResult.rows
      ),

    newLast7Days:
      firstCount(
        new7Result.rows
      ),

    newLast30Days:
      firstCount(
        new30Result.rows
      ),

    statuses,

    recent,
  };
}

/* ============================================================
   TENANT DATA
   ============================================================ */

async function getTenantDashboardData() {
  const [
    totalResult,
    new7Result,
    new30Result,
    statusResult,
    recentResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM tenants
          WHERE deleted_at IS NULL
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM tenants
          WHERE deleted_at IS NULL
            AND created_at >= NOW() - INTERVAL '7 days'
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM tenants
          WHERE deleted_at IS NULL
            AND created_at >= NOW() - INTERVAL '30 days'
        `
      ),

      queryControl(
        `
          SELECT
            COALESCE(
              NULLIF(
                LOWER(
                  TRIM(
                    status
                  )
                ),
                ''
              ),
              'unknown'
            ) AS status,

            COUNT(*)::bigint AS count

          FROM tenants

          WHERE deleted_at IS NULL

          GROUP BY 1

          ORDER BY count DESC,
                   status ASC
        `
      ),

      queryControl(
        `
          SELECT
            id,
            name,
            slug,
            status,
            created_at

          FROM tenants

          WHERE deleted_at IS NULL

          ORDER BY created_at DESC

          LIMIT 8
        `
      ),
    ]);

  const statuses =
    mapStatusCounts(
      statusResult.rows as
        StatusCountRow[]
    );

  return {
    total:
      firstCount(
        totalResult.rows
      ),

    active:
      getStatusCount(
        statuses,
        [
          'active',
        ]
      ),

    newLast7Days:
      firstCount(
        new7Result.rows
      ),

    newLast30Days:
      firstCount(
        new30Result.rows
      ),

    statuses,

    recent:
      (
        recentResult.rows as
          RecentTenantRow[]
      ).map(
        (
          row
        ): AdminDashboardRecentTenant => ({
          id:
            row.id,

          name:
            row.name,

          slug:
            row.slug,

          status:
            row.status,

          createdAt:
            toIsoString(
              row.created_at
            ),
        })
      ),
  };
}

/* ============================================================
   SUBSCRIPTION DATA
   ============================================================ */

async function getSubscriptionDashboardData() {
  const [
    totalResult,
    statusResult,
    endingTrialsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM subscriptions
          WHERE deleted_at IS NULL
        `
      ),

      queryControl(
        `
          SELECT
            COALESCE(
              NULLIF(
                LOWER(
                  TRIM(
                    status
                  )
                ),
                ''
              ),
              'unknown'
            ) AS status,

            COUNT(*)::bigint AS count

          FROM subscriptions

          WHERE deleted_at IS NULL

          GROUP BY 1

          ORDER BY count DESC,
                   status ASC
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count

          FROM subscriptions

          WHERE deleted_at IS NULL
            AND trial_ends_at IS NOT NULL
            AND trial_ends_at >= NOW()
            AND trial_ends_at < NOW() + INTERVAL '7 days'
        `
      ),
    ]);

  const statuses =
    mapStatusCounts(
      statusResult.rows as
        StatusCountRow[]
    );

  return {
    total:
      firstCount(
        totalResult.rows
      ),

    active:
      getStatusCount(
        statuses,
        [
          'active',
        ]
      ),

    trialing:
      getStatusCount(
        statuses,
        [
          'trial',
          'trialing',
          'trial_active',
          'on_trial',
        ]
      ),

    pastDue:
      getStatusCount(
        statuses,
        [
          'past_due',
          'past-due',
          'overdue',
          'payment_due',
        ]
      ),

    cancelled:
      getStatusCount(
        statuses,
        [
          'cancelled',
          'canceled',
        ]
      ),

    trialsEndingNext7Days:
      firstCount(
        endingTrialsResult.rows
      ),

    statuses,
  };
}

/* ============================================================
   MODULE DATA
   ============================================================ */

async function getModuleDashboardData() {
  const [
    totalResult,
    coreResult,
    aiResult,
    statusResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM modules
          WHERE deleted_at IS NULL
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM modules
          WHERE deleted_at IS NULL
            AND is_core = TRUE
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count
          FROM modules
          WHERE deleted_at IS NULL
            AND is_ai_module = TRUE
        `
      ),

      queryControl(
        `
          SELECT
            COALESCE(
              NULLIF(
                LOWER(
                  TRIM(
                    status
                  )
                ),
                ''
              ),
              'unknown'
            ) AS status,

            COUNT(*)::bigint AS count

          FROM modules

          WHERE deleted_at IS NULL

          GROUP BY 1

          ORDER BY count DESC,
                   status ASC
        `
      ),
    ]);

  const statuses =
    mapStatusCounts(
      statusResult.rows as
        StatusCountRow[]
    );

  return {
    total:
      firstCount(
        totalResult.rows
      ),

    active:
      getStatusCount(
        statuses,
        [
          'active',
          'enabled',
          'available',
        ]
      ),

    core:
      firstCount(
        coreResult.rows
      ),

    aiEnabled:
      firstCount(
        aiResult.rows
      ),

    statuses,
  };
}

/* ============================================================
   SECURITY DATA
   ============================================================ */

async function getSecurityDashboardData() {
  const [
    lockedUsersResult,
    failedUserResult,
    failedAdminResult,
    activeAdminSessionsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count

          FROM users

          WHERE deleted_at IS NULL
            AND locked_until IS NOT NULL
            AND locked_until > NOW()
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count

          FROM login_history

          WHERE successful = FALSE
            AND deleted_at IS NULL
            AND created_at >= NOW() - INTERVAL '24 hours'
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count

          FROM platform_admin_login_history

          WHERE successful = FALSE
            AND created_at >= NOW() - INTERVAL '24 hours'
        `
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::bigint AS count

          FROM platform_admin_sessions

          WHERE revoked_at IS NULL
            AND expires_at > NOW()
        `
      ),
    ]);

  return {
    lockedUsers:
      firstCount(
        lockedUsersResult.rows
      ),

    failedUserLoginsLast24Hours:
      firstCount(
        failedUserResult.rows
      ),

    failedAdminLoginsLast24Hours:
      firstCount(
        failedAdminResult.rows
      ),

    activeAdminSessions:
      firstCount(
        activeAdminSessionsResult.rows
      ),
  };
}

/* ============================================================
   ACTIVITY
   ============================================================ */

async function getRecentPlatformActivity(): Promise<
  AdminDashboardActivity[]
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          actor_type,
          action,
          event_type,
          resource_type,
          resource_id::text AS resource_id,
          result,
          tenant_id,
          user_id,
          created_at

        FROM audit_logs

        WHERE deleted_at IS NULL

        ORDER BY created_at DESC

        LIMIT 15
      `
    );

  return (
    result.rows as
      ActivityRow[]
  ).map(
    (
      row
    ): AdminDashboardActivity => ({
      id:
        row.id,

      actorType:
        row.actor_type,

      action:
        row.action,

      eventType:
        row.event_type,

      resourceType:
        row.resource_type,

      resourceId:
        row.resource_id,

      result:
        row.result,

      tenantId:
        row.tenant_id,

      userId:
        row.user_id,

      createdAt:
        toIsoString(
          row.created_at
        ),
    })
  );
}

/* ============================================================
   RECENT ADMIN SECURITY EVENTS
   ============================================================ */

async function getRecentSecurityEvents(): Promise<
  AdminDashboardSecurityEvent[]
> {
  const [
    loginFailuresResult,
    auditResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            id,
            admin_id,
            failure_reason,
            ip_address,
            created_at

          FROM platform_admin_login_history

          WHERE successful = FALSE

          ORDER BY created_at DESC

          LIMIT 8
        `
      ),

      queryControl(
        `
          SELECT
            id,
            admin_id,
            event_type,
            action,
            failure_reason,
            ip_address,
            created_at

          FROM platform_admin_audit_logs

          WHERE successful = FALSE

          ORDER BY created_at DESC

          LIMIT 8
        `
      ),
    ]);

  const loginFailures:
    AdminDashboardSecurityEvent[] =
    (
      loginFailuresResult.rows as
        FailedAdminLoginRow[]
    ).map(
      (
        row
      ) => ({
        id:
          row.id,

        type:
          'login_failure',

        adminId:
          row.admin_id,

        eventType:
          'admin.login.failed',

        action:
          'admin_login',

        failureReason:
          row.failure_reason,

        ipAddress:
          row.ip_address,

        createdAt:
          toIsoString(
            row.created_at
          ),
      })
    );

  const auditEvents:
    AdminDashboardSecurityEvent[] =
    (
      auditResult.rows as
        AdminAuditRow[]
    ).map(
      (
        row
      ) => ({
        id:
          row.id,

        type:
          'admin_audit',

        adminId:
          row.admin_id,

        eventType:
          row.event_type,

        action:
          row.action,

        failureReason:
          row.failure_reason,

        ipAddress:
          row.ip_address,

        createdAt:
          toIsoString(
            row.created_at
          ),
      })
    );

  return [
    ...loginFailures,
    ...auditEvents,
  ]
    .sort(
      (
        a,
        b
      ) =>
        new Date(
          b.createdAt
        ).getTime() -
        new Date(
          a.createdAt
        ).getTime()
    )
    .slice(
      0,
      10
    );
}

/* ============================================================
   MAIN DASHBOARD LOADER
   ============================================================ */

export async function getAdminDashboardData(): Promise<
  AdminDashboardData
> {
  const [
    users,
    tenants,
    subscriptions,
    modules,
    security,
    recentPlatformActivity,
    recentSecurityEvents,
  ] =
    await Promise.all([
      getUserDashboardData(),

      getTenantDashboardData(),

      getSubscriptionDashboardData(),

      getModuleDashboardData(),

      getSecurityDashboardData(),

      getRecentPlatformActivity(),

      getRecentSecurityEvents(),
    ]);

  return {
    generatedAt:
      new Date().toISOString(),

    users,

    tenants,

    subscriptions,

    modules,

    security,

    attention: {
      unverifiedUsers:
        users.unverified,

      lockedUsers:
        users.locked,

      trialsEndingNext7Days:
        subscriptions.trialsEndingNext7Days,

      pastDueSubscriptions:
        subscriptions.pastDue,

      failedAdminLoginsLast24Hours:
        security.failedAdminLoginsLast24Hours,
    },

    activity: {
      recentPlatformActivity,

      recentSecurityEvents,
    },
  };
}

/* ============================================================
   DEFAULT EXPORT
   ============================================================ */

export default getAdminDashboardData;