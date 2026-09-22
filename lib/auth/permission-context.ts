import 'server-only';

import { queryControl } from '@/lib/db/control';
import {
  requireTenantContext,
  type TrustedTenantContext,
} from '@/lib/auth/tenant-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  getWorkspaceSubscriptionAccessState,
} from '@/lib/billing/access';

export interface EffectiveRole {
  id: string;
  key: string | null;
  name: string;
  description: string | null;
  isSystem: boolean;
  tenantId: string | null;
}

export interface EffectivePermission {
  id: string;
  key: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  moduleKey: string | null;
  scope: 'workspace' | 'company' | 'module' | 'record';
  isSystem: boolean;
}

export interface PermissionContext {
  sessionId: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  isOwner: boolean;
  roles: EffectiveRole[];
  permissions: EffectivePermission[];
  permissionKeys: string[];
  permissionSet: ReadonlySet<string>;
}

type RoleRow = {
  id: unknown;
  key: unknown;
  name: unknown;
  description: unknown;
  is_system: unknown;
  tenant_id: unknown;
};

type PermissionRow = {
  id: unknown;
  key: unknown;
  name: unknown;
  description: unknown;
  resource: unknown;
  action: unknown;
  module_key: unknown;
  scope: unknown;
  is_system: unknown;
};

type MembershipAppBoundary = {
  mode: 'role_based' | 'selected';
  selectedModuleKeys: ReadonlySet<string>;
};

function normalizePermissionKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeModuleKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeScope(value: unknown): 'workspace' | 'company' | 'module' | 'record' {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (normalized === 'company') return 'company';
  if (normalized === 'module') return 'module';
  if (normalized === 'record') return 'record';
  return 'workspace';
}

function mapRole(row: RoleRow): EffectiveRole {
  return {
    id: String(row.id),
    key: typeof row.key === 'string' ? row.key : null,
    name: typeof row.name === 'string' ? row.name : '',
    description: typeof row.description === 'string' ? row.description : null,
    isSystem: row.is_system === true,
    tenantId: typeof row.tenant_id === 'string' ? row.tenant_id : null,
  };
}

function mapPermission(row: PermissionRow): EffectivePermission {
  return {
    id: String(row.id),
    key: normalizePermissionKey(row.key),
    name: typeof row.name === 'string' ? row.name : normalizePermissionKey(row.key),
    description: typeof row.description === 'string' ? row.description : null,
    resource: typeof row.resource === 'string' ? row.resource : '',
    action: typeof row.action === 'string' ? row.action : '',
    moduleKey: typeof row.module_key === 'string' ? row.module_key : null,
    scope: normalizeScope(row.scope),
    isSystem: row.is_system === true,
  };
}

const OWNER_INSTALLED_MODULE_CONDITION = `
  (
    p.module_key IS NULL
    OR EXISTS (
      SELECT 1
      FROM tenant_modules tm
      INNER JOIN modules m ON m.id = tm.module_id
      WHERE tm.tenant_id = $1
        AND tm.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND LOWER(COALESCE(m.status, '')) = 'active'
        AND LOWER(COALESCE(m.key, '')) = LOWER(COALESCE(p.module_key, ''))
        AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    )
  )
`;

const ROLE_INSTALLED_MODULE_CONDITION = `
  (
    p.module_key IS NULL
    OR EXISTS (
      SELECT 1
      FROM tenant_modules tm
      INNER JOIN modules m ON m.id = tm.module_id
      WHERE tm.tenant_id = $2
        AND tm.deleted_at IS NULL
        AND m.deleted_at IS NULL
        AND LOWER(COALESCE(m.status, '')) = 'active'
        AND LOWER(COALESCE(m.key, '')) = LOWER(COALESCE(p.module_key, ''))
        AND LOWER(COALESCE(tm.status, '')) IN ('installed', 'active', 'enabled')
    )
  )
`;

