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

export interface AccountContext {
  tenant: TenantContext | null;
  subscription: SubscriptionContext | null;
  role: RoleContext | null;
  modules: ModuleContext[];
}

export interface LoginValidationResult {
  allowed: boolean;
  httpStatus: number;
  code: string;
  message: string;
  next?: string;
}

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

export async function getAccountContextForUser(
  userId: string
): Promise<AccountContext> {
  const tenant = await getPrimaryTenant(userId);

  if (!tenant) {
    return {
      tenant: null,
      subscription: null,
      role: null,
      modules: [],
    };
  }

  const [subscription, role, modules] =
    await Promise.all([
      getTenantSubscription(tenant.id),
      getUserRole(userId, tenant.id),
      getTenantModules(tenant.id),
    ]);

  return {
    tenant,
    subscription,
    role,
    modules,
  };
}

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
      WHERE tu.user_id = $1
        AND tu.deleted_at IS NULL
        AND t.deleted_at IS NULL
      ORDER BY tu.created_at ASC
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
        ORDER BY ur.created_at ASC
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

export function validateAccountCanLogin(
  user: AuthUserRecord,
  context: AccountContext
): LoginValidationResult {
  const userStatus =
    user.status.toLowerCase();

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
      message:
        'Your account is not active yet.',
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
      message:
        'This workspace is not active.',
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
      message:
        'Your subscription is not active.',
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