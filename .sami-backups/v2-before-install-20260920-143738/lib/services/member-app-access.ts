import 'server-only';

import crypto from 'node:crypto';
import type { PoolClient } from 'pg';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';

import {
  getPermissionContext,
  permissionContextHas,
  type PermissionContext,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

export type AppAccessMode = 'role_based' | 'selected';

export interface WorkspaceAppOption {
  id: string;
  key: string;
  name: string;
  status: string;
}

export interface RoleAppAccess {
  roleId: string;
  apps: WorkspaceAppOption[];
  appIds: string[];
  appKeys: string[];
}

export interface MemberAppAccessState {
  userId: string;
  tenantId: string;
  isOwner: boolean;
  editable: boolean;
  mode: AppAccessMode;
  installedApps: WorkspaceAppOption[];
  roleEligibleApps: WorkspaceAppOption[];
  selectedApps: WorkspaceAppOption[];
  effectiveApps: WorkspaceAppOption[];
}

export interface InvitationAppAccessState {
  invitationId: string;
  tenantId: string;
  mode: AppAccessMode;
  selectedApps: WorkspaceAppOption[];
}

export interface MemberDirectoryAppAccess {
  mode: AppAccessMode;
  apps: WorkspaceAppOption[];
}

export type AppAccessErrorCode =
  | 'INVALID_USER_ID'
  | 'INVALID_INVITATION_ID'
  | 'INVALID_APP_ACCESS_MODE'
  | 'TOO_MANY_APPS'
  | 'USERS_VIEW_REQUIRED'
  | 'USERS_MANAGE_REQUIRED'
  | 'APPS_VIEW_REQUIRED'
  | 'APPS_MANAGE_REQUIRED'
  | 'INVITATIONS_VIEW_REQUIRED'
  | 'INVITATIONS_MANAGE_REQUIRED'
  | 'MEMBER_NOT_FOUND'
  | 'MEMBER_NOT_ACTIVE'
  | 'OWNER_PROTECTED'
  | 'SELF_ACCESS_PROTECTED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_NOT_PENDING'
  | 'APP_NOT_INSTALLED'
  | 'APP_NOT_GRANTED_BY_ROLE';

export class AppAccessError extends Error {
  readonly code: AppAccessErrorCode;

  constructor(code: AppAccessErrorCode, message: string) {
    super(message);
    this.name = 'AppAccessError';
    this.code = code;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_APPS = 100;

function requireUuid(value: string, code: 'INVALID_USER_ID' | 'INVALID_INVITATION_ID', label: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!UUID_PATTERN.test(normalized)) {
    throw new AppAccessError(code, `A valid ${label} is required.`);
  }
  return normalized;
}

function normalizeMode(value: unknown): AppAccessMode {
  if (value === 'role_based' || value === 'selected') return value;
  throw new AppAccessError('INVALID_APP_ACCESS_MODE', 'App access mode must be role_based or selected.');
}

function normalizeIds(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const set = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const id = value.trim();
    if (!id) continue;
    if (!UUID_PATTERN.test(id)) {
      throw new AppAccessError('APP_NOT_INSTALLED', 'One of the selected apps is invalid.');
    }
    set.add(id);
  }
  if (set.size > MAX_APPS) {
    throw new AppAccessError('TOO_MANY_APPS', `At most ${MAX_APPS} apps can be selected.`);
  }
  return [...set];
}

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function mapApp(row: Record<string, unknown>): WorkspaceAppOption {
  return {
    id: String(row.id),
    key: typeof row.key === 'string' ? row.key : '',
    name: typeof row.name === 'string' && row.name ? row.name : String(row.key || ''),
    status: typeof row.status === 'string' ? row.status : 'unknown',
  };
}

function hasAny(
  context: PermissionContext,
  permissions: readonly string[],
): boolean {
  return permissions.some(permission => permissionContextHas(context, permission));
}

async function requireMemberAppView(): Promise<PermissionContext> {
  const context = await getPermissionContext();

  if (
    context.isOwner ||
    (
      hasAny(context, [SAMI_PERMISSIONS.USERS_VIEW, SAMI_PERMISSIONS.USERS_MANAGE]) &&
      hasAny(context, [SAMI_PERMISSIONS.APPS_VIEW, SAMI_PERMISSIONS.APPS_MANAGE])
    )
  ) {
    return context;
  }

  if (!hasAny(context, [SAMI_PERMISSIONS.USERS_VIEW, SAMI_PERMISSIONS.USERS_MANAGE])) {
    throw new AppAccessError(
      'USERS_VIEW_REQUIRED',
      'You need People visibility before you can inspect employee app access.',
    );
  }

  throw new AppAccessError(
    'APPS_VIEW_REQUIRED',
    'You do not have permission to view workspace app access.',
  );
}

async function requireMemberAppManage(): Promise<PermissionContext> {
  const context = await requireMemberAppView();

  if (context.isOwner || permissionContextHas(context, SAMI_PERMISSIONS.APPS_MANAGE)) {
    return context;
  }

  throw new AppAccessError(
    'APPS_MANAGE_REQUIRED',
    'You do not have permission to assign apps to employees.',
  );
}

async function requireInvitationAppView(): Promise<PermissionContext> {
  const context = await getPermissionContext();

  if (
    context.isOwner ||
    (
      hasAny(context, [SAMI_PERMISSIONS.INVITATIONS_VIEW, SAMI_PERMISSIONS.INVITATIONS_MANAGE]) &&
      hasAny(context, [SAMI_PERMISSIONS.APPS_VIEW, SAMI_PERMISSIONS.APPS_MANAGE])
    )
  ) {
    return context;
  }

  if (!hasAny(context, [SAMI_PERMISSIONS.INVITATIONS_VIEW, SAMI_PERMISSIONS.INVITATIONS_MANAGE])) {
    throw new AppAccessError(
      'INVITATIONS_VIEW_REQUIRED',
      'You do not have permission to view invitation access.',
    );
  }

  throw new AppAccessError(
    'APPS_VIEW_REQUIRED',
    'You do not have permission to view workspace app access.',
  );
}

async function requireInvitationAppManage(): Promise<PermissionContext> {
  const context = await requireInvitationAppView();

  if (
    context.isOwner ||
    (
      permissionContextHas(context, SAMI_PERMISSIONS.INVITATIONS_MANAGE) &&
      permissionContextHas(context, SAMI_PERMISSIONS.APPS_MANAGE)
    )
  ) {
    return context;
  }

  if (!permissionContextHas(context, SAMI_PERMISSIONS.INVITATIONS_MANAGE)) {
    throw new AppAccessError(
      'INVITATIONS_MANAGE_REQUIRED',
      'You do not have permission to manage invitations.',
    );
  }

  throw new AppAccessError(
    'APPS_MANAGE_REQUIRED',
    'You do not have permission to assign apps on invitations.',
  );
}

export async function listInstalledWorkspaceApps(tenantId: string): Promise<WorkspaceAppOption[]> {
  const result = await queryControl(`
    SELECT
      m.id,
      m.key,
      m.name,
      tm.status
    FROM tenant_modules tm
    INNER JOIN modules m ON m.id = tm.module_id
    WHERE tm.tenant_id = $1
      AND tm.deleted_at IS NULL
      AND m.deleted_at IS NULL
      AND LOWER(COALESCE(m.status, '')) = 'active'
      AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    ORDER BY LOWER(m.name), m.id
  `, [tenantId]);

  return (result.rows as Record<string, unknown>[]).map(mapApp);
}

export async function getRoleAppAccessMapForTenant(
  tenantId: string,
  roleIds: string[],
): Promise<Map<string, WorkspaceAppOption[]>> {
  const map = new Map<string, WorkspaceAppOption[]>();
  if (roleIds.length === 0) return map;

  const result = await queryControl(`
    SELECT DISTINCT
      rp.role_id,
      m.id,
      m.key,
      m.name,
      tm.status
    FROM role_permissions rp
    INNER JOIN permissions p ON p.id = rp.permission_id
    INNER JOIN modules m ON LOWER(m.key) = LOWER(p.module_key)
    INNER JOIN tenant_modules tm
      ON tm.module_id = m.id
     AND tm.tenant_id = $1
    WHERE rp.role_id = ANY($2::uuid[])
      AND rp.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND LOWER(COALESCE(p.status, 'active')) = 'active'
      AND p.module_key IS NOT NULL
      AND m.deleted_at IS NULL
      AND LOWER(COALESCE(m.status, '')) = 'active'
      AND tm.deleted_at IS NULL
      AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    ORDER BY rp.role_id, m.name, m.id
  `, [tenantId, roleIds]);

  for (const row of result.rows as Record<string, unknown>[]) {
    const roleId = String(row.role_id);
    const current = map.get(roleId) || [];
    current.push(mapApp(row));
    map.set(roleId, current);
  }
  return map;
}

export async function getRoleAppAccessMap(
  roleIds: string[],
): Promise<RoleAppAccess[]> {
  const context = await getPermissionContext();
  const normalizedRoleIds = [...new Set(roleIds.filter(id => UUID_PATTERN.test(id)))];
  const map = await getRoleAppAccessMapForTenant(context.tenantId, normalizedRoleIds);
  return normalizedRoleIds.map(roleId => {
    const apps = map.get(roleId) || [];
    return {
      roleId,
      apps,
      appIds: apps.map(app => app.id),
      appKeys: apps.map(app => app.key),
    };
  });
}

async function loadTargetRoleIds(tenantId: string, userId: string): Promise<string[]> {
  const result = await queryControl(`
    SELECT ur.role_id
    FROM user_roles ur
    INNER JOIN roles r ON r.id = ur.role_id
    WHERE ur.tenant_id = $1
      AND ur.user_id = $2
      AND ur.deleted_at IS NULL
      AND r.deleted_at IS NULL
      AND LOWER(COALESCE(r.status, 'active')) = 'active'
  `, [tenantId, userId]);
  return result.rows.map(row => String(row.role_id));
}

async function unionRoleEligibleApps(tenantId: string, roleIds: string[]): Promise<WorkspaceAppOption[]> {
  const roleMap = await getRoleAppAccessMapForTenant(tenantId, roleIds);
  const byId = new Map<string, WorkspaceAppOption>();
  for (const apps of roleMap.values()) {
    for (const app of apps) byId.set(app.id, app);
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function validateSelectedApps(
  tenantId: string,
  appIds: string[],
  eligibleApps: WorkspaceAppOption[],
): Promise<WorkspaceAppOption[]> {
  const installed = await listInstalledWorkspaceApps(tenantId);
  const installedById = new Map(installed.map(app => [app.id, app]));
  const eligibleIds = new Set(eligibleApps.map(app => app.id));
  const selected: WorkspaceAppOption[] = [];

  for (const appId of appIds) {
    const app = installedById.get(appId);
    if (!app) {
      throw new AppAccessError('APP_NOT_INSTALLED', 'One of the selected apps is not installed in this workspace.');
    }
    if (!eligibleIds.has(appId)) {
      throw new AppAccessError(
        'APP_NOT_GRANTED_BY_ROLE',
        `${app.name} cannot be granted because the selected role set has no permission for that app.`,
      );
    }
    selected.push(app);
  }

  return selected;
}

export async function getMemberAppAccess(userIdInput: string): Promise<MemberAppAccessState> {
  const context = await requireMemberAppView();
  const userId = requireUuid(userIdInput, 'INVALID_USER_ID', 'user ID');

  const memberResult = await queryControl(`
    SELECT id, is_owner, status, deleted_at, app_access_mode
    FROM tenant_users
    WHERE tenant_id = $1 AND user_id = $2
    LIMIT 1
  `, [context.tenantId, userId]);

  if (memberResult.rows.length === 0) {
    throw new AppAccessError('MEMBER_NOT_FOUND', 'The workspace member could not be found.');
  }

  const member = memberResult.rows[0] as Record<string, unknown>;
  const installedApps = await listInstalledWorkspaceApps(context.tenantId);
  const isOwner = member.is_owner === true;

  if (isOwner) {
    return {
      userId,
      tenantId: context.tenantId,
      isOwner: true,
      editable: false,
      mode: 'role_based',
      installedApps,
      roleEligibleApps: installedApps,
      selectedApps: installedApps,
      effectiveApps: installedApps,
    };
  }

  const roleIds = await loadTargetRoleIds(context.tenantId, userId);
  const roleEligibleApps = await unionRoleEligibleApps(context.tenantId, roleIds);
  const mode: AppAccessMode = member.app_access_mode === 'selected' ? 'selected' : 'role_based';

  const selectedResult = await queryControl(`
    SELECT m.id, m.key, m.name, tm.status
    FROM tenant_user_apps tua
    INNER JOIN modules m ON m.id = tua.module_id
    INNER JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = tua.tenant_id
    WHERE tua.tenant_id = $1
      AND tua.user_id = $2
      AND tua.deleted_at IS NULL
      AND m.deleted_at IS NULL
      AND tm.deleted_at IS NULL
      AND LOWER(COALESCE(m.status, '')) = 'active'
      AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    ORDER BY LOWER(m.name), m.id
  `, [context.tenantId, userId]);

  const selectedApps = (selectedResult.rows as Record<string, unknown>[]).map(mapApp);
  const eligibleIds = new Set(roleEligibleApps.map(app => app.id));
  const effectiveApps = mode === 'role_based'
    ? roleEligibleApps
    : selectedApps.filter(app => eligibleIds.has(app.id));

  return {
    userId,
    tenantId: context.tenantId,
    isOwner: false,
    editable: context.isOwner || permissionContextHas(context, SAMI_PERMISSIONS.USERS_MANAGE),
    mode,
    installedApps,
    roleEligibleApps,
    selectedApps,
    effectiveApps,
  };
}

async function writeMemberAppAudit(
  client: PoolClient,
  input: {
    tenantId: string;
    actorUserId: string;
    targetUserId: string;
    mode: AppAccessMode;
    appIds: string[];
    ipAddress?: string | null;
    userAgent?: string | null;
    correlationId?: string | null;
  },
) {
  await client.query(`
    INSERT INTO audit_logs (
      tenant_id, user_id, actor_type, action,
      resource_type, resource_id, module, result,
      metadata, ip_address, user_agent, correlation_id,
      event_type, entity_type, entity_id
    ) VALUES (
      $1, $2, 'human', 'workspace.member.apps.updated',
      'workspace_member', $3, 'workspace', 'success',
      $4::jsonb, $5, $6, $7,
      'workspace.member.apps.updated', 'workspace_member', $3
    )
  `, [
    input.tenantId,
    input.actorUserId,
    input.targetUserId,
    JSON.stringify({ mode: input.mode, appIds: input.appIds }),
    input.ipAddress || 'unknown',
    input.userAgent || '',
    input.correlationId || crypto.randomUUID(),
  ]);
}

export async function replaceMemberAppAccess(input: {
  userId: string;
  mode: AppAccessMode;
  appIds: string[];
  audit?: { ipAddress?: string | null; userAgent?: string | null; correlationId?: string | null };
}): Promise<MemberAppAccessState> {
  const context = await requireMemberAppManage();
  const userId = requireUuid(input.userId, 'INVALID_USER_ID', 'user ID');
  const mode = normalizeMode(input.mode);
  const appIds = normalizeIds(input.appIds);

  if (userId === context.userId) {
    throw new AppAccessError('SELF_ACCESS_PROTECTED', 'You cannot expand or restrict your own app access from People & Access.');
  }

  const roleIds = await loadTargetRoleIds(context.tenantId, userId);
  const roleEligibleApps = await unionRoleEligibleApps(context.tenantId, roleIds);
  const selectedApps = mode === 'selected'
    ? await validateSelectedApps(context.tenantId, appIds, roleEligibleApps)
    : [];

  await withControlTransaction(async client => {
    const memberResult = await client.query(`
      SELECT id, is_owner, status, deleted_at
      FROM tenant_users
      WHERE tenant_id = $1 AND user_id = $2
      LIMIT 1
      FOR UPDATE
    `, [context.tenantId, userId]);

    if (memberResult.rows.length === 0) {
      throw new AppAccessError('MEMBER_NOT_FOUND', 'The workspace member could not be found.');
    }
    if (memberResult.rows[0].is_owner === true) {
      throw new AppAccessError('OWNER_PROTECTED', 'Workspace owner app access cannot be restricted.');
    }

    await client.query(`
      UPDATE tenant_users
      SET app_access_mode = $3, updated_at = NOW()
      WHERE tenant_id = $1 AND user_id = $2
    `, [context.tenantId, userId, mode]);

    await client.query(`
      UPDATE tenant_user_apps
      SET deleted_at = NOW(), updated_at = NOW()
      WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
    `, [context.tenantId, userId]);

    if (mode === 'selected') {
      for (const app of selectedApps) {
        await client.query(`
          INSERT INTO tenant_user_apps (
            tenant_id, user_id, module_id, granted_by,
            created_at, updated_at, deleted_at
          ) VALUES ($1, $2, $3, $4, NOW(), NOW(), NULL)
          ON CONFLICT (tenant_id, user_id, module_id)
          DO UPDATE SET granted_by = EXCLUDED.granted_by, updated_at = NOW(), deleted_at = NULL
        `, [context.tenantId, userId, app.id, context.userId]);
      }
    }

    await writeMemberAppAudit(client, {
      tenantId: context.tenantId,
      actorUserId: context.userId,
      targetUserId: userId,
      mode,
      appIds: selectedApps.map(app => app.id),
      ...input.audit,
    });
  });

  return getMemberAppAccess(userId);
}

export async function listInvitationAppOptions(): Promise<WorkspaceAppOption[]> {
  const context = await requireInvitationAppManage();
  return listInstalledWorkspaceApps(context.tenantId);
}

export async function getInvitationRoleAppAccess(roleIds: string[]): Promise<RoleAppAccess[]> {
  const context = await requireInvitationAppManage();
  const normalized = [...new Set(roleIds.filter(id => UUID_PATTERN.test(id)))];
  const map = await getRoleAppAccessMapForTenant(context.tenantId, normalized);
  return normalized.map(roleId => {
    const apps = map.get(roleId) || [];
    return { roleId, apps, appIds: apps.map(app => app.id), appKeys: apps.map(app => app.key) };
  });
}

export async function setInvitationAppAccess(input: {
  invitationId: string;
  mode: AppAccessMode;
  appIds: string[];
  audit?: { ipAddress?: string | null; userAgent?: string | null; correlationId?: string | null };
}): Promise<InvitationAppAccessState> {
  const context = await requireInvitationAppManage();
  const invitationId = requireUuid(input.invitationId, 'INVALID_INVITATION_ID', 'invitation ID');
  const mode = normalizeMode(input.mode);
  const appIds = normalizeIds(input.appIds);

  return withControlTransaction(async client => {
    const invitationResult = await client.query(`
      SELECT id, tenant_id, member_type, status
      FROM workspace_invitations
      WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL
      LIMIT 1
      FOR UPDATE
    `, [invitationId, context.tenantId]);

    if (invitationResult.rows.length === 0) {
      throw new AppAccessError('INVITATION_NOT_FOUND', 'The invitation could not be found.');
    }
    const invitation = invitationResult.rows[0] as Record<string, unknown>;
    if (normalizeStatus(invitation.status) !== 'pending') {
      throw new AppAccessError('INVITATION_NOT_PENDING', 'Only pending invitations can have their app access changed.');
    }

    const roleResult = await client.query(`
      SELECT role_id
      FROM workspace_invitation_roles
      WHERE invitation_id = $1
      ORDER BY role_id
    `, [invitationId]);
    const roleIds = roleResult.rows.map(row => String(row.role_id));
    const roleEligibleApps = invitation.member_type === 'portal'
      ? []
      : await unionRoleEligibleApps(context.tenantId, roleIds);
    const selectedApps = mode === 'selected'
      ? await validateSelectedApps(context.tenantId, appIds, roleEligibleApps)
      : [];

    await client.query(`
      UPDATE workspace_invitations
      SET app_access_mode = $2, updated_at = NOW()
      WHERE id = $1
    `, [invitationId, mode]);

    await client.query(`DELETE FROM workspace_invitation_apps WHERE invitation_id = $1`, [invitationId]);

    if (mode === 'selected') {
      for (const app of selectedApps) {
        await client.query(`
          INSERT INTO workspace_invitation_apps (invitation_id, module_id, created_at)
          VALUES ($1, $2, NOW())
          ON CONFLICT (invitation_id, module_id) DO NOTHING
        `, [invitationId, app.id]);
      }
    }

    await client.query(`
      INSERT INTO audit_logs (
        tenant_id, user_id, actor_type, action,
        resource_type, resource_id, module, result,
        metadata, ip_address, user_agent, correlation_id,
        event_type, entity_type, entity_id
      ) VALUES (
        $1, $2, 'human', 'workspace.invitation.apps.updated',
        'workspace_invitation', $3, 'workspace', 'success',
        $4::jsonb, $5, $6, $7,
        'workspace.invitation.apps.updated', 'workspace_invitation', $3
      )
    `, [
      context.tenantId,
      context.userId,
      invitationId,
      JSON.stringify({ mode, appIds: selectedApps.map(app => app.id) }),
      input.audit?.ipAddress || 'unknown',
      input.audit?.userAgent || '',
      input.audit?.correlationId || crypto.randomUUID(),
    ]);

    return {
      invitationId,
      tenantId: context.tenantId,
      mode,
      selectedApps,
    };
  });
}

export async function getInvitationAppAccesses(): Promise<InvitationAppAccessState[]> {
  const context = await requireInvitationAppView();
  const result = await queryControl(`
    SELECT
      wi.id AS invitation_id,
      wi.app_access_mode,
      m.id,
      m.key,
      m.name,
      tm.status
    FROM workspace_invitations wi
    LEFT JOIN workspace_invitation_apps wia ON wia.invitation_id = wi.id
    LEFT JOIN modules m ON m.id = wia.module_id AND m.deleted_at IS NULL
    LEFT JOIN tenant_modules tm
      ON tm.module_id = m.id
     AND tm.tenant_id = wi.tenant_id
     AND tm.deleted_at IS NULL
    WHERE wi.tenant_id = $1
      AND wi.deleted_at IS NULL
      AND wi.status IN ('pending', 'expired', 'revoked')
    ORDER BY wi.created_at DESC, LOWER(m.name)
  `, [context.tenantId]);

  const states = new Map<string, InvitationAppAccessState>();
  for (const row of result.rows as Record<string, unknown>[]) {
    const invitationId = String(row.invitation_id);
    let state = states.get(invitationId);
    if (!state) {
      state = {
        invitationId,
        tenantId: context.tenantId,
        mode: row.app_access_mode === 'selected' ? 'selected' : 'role_based',
        selectedApps: [],
      };
      states.set(invitationId, state);
    }
    if (row.id) state.selectedApps.push(mapApp(row));
  }
  return [...states.values()];
}

export async function getMemberDirectoryAppAccessMap(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, MemberDirectoryAppAccess>> {
  const output = new Map<string, MemberDirectoryAppAccess>();
  if (userIds.length === 0) return output;

  const memberships = await queryControl(`
    SELECT user_id, is_owner, app_access_mode
    FROM tenant_users
    WHERE tenant_id = $1 AND user_id = ANY($2::uuid[])
  `, [tenantId, userIds]);

  const installed = await listInstalledWorkspaceApps(tenantId);
  const roleRows = await queryControl(`
    SELECT DISTINCT
      ur.user_id,
      m.id,
      m.key,
      m.name,
      tm.status
    FROM user_roles ur
    INNER JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.deleted_at IS NULL
    INNER JOIN permissions p ON p.id = rp.permission_id
    INNER JOIN modules m ON LOWER(m.key) = LOWER(p.module_key)
    INNER JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = ur.tenant_id
    WHERE ur.tenant_id = $1
      AND ur.user_id = ANY($2::uuid[])
      AND ur.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND LOWER(COALESCE(p.status, 'active')) = 'active'
      AND p.module_key IS NOT NULL
      AND m.deleted_at IS NULL
      AND LOWER(COALESCE(m.status, '')) = 'active'
      AND tm.deleted_at IS NULL
      AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    ORDER BY ur.user_id, m.name, m.id
  `, [tenantId, userIds]);

  const roleApps = new Map<string, WorkspaceAppOption[]>();
  for (const row of roleRows.rows as Record<string, unknown>[]) {
    const uid = String(row.user_id);
    const list = roleApps.get(uid) || [];
    const app = mapApp(row);
    if (!list.some(item => item.id === app.id)) list.push(app);
    roleApps.set(uid, list);
  }

  const selectedRows = await queryControl(`
    SELECT
      tua.user_id,
      m.id,
      m.key,
      m.name,
      tm.status
    FROM tenant_user_apps tua
    INNER JOIN modules m ON m.id = tua.module_id
    INNER JOIN tenant_modules tm ON tm.module_id = m.id AND tm.tenant_id = tua.tenant_id
    WHERE tua.tenant_id = $1
      AND tua.user_id = ANY($2::uuid[])
      AND tua.deleted_at IS NULL
      AND m.deleted_at IS NULL
      AND tm.deleted_at IS NULL
      AND LOWER(COALESCE(m.status, '')) = 'active'
      AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    ORDER BY tua.user_id, LOWER(m.name)
  `, [tenantId, userIds]);

  const selectedApps = new Map<string, WorkspaceAppOption[]>();
  for (const row of selectedRows.rows as Record<string, unknown>[]) {
    const uid = String(row.user_id);
    const list = selectedApps.get(uid) || [];
    list.push(mapApp(row));
    selectedApps.set(uid, list);
  }

  for (const row of memberships.rows as Record<string, unknown>[]) {
    const uid = String(row.user_id);
    const owner = row.is_owner === true;
    const mode: AppAccessMode = row.app_access_mode === 'selected' ? 'selected' : 'role_based';
    const eligible = owner ? installed : (roleApps.get(uid) || []);
    const eligibleIds = new Set(eligible.map(app => app.id));
    const apps = owner || mode === 'role_based'
      ? eligible
      : (selectedApps.get(uid) || []).filter(app => eligibleIds.has(app.id));
    output.set(uid, { mode: owner ? 'role_based' : mode, apps });
  }

  return output;
}
