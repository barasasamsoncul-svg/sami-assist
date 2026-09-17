import {
  queryControl,
} from '@/lib/db/control';


/* ============================================================
   TYPES
   ============================================================ */

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  status: string;
  emailVerified: boolean;
}


export interface TenantContext {
  id: string;
  name: string;
  slug: string;
  status: string;

  deletionRequestedAt:
    string | null;

  deletionScheduledFor:
    string | null;

  deletionCancelledAt:
    string | null;
}


export interface TenantOwnerContext {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  roleKey: string | null;
  roleName: string | null;
}


export interface MembershipContext {
  userId: string;
  tenantId: string;
  status: string;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';

  isOwner: boolean;
  isAdmin: boolean;
  label: string;
}


export interface SubscriptionContext {
  id: string;
  status: string;
  billingCycle: string | null;
  startedAt: string | null;
  trialEndsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  planKey: string | null;
  planName: string | null;
}


export interface RoleContext {
  id: string;
  key: string | null;
  name: string;
}


export interface ModuleContext {
  key: string;
  name: string;
  status: string;
}


export interface TenantDatabaseContext {
  id: string;
  databaseName: string;
  databaseHost: string | null;
  databasePort: number | null;
  status: string;
  provisionedAt: string | null;
}


export interface AccountContext {
  tenant:
    TenantContext | null;

  owner:
    TenantOwnerContext | null;

  membership:
    MembershipContext | null;

  subscription:
    SubscriptionContext | null;

  role:
    RoleContext | null;

  modules:
    ModuleContext[];

  database:
    TenantDatabaseContext | null;
}


export interface LoginValidationResult {
  allowed: boolean;
  httpStatus: number;
  code: string;
  message: string;
  next?: string;
}


type PrimaryTenantSelection = {
  tenant:
    TenantContext;

  membershipStatus:
    string;

  membershipIsOwner:
    boolean;
};


/* ============================================================
   HELPERS
   ============================================================ */

function normalizeStatus(
  value:
    unknown,
): string {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}


function toIsoString(
  value:
    unknown,
): string | null {
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
          String(
            value,
          ),
        );

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }

  return date.toISOString();
}


function toNullablePort(
  value:
    unknown,
): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const port =
    Number(
      value,
    );

  if (
    !Number.isInteger(
      port,
    ) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  return port;
}


/* ============================================================
   WORKSPACE LIFECYCLE FINALIZATION

   Scheduled workspace closure is soft deletion.

   The first authenticated access after the grace deadline
   atomically:

   - marks the workspace deleted
   - records deleted_at
   - writes a system audit event

   Physical tenant-data destruction is deliberately NOT done
   here.
   ============================================================ */

async function finalizeDueWorkspaceClosuresForUser(
  userId:
    string,
): Promise<void> {
  await queryControl(
    `
      WITH due_workspaces AS (
        SELECT DISTINCT
          t.id
        FROM tenants t

        INNER JOIN tenant_users tu
          ON tu.tenant_id =
             t.id

        WHERE tu.user_id = $1
          AND tu.deleted_at IS NULL
          AND t.deleted_at IS NULL

          AND t.deletion_requested_at
              IS NOT NULL

          AND t.deletion_scheduled_for
              IS NOT NULL

          AND t.deletion_scheduled_for
              <= NOW()

          AND t.deletion_cancelled_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) IN (
            'active',
            'deletion_pending'
          )
      ),

      closed_workspaces AS (
        UPDATE tenants t

        SET
          status =
            'deleted',

          deleted_at =
            NOW(),

          updated_at =
            NOW()

        FROM due_workspaces due

        WHERE t.id =
              due.id

          AND t.deleted_at
              IS NULL

        RETURNING
          t.id,
          t.deletion_requested_by,
          t.deletion_requested_at,
          t.deletion_scheduled_for
      )

      INSERT INTO audit_logs (
        tenant_id,
        user_id,
        actor_type,
        action,
        resource_type,
        resource_id,
        module,
        result,
        metadata,
        correlation_id,
        event_type,
        entity_type,
        entity_id,
        created_at
      )

      SELECT
        closed.id,

        closed.deletion_requested_by,

        'system',

        'workspace.closed',

        'workspace',

        closed.id,

        'workspace',

        'success',

        jsonb_build_object(
          'reason',
          'scheduled_workspace_closure',

          'requestedAt',
          closed.deletion_requested_at,

          'scheduledFor',
          closed.deletion_scheduled_for,

          'closedAt',
          NOW()
        ),

        gen_random_uuid(),

        'workspace.closed',

        'workspace',

        closed.id,

        NOW()

      FROM closed_workspaces
        AS closed
    `,
    [
      userId,
    ],
  );
}


/* ============================================================
   USER LOOKUP
   ============================================================ */

export async function findUserForLogin(
  email:
    string,
): Promise<AuthUserRecord | null> {
  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  if (
    !normalizedEmail
  ) {
    return null;
  }

  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          password_hash,
          full_name,
          first_name,
          last_name,
          avatar_file_id,
          status,
          email_verified,
          email_verified_at

        FROM users

        WHERE LOWER(email) = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        normalizedEmail,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    id:
      row.id,

    email:
      row.email,

    passwordHash:
      row.password_hash ||
      null,

    fullName:
      row.full_name ||
      '',

    firstName:
      row.first_name ||
      '',

    lastName:
      row.last_name ||
      '',

    avatarFileId:
      row.avatar_file_id ||
      null,

    status:
      row.status ||
      'unknown',

    emailVerified:
      row.email_verified ===
        true ||
      Boolean(
        row.email_verified_at,
      ),
  };
}


/* ============================================================
   MAIN ACCOUNT CONTEXT
   ============================================================ */

export async function getAccountContextForUser(
  userId:
    string,
): Promise<AccountContext> {
  /*
   * Enforce due workspace closures before choosing the
   * workspace that will become the user's current context.
   */
  await finalizeDueWorkspaceClosuresForUser(
    userId,
  );


  const primary =
    await getPrimaryTenant(
      userId,
    );


  if (
    !primary
  ) {
    return {
      tenant:
        null,

      owner:
        null,

      membership:
        null,

      subscription:
        null,

      role:
        null,

      modules:
        [],

      database:
        null,
    };
  }


  const tenant =
    primary.tenant;


  const [
    subscription,
    role,
    modules,
    database,
    owner,
  ] =
    await Promise.all([
      getTenantSubscription(
        tenant.id,
      ),

      getUserRole(
        userId,
        tenant.id,
      ),

      getTenantModules(
        tenant.id,
      ),

      getTenantDatabase(
        tenant.id,
      ),

      getTenantOwner(
        tenant.id,
      ),
    ]);


  const membership =
    buildMembershipContext({
      userId,

      tenant,

      role,

      membershipStatus:
        primary
          .membershipStatus,

      membershipIsOwner:
        primary
          .membershipIsOwner,
    });


  return {
    tenant,

    owner,

    membership,

    subscription,

    role,

    modules,

    database,
  };
}


/* ============================================================
   PRIMARY TENANT / MEMBERSHIP
   ============================================================ */

