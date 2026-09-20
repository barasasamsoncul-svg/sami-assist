import 'server-only';

import { queryControl } from '@/lib/db/control';
import { getTenantPoolByTenantId } from '@/lib/db/tenant';
import {
  getWorkspaceMembershipSummary,
  listWorkspaceMembers,
  type WorkspaceMemberType,
  type WorkspaceMembershipStatus,
} from '@/lib/services/membership';
import {
  getMemberDirectoryAppAccessMap,
  type AppAccessMode,
  type WorkspaceAppOption,
} from '@/lib/services/member-app-access';

export interface MemberDirectoryRole {
  id: string;
  key: string | null;
  name: string;
}

export interface MemberDirectoryCompany {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface MemberDirectoryApp {
  id: string;
  key: string;
  name: string;
  status: string;
}

export interface MemberDirectoryMember {
  membershipId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  avatarFileId: string | null;
  accountStatus: string;
  memberType: WorkspaceMemberType;
  membershipStatus: WorkspaceMembershipStatus;
  accessState: string;
  canEnterWorkspace: boolean;
  isOwner: boolean;
  defaultCompanyId: string | null;
  appAccessMode: AppAccessMode;
  roles: MemberDirectoryRole[];
  companies: MemberDirectoryCompany[];
  apps: MemberDirectoryApp[];
  invitedAt: string | null;
  joinedAt: string | null;
  lastActiveAt: string | null;
  suspendedAt: string | null;
  deletedAt: string | null;
}

export interface MemberDirectorySummary {
  total: number;
  active: number;
  suspended: number;
  internal: number;
  portal: number;
  removed: number;
}

export interface WorkspaceMemberDirectory {
  tenantId: string;
  workspaceName: string;
  generatedAt: string;
  summary: MemberDirectorySummary;
  members: MemberDirectoryMember[];
}

type RoleRow = {
  user_id: string;
  role_id: string;
  role_key: string | null;
  role_name: string;
};

type CompanyRow = {
  user_id: string;
  company_id: string;
  company_name: string;
  company_is_active: boolean;
  company_archived_at: Date | string | null;
  access_status: string;
  access_is_default: boolean;
};

async function loadRoleMap(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, MemberDirectoryRole[]>> {
  const roleMap = new Map<string, MemberDirectoryRole[]>();
  if (userIds.length === 0) return roleMap;

  const result = await queryControl(`
    SELECT
      ur.user_id,
      r.id AS role_id,
      r.key AS role_key,
      r.name AS role_name
    FROM user_roles ur
    INNER JOIN roles r ON r.id = ur.role_id
    WHERE ur.tenant_id = $1
      AND ur.user_id = ANY($2::UUID[])
      AND ur.deleted_at IS NULL
      AND r.deleted_at IS NULL
    ORDER BY
      ur.user_id,
      CASE WHEN LOWER(COALESCE(r.key, r.name, '')) LIKE '%admin%' THEN 0 ELSE 1 END,
      LOWER(r.name),
      ur.created_at
  `, [tenantId, userIds]);

  for (const row of result.rows as RoleRow[]) {
    const userId = String(row.user_id);
    const current = roleMap.get(userId) || [];
    current.push({
      id: String(row.role_id),
      key: typeof row.role_key === 'string' ? row.role_key : null,
      name: typeof row.role_name === 'string' ? row.role_name : '',
    });
    roleMap.set(userId, current);
  }
  return roleMap;
}

async function loadCompanyMap(
  tenantId: string,
  userIds: string[],
  defaultCompanyByUser: Map<string, string | null>,
): Promise<Map<string, MemberDirectoryCompany[]>> {
  const companyMap = new Map<string, MemberDirectoryCompany[]>();
  if (userIds.length === 0) return companyMap;

  const pool = await getTenantPoolByTenantId(tenantId);
  const result = await pool.query<CompanyRow>(`
    SELECT
      cu.user_id,
      c.id AS company_id,
      c.name AS company_name,
      c.is_active AS company_is_active,
      c.archived_at AS company_archived_at,
      cu.status AS access_status,
      cu.is_default AS access_is_default
    FROM company_users cu
    INNER JOIN companies c ON c.id = cu.company_id
    WHERE cu.user_id = ANY($1::UUID[])
      AND LOWER(COALESCE(cu.status, '')) = 'active'
      AND c.is_active = TRUE
      AND c.archived_at IS NULL
    ORDER BY
      cu.user_id,
      CASE WHEN cu.is_default = TRUE THEN 0 ELSE 1 END,
      LOWER(c.name),
      c.created_at
  `, [userIds]);

  for (const row of result.rows) {
    const userId = String(row.user_id);
    const companyId = String(row.company_id);
    const current = companyMap.get(userId) || [];
    const authoritativeDefault = defaultCompanyByUser.get(userId);
    current.push({
      id: companyId,
      name: typeof row.company_name === 'string' ? row.company_name : '',
      isDefault: authoritativeDefault
        ? authoritativeDefault === companyId
        : row.access_is_default === true,
    });
    companyMap.set(userId, current);
  }
  return companyMap;
}

function mapApp(app: WorkspaceAppOption): MemberDirectoryApp {
  return {
    id: app.id,
    key: app.key,
    name: app.name,
    status: app.status,
  };
}

export async function buildWorkspaceMemberDirectory(
  tenantId: string,
): Promise<WorkspaceMemberDirectory> {
  const [memberships, summary] = await Promise.all([
    listWorkspaceMembers(tenantId, { includeRemoved: true }),
    getWorkspaceMembershipSummary(tenantId),
  ]);

  const userIds = [...new Set(memberships.map(membership => membership.userId))];
  const defaultCompanyByUser = new Map<string, string | null>(
    memberships.map(membership => [membership.userId, membership.defaultCompanyId]),
  );

  const [roleMap, companyMap, appMap] = await Promise.all([
    loadRoleMap(tenantId, userIds),
    loadCompanyMap(tenantId, userIds, defaultCompanyByUser),
    getMemberDirectoryAppAccessMap(tenantId, userIds),
  ]);

  const members: MemberDirectoryMember[] = memberships.map(membership => {
    const appAccess = appMap.get(membership.userId);
    return {
      membershipId: membership.id,
      userId: membership.userId,
      email: membership.email,
      firstName: membership.firstName,
      lastName: membership.lastName,
      fullName: membership.fullName,
      avatarFileId: membership.avatarFileId,
      accountStatus: membership.userStatus,
      memberType: membership.memberType,
      membershipStatus: membership.status,
      accessState: membership.accessState,
      canEnterWorkspace: membership.canEnterWorkspace,
      isOwner: membership.isOwner,
      defaultCompanyId: membership.defaultCompanyId,
      appAccessMode: appAccess?.mode || 'role_based',
      roles: roleMap.get(membership.userId) || [],
      companies: companyMap.get(membership.userId) || [],
      apps: (appAccess?.apps || []).map(mapApp),
      invitedAt: membership.invitedAt,
      joinedAt: membership.joinedAt,
      lastActiveAt: membership.lastActiveAt,
      suspendedAt: membership.suspendedAt,
      deletedAt: membership.deletedAt,
    };
  });

  return {
    tenantId,
    workspaceName: memberships[0]?.workspaceName || '',
    generatedAt: new Date().toISOString(),
    summary,
    members,
  };
}
