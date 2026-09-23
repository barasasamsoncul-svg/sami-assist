import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';


const DEFAULT_PAGE_SIZE =
  25;

const MAX_PAGE_SIZE =
  100;

const MAX_SEARCH_LENGTH =
  120;


function integer(
  value:
    unknown,
  fallback:
    number,
  minimum:
    number,
  maximum:
    number,
) {
  const parsed =
    Number(
      value,
    );

  if (
    !Number.isFinite(
      parsed,
    )
  ) {
    return fallback;
  }

  return Math.min(
    maximum,
    Math.max(
      minimum,
      Math.floor(
        parsed,
      ),
    ),
  );
}


function searchText(
  value:
    unknown,
) {
  return typeof value ===
    'string'
    ? value
        .trim()
        .slice(
          0,
          MAX_SEARCH_LENGTH,
        )
    : '';
}


function toIso(
  value:
    Date |
    string |
    null |
    undefined,
) {
  if (
    !value
  ) {
    return null;
  }

  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value,
        );

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


export type AdminListInput = {
  page?:
    unknown;
  limit?:
    unknown;
  search?:
    unknown;
};


function pagination(
  input:
    AdminListInput,
) {
  const page =
    integer(
      input.page,
      1,
      1,
      1_000_000,
    );

  const limit =
    integer(
      input.limit,
      DEFAULT_PAGE_SIZE,
      1,
      MAX_PAGE_SIZE,
    );

  return {
    page,
    limit,
    offset:
      (
        page -
        1
      ) *
      limit,
    search:
      searchText(
        input.search,
      ),
  };
}


function pageResult<T>(
  input: {
    rows:
      T[];
    total:
      number;
    page:
      number;
    limit:
      number;
  },
) {
  return {
    items:
      input.rows,
    page:
      input.page,
    limit:
      input.limit,
    total:
      input.total,
    totalPages:
      Math.max(
        1,
        Math.ceil(
          input.total /
          input.limit,
        ),
      ),
  };
}


export async function listAdminUsers(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM users u
          WHERE u.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR u.email
                   ILIKE $1
              OR COALESCE(
                   u.full_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   u.first_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   u.last_name,
                   ''
                 )
                   ILIKE $1
            )
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.full_name,
            u.status,
            u.email_verified,
            u.email_verified_at,
            u.two_factor_enabled,
            u.locked_until,
            u.last_login_at,
            u.created_at,
            COUNT(
              DISTINCT tu.tenant_id
            )::int
              AS workspace_count
          FROM users u
          LEFT JOIN tenant_users tu
            ON tu.user_id =
               u.id
           AND tu.deleted_at
               IS NULL
           AND LOWER(
                 COALESCE(
                   tu.status,
                   ''
                 )
               ) =
               'active'
          WHERE u.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR u.email
                   ILIKE $1
              OR COALESCE(
                   u.full_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   u.first_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   u.last_name,
                   ''
                 )
                   ILIKE $1
            )
          GROUP BY
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.full_name,
            u.status,
            u.email_verified,
            u.email_verified_at,
            u.two_factor_enabled,
            u.locked_until,
            u.last_login_at,
            u.created_at
          ORDER BY
            u.created_at DESC,
            u.id DESC
          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          email:
            String(
              row.email ||
              '',
            ),
          name:
            String(
              row.full_name ||
              [
                row.first_name,
                row.last_name,
              ]
                .filter(
                  Boolean,
                )
                .join(
                  ' ',
                ) ||
              row.email ||
              '',
            ),
          status:
            String(
              row.status ||
              'unknown',
            ),
          emailVerified:
            Boolean(
              row.email_verified ||
              row.email_verified_at,
            ),
          twoFactorEnabled:
            row.two_factor_enabled ===
            true,
          lockedUntil:
            toIso(
              row.locked_until,
            ),
          lastLoginAt:
            toIso(
              row.last_login_at,
            ),
          workspaceCount:
            Number(
              row.workspace_count ||
              0,
            ),
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  });
}


