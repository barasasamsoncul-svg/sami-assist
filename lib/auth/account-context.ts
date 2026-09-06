import { queryControl } from '@/lib/db/control';

export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarFileId: string | null;
  status: string;
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
  accessLevel: 'owner' | 'admin' | 'member';
  isOwner: boolean;
  isAdmin: boolean;
  label: string;
}

export interface SubscriptionContext {
  id: string;
  status: string;
  billingCycle: string | null;
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

// ============================================================
// USER LOOKUP
// ============================================================

export async function findUserForLogin(
  email: string
): Promise<AuthUserRecord | null> {
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
        status
      FROM users
      WHERE LOWER(email) = LOWER($1)
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [email]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash || null,
    fullName: row.full_name || '',
    firstName: row.first_name || '',
    lastName: row.last_name || '',
    avatarFileId: row.avatar_file_id || null,
    status: row.status || 'unknown',
  };
}

// ============================================================
// MAIN ACCOUNT CONTEXT
// ============================================================

export async function getAccountContextForUser(
  userId: string
): Promise<AccountContext> {
  const tenant = await getPrimaryTenant(userId);

  if (!tenant) {
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

  const [
    subscription,
    role,
    modules,
    database,
    owner,
  ] = await Promise.all([
    getTenantSubscription(tenant.id),
    getUserRole(userId, tenant.id),
    getTenantModules(tenant.id),
    getTenantDatabase(tenant.id),
    getTenantOwner(tenant.id),
  ]);

  const membership = buildMembershipContext({
    userId,
    tenant,
    role,
    owner,
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

// ============================================================
// TENANT
// ============================================================

async function getPrimaryTenant(
  userId: string
): Promise<TenantContext | null> {
  const result = await queryControl(
    `
      SELECT
        t.id,
        t.name,
        t.slug,
        t.status
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
        tu.created_at ASC

      LIMIT 1
    `,
    [userId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  return {
    id: row.id,
    name: row.name || '',
    slug: row.slug || '',
    status: row.status || 'unknown',
  };
}

// ============================================================
// OWNER
// ============================================================

async function getTenantOwner(
  tenantId: string
): Promise<TenantOwnerContext | null> {
  try {
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
          AND tu.deleted_at IS NULL
          AND u.deleted_at IS NULL

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
          tu.created_at ASC

        LIMIT 1
      `,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      email: row.email,
      fullName: row.full_name || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      roleKey: row.role_key || null,
      roleName: row.role_name || null,
    };
  } catch (error) {
    console.error(
      '[Auth] Failed to load tenant owner:',
      error
    );

    return null;
  }
}

// ============================================================
// MEMBERSHIP / ACCESS LEVEL
// ============================================================

function buildMembershipContext(params: {
  userId: string;
  tenant: TenantContext;
  role: RoleContext | null;
  owner: TenantOwnerContext | null;
}): MembershipContext {
  const roleText = [
    params.role?.key || '',
    params.role?.name || '',
  ]
    .join(' ')
    .toLowerCase();

  const roleSaysOwner =
    roleText.includes('owner') ||
    roleText.includes('founder');

  const roleSaysAdmin =
    roleText.includes('admin');

  const userIsDetectedOwner =
    params.owner?.id === params.userId;

  const isOwner =
    roleSaysOwner || userIsDetectedOwner;

  const isAdmin =
    isOwner || roleSaysAdmin;

  const accessLevel: 'owner' | 'admin' | 'member' =
    isOwner
      ? 'owner'
      : isAdmin
        ? 'admin'
        : 'member';

  const label =
    accessLevel === 'owner'
      ? 'Workspace Owner'
      : accessLevel === 'admin'
        ? 'Workspace Admin'
        : 'Workspace Member';

  return {
    userId: params.userId,
    tenantId: params.tenant.id,
    accessLevel,
    isOwner,
    isAdmin,
    label,
  };
}

// ============================================================
// SUBSCRIPTION
// ============================================================

async function getTenantSubscription(
  tenantId: string
): Promise<SubscriptionContext | null> {
  try {
    const result = await queryControl(
      `
        SELECT
          s.id,
          s.status,
          s.billing_cycle,
          s.current_period_end,
          p.key AS plan_key,
          p.name AS plan_name
        FROM subscriptions s

        LEFT JOIN plans p
          ON p.id = s.plan_id

        WHERE s.tenant_id = $1
          AND s.deleted_at IS NULL

        ORDER BY s.created_at DESC

        LIMIT 1
      `,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      status: row.status || 'unknown',
      billingCycle: row.billing_cycle || null,
      currentPeriodEnd: row.current_period_end
        ? new Date(row.current_period_end).toISOString()
        : null,
      planKey: row.plan_key || null,
      planName: row.plan_name || null,
    };
  } catch (error) {
    console.error(
      '[Auth] Failed to load subscription context:',
      error
    );

    return null;
  }
}

// ============================================================
// ROLE
// ============================================================

async function getUserRole(
  userId: string,
  tenantId: string
): Promise<RoleContext | null> {
  try {
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
      [userId, tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      key: row.key || null,
      name: row.name || '',
    };
  } catch (error) {
    console.error(
      '[Auth] Failed to load role context:',
      error
    );

    return null;
  }
}

// ============================================================
// MODULES
// ============================================================

async function getTenantModules(
  tenantId: string
): Promise<ModuleContext[]> {
  try {
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

        ORDER BY m.name ASC
      `,
      [tenantId]
    );

    return result.rows.map((row: any) => ({
      key: row.key,
      name: row.name || row.key,
      status: row.status || 'unknown',
    }));
  } catch (error) {
    console.error(
      '[Auth] Failed to load tenant modules:',
      error
    );

    return [];
  }
}

// ============================================================
// DATABASE
// ============================================================

async function getTenantDatabase(
  tenantId: string
): Promise<TenantDatabaseContext | null> {
  try {
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
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];

    return {
      id: row.id,
      databaseName: row.database_name || '',
      databaseHost: row.database_host || null,
      databasePort: row.database_port
        ? Number(row.database_port)
        : null,
      status: row.status || 'unknown',
      provisionedAt: row.provisioned_at
        ? new Date(row.provisioned_at).toISOString()
        : null,
    };
  } catch (error) {
    console.error(
      '[Auth] Failed to load tenant database context:',
      error
    );

    return null;
  }
}

// ============================================================
// LOGIN VALIDATION
// ============================================================

export function validateAccountCanLogin(
  user: AuthUserRecord,
  context: AccountContext
): LoginValidationResult {
  const userStatus = user.status.toLowerCase();

  if (userStatus === 'pending_verification') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'EMAIL_NOT_VERIFIED',
      message:
        'Please verify your email address before signing in.',
      next: 'verify-email',
    };
  }

  if (userStatus === 'suspended') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'ACCOUNT_SUSPENDED',
      message:
        'This account has been suspended. Please contact support.',
    };
  }

  if (userStatus === 'locked') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'ACCOUNT_LOCKED',
      message:
        'This account is locked. Please reset your password or contact support.',
    };
  }

  if (userStatus !== 'active') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'ACCOUNT_NOT_ACTIVE',
      message: 'Your account is not active yet.',
    };
  }

  if (!context.tenant) {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'TENANT_NOT_FOUND',
      message:
        'Your account is not linked to a business workspace yet.',
    };
  }

  const tenantStatus =
    context.tenant.status.toLowerCase();

  if (tenantStatus === 'pending_payment') {
    return {
      allowed: false,
      httpStatus: 402,
      code: 'PAYMENT_REQUIRED',
      message:
        'Payment is required before this workspace can be accessed.',
      next: 'payment',
    };
  }

  if (tenantStatus === 'provisioning') {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'TENANT_PROVISIONING',
      message:
        'Your workspace is still being prepared. Please try again shortly.',
    };
  }

  if (tenantStatus === 'provisioning_failed') {
    return {
      allowed: false,
      httpStatus: 409,
      code: 'TENANT_PROVISIONING_FAILED',
      message:
        'Your workspace setup failed. Please contact support.',
    };
  }

  if (tenantStatus !== 'active') {
    return {
      allowed: false,
      httpStatus: 403,
      code: 'TENANT_NOT_ACTIVE',
      message: 'This workspace is not active.',
    };
  }

  const subscriptionStatus =
    context.subscription?.status?.toLowerCase();

  if (
    subscriptionStatus &&
    [
      'pending_payment',
      'cancelled',
      'expired',
      'failed',
      'unpaid',
    ].includes(subscriptionStatus)
  ) {
    return {
      allowed: false,
      httpStatus: 402,
      code: 'SUBSCRIPTION_NOT_ACTIVE',
      message: 'Your subscription is not active.',
      next: 'billing',
    };
  }

  return {
    allowed: true,
    httpStatus: 200,
    code: 'OK',
    message: 'Login allowed.',
  };
}