async function getPrimaryTenant(
  userId:
    string,
): Promise<PrimaryTenantSelection | null> {
  const result =
    await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.status,

          t.deletion_requested_at,
          t.deletion_scheduled_for,
          t.deletion_cancelled_at,

          tu.status
            AS membership_status,

          tu.is_owner
            AS membership_is_owner

        FROM tenant_users tu

        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id

        LEFT JOIN user_roles ur
          ON ur.user_id =
             tu.user_id

         AND ur.tenant_id =
             tu.tenant_id

         AND ur.deleted_at
             IS NULL

        LEFT JOIN roles r
          ON r.id =
             ur.role_id

         AND r.deleted_at
             IS NULL

        WHERE tu.user_id = $1

          AND tu.deleted_at
              IS NULL

          AND t.deleted_at
              IS NULL

        ORDER BY

          /*
           * Prefer a usable active workspace before a workspace
           * that is provisioning, suspended or otherwise
           * unavailable.
           */
          CASE
            WHEN LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) = 'active'
            THEN 0

            WHEN LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) = 'provisioning'
            THEN 1

            ELSE 2
          END ASC,

          /*
           * Prefer an active membership.
           */
          CASE
            WHEN LOWER(
              COALESCE(
                tu.status,
                ''
              )
            ) = 'active'
            THEN 0

            ELSE 1
          END ASC,

          /*
           * Ownership is authoritative from is_owner.
           */
          CASE
            WHEN tu.is_owner =
                 TRUE
            THEN 0

            WHEN LOWER(
              COALESCE(
                r.key,
                r.name,
                ''
              )
            ) LIKE '%admin%'
            THEN 1

            ELSE 2
          END ASC,

          tu.created_at
            ASC

        LIMIT 1
      `,
      [
        userId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    tenant: {
      id:
        row.id,

      name:
        row.name ||
        '',

      slug:
        row.slug ||
        '',

      status:
        row.status ||
        'unknown',

      deletionRequestedAt:
        toIsoString(
          row.deletion_requested_at,
        ),

      deletionScheduledFor:
        toIsoString(
          row.deletion_scheduled_for,
        ),

      deletionCancelledAt:
        toIsoString(
          row.deletion_cancelled_at,
        ),
    },

    membershipStatus:
      row.membership_status ||
      'unknown',

    membershipIsOwner:
      row.membership_is_owner ===
      true,
  };
}


/* ============================================================
   OWNER
   ============================================================ */

async function getTenantOwner(
  tenantId:
    string,
): Promise<TenantOwnerContext | null> {
  const result =
    await queryControl(
      `
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.first_name,
          u.last_name,

          r.key
            AS role_key,

          r.name
            AS role_name

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        LEFT JOIN user_roles ur
          ON ur.user_id =
             tu.user_id

         AND ur.tenant_id =
             tu.tenant_id

         AND ur.deleted_at
             IS NULL

        LEFT JOIN roles r
          ON r.id =
             ur.role_id

         AND r.deleted_at
             IS NULL

        WHERE tu.tenant_id = $1

          AND tu.is_owner =
              TRUE

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND tu.deleted_at
              IS NULL

          AND u.deleted_at
              IS NULL

        ORDER BY
          CASE
            WHEN LOWER(
              COALESCE(
                r.key,
                r.name,
                ''
              )
            ) LIKE '%admin%'
            THEN 0

            ELSE 1
          END ASC,

          tu.created_at
            ASC

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    id:
      row.id,

    email:
      row.email,

    fullName:
      row.full_name ||
      '',

    firstName:
      row.first_name ||
      '',

    lastName:
      row.last_name ||
      '',

    roleKey:
      row.role_key ||
      null,

    roleName:
      row.role_name ||
      null,
  };
}


/* ============================================================
   MEMBERSHIP / ACCESS LEVEL
   ============================================================ */

function buildMembershipContext(
  params: {
    userId: string;
    tenant: TenantContext;
    role: RoleContext | null;
    membershipStatus: string;
    membershipIsOwner: boolean;
  },
): MembershipContext {
  const roleText =
    [
      params.role?.key ||
        '',

      params.role?.name ||
        '',
    ]
      .join(
        ' ',
      )
      .toLowerCase();


  const isOwner =
    params
      .membershipIsOwner ===
    true;


  const roleSaysAdmin =
    roleText.includes(
      'admin',
    );


  const isAdmin =
    isOwner ||
    roleSaysAdmin;


  const accessLevel:
    | 'owner'
    | 'admin'
    | 'member' =
    isOwner
      ? 'owner'
      : isAdmin
        ? 'admin'
        : 'member';


  const label =
    accessLevel ===
      'owner'
      ? 'Workspace Owner'
      : accessLevel ===
          'admin'
        ? 'Workspace Admin'
        : 'Workspace Member';


  return {
    userId:
      params.userId,

    tenantId:
      params.tenant.id,

    status:
      params.membershipStatus ||
      'unknown',

    accessLevel,

    isOwner,

    isAdmin,

    label,
  };
}


/* ============================================================
   SUBSCRIPTION
   ============================================================ */

async function getTenantSubscription(
  tenantId:
    string,
): Promise<SubscriptionContext | null> {
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

        WHERE s.tenant_id = $1
          AND s.deleted_at IS NULL

        ORDER BY
          s.created_at DESC

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    id:
      row.id,

    status:
      row.status ||
      'unknown',

    billingCycle:
      row.billing_cycle ||
      null,

    startedAt:
      toIsoString(
        row.started_at,
      ),

    trialEndsAt:
      toIsoString(
        row.trial_ends_at,
      ),

    currentPeriodStart:
      toIsoString(
        row.current_period_start,
      ),

    currentPeriodEnd:
      toIsoString(
        row.current_period_end,
      ),

    planKey:
      row.plan_key ||
      null,

    planName:
      row.plan_name ||
      null,
  };
}


/* ============================================================
   ROLE
   ============================================================ */

