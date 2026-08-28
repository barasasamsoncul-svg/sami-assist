import { getSession, getUserPermissions } from './session';
import { queryControl } from '@/lib/db/control';

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
}

export async function checkPermission(
  tenantId: string,
  requiredPermission: string
): Promise<PermissionCheck> {
  const session = await getSession();
  
  if (!session) {
    return { allowed: false, reason: 'Not authenticated' };
  }

  const permissions = await getUserPermissions(tenantId, session.user.id);

  if (permissions.includes('*')) {
    return { allowed: true };
  }

  if (!permissions.includes(requiredPermission)) {
    return { allowed: false, reason: `Missing permission: ${requiredPermission}` };
  }

  return { allowed: true };
}

export async function isTenantOwner(tenantId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const result = await queryControl(
    `SELECT is_owner FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, session.user.id]
  );

  return result.rows[0]?.is_owner || false;
}

export async function isTenantAdmin(tenantId: string): Promise<boolean> {
  const session = await getSession();
  if (!session) return false;

  const result = await queryControl(
    `SELECT r.name as role_name
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE ur.tenant_id = $1 AND ur.user_id = $2
       AND r.name IN ('Owner', 'Administrator')`,
    [tenantId, session.user.id]
  );

  return result.rows.length > 0;
}