async function loadAssignedRoles(context: TrustedTenantContext): Promise<EffectiveRole[]> {
  const result = await queryControl(`
    SELECT
      resolved_roles.id,
      resolved_roles.key,
      resolved_roles.name,
      resolved_roles.description,
      resolved_roles.is_system,
      resolved_roles.tenant_id
    FROM (
      SELECT DISTINCT
        r.id,
        r.key,
        r.name,
        r.description,
        r.is_system,
        r.tenant_id
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = $1
        AND ur.tenant_id = $2
        AND ur.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND LOWER(COALESCE(r.status, 'active')) = 'active'
        AND (
          (r.is_system = TRUE AND r.tenant_id IS NULL)
          OR (r.is_system = FALSE AND r.tenant_id = $2)
        )
    ) AS resolved_roles
    ORDER BY
      resolved_roles.is_system DESC,
      LOWER(resolved_roles.name),
      resolved_roles.id
  `, [context.userId, context.tenantId]);

  return (result.rows as RoleRow[]).map(mapRole);
}

async function loadOwnerPermissions(context: TrustedTenantContext): Promise<EffectivePermission[]> {
  const result = await queryControl(`
    SELECT
      p.id,
      p.key,
      p.name,
      p.description,
      p.resource,
      p.action,
      p.module_key,
      p.scope,
      p.is_system
    FROM permissions p
    WHERE p.deleted_at IS NULL
      AND LOWER(COALESCE(p.status, 'active')) = 'active'
      AND ${OWNER_INSTALLED_MODULE_CONDITION}
    ORDER BY
      CASE WHEN p.module_key IS NULL THEN 0 ELSE 1 END,
      LOWER(COALESCE(p.module_key, '')),
      LOWER(p.key),
      p.id
  `, [context.tenantId]);

  return (result.rows as PermissionRow[])
    .map(mapPermission)
    .filter(permission => Boolean(permission.key));
}

async function loadRolePermissions(context: TrustedTenantContext): Promise<EffectivePermission[]> {
  const result = await queryControl(`
    SELECT
      resolved_permissions.id,
      resolved_permissions.key,
      resolved_permissions.name,
      resolved_permissions.description,
      resolved_permissions.resource,
      resolved_permissions.action,
      resolved_permissions.module_key,
      resolved_permissions.scope,
      resolved_permissions.is_system
    FROM (
      SELECT DISTINCT
        p.id,
        p.key,
        p.name,
        p.description,
        p.resource,
        p.action,
        p.module_key,
        p.scope,
        p.is_system
      FROM user_roles ur
      INNER JOIN roles r ON r.id = ur.role_id
      INNER JOIN role_permissions rp ON rp.role_id = r.id
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE ur.user_id = $1
        AND ur.tenant_id = $2
        AND ur.deleted_at IS NULL
        AND r.deleted_at IS NULL
        AND LOWER(COALESCE(r.status, 'active')) = 'active'
        AND (
          (r.is_system = TRUE AND r.tenant_id IS NULL)
          OR (r.is_system = FALSE AND r.tenant_id = $2)
        )
        AND rp.deleted_at IS NULL
        AND p.deleted_at IS NULL
        AND LOWER(COALESCE(p.status, 'active')) = 'active'
        AND ${ROLE_INSTALLED_MODULE_CONDITION}
    ) AS resolved_permissions
    ORDER BY
      CASE WHEN resolved_permissions.module_key IS NULL THEN 0 ELSE 1 END,
      LOWER(COALESCE(resolved_permissions.module_key, '')),
      LOWER(resolved_permissions.key),
      resolved_permissions.id
  `, [context.userId, context.tenantId]);

  return (result.rows as PermissionRow[])
    .map(mapPermission)
    .filter(permission => Boolean(permission.key));
}

async function loadMembershipAppBoundary(context: TrustedTenantContext): Promise<MembershipAppBoundary> {
  if (context.isOwner) {
    return { mode: 'role_based', selectedModuleKeys: new Set<string>() };
  }

  const membership = await queryControl(`
    SELECT app_access_mode
    FROM tenant_users
    WHERE id = $1
      AND tenant_id = $2
      AND user_id = $3
      AND deleted_at IS NULL
    LIMIT 1
  `, [context.membershipId, context.tenantId, context.userId]);

  const mode: 'role_based' | 'selected' = membership.rows[0]?.app_access_mode === 'selected'
    ? 'selected'
    : 'role_based';

  if (mode === 'role_based') {
    return { mode, selectedModuleKeys: new Set<string>() };
  }

  const result = await queryControl(`
    SELECT LOWER(m.key) AS module_key
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
  `, [context.tenantId, context.userId]);

  return {
    mode,
    selectedModuleKeys: new Set(
      result.rows
        .map(row => normalizeModuleKey(row.module_key))
        .filter(Boolean),
    ),
  };
}