async function getUserRole(
  userId:
    string,

  tenantId:
    string,
): Promise<RoleContext | null> {
  const result =
    await queryControl(
      `
        SELECT
          r.id,
          r.key,
          r.name

        FROM user_roles ur

        INNER JOIN roles r
          ON r.id =
             ur.role_id

        WHERE ur.user_id = $1

          AND ur.tenant_id = $2

          AND ur.deleted_at
              IS NULL

          AND r.deleted_at
              IS NULL

        ORDER BY
          CASE
            WHEN LOWER(
              COALESCE(
                r.key,
                r.name,
                ''
              )
            ) IN (
              'owner',
              'business_owner',
              'workspace_owner',
              'founder'
            )
            THEN 0

            WHEN LOWER(
              COALESCE(
                r.key,
                r.name,
                ''
              )
            ) LIKE '%admin%'
            THEN 1

            ELSE 2
          END ASC,

          ur.created_at
            ASC

        LIMIT 1
      `,
      [
        userId,
        tenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    id:
      row.id,

    key:
      row.key ||
      null,

    name:
      row.name ||
      '',
  };
}


/* ============================================================
   MODULES
   ============================================================ */

async function getTenantModules(
  tenantId:
    string,
): Promise<ModuleContext[]> {
  const result =
    await queryControl(
      `
        SELECT
          m.key,
          m.name,
          tm.status

        FROM tenant_modules tm

        INNER JOIN modules m
          ON m.id =
             tm.module_id

        WHERE tm.tenant_id = $1

          AND tm.deleted_at
              IS NULL

          AND m.deleted_at
              IS NULL

        ORDER BY
          m.name ASC
      `,
      [
        tenantId,
      ],
    );


  return result.rows.map(
    (
      row:
        Record<
          string,
          unknown
        >,
    ) => ({
      key:
        typeof row.key ===
          'string'
          ? row.key
          : '',

      name:
        typeof row.name ===
          'string' &&
        row.name
          ? row.name
          : typeof row.key ===
              'string'
            ? row.key
            : '',

      status:
        typeof row.status ===
          'string'
          ? row.status
          : 'unknown',
    }),
  );
}


/* ============================================================
   DATABASE
   ============================================================ */

async function getTenantDatabase(
  tenantId:
    string,
): Promise<TenantDatabaseContext | null> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          database_name,
          database_host,
          database_port,
          status,
          provisioned_at

        FROM tenant_databases

        WHERE tenant_id = $1

        ORDER BY
          created_at DESC

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  const row =
    result.rows[0];


  return {
    id:
      row.id,

    databaseName:
      row.database_name ||
      '',

    databaseHost:
      row.database_host ||
      null,

    databasePort:
      toNullablePort(
        row.database_port,
      ),

    status:
      row.status ||
      'unknown',

    provisionedAt:
      toIsoString(
        row.provisioned_at,
      ),
  };
}


/* ============================================================
   LOGIN VALIDATION
   ============================================================ */