export async function listAdminTenants(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM tenants t
          WHERE t.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
            )
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            t.id,
            t.name,
            t.slug,
            t.status,
            t.created_at,

            owner_user.id
              AS owner_user_id,
            owner_user.email
              AS owner_email,
            owner_user.full_name
              AS owner_full_name,

            s.id
              AS subscription_id,
            s.status
              AS subscription_status,
            s.trial_ends_at,
            s.current_period_end,
            s.cancelled_at,

            p.key
              AS plan_key,
            p.name
              AS plan_name,

            (
              SELECT
                COUNT(*)::int
              FROM tenant_users members
              WHERE members.tenant_id =
                    t.id
                AND members.deleted_at
                    IS NULL
                AND LOWER(
                      COALESCE(
                        members.status,
                        ''
                      )
                    ) =
                    'active'
            )
              AS active_members

          FROM tenants t

          LEFT JOIN LATERAL (
            SELECT
              u.id,
              u.email,
              u.full_name
            FROM tenant_users owner_membership
            INNER JOIN users u
              ON u.id =
                 owner_membership.user_id
             AND u.deleted_at
                 IS NULL
            WHERE owner_membership.tenant_id =
                  t.id
              AND owner_membership.deleted_at
                  IS NULL
              AND owner_membership.is_owner =
                  TRUE
            ORDER BY
              owner_membership.created_at ASC
            LIMIT 1
          ) owner_user
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              subscription.*
            FROM subscriptions subscription
            WHERE subscription.tenant_id =
                  t.id
              AND subscription.deleted_at
                  IS NULL
            ORDER BY
              subscription.created_at DESC
            LIMIT 1
          ) s
            ON TRUE

          LEFT JOIN plans p
            ON p.id =
               s.plan_id
           AND p.deleted_at
               IS NULL

          WHERE t.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
              OR owner_user.email
                   ILIKE $1
            )

          ORDER BY
            t.created_at DESC,
            t.id DESC

          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          name:
            String(
              row.name ||
              '',
            ),
          slug:
            String(
              row.slug ||
              '',
            ),
          status:
            String(
              row.status ||
              'unknown',
            ),
          owner: {
            userId:
              row.owner_user_id
                ? String(
                    row.owner_user_id,
                  )
                : null,
            email:
              row.owner_email
                ? String(
                    row.owner_email,
                  )
                : null,
            name:
              row.owner_full_name
                ? String(
                    row.owner_full_name,
                  )
                : null,
          },
          activeMembers:
            Number(
              row.active_members ||
              0,
            ),
          subscription:
            row.subscription_id
              ? {
                  id:
                    String(
                      row.subscription_id,
                    ),
                  status:
                    String(
                      row.subscription_status ||
                      'unknown',
                    ),
                  planKey:
                    row.plan_key
                      ? String(
                          row.plan_key,
                        )
                      : null,
                  planName:
                    row.plan_name
                      ? String(
                          row.plan_name,
                        )
                      : null,
                  trialEndsAt:
                    toIso(
                      row.trial_ends_at,
                    ),
                  currentPeriodEnd:
                    toIso(
                      row.current_period_end,
                    ),
                  cancelledAt:
                    toIso(
                      row.cancelled_at,
                    ),
                }
              : null,
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  });
}