function applyAppBoundary(
  permissions: EffectivePermission[],
  boundary: MembershipAppBoundary,
): EffectivePermission[] {
  if (boundary.mode === 'role_based') return permissions;

  return permissions.filter(permission => {
    const moduleKey = normalizeModuleKey(permission.moduleKey);
    if (!moduleKey) return true; // Core/platform permissions are not business-app grants.
    return boundary.selectedModuleKeys.has(moduleKey);
  });
}

function uniquePermissions(permissions: EffectivePermission[]): EffectivePermission[] {
  const byKey = new Map<string, EffectivePermission>();
  for (const permission of permissions) {
    if (permission.key && !byKey.has(permission.key)) byKey.set(permission.key, permission);
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function resolvePermissionContext(
  tenantContext: TrustedTenantContext,
): Promise<PermissionContext> {
  const [roles, rawPermissions, appBoundary] = await Promise.all([
    loadAssignedRoles(tenantContext),
    tenantContext.isOwner
      ? loadOwnerPermissions(tenantContext)
      : loadRolePermissions(tenantContext),
    loadMembershipAppBoundary(tenantContext),
  ]);

  const resolvedPermissions = uniquePermissions(
    tenantContext.isOwner
      ? rawPermissions
      : applyAppBoundary(rawPermissions, appBoundary),
  );

  const subscriptionAccess =
    await getWorkspaceSubscriptionAccessState(
      tenantContext.tenantId,
    );

  const recoveryPermissions =
    new Set<string>([
      SAMI_PERMISSIONS
        .BILLING_VIEW,
      SAMI_PERMISSIONS
        .BILLING_MANAGE,
      SAMI_PERMISSIONS
        .SETTINGS_VIEW,
      SAMI_PERMISSIONS
        .SETTINGS_MANAGE,
    ]);

  const permissions =
    subscriptionAccess.pastDue
      ? resolvedPermissions.filter(
          permission =>
            recoveryPermissions.has(
              permission.key,
            ),
        )
      : resolvedPermissions;

  const permissionKeys = permissions.map(permission => permission.key);
  const permissionSet = new Set<string>(permissionKeys);

  return {
    sessionId: tenantContext.sessionId,
    userId: tenantContext.userId,
    tenantId: tenantContext.tenantId,
    membershipId: tenantContext.membershipId,
    isOwner: tenantContext.isOwner,
    roles,
    permissions,
    permissionKeys,
    permissionSet,
  };
}

export async function getPermissionContext(): Promise<PermissionContext> {
  return resolvePermissionContext(await requireTenantContext());
}

export async function getEffectivePermissionKeys(): Promise<string[]> {
  const context = await getPermissionContext();
  return [...context.permissionKeys];
}

export function permissionContextHas(context: PermissionContext, permission: string): boolean {
  const key = normalizePermissionKey(permission);
  return Boolean(key) && context.permissionSet.has(key);
}

export function permissionContextHasAny(context: PermissionContext, permissions: readonly string[]): boolean {
  if (permissions.length === 0) return false;
  return permissions.some(permission => permissionContextHas(context, permission));
}

export function permissionContextHasAll(context: PermissionContext, permissions: readonly string[]): boolean {
  if (permissions.length === 0) return true;
  return permissions.every(permission => permissionContextHas(context, permission));
}

export async function hasPermission(permission: string): Promise<boolean> {
  return permissionContextHas(await getPermissionContext(), permission);
}

export async function hasAnyPermission(permissions: readonly string[]): Promise<boolean> {
  return permissionContextHasAny(await getPermissionContext(), permissions);
}

export async function hasAllPermissions(permissions: readonly string[]): Promise<boolean> {
  return permissionContextHasAll(await getPermissionContext(), permissions);
}

export function getPermissionFromContext(
  context: PermissionContext,
  permission: string,
): EffectivePermission | null {
  const key = normalizePermissionKey(permission);
  if (!key) return null;
  return context.permissions.find(item => item.key === key) || null;
}

export function hasRole(context: PermissionContext, roleKey: string): boolean {
  const normalized = typeof roleKey === 'string' ? roleKey.trim().toLowerCase() : '';
  if (!normalized) return false;
  return context.roles.some(role => role.key?.trim().toLowerCase() === normalized);
}
