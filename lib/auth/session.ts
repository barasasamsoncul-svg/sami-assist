import { queryControl } from '@/lib/db/control';
import { cookies } from 'next/headers';
import crypto from 'crypto';

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}

export interface SessionTenant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string;
  role: string;
  isOwner: boolean;
}

export interface Session {
  sessionId: string;
  user: SessionUser;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('sami_session')?.value;

  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashToken(sessionToken);

  const result = await queryControl(
    `SELECT 
      s.id as session_id,
      s.expires_at,
      u.id,
      u.email,
      u.full_name,
      u.first_name,
      u.last_name,
      u.avatar_url,
      u.status
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.session_token_hash = $1 
       AND s.is_current = true
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND u.status = 'active'
       AND u.deleted_at IS NULL`,
    [tokenHash]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];

  await queryControl(
    `UPDATE sessions SET last_active_at = NOW() WHERE id = $1`,
    [row.session_id]
  );

  return {
    sessionId: row.session_id,
    user: {
      id: row.id,
      email: row.email,
      fullName: row.full_name || '',
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      avatarUrl: row.avatar_url || '',
    },
  };
}

export async function getUserTenants(userId: string): Promise<SessionTenant[]> {
  const result = await queryControl(
    `SELECT 
      t.id,
      t.name,
      t.slug,
      t.logo_url,
      tu.is_owner,
      COALESCE(
        (SELECT r.name FROM user_roles ur 
         INNER JOIN roles r ON r.id = ur.role_id 
         WHERE ur.user_id = tu.user_id AND ur.tenant_id = tu.tenant_id 
         ORDER BY ur.created_at ASC LIMIT 1),
        CASE WHEN tu.is_owner THEN 'Owner' ELSE 'Member' END
      ) as role
     FROM tenant_users tu
     INNER JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1 
       AND tu.status = 'active'
       AND t.status = 'active'
       AND t.deleted_at IS NULL
     ORDER BY tu.joined_at ASC`,
    [userId]
  );

  return result.rows.map((row: any) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    logoUrl: row.logo_url || '',
    role: row.role || 'Member',
    isOwner: row.is_owner || false,
  }));
}

export async function getUserPermissions(tenantId: string, userId: string): Promise<string[]> {
  const result = await queryControl(
    `SELECT DISTINCT p.resource || ':' || p.action as permission
     FROM user_roles ur
     INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
     INNER JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.tenant_id = $1 AND ur.user_id = $2`,
    [tenantId, userId]
  );

  let permissions = result.rows.map((row: any) => row.permission);

  const ownerCheck = await queryControl(
    `SELECT is_owner FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`,
    [tenantId, userId]
  );

  if (ownerCheck.rows[0]?.is_owner) {
    permissions = ['*'];
  }

  return permissions;
}

export async function hasPermission(
  tenantId: string,
  userId: string,
  requiredPermission: string
): Promise<boolean> {
  const permissions = await getUserPermissions(tenantId, userId);
  if (permissions.includes('*')) return true;
  return permissions.includes(requiredPermission);
}

export async function createSession(
  userId: string,
  request: Request
): Promise<{ sessionToken: string; sessionExpiry: Date }> {
  const sessionToken = crypto.randomBytes(48).toString('hex');
  const tokenHash = hashToken(sessionToken);
  const sessionExpiry = new Date();
  sessionExpiry.setDate(sessionExpiry.getDate() + 30);

  const userAgent = request.headers.get('user-agent') || '';
  const deviceType = userAgent.includes('Mobile') ? 'mobile' : userAgent.includes('Tablet') ? 'tablet' : 'desktop';
  const browser = userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : userAgent.includes('Safari') ? 'Safari' : userAgent.includes('Edge') ? 'Edge' : 'Unknown';
  const os = userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'macOS' : userAgent.includes('Linux') ? 'Linux' : userAgent.includes('Android') ? 'Android' : userAgent.includes('iOS') ? 'iOS' : 'Unknown';
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  await queryControl(
    `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE user_id = $1`,
    [userId]
  );

  await queryControl(
    `INSERT INTO sessions (user_id, session_token_hash, ip_address, user_agent, device_type, browser, operating_system, is_current, last_active_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, NOW(), $8)`,
    [userId, tokenHash, ip, userAgent, deviceType, browser, os, sessionExpiry]
  );

  return { sessionToken, sessionExpiry };
}

export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  await queryControl(
    `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE id = $1 AND user_id = $2`,
    [sessionId, userId]
  );
}

export async function revokeAllOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  await queryControl(
    `UPDATE sessions SET is_current = false, revoked_at = NOW() WHERE user_id = $1 AND id != $2`,
    [userId, currentSessionId]
  );
}