export async function listAdminSubscriptions(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM subscriptions s
          INNER JOIN tenants t
            ON t.id =
               s.tenant_id
           AND t.deleted_at
               IS NULL
          LEFT JOIN plans p
            ON p.id =
               s.plan_id
           AND p.deleted_at
               IS NULL
          WHERE s.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
              OR COALESCE(
                   p.key,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   s.status,
                   ''
                 )
                   ILIKE $1
            )
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            s.id,
            s.tenant_id,
            s.status,
            s.billing_cycle,
            s.started_at,
            s.trial_ends_at,
            s.current_period_start,
            s.current_period_end,
            s.cancelled_at,
            s.created_at,

            t.name
              AS tenant_name,
            t.slug
              AS tenant_slug,

            p.key
              AS plan_key,
            p.name
              AS plan_name,

            profile.provider
              AS provider,
            profile.recurring_status
              AS recurring_status

          FROM subscriptions s

          INNER JOIN tenants t
            ON t.id =
               s.tenant_id
           AND t.deleted_at
               IS NULL

          LEFT JOIN plans p
            ON p.id =
               s.plan_id
           AND p.deleted_at
               IS NULL

          LEFT JOIN LATERAL (
            SELECT
              sbp.provider,
              sbp.recurring_status
            FROM subscription_billing_profiles sbp
            WHERE sbp.subscription_id =
                  s.id
              AND sbp.is_active =
                  TRUE
            ORDER BY
              sbp.updated_at DESC
            LIMIT 1
          ) profile
            ON TRUE

          WHERE s.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
              OR COALESCE(
                   p.key,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   s.status,
                   ''
                 )
                   ILIKE $1
            )

          ORDER BY
            s.created_at DESC,
            s.id DESC

          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          tenantId:
            String(
              row.tenant_id,
            ),
          tenantName:
            String(
              row.tenant_name ||
              '',
            ),
          tenantSlug:
            String(
              row.tenant_slug ||
              '',
            ),
          planKey:
            row.plan_key
              ? String(
                  row.plan_key,
                )
              : null,
          planName:
            row.plan_name
              ? String(
                  row.plan_name,
                )
              : null,
          status:
            String(
              row.status ||
              'unknown',
            ),
          billingCycle:
            row.billing_cycle
              ? String(
                  row.billing_cycle,
                )
              : null,
          provider:
            row.provider
              ? String(
                  row.provider,
                )
              : null,
          recurringStatus:
            row.recurring_status
              ? String(
                  row.recurring_status,
                )
              : null,
          startedAt:
            toIso(
              row.started_at,
            ),
          trialEndsAt:
            toIso(
              row.trial_ends_at,
            ),
          currentPeriodStart:
            toIso(
              row.current_period_start,
            ),
          currentPeriodEnd:
            toIso(
              row.current_period_end,
            ),
          cancelledAt:
            toIso(
              row.cancelled_at,
            ),
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  });
}


export async function listAdminModules(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM modules m
          WHERE m.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR m.key
                   ILIKE $1
              OR m.name
                   ILIKE $1
            )
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            m.id,
            m.key,
            m.name,
            m.version,
            m.status,
            COALESCE(
              m.is_core,
              FALSE
            )
              AS is_core,
            COALESCE(
              m.is_ai_module,
              FALSE
            )
              AS is_ai_module,
            COALESCE(
              m.dependencies,
              '[]'::jsonb
            )
              AS dependencies,
            COUNT(
              DISTINCT CASE
                WHEN tm.deleted_at
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
                THEN tm.tenant_id
                ELSE NULL
              END
            )::int
              AS active_workspace_count
          FROM modules m
          LEFT JOIN tenant_modules tm
            ON tm.module_id =
               m.id
          WHERE m.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR m.key
                   ILIKE $1
              OR m.name
                   ILIKE $1
            )
          GROUP BY
            m.id,
            m.key,
            m.name,
            m.version,
            m.status,
            m.is_core,
            m.is_ai_module,
            m.dependencies
          ORDER BY
            COALESCE(
              m.is_core,
              FALSE
            ) DESC,
            LOWER(
              m.name
            ) ASC
          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          key:
            String(
              row.key ||
              '',
            ),
          name:
            String(
              row.name ||
              row.key ||
              '',
            ),
          version:
            row.version
              ? String(
                  row.version,
                )
              : null,
          status:
            String(
              row.status ||
              'unknown',
            ),
          isCore:
            row.is_core ===
            true,
          isAiModule:
            row.is_ai_module ===
            true,
          dependencies:
            Array.isArray(
              row.dependencies,
            )
              ? row.dependencies
                  .map(
                    value =>
                      String(
                        value,
                      ),
                  )
              : [],
          activeWorkspaceCount:
            Number(
              row.active_workspace_count ||
              0,
            ),
        }),
      ),
  });
}


