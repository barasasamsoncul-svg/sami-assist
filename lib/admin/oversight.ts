import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  getControlMigrationStatus,
} from '@/lib/admin/control-migration-status';

import {
  getEffectiveSubscriptionStatus,
  getSamiPlanPolicy,
  normalizeSamiPlanKey,
} from '@/lib/billing/plan-policy';

import {
  getSamiMonthlyAmount,
  getSamiPricePerUserMonthly,
} from '@/lib/billing/pricing';


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


export type AdminUserListInput =
  AdminListInput & {
    workspaceId?:
      unknown;
  };


function adminWorkspaceId(
  value:
    unknown,
) {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const candidate =
    value.trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(
      candidate,
    )
      ? candidate
      : null;
}


export async function listAdminUserWorkspaceFilters() {
  const result =
    await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          current_subscription.plan_key,
          current_subscription.plan_name,
          current_subscription.subscription_status
        FROM tenants t
        LEFT JOIN LATERAL (
          SELECT
            s.status
              AS subscription_status,
            p.key
              AS plan_key,
            p.name
              AS plan_name
          FROM subscriptions s
          LEFT JOIN plans p
            ON p.id =
               s.plan_id
           AND p.deleted_at
               IS NULL
          WHERE s.tenant_id =
                t.id
            AND s.deleted_at
                IS NULL
          ORDER BY
            s.created_at DESC,
            s.id DESC
          LIMIT 1
        ) current_subscription
          ON TRUE
        WHERE t.deleted_at
              IS NULL
        ORDER BY
          LOWER(
            COALESCE(
              t.name,
              ''
            )
          ) ASC,
          t.id ASC
        LIMIT 2000
      `,
    );

  return result.rows.map(
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
      subscriptionStatus:
        row.subscription_status
          ? String(
              row.subscription_status,
            )
          : null,
    }),
  );
}


export async function listAdminUsers(
  input:
    AdminUserListInput = {},
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

  const workspaceId =
    adminWorkspaceId(
      input.workspaceId,
    );

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
          LEFT JOIN LATERAL (
            SELECT
              u.email,
              u.full_name,
              u.first_name,
              u.last_name
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
              CASE
                WHEN LOWER(
                  COALESCE(
                    owner_membership.status,
                    ''
                  )
                ) =
                'active'
                THEN 0
                ELSE 1
              END,
              owner_membership.created_at ASC
            LIMIT 1
          ) owner_user
            ON TRUE
          WHERE t.deleted_at
                IS NULL
            AND (
              $2::uuid IS NULL
              OR t.id =
                 $2::uuid
            )
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
              OR owner_user.email
                   ILIKE $1
              OR COALESCE(
                   owner_user.full_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   owner_user.first_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   owner_user.last_name,
                   ''
                 )
                   ILIKE $1
              OR EXISTS (
                SELECT 1
                FROM tenant_users member
                INNER JOIN users member_user
                  ON member_user.id =
                     member.user_id
                 AND member_user.deleted_at
                     IS NULL
                WHERE member.tenant_id =
                      t.id
                  AND member.deleted_at
                      IS NULL
                  AND LOWER(
                        COALESCE(
                          member.member_type,
                          ''
                        )
                      ) =
                      'internal'
                  AND (
                    member_user.email
                      ILIKE $1
                    OR COALESCE(
                         member_user.full_name,
                         ''
                       )
                         ILIKE $1
                    OR COALESCE(
                         member_user.first_name,
                         ''
                       )
                         ILIKE $1
                    OR COALESCE(
                         member_user.last_name,
                         ''
                       )
                         ILIKE $1
                  )
              )
            )
        `,
        [
          pattern,
          workspaceId,
        ],
      ),

      queryControl(
        `
          SELECT
            t.id
              AS tenant_id,
            t.name
              AS tenant_name,
            t.slug
              AS tenant_slug,
            t.status
              AS tenant_status,
            t.created_at
              AS tenant_created_at,

            owner_user.user_id
              AS owner_user_id,
            owner_user.email
              AS owner_email,
            owner_user.full_name
              AS owner_full_name,
            owner_user.first_name
              AS owner_first_name,
            owner_user.last_name
              AS owner_last_name,
            owner_user.user_status
              AS owner_user_status,
            owner_user.email_verified
              AS owner_email_verified,
            owner_user.email_verified_at
              AS owner_email_verified_at,
            owner_user.two_factor_enabled
              AS owner_two_factor_enabled,
            owner_user.locked_until
              AS owner_locked_until,
            owner_user.last_login_at
              AS owner_last_login_at,

            member_summary.active_internal_users,
            member_summary.internal_members,

            current_subscription.subscription_id,
            current_subscription.subscription_status,
            current_subscription.billing_cycle,
            current_subscription.trial_ends_at,
            current_subscription.current_period_start,
            current_subscription.current_period_end,
            current_subscription.cancelled_at,
            current_subscription.plan_key,
            current_subscription.plan_name,
            current_subscription.provider,
            current_subscription.recurring_status,
            current_subscription.profile_price_per_user_monthly,
            current_subscription.profile_seat_quantity,

            latest_payment.payment_id,
            latest_payment.payment_provider,
            latest_payment.payment_reference,
            latest_payment.payment_amount,
            latest_payment.payment_currency,
            latest_payment.payment_status,
            latest_payment.payment_created_at,
            latest_payment.payment_updated_at

          FROM tenants t

          LEFT JOIN LATERAL (
            SELECT
              u.id
                AS user_id,
              u.email,
              u.full_name,
              u.first_name,
              u.last_name,
              u.status
                AS user_status,
              u.email_verified,
              u.email_verified_at,
              u.two_factor_enabled,
              u.locked_until,
              u.last_login_at
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
              CASE
                WHEN LOWER(
                  COALESCE(
                    owner_membership.status,
                    ''
                  )
                ) =
                'active'
                THEN 0
                ELSE 1
              END,
              owner_membership.created_at ASC
            LIMIT 1
          ) owner_user
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              COUNT(*) FILTER (
                WHERE LOWER(
                  COALESCE(
                    membership.status,
                    ''
                  )
                ) =
                'active'
              )::int
                AS active_internal_users,

              COALESCE(
                jsonb_agg(
                  jsonb_build_object(
                    'id',
                      member_user.id,
                    'name',
                      COALESCE(
                        member_user.full_name,
                        NULLIF(
                          CONCAT_WS(
                            ' ',
                            member_user.first_name,
                            member_user.last_name
                          ),
                          ''
                        ),
                        member_user.email
                      ),
                    'email',
                      member_user.email,
                    'status',
                      membership.status,
                    'isOwner',
                      membership.is_owner,
                    'lastLoginAt',
                      member_user.last_login_at
                  )
                  ORDER BY
                    membership.is_owner DESC,
                    LOWER(
                      COALESCE(
                        member_user.full_name,
                        member_user.email,
                        ''
                      )
                    ) ASC
                ),
                '[]'::jsonb
              )
                AS internal_members

            FROM tenant_users membership
            INNER JOIN users member_user
              ON member_user.id =
                 membership.user_id
             AND member_user.deleted_at
                 IS NULL
            WHERE membership.tenant_id =
                  t.id
              AND membership.deleted_at
                  IS NULL
              AND LOWER(
                    COALESCE(
                      membership.member_type,
                      ''
                    )
                  ) =
                  'internal'
          ) member_summary
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              s.id
                AS subscription_id,
              s.status
                AS subscription_status,
              s.billing_cycle,
              s.trial_ends_at,
              s.current_period_start,
              s.current_period_end,
              s.cancelled_at,
              p.key
                AS plan_key,
              p.name
                AS plan_name,
              profile.provider,
              profile.recurring_status,
              profile.price_per_user_monthly
                AS profile_price_per_user_monthly,
              profile.seat_quantity
                AS profile_seat_quantity
            FROM subscriptions s
            LEFT JOIN plans p
              ON p.id =
                 s.plan_id
             AND p.deleted_at
                 IS NULL
            LEFT JOIN LATERAL (
              SELECT
                sbp.provider,
                sbp.recurring_status,
                sbp.price_per_user_monthly,
                sbp.seat_quantity
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
            WHERE s.tenant_id =
                  t.id
              AND s.deleted_at
                  IS NULL
            ORDER BY
              s.created_at DESC,
              s.id DESC
            LIMIT 1
          ) current_subscription
            ON TRUE

          LEFT JOIN LATERAL (
            SELECT
              pt.id
                AS payment_id,
              pt.provider
                AS payment_provider,
              pt.provider_transaction_id
                AS payment_reference,
              pt.amount
                AS payment_amount,
              pt.currency
                AS payment_currency,
              pt.status
                AS payment_status,
              pt.created_at
                AS payment_created_at,
              pt.updated_at
                AS payment_updated_at
            FROM payment_transactions pt
            WHERE pt.tenant_id =
                  t.id
              AND (
                current_subscription.subscription_id
                  IS NULL
                OR pt.subscription_id =
                   current_subscription.subscription_id
              )
            ORDER BY
              pt.created_at DESC,
              pt.id DESC
            LIMIT 1
          ) latest_payment
            ON TRUE

          WHERE t.deleted_at
                IS NULL
            AND (
              $2::uuid IS NULL
              OR t.id =
                 $2::uuid
            )
            AND (
              $1::text IS NULL
              OR t.name
                   ILIKE $1
              OR t.slug
                   ILIKE $1
              OR owner_user.email
                   ILIKE $1
              OR COALESCE(
                   owner_user.full_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   owner_user.first_name,
                   ''
                 )
                   ILIKE $1
              OR COALESCE(
                   owner_user.last_name,
                   ''
                 )
                   ILIKE $1
              OR EXISTS (
                SELECT 1
                FROM tenant_users member
                INNER JOIN users member_user
                  ON member_user.id =
                     member.user_id
                 AND member_user.deleted_at
                     IS NULL
                WHERE member.tenant_id =
                      t.id
                  AND member.deleted_at
                      IS NULL
                  AND LOWER(
                        COALESCE(
                          member.member_type,
                          ''
                        )
                      ) =
                      'internal'
                  AND (
                    member_user.email
                      ILIKE $1
                    OR COALESCE(
                         member_user.full_name,
                         ''
                       )
                         ILIKE $1
                    OR COALESCE(
                         member_user.first_name,
                         ''
                       )
                         ILIKE $1
                    OR COALESCE(
                         member_user.last_name,
                         ''
                       )
                         ILIKE $1
                  )
              )
            )

          ORDER BY
            t.created_at DESC,
            t.id DESC

          LIMIT $3
          OFFSET $4
        `,
        [
          pattern,
          workspaceId,
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
        row => {
          const planKey =
            normalizeSamiPlanKey(
              row.plan_key
                ? String(
                    row.plan_key,
                  )
                : null,
            );

          const policy =
            planKey
              ? getSamiPlanPolicy(
                  planKey,
                )
              : null;

          const activeInternalUsers =
            Number(
              row.active_internal_users ||
              0,
            );

          const billableUsers =
            Math.max(
              1,
              activeInternalUsers,
            );

          const pricePerUserMonthly =
            planKey
              ? getSamiPricePerUserMonthly(
                  planKey,
                )
              : null;

          const expectedMonthlyAmount =
            planKey
              ? getSamiMonthlyAmount(
                  planKey,
                  billableUsers,
                )
              : null;

          const subscriptionStatus =
            row.subscription_status
              ? String(
                  row.subscription_status,
                )
              : null;

          const effectiveStatus =
            planKey &&
            subscriptionStatus
              ? getEffectiveSubscriptionStatus({
                  status:
                    subscriptionStatus,
                  planKey,
                  trialEndsAt:
                    row.trial_ends_at,
                  currentPeriodEnd:
                    row.current_period_end,
                  cancelledAt:
                    row.cancelled_at,
                })
              : 'missing';

          const latestPaymentStatus =
            row.payment_status
              ? String(
                  row.payment_status,
                )
                  .trim()
                  .toLowerCase()
              : null;

          let settlement:
            'free'
            | 'trial'
            | 'cleared'
            | 'pending'
            | 'due'
            | 'cancelled'
            | 'unknown' =
              'unknown';

          if (
            policy &&
            !policy.paid
          ) {
            settlement =
              'free';
          } else if (
            effectiveStatus ===
              'trial' ||
            effectiveStatus ===
              'trialing'
          ) {
            settlement =
              'trial';
          } else if (
            effectiveStatus ===
              'active'
          ) {
            settlement =
              'cleared';
          } else if (
            effectiveStatus ===
              'past_due'
          ) {
            settlement =
              latestPaymentStatus ===
                'pending' ||
              latestPaymentStatus ===
                'processing'
                ? 'pending'
                : 'due';
          } else if (
            effectiveStatus ===
              'cancelled' ||
            effectiveStatus ===
              'canceled'
          ) {
            settlement =
              'cancelled';
          }

          const rawMembers =
            Array.isArray(
              row.internal_members,
            )
              ? row.internal_members
              : [];

          return {
            workspace: {
              id:
                String(
                  row.tenant_id,
                ),
              name:
                String(
                  row.tenant_name ||
                  '',
                ),
              slug:
                String(
                  row.tenant_slug ||
                  '',
                ),
              status:
                String(
                  row.tenant_status ||
                  'unknown',
                ),
              createdAt:
                toIso(
                  row.tenant_created_at,
                ),
            },

            owner:
              row.owner_user_id
                ? {
                    userId:
                      String(
                        row.owner_user_id,
                      ),
                    email:
                      String(
                        row.owner_email ||
                        '',
                      ),
                    name:
                      String(
                        row.owner_full_name ||
                        [
                          row.owner_first_name,
                          row.owner_last_name,
                        ]
                          .filter(
                            Boolean,
                          )
                          .join(
                            ' ',
                          ) ||
                        row.owner_email ||
                        '',
                      ),
                    status:
                      String(
                        row.owner_user_status ||
                        'unknown',
                      ),
                    emailVerified:
                      Boolean(
                        row.owner_email_verified ||
                        row.owner_email_verified_at,
                      ),
                    twoFactorEnabled:
                      row.owner_two_factor_enabled ===
                      true,
                    lockedUntil:
                      toIso(
                        row.owner_locked_until,
                      ),
                    lastLoginAt:
                      toIso(
                        row.owner_last_login_at,
                      ),
                  }
                : null,

            users: {
              activeInternal:
                activeInternalUsers,
              billable:
                billableUsers,
              allInternal:
                rawMembers.map(
                  member => ({
                    id:
                      String(
                        member.id ||
                        '',
                      ),
                    name:
                      String(
                        member.name ||
                        member.email ||
                        '',
                      ),
                    email:
                      String(
                        member.email ||
                        '',
                      ),
                    status:
                      String(
                        member.status ||
                        'unknown',
                      ),
                    isOwner:
                      member.isOwner ===
                        true,
                    lastLoginAt:
                      toIso(
                        member.lastLoginAt ||
                        null,
                      ),
                  }),
                ),
            },

            subscription:
              row.subscription_id
                ? {
                    id:
                      String(
                        row.subscription_id,
                      ),
                    status:
                      effectiveStatus,
                    storedStatus:
                      subscriptionStatus ||
                      'unknown',
                    planKey,
                    planName:
                      row.plan_name
                        ? String(
                            row.plan_name,
                          )
                        : planKey,
                    billingCycle:
                      row.billing_cycle
                        ? String(
                            row.billing_cycle,
                          )
                        : null,
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
                    synchronizedPricePerUser:
                      row.profile_price_per_user_monthly ===
                        null ||
                      row.profile_price_per_user_monthly ===
                        undefined
                        ? null
                        : Number(
                            row.profile_price_per_user_monthly,
                          ),
                    synchronizedSeats:
                      row.profile_seat_quantity ===
                        null ||
                      row.profile_seat_quantity ===
                        undefined
                        ? null
                        : Number(
                            row.profile_seat_quantity,
                          ),
                  }
                : null,

            billing: {
              currency:
                'KES' as const,
              pricePerUserMonthly,
              expectedMonthlyAmount,
              settlement,
              cleared:
                settlement ===
                  'cleared' ||
                settlement ===
                  'free' ||
                settlement ===
                  'trial',
            },

            latestPayment:
              row.payment_id
                ? {
                    id:
                      String(
                        row.payment_id,
                      ),
                    provider:
                      row.payment_provider
                        ? String(
                            row.payment_provider,
                          )
                        : null,
                    reference:
                      row.payment_reference
                        ? String(
                            row.payment_reference,
                          )
                        : null,
                    amount:
                      Number(
                        row.payment_amount ||
                        0,
                      ),
                    currency:
                      String(
                        row.payment_currency ||
                        'KES',
                      ),
                    status:
                      String(
                        row.payment_status ||
                        'unknown',
                      ),
                    createdAt:
                      toIso(
                        row.payment_created_at,
                      ),
                    updatedAt:
                      toIso(
                        row.payment_updated_at,
                      ),
                  }
                : null,
          };
        },
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

            td.status
              AS database_status,
            td.health_status
              AS database_health_status,
            td.schema_version
              AS database_schema_version,
            td.last_health_check_at
              AS database_last_health_check_at,
            td.failure_code
              AS database_failure_code,

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

          LEFT JOIN tenant_databases td
            ON td.tenant_id =
               t.id

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
          database: {
            lifecycleStatus:
              row.database_status
                ? String(
                    row.database_status,
                  )
                : 'unregistered',
            healthStatus:
              row.database_health_status
                ? String(
                    row.database_health_status,
                  )
                : 'unknown',
            schemaVersion:
              row.database_schema_version
                ? String(
                    row.database_schema_version,
                  )
                : null,
            lastHealthCheckAt:
              toIso(
                row.database_last_health_check_at,
              ),
            failureCode:
              row.database_failure_code
                ? String(
                    row.database_failure_code,
                  )
                : null,
          },
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
                    (
                      value:
                        unknown,
                    ) =>
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


async function optionalControlQuery(
  sql:
    string,
  fallbackRow:
    Record<
      string,
      unknown
    >,
) {
  try {
    return await queryControl(
      sql,
    );
  } catch (
    error
  ) {
    const code =
      error &&
      typeof error ===
        'object' &&
      'code' in
        error
        ? String(
            (
              error as {
                code?:
                  unknown;
              }
            ).code ||
            '',
          )
        : '';

    if (
      code !==
        '42P01'
    ) {
      throw error;
    }

    return {
      rows: [
        fallbackRow,
      ],
    };
  }
}


export async function getAdminPlatformHealth() {
  const started =
    Date.now();

  const [
    nowResult,
    tenantCount,
    activeSubscriptions,
    registrationRequests,
    migrationStatus,
    tenantDatabaseHealth,
    incidents,
    failedJobs,
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

      getControlMigrationStatus(),

      queryControl(
        `
          SELECT
            COUNT(*)::int
              AS total,
            COUNT(*) FILTER (
              WHERE health_status =
                    'healthy'
            )::int
              AS healthy,
            COUNT(*) FILTER (
              WHERE health_status =
                    'degraded'
            )::int
              AS degraded,
            COUNT(*) FILTER (
              WHERE health_status =
                    'unreachable'
            )::int
              AS unreachable,
            COUNT(*) FILTER (
              WHERE health_status =
                    'maintenance'
            )::int
              AS maintenance,
            COUNT(*) FILTER (
              WHERE health_status IS NULL
                 OR health_status =
                    'unknown'
            )::int
              AS unknown
          FROM tenant_databases
        `,
      ),

      optionalControlQuery(
        `
          SELECT
            COUNT(*) FILTER (
              WHERE status =
                    'open'
            )::int
              AS open,
            COUNT(*) FILTER (
              WHERE status =
                    'acknowledged'
            )::int
              AS acknowledged,
            COUNT(*) FILTER (
              WHERE status IN (
                'open',
                'acknowledged'
              )
              AND severity =
                  'critical'
            )::int
              AS critical,
            COUNT(*) FILTER (
              WHERE status IN (
                'open',
                'acknowledged'
              )
              AND severity =
                  'error'
            )::int
              AS errors
          FROM platform_incidents
        `,
        {
          open:
            0,
          acknowledged:
            0,
          critical:
            0,
          errors:
            0,
        },
      ),

      optionalControlQuery(
        `
          SELECT
            COUNT(*)::int
              AS count
          FROM platform_job_runs
          WHERE status =
                'failed'
            AND created_at >=
                NOW() -
                INTERVAL '24 hours'
        `,
        {
          count:
            0,
        },
      ),
    ]);

  const elapsedMs =
    Date.now() -
    started;

  const registration =
    registrationRequests.rows[0] ||
    {};

  const databases =
    tenantDatabaseHealth.rows[0] ||
    {};

  const incidentCounts =
    incidents.rows[0] ||
    {};

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

    tenantDatabases: {
      total:
        Number(
          databases.total ||
          0,
        ),
      healthy:
        Number(
          databases.healthy ||
          0,
        ),
      degraded:
        Number(
          databases.degraded ||
          0,
        ),
      unreachable:
        Number(
          databases.unreachable ||
          0,
        ),
      maintenance:
        Number(
          databases.maintenance ||
          0,
        ),
      unknown:
        Number(
          databases.unknown ||
          0,
        ),
    },

    incidents: {
      open:
        Number(
          incidentCounts.open ||
          0,
        ),
      acknowledged:
        Number(
          incidentCounts.acknowledged ||
          0,
        ),
      critical:
        Number(
          incidentCounts.critical ||
          0,
        ),
      errors:
        Number(
          incidentCounts.errors ||
          0,
        ),
    },

    failedJobsLast24Hours:
      Number(
        failedJobs.rows[0]
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
      expectedCount:
        migrationStatus
          .expectedCount,
      appliedCount:
        migrationStatus
          .appliedCount,
      pendingCount:
        migrationStatus
          .pendingCount,
      latestExpected:
        migrationStatus
          .latestExpected
          ?.migrationKey ||
        null,
      latestApplied:
        migrationStatus
          .latestApplied
          ?.migrationKey ||
        null,
      latestAppliedAt:
        migrationStatus
          .latestApplied
          ?.appliedAt ||
        null,
      pending:
        migrationStatus
          .pending,
      ready:
        migrationStatus
          .pendingCount ===
        0,
    },
  };
}