export function validateAccountCanLogin(
  user:
    AuthUserRecord,

  context:
    AccountContext,
): LoginValidationResult {
  const userStatus =
    normalizeStatus(
      user.status,
    );


  /* ----------------------------------------------------------
     EMAIL VERIFICATION
     ---------------------------------------------------------- */

  if (
    userStatus ===
      'pending_verification' ||
    !user.emailVerified
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'EMAIL_NOT_VERIFIED',

      message:
        'Please verify your email address before signing in.',

      next:
        'verify-email',
    };
  }


  /* ----------------------------------------------------------
     USER STATUS
     ---------------------------------------------------------- */

  if (
    userStatus ===
    'locked'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'ACCOUNT_LOCKED',

      message:
        'This account is locked. Please reset your password or contact support.',
    };
  }


  if (
    [
      'suspended',
      'disabled',
      'deleted',
      'cancelled',
      'banned',
    ].includes(
      userStatus,
    )
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'ACCOUNT_UNAVAILABLE',

      message:
        'This account is not currently available for sign in.',
    };
  }


  if (
    userStatus !==
    'active'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'ACCOUNT_NOT_ACTIVE',

      message:
        'Your account is not active yet.',
    };
  }


  /* ----------------------------------------------------------
     TENANT
     ---------------------------------------------------------- */

  if (
    !context.tenant
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'TENANT_NOT_FOUND',

      message:
        'Your account is not linked to an available workspace.',
    };
  }


  /* ----------------------------------------------------------
     MEMBERSHIP
     ---------------------------------------------------------- */

  if (
    !context.membership
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'MEMBERSHIP_NOT_FOUND',

      message:
        'Your account does not have access to this workspace.',
    };
  }


  const membershipStatus =
    normalizeStatus(
      context.membership
        .status,
    );


  if (
    membershipStatus !==
    'active'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'MEMBERSHIP_NOT_ACTIVE',

      message:
        'Your workspace access is not currently active.',
    };
  }


  /* ----------------------------------------------------------
     TENANT LIFECYCLE
     ---------------------------------------------------------- */

  const tenantStatus =
    normalizeStatus(
      context.tenant
        .status,
    );


  /*
   * Defensive closure deadline check.
   *
   * Normally getAccountContextForUser() already finalizes the
   * closure before this function runs.
   */
  if (
    context.tenant
      .deletionScheduledFor &&
    !context.tenant
      .deletionCancelledAt
  ) {
    const scheduledFor =
      new Date(
        context.tenant
          .deletionScheduledFor,
      );

    if (
      !Number.isNaN(
        scheduledFor.getTime(),
      ) &&
      scheduledFor.getTime() <=
        Date.now()
    ) {
      return {
        allowed:
          false,

        httpStatus:
          403,

        code:
          'WORKSPACE_CLOSED',

        message:
          'This workspace is no longer available.',
      };
    }
  }


  if (
    tenantStatus ===
    'provisioning'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'TENANT_PROVISIONING',

      message:
        'Your workspace is still being prepared. Please try again shortly.',
    };
  }


  if (
    tenantStatus ===
    'provisioning_failed'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'TENANT_PROVISIONING_FAILED',

      message:
        'Your workspace setup could not be completed. Please contact support.',
    };
  }


  if (
    tenantStatus ===
    'pending_payment'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'TENANT_NOT_ACTIVE',

      message:
        'This workspace is not ready for access yet.',
    };
  }


  if (
    [
      'deleted',
      'cancelled',
      'disabled',
      'suspended',
      'archived',
    ].includes(
      tenantStatus,
    )
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'TENANT_NOT_ACTIVE',

      message:
        'This workspace is not currently available.',
    };
  }


  if (
    tenantStatus !==
    'active'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        403,

      code:
        'TENANT_NOT_ACTIVE',

      message:
        'This workspace is not active.',
    };
  }


  /* ----------------------------------------------------------
     PHYSICAL WORKSPACE DATABASE
     ---------------------------------------------------------- */

  if (
    !context.database ||
    normalizeStatus(
      context.database
        .status,
    ) !==
      'active'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'WORKSPACE_NOT_READY',

      message:
        'Your workspace is not ready yet. Please try again shortly.',
    };
  }


  /* ----------------------------------------------------------
     SUBSCRIPTION
     ---------------------------------------------------------- */

  if (
    !context.subscription
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'SUBSCRIPTION_NOT_FOUND',

      message:
        'Your workspace subscription is not configured yet.',
    };
  }


  const subscriptionStatus =
    normalizeStatus(
      context.subscription
        .status,
    );


  if (
    [
      'trialing',
      'active',
      'past_due',
    ].includes(
      subscriptionStatus,
    )
  ) {
    return {
      allowed:
        true,

      httpStatus:
        200,

      code:
        'OK',

      message:
        'Login allowed.',
    };
  }


  if (
    subscriptionStatus ===
    'pending'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'SUBSCRIPTION_PENDING',

      message:
        'Your workspace subscription is still being prepared.',
    };
  }


  if (
    subscriptionStatus ===
    'provisioning_failed'
  ) {
    return {
      allowed:
        false,

      httpStatus:
        409,

      code:
        'SUBSCRIPTION_SETUP_FAILED',

      message:
        'Your workspace subscription setup could not be completed.',
    };
  }


  if (
    [
      'pending_payment',
      'cancelled',
      'expired',
      'failed',
      'unpaid',
    ].includes(
      subscriptionStatus,
    )
  ) {
    return {
      allowed:
        false,

      httpStatus:
        402,

      code:
        'SUBSCRIPTION_NOT_ACTIVE',

      message:
        'Your workspace subscription is not currently active.',
    };
  }


  return {
    allowed:
      false,

    httpStatus:
      403,

    code:
      'SUBSCRIPTION_NOT_ACTIVE',

    message:
      'Your workspace subscription is not currently active.',
  };
}