export async function listAdminAuditEvents(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM audit_logs a
          WHERE a.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR COALESCE(
                   a.event_type,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.action,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.resource_type,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.result,
                   ''
                 )
                   ILIKE $1
            )
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            a.id,
            a.actor_type,
            a.action,
            a.event_type,
            a.resource_type,
            a.resource_id::text
              AS resource_id,
            a.result,
            a.tenant_id,
            a.user_id,
            a.created_at
          FROM audit_logs a
          WHERE a.deleted_at
                IS NULL
            AND (
              $1::text IS NULL
              OR COALESCE(
                   a.event_type,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.action,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.resource_type,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   a.result,
                   ''
                 )
                   ILIKE $1
            )
          ORDER BY
            a.created_at DESC,
            a.id DESC
          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          actorType:
            row.actor_type
              ? String(
                  row.actor_type,
                )
              : null,
          action:
            row.action
              ? String(
                  row.action,
                )
              : null,
          eventType:
            row.event_type
              ? String(
                  row.event_type,
                )
              : null,
          resourceType:
            row.resource_type
              ? String(
                  row.resource_type,
                )
              : null,
          resourceId:
            row.resource_id
              ? String(
                  row.resource_id,
                )
              : null,
          result:
            row.result
              ? String(
                  row.result,
                )
              : null,
          tenantId:
            row.tenant_id
              ? String(
                  row.tenant_id,
                )
              : null,
          userId:
            row.user_id
              ? String(
                  row.user_id,
                )
              : null,
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  });
}


export async function listAdminNotificationEvents(
  input:
    AdminListInput = {},
) {
  const {
    page,
    limit,
    offset,
    search,
  } =
    pagination(
      input,
    );

  const pattern =
    search
      ? `%${search}%`
      : null;

  const filter =
    `
      a.deleted_at IS NULL
      AND (
        LOWER(
          COALESCE(
            a.event_type,
            ''
          )
        ) LIKE '%notification%'
        OR LOWER(
             COALESCE(
               a.action,
               ''
             )
           ) LIKE '%notification%'
        OR LOWER(
             COALESCE(
               a.event_type,
               ''
             )
           ) LIKE 'billing.%'
      )
      AND (
        $1::text IS NULL
        OR COALESCE(
             a.event_type,
             ''
           )
             ILIKE $1
        OR COALESCE(
             a.action,
             ''
           )
             ILIKE $1
        OR COALESCE(
             a.result,
             ''
           )
             ILIKE $1
      )
    `;

  const [
    countResult,
    rowsResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM audit_logs a
          WHERE
            ${filter}
        `,
        [
          pattern,
        ],
      ),

      queryControl(
        `
          SELECT
            a.id,
            a.event_type,
            a.action,
            a.result,
            a.tenant_id,
            a.user_id,
            a.created_at
          FROM audit_logs a
          WHERE
            ${filter}
          ORDER BY
            a.created_at DESC,
            a.id DESC
          LIMIT $2
          OFFSET $3
        `,
        [
          pattern,
          limit,
          offset,
        ],
      ),
    ]);

  return pageResult({
    page,
    limit,
    total:
      Number(
        countResult.rows[0]
          ?.count ||
        0,
      ),
    rows:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          eventType:
            row.event_type
              ? String(
                  row.event_type,
                )
              : null,
          action:
            row.action
              ? String(
                  row.action,
                )
              : null,
          result:
            row.result
              ? String(
                  row.result,
                )
              : null,
          tenantId:
            row.tenant_id
              ? String(
                  row.tenant_id,
                )
              : null,
          userId:
            row.user_id
              ? String(
                  row.user_id,
                )
              : null,
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  });
}


export async function getAdminSecurityOverview() {
  const [
    lockedUsers,
    failedUserLogins,
    failedAdminLogins,
    activeAdminSessions,
    recentAdminSecurity,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM users
          WHERE deleted_at
                IS NULL
            AND locked_until
                IS NOT NULL
            AND locked_until >
                NOW()
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM login_history
          WHERE deleted_at
                IS NULL
            AND successful =
                FALSE
            AND created_at >=
                NOW() -
                INTERVAL '24 hours'
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM platform_admin_login_history
          WHERE successful =
                FALSE
            AND created_at >=
                NOW() -
                INTERVAL '24 hours'
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM platform_admin_sessions
          WHERE revoked_at
                IS NULL
            AND expires_at >
                NOW()
        `,
      ),

      queryControl(
        `
          SELECT
            id,
            admin_id,
            event_type,
            action,
            successful,
            failure_reason,
            ip_address,
            created_at
          FROM platform_admin_audit_logs
          ORDER BY
            created_at DESC,
            id DESC
          LIMIT 50
        `,
      ),
    ]);

  return {
    lockedUsers:
      Number(
        lockedUsers.rows[0]
          ?.count ||
        0,
      ),
    failedUserLoginsLast24Hours:
      Number(
        failedUserLogins.rows[0]
          ?.count ||
        0,
      ),
    failedAdminLoginsLast24Hours:
      Number(
        failedAdminLogins.rows[0]
          ?.count ||
        0,
      ),
    activeAdminSessions:
      Number(
        activeAdminSessions.rows[0]
          ?.count ||
        0,
      ),
    recentEvents:
      recentAdminSecurity.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          adminId:
            row.admin_id
              ? String(
                  row.admin_id,
                )
              : null,
          eventType:
            row.event_type
              ? String(
                  row.event_type,
                )
              : null,
          action:
            row.action
              ? String(
                  row.action,
                )
              : null,
          successful:
            row.successful ===
            true,
          failureReason:
            row.failure_reason
              ? String(
                  row.failure_reason,
                )
              : null,
          ipAddress:
            row.ip_address
              ? String(
                  row.ip_address,
                )
              : null,
          createdAt:
            toIso(
              row.created_at,
            ),
        }),
      ),
  };
}


