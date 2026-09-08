import { queryControl } from '@/lib/db/control';

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
  accessLevel: 'owner' | 'admin' | 'member';
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
  tenant: TenantContext | null;
  owner: TenantOwnerContext | null;
  membership: MembershipContext | null;
  subscription: SubscriptionContext | null;
  role: RoleContext | null;
  modules: ModuleContext[];
  database: TenantDatabaseContext | null;
}

export interface LoginValidationResult {
  allowed: boolean;
  httpStatus: number;
  code: string;
  message: string;
  next?: string;
}

type PrimaryTenantSelection = {
  tenant: TenantContext;
  membershipStatus: string;
  membershipIsOwner: boolean;
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeStatus(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function toIsoString(value: unknown): string | null {
  if (!value) {
    return null;
  }

  const date =
    value instanceof Date
      ? value
      : new Date(String(value));

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function toNullablePort(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const port = Number(value);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    return null;
  }

  return port;
}

/* ============================================================
   USER LOOKUP
   ============================================================ */

export async function findUserForLogin(
  email: string
): Promise<AuthUserRecord | null> {
  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  if (!normalizedEmail) {
    return null;
  }

  const result = await queryControl(
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
    [normalizedEmail]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    email: row.email,
    passwordHash:
      row.password_hash || null,
    fullName:
      row.full_name || '',
    firstName:
      row.first_name || '',
    lastName:
      row.last_name || '',
    avatarFileId:
      row.avatar_file_id || null,
    status:
      row.status || 'unknown',
    emailVerified:
      row.email_verified === true ||
      Boolean(row.email_verified_at),
  };
}

/* ============================================================
   MAIN ACCOUNT CONTEXT
   ============================================================ */

export async function getAccountContextForUser(
  userId: string
): Promise<AccountContext> {
  const primary =
    await getPrimaryTenant(
      userId
    );

  if (!primary) {
    return {
      tenant: null,
      owner: null,
      membership: null,
      subscription: null,
      role: null,
      modules: [],
      database: null,
    };
  }

  const tenant =
    primary.tenant;

  /*
   * These records are all part of the login/account context.
   *
   * We intentionally let database/query failures propagate to
   * the caller rather than silently converting an authorization
   * failure into "member", "no subscription" or "no modules".
   *
   * The login route already catches unexpected failures and
   * returns a generic authentication error.
   */
  const [
    subscription,
    role,
    modules,
    database,
    owner,
  ] = await Promise.all([
    getTenantSubscription(
      tenant.id
    ),

    getUserRole(
      userId,
      tenant.id
    ),

    getTenantModules(
      tenant.id
    ),

    getTenantDatabase(
      tenant.id
    ),

    getTenantOwner(
      tenant.id
    ),
  ]);

  const membership =
    buildMembershipContext({
      userId,
      tenant,
      role,
      membershipStatus:
        primary.membershipStatus,
      membershipIsOwner:
        primary.membershipIsOwner,
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

/**
 * SaMi will support users belonging to multiple workspaces.
 *
 * Until a dedicated workspace-selection context is introduced,
 * this function deterministically chooses the most appropriate
 * membership:
 *
 * 1. active membership
 * 2. owner membership
 * 3. admin membership
 * 4. earliest membership
 *
 * Ownership comes from tenant_users.is_owner, not from a role
 * name.
 */
async function getPrimaryTenant(
  userId: string
): Promise<PrimaryTenantSelection | null> {
  const result = await queryControl(
    `
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status,

        tu.status AS membership_status,
        tu.is_owner AS membership_is_owner

      FROM tenant_users tu

      INNER JOIN tenants t
        ON t.id = tu.tenant_id

      LEFT JOIN user_roles ur
        ON ur.user_id = tu.user_id
       AND ur.tenant_id = tu.tenant_id
       AND ur.deleted_at IS NULL

      LEFT JOIN roles r
        ON r.id = ur.role_id
       AND r.deleted_at IS NULL

      WHERE tu.user_id = $1
        AND tu.deleted_at IS NULL
        AND t.deleted_at IS NULL

      ORDER BY
        CASE
          WHEN LOWER(COALESCE(tu.status, '')) = 'active'
          THEN 0
          ELSE 1
        END ASC,

        CASE
          WHEN tu.is_owner = TRUE
          THEN 0

          WHEN LOWER(COALESCE(r.key, r.name, '')) LIKE '%admin%'
          THEN 1

          ELSE 2
        END ASC,

        tu.created_at ASC

      LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    tenant: {
      id: row.id,
      name:
        row.name || '',
      slug:
        row.slug || '',
      status:
        row.status ||
        'unknown',
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

/**
 * Workspace ownership is authoritative from:
 *
 *   tenant_users.is_owner = TRUE
 *
 * Do not infer the owner from:
 *
 * - role names
 * - first admin
 * - earliest user
 *
 * Registration currently creates the owner membership with
 * is_owner = TRUE even though the initial role may be "admin".
 */
async function getTenantOwner(
  tenantId: string
): Promise<TenantOwnerContext | null> {
  const result = await queryControl(
    `
      SELECT
        u.id,
        u.email,
        u.full_name,
        u.first_name,
        u.last_name,

        r.key AS role_key,
        r.name AS role_name

      FROM tenant_users tu

      INNER JOIN users u
        ON u.id = tu.user_id

      LEFT JOIN user_roles ur
        ON ur.user_id = tu.user_id
       AND ur.tenant_id = tu.tenant_id
       AND ur.deleted_at IS NULL

      LEFT JOIN roles r
        ON r.id = ur.role_id
       AND r.deleted_at IS NULL

      WHERE tu.tenant_id = $1
        AND tu.is_owner = TRUE
        AND tu.deleted_at IS NULL
        AND u.deleted_at IS NULL

      ORDER BY
        CASE
          WHEN LOWER(COALESCE(r.key, r.name, '')) LIKE '%admin%'
          THEN 0
          ELSE 1
        END ASC,

        tu.created_at ASC

      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    id: row.id,
    email: row.email,
    fullName:
      row.full_name || '',
    firstName:
      row.first_name || '',
    lastName:
      row.last_name || '',
    roleKey:
      row.role_key || null,
    roleName:
      row.role_name || null,
  };
}

/* ============================================================
   MEMBERSHIP / ACCESS LEVEL
   ============================================================ */

function buildMembershipContext(params: {
  userId: string;
  tenant: TenantContext;
  role: RoleContext | null;
  membershipStatus: string;
  membershipIsOwner: boolean;
}): MembershipContext {
  const roleText = [
    params.role?.key || '',
    params.role?.name || '',
  ]
    .join(' ')
    .toLowerCase();

  const isOwner =
    params.membershipIsOwner ===
    true;

  const roleSaysAdmin =
    roleText.includes(
      'admin'
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
  tenantId: string
): Promise<SubscriptionContext | null> {
  const result = await queryControl(
    `
      SELECT
        s.id,
        s.status,
        s.billing_cycle,
        s.started_at,
        s.trial_ends_at,
        s.current_period_start,
        s.current_period_end,

        p.key AS plan_key,
        p.name AS plan_name

      FROM subscriptions s

      LEFT JOIN plans p
        ON p.id = s.plan_id
       AND p.deleted_at IS NULL

      WHERE s.tenant_id = $1
        AND s.deleted_at IS NULL

      ORDER BY
        s.created_at DESC

      LIMIT 1
    `,
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    id: row.id,

    status:
      row.status ||
      'unknown',

    billingCycle:
      row.billing_cycle ||
      null,

    startedAt:
      toIsoString(
        row.started_at
      ),

    trialEndsAt:
      toIsoString(
        row.trial_ends_at
      ),

    currentPeriodStart:
      toIsoString(
        row.current_period_start
      ),

    currentPeriodEnd:
      toIsoString(
        row.current_period_end
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
  userId: string,
  tenantId: string
): Promise<RoleContext | null> {
  const result = await queryControl(
    `
      SELECT
        r.id,
        r.key,
        r.name

      FROM user_roles ur

      INNER JOIN roles r
        ON r.id = ur.role_id

      WHERE ur.user_id = $1
        AND ur.tenant_id = $2
        AND ur.deleted_at IS NULL
        AND r.deleted_at IS NULL

      ORDER BY
        CASE
          WHEN LOWER(COALESCE(r.key, r.name, '')) IN (
            'owner',
            'business_owner',
            'workspace_owner',
            'founder'
          ) THEN 0

          WHEN LOWER(COALESCE(r.key, r.name, '')) LIKE '%admin%'
          THEN 1

          ELSE 2
        END ASC,

        ur.created_at ASC

      LIMIT 1
    `,
    [
      userId,
      tenantId,
    ]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    id: row.id,
    key:
      row.key || null,
    name:
      row.name || '',
  };
}

/* ============================================================
   MODULES
   ============================================================ */

async function getTenantModules(
  tenantId: string
): Promise<ModuleContext[]> {
  const result = await queryControl(
    `
      SELECT
        m.key,
        m.name,
        tm.status

      FROM tenant_modules tm

      INNER JOIN modules m
        ON m.id = tm.module_id

      WHERE tm.tenant_id = $1
        AND tm.deleted_at IS NULL
        AND m.deleted_at IS NULL

      ORDER BY
        m.name ASC
    `,
    [tenantId]
  );

  return result.rows.map(
    (row: Record<string, unknown>) => ({
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
    })
  );
}

/* ============================================================
   DATABASE
   ============================================================ */

async function getTenantDatabase(
  tenantId: string
): Promise<TenantDatabaseContext | null> {
  const result = await queryControl(
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
    [tenantId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row =
    result.rows[0];

  return {
    id: row.id,

    databaseName:
      row.database_name ||
      '',

    databaseHost:
      row.database_host ||
      null,

    databasePort:
      toNullablePort(
        row.database_port
      ),

    status:
      row.status ||
      'unknown',

    provisionedAt:
      toIsoString(
        row.provisioned_at
      ),
  };
}

/* ============================================================
   LOGIN VALIDATION
   ============================================================ */

/**
 * This validation determines whether login may proceed into the
 * normal SaMi workspace.
 *
 * Billing policy:
 *
 * - Free plan:
 *     active subscription
 *
 * - Standard / Custom:
 *     trialing during the first free calendar month
 *
 * - KES 0 is due at signup
 *
 * - No PesaPal transaction is required during signup
 *
 * - past_due may still be allowed during billing grace handling
 *
 * Billing/entitlement enforcement remains authoritative in the
 * billing and entitlement layers. Login must not reintroduce the
 * old "pay before workspace access" signup model.
 */
export function validateAccountCanLogin(
  user: AuthUserRecord,
  context: AccountContext
): LoginValidationResult {
  const userStatus =
    normalizeStatus(
      user.status
    );

  /* ----------------------------------------------------------
     Email verification
     ---------------------------------------------------------- */

  if (
    userStatus ===
      'pending_verification' ||
    !user.emailVerified
  ) {
    return {
      allowed: false,
      httpStatus: 403,
      code:
        'EMAIL_NOT_VERIFIED',
      message:
        'Please verify your email address before signing in.',
      next:
        'verify-email',
    };
  }

  /* ----------------------------------------------------------
     User status
     ---------------------------------------------------------- */

  if (
    userStatus ===
    'locked'
  ) {
    return {
      allowed: false,
      httpStatus: 403,
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
      userStatus
    )
  ) {
    return {
      allowed: false,
      httpStatus: 403,
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
      allowed: false,
      httpStatus: 403,
      code:
        'ACCOUNT_NOT_ACTIVE',
      message:
        'Your account is not active yet.',
    };
  }

  /* ----------------------------------------------------------
     Tenant
     ---------------------------------------------------------- */

  if (!context.tenant) {
    return {
      allowed: false,
      httpStatus: 409,
      code:
        'TENANT_NOT_FOUND',
      message:
        'Your account is not linked to a business workspace yet.',
    };
  }

  /* ----------------------------------------------------------
     Membership
     ---------------------------------------------------------- */

  if (!context.membership) {
    return {
      allowed: false,
      httpStatus: 403,
      code:
        'MEMBERSHIP_NOT_FOUND',
      message:
        'Your account does not have access to this workspace.',
    };
  }

  const membershipStatus =
    normalizeStatus(
      context.membership
        .status
    );

  if (
    membershipStatus !==
    'active'
  ) {
    return {
      allowed: false,
      httpStatus: 403,
      code:
        'MEMBERSHIP_NOT_ACTIVE',
      message:
        'Your workspace access is not currently active.',
    };
  }

  /* ----------------------------------------------------------
     Tenant lifecycle
     ---------------------------------------------------------- */

  const tenantStatus =
    normalizeStatus(
      context.tenant.status
    );

  if (
    tenantStatus ===
    'provisioning'
  ) {
    return {
      allowed: false,
      httpStatus: 409,
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
      allowed: false,
      httpStatus: 409,
      code:
        'TENANT_PROVISIONING_FAILED',
      message:
        'Your workspace setup could not be completed. Please contact support.',
    };
  }

  /*
   * pending_payment belongs to the old registration flow.
   *
   * New paid SaMi registrations are trialing immediately and do
   * not require payment before workspace access.
   *
   * A legacy tenant still carrying this status is therefore
   * treated as an unavailable/incomplete workspace rather than
   * redirecting the user into a fake signup-payment route.
   */
  if (
    tenantStatus ===
    'pending_payment'
  ) {
    return {
      allowed: false,
      httpStatus: 409,
      code:
        'TENANT_NOT_ACTIVE',
      message:
        'This workspace is not ready for access yet.',
    };
  }

  if (
    tenantStatus !==
    'active'
  ) {
    return {
      allowed: false,
      httpStatus: 403,
      code:
        'TENANT_NOT_ACTIVE',
      message:
        'This workspace is not active.',
    };
  }

  /* ----------------------------------------------------------
     Physical workspace database
     ---------------------------------------------------------- */

  if (
    !context.database ||
    normalizeStatus(
      context.database.status
    ) !== 'active'
  ) {
    return {
      allowed: false,
      httpStatus: 409,
      code:
        'WORKSPACE_NOT_READY',
      message:
        'Your workspace is not ready yet. Please try again shortly.',
    };
  }

  /* ----------------------------------------------------------
     Subscription
     ---------------------------------------------------------- */

  if (
    !context.subscription
  ) {
    return {
      allowed: false,
      httpStatus: 409,
      code:
        'SUBSCRIPTION_NOT_FOUND',
      message:
        'Your workspace subscription is not configured yet.',
    };
  }

  const subscriptionStatus =
    normalizeStatus(
      context.subscription
        .status
    );

  /*
   * trialing:
   *   Standard / Custom first calendar month free.
   *
   * active:
   *   Free plan or successfully paid subscription.
   *
   * past_due:
   *   Login remains possible so the billing/grace layer can
   *   handle recovery without immediately locking the user out
   *   of the entire SaMi account.
   */
  if (
    [
      'trialing',
      'active',
      'past_due',
    ].includes(
      subscriptionStatus
    )
  ) {
    return {
      allowed: true,
      httpStatus: 200,
      code: 'OK',
      message:
        'Login allowed.',
    };
  }

  if (
    subscriptionStatus ===
    'pending'
  ) {
    return {
      allowed: false,
      httpStatus: 409,
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
      allowed: false,
      httpStatus: 409,
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
      subscriptionStatus
    )
  ) {
    return {
      allowed: false,
      httpStatus: 402,
      code:
        'SUBSCRIPTION_NOT_ACTIVE',
      message:
        'Your workspace subscription is not currently active.',
    };
  }

  /*
   * Unknown subscription states fail closed.
   */
  return {
    allowed: false,
    httpStatus: 403,
    code:
      'SUBSCRIPTION_NOT_ACTIVE',
    message:
      'Your workspace subscription is not currently active.',
  };
}