export async function listAdminJobRuns(
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
          FROM platform_job_runs j
          WHERE (
            $1::text IS NULL
            OR j.job_key
                 ILIKE $1
            OR COALESCE(
                 j.status,
                 ''
               )
                 ILIKE $1
            OR COALESCE(
                 j.provider,
                 ''
               )
                 ILIKE $1
            OR COALESCE(
                 j.error_code,
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
            j.id,
            j.job_key,
            j.status,
            j.correlation_id,
            j.trigger_type,
            j.provider,
            j.tenant_id,
            j.started_at,
            j.finished_at,
            j.duration_ms,
            j.error_code,
            j.error_message,
            j.created_at,
            t.name
              AS tenant_name
          FROM platform_job_runs j
          LEFT JOIN tenants t
            ON t.id =
               j.tenant_id
          WHERE (
            $1::text IS NULL
            OR j.job_key
                 ILIKE $1
            OR COALESCE(
                 j.status,
                 ''
               )
                 ILIKE $1
            OR COALESCE(
                 j.provider,
                 ''
               )
                 ILIKE $1
            OR COALESCE(
                 j.error_code,
                 ''
               )
                 ILIKE $1
          )
          ORDER BY
            j.created_at DESC,
            j.id DESC
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

  const total =
    Number(
      countResult.rows[0]
        ?.count ||
      0,
    );

  return {
    page,
    limit,
    total,
    totalPages:
      Math.max(
        1,
        Math.ceil(
          total /
          limit,
        ),
      ),
    items:
      rowsResult.rows.map(
        row => ({
          id:
            String(
              row.id,
            ),
          jobKey:
            String(
              row.job_key,
            ),
          status:
            String(
              row.status,
            ),
          correlationId:
            String(
              row.correlation_id,
            ),
          triggerType:
            row.trigger_type
              ? String(
                  row.trigger_type,
                )
              : null,
          provider:
            row.provider
              ? String(
                  row.provider,
                )
              : null,
          tenantId:
            row.tenant_id
              ? String(
                  row.tenant_id,
                )
              : null,
          tenantName:
            row.tenant_name
              ? String(
                  row.tenant_name,
                )
              : null,
          startedAt:
            toIso(
              row.started_at,
            ),
          finishedAt:
            toIso(
              row.finished_at,
            ),
          durationMs:
            row.duration_ms ===
              null ||
            row.duration_ms ===
              undefined
              ? null
              : Number(
                  row.duration_ms,
                ),
          errorCode:
            row.error_code
              ? String(
                  row.error_code,
                )
              : null,
          errorMessage:
            row.error_message
              ? String(
                  row.error_message,
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