export async function getAdminPlatformHealth() {
  const started =
    Date.now();

  const [
    nowResult,
    tenantCount,
    activeSubscriptions,
    registrationRequests,
    migrations,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            NOW()
              AS database_time
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM tenants
          WHERE deleted_at
                IS NULL
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM subscriptions
          WHERE deleted_at
                IS NULL
            AND LOWER(
                  COALESCE(
                    status,
                    ''
                  )
                ) IN (
                  'active',
                  'trial',
                  'trialing',
                  'past_due'
                )
        `,
      ),

      queryControl(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status =
                    'processing'
            )::int
              AS processing,
            COUNT(*) FILTER (
              WHERE status =
                    'failed'
            )::int
              AS failed,
            COUNT(*) FILTER (
              WHERE status =
                    'completed'
            )::int
              AS completed
          FROM registration_requests
        `,
      ),

      queryControl(
        `
          SELECT
            version,
            name,
            applied_at
          FROM control_schema_migrations
          ORDER BY
            version DESC
          LIMIT 1
        `,
      ),
    ]);

  const elapsedMs =
    Date.now() -
    started;

  const registration =
    registrationRequests.rows[0] ||
    {};

  const latestMigration =
    migrations.rows[0] ||
    null;

  return {
    generatedAt:
      new Date()
        .toISOString(),
    controlDatabase: {
      reachable:
        true,
      latencyMs:
        elapsedMs,
      databaseTime:
        toIso(
          nowResult.rows[0]
            ?.database_time,
        ),
    },
    tenants:
      Number(
        tenantCount.rows[0]
          ?.count ||
        0,
      ),
    entitledSubscriptions:
      Number(
        activeSubscriptions.rows[0]
          ?.count ||
        0,
      ),
    registrationRequests: {
      processing:
        Number(
          registration.processing ||
          0,
        ),
      failed:
        Number(
          registration.failed ||
          0,
        ),
      completed:
        Number(
          registration.completed ||
          0,
        ),
    },
    schema: {
      latestVersion:
        latestMigration
          ?.version
          ? String(
              latestMigration.version,
            )
          : null,
      latestName:
        latestMigration
          ?.name
          ? String(
              latestMigration.name,
            )
          : null,
      appliedAt:
        toIso(
          latestMigration
            ?.applied_at,
        ),
    },
  };
}
