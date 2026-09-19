import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';

import {
  requireTenantContext,
  type TrustedTenantContext,
} from '@/lib/auth/tenant-context';


/* ================================================================
   SaMi PERMISSION RESOLUTION ENGINE
   ================================================================

   Category 8.2

   TRUST CHAIN

   session
      ↓
   active global account
      ↓
   active INTERNAL membership
      ↓
   active workspace
      ↓
   active tenant database
      ↓
   trusted tenant context
      ↓
   assigned roles
      ↓
   active role permissions
      ↓
   effective permissions


   IMPORTANT SECURITY RULES

   1. This file NEVER accepts tenantId from the browser.

   2. requireTenantContext() determines the workspace.

   3. user_roles must belong to that exact tenant.

   4. Custom roles from another tenant are rejected.

   5. Deleted/disabled roles do not grant access.

   6. Deleted/disabled permissions do not grant access.

   7. Deleted role assignments do not grant access.

   8. Deleted role-permission links do not grant access.

   9. Workspace ownership is structural.

      tenant_users.is_owner

      remains authoritative.

   10. An owner receives every ACTIVE REGISTERED permission.

       We intentionally do NOT return true for arbitrary strings.

       Therefore:

           hasPermission('made.up.permission')

       remains false even for an owner unless that permission exists
       in the permissions registry.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export interface EffectiveRole {
  id:
    string;

  key:
    string | null;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  tenantId:
    string | null;
}


export interface EffectivePermission {
  id:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  resource:
    string;

  action:
    string;

  moduleKey:
    string | null;

  scope:
    'workspace'
    | 'company'
    | 'module'
    | 'record';

  isSystem:
    boolean;
}


export interface PermissionContext {
  sessionId:
    string;

  userId:
    string;

  tenantId:
    string;

  membershipId:
    string;

  isOwner:
    boolean;

  roles:
    EffectiveRole[];

  permissions:
    EffectivePermission[];

  permissionKeys:
    string[];

  permissionSet:
    ReadonlySet<string>;
}


/* ================================================================
   INTERNAL ROW TYPES
   ================================================================ */

interface RoleRow {
  id:
    unknown;

  key:
    unknown;

  name:
    unknown;

  description:
    unknown;

  is_system:
    unknown;

  tenant_id:
    unknown;
}


interface PermissionRow {
  id:
    unknown;

  key:
    unknown;

  name:
    unknown;

  description:
    unknown;

  resource:
    unknown;

  action:
    unknown;

  module_key:
    unknown;

  scope:
    unknown;

  is_system:
    unknown;
}


/* ================================================================
   NORMALIZATION
   ================================================================ */

function normalizePermissionKey(
  value:
    unknown,
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }


  return value
    .trim()
    .toLowerCase();
}


function normalizeScope(
  value:
    unknown,
):
  | 'workspace'
  | 'company'
  | 'module'
  | 'record' {
  switch (
    value
  ) {
    case 'company':
      return 'company';

    case 'module':
      return 'module';

    case 'record':
      return 'record';

    default:
      return 'workspace';
  }
}


/* ================================================================
   MAP ROLE
   ================================================================ */

function mapRole(
  row:
    RoleRow,
): EffectiveRole {
  return {
    id:
      String(
        row.id,
      ),

    key:
      typeof row.key ===
        'string'
        ? row.key
        : null,

    name:
      typeof row.name ===
        'string'
        ? row.name
        : '',

    description:
      typeof row.description ===
        'string'
        ? row.description
        : null,

    isSystem:
      row.is_system ===
        true,

    tenantId:
      typeof row.tenant_id ===
        'string'
        ? row.tenant_id
        : null,
  };
}


/* ================================================================
   MAP PERMISSION
   ================================================================ */

function mapPermission(
  row:
    PermissionRow,
): EffectivePermission {
  return {
    id:
      String(
        row.id,
      ),

    key:
      normalizePermissionKey(
        row.key,
      ),

    name:
      typeof row.name ===
        'string'
        ? row.name
        : normalizePermissionKey(
            row.key,
          ),

    description:
      typeof row.description ===
        'string'
        ? row.description
        : null,

    resource:
      typeof row.resource ===
        'string'
        ? row.resource
        : '',

    action:
      typeof row.action ===
        'string'
        ? row.action
        : '',

    moduleKey:
      typeof row.module_key ===
        'string'
        ? row.module_key
        : null,

    scope:
      normalizeScope(
        row.scope,
      ),

    isSystem:
      row.is_system ===
        true,
  };
}


/* ================================================================
   LOAD ASSIGNED ROLES
   ================================================================ */

async function loadAssignedRoles(
  context:
    TrustedTenantContext,
): Promise<EffectiveRole[]> {
  const result =
    await queryControl(
      `
        SELECT DISTINCT
          r.id,
          r.key,
          r.name,
          r.description,
          r.is_system,
          r.tenant_id

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

          AND LOWER(
            COALESCE(
              r.status,
              'active'
            )
          ) = 'active'

          AND (
            r.tenant_id
              IS NULL

            OR

            r.tenant_id = $2
          )

        ORDER BY
          r.is_system DESC,

          LOWER(
            r.name
          ) ASC,

          r.id ASC
      `,
      [
        context.userId,
        context.tenantId,
      ],
    );


  return (
    result.rows as RoleRow[]
  ).map(
    mapRole,
  );
}


/* ================================================================
   LOAD OWNER PERMISSIONS
   ================================================================

   Workspace owner receives every ACTIVE REGISTERED permission.

   This means newly registered module permissions automatically
   become available to the owner without adding a fake Owner role.

   ================================================================ */

async function loadOwnerPermissions():
  Promise<EffectivePermission[]> {
  const result =
    await queryControl(
      `
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

        WHERE p.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              p.status,
              'active'
            )
          ) = 'active'

        ORDER BY
          LOWER(
            p.key
          ) ASC,

          p.id ASC
      `,
    );


  return (
    result.rows as PermissionRow[]
  )
    .map(
      mapPermission,
    )
    .filter(
      permission =>
        Boolean(
          permission.key,
        ),
    );
}


/* ================================================================
   LOAD ROLE PERMISSIONS
   ================================================================ */

async function loadRolePermissions(
  context:
    TrustedTenantContext,
): Promise<EffectivePermission[]> {
  const result =
    await queryControl(
      `
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

        INNER JOIN roles r
          ON r.id =
             ur.role_id

        INNER JOIN role_permissions rp
          ON rp.role_id =
             r.id

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE ur.user_id = $1
          AND ur.tenant_id = $2

          AND ur.deleted_at
              IS NULL

          AND r.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              r.status,
              'active'
            )
          ) = 'active'

          AND (
            r.tenant_id
              IS NULL

            OR

            r.tenant_id = $2
          )

          AND rp.deleted_at
              IS NULL

          AND p.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              p.status,
              'active'
            )
          ) = 'active'

        ORDER BY
          LOWER(
            p.key
          ) ASC,

          p.id ASC
      `,
      [
        context.userId,
        context.tenantId,
      ],
    );


  return (
    result.rows as PermissionRow[]
  )
    .map(
      mapPermission,
    )
    .filter(
      permission =>
        Boolean(
          permission.key,
        ),
    );
}


/* ================================================================
   DEDUPLICATE PERMISSIONS
   ================================================================

   Multiple roles may grant the same permission.

   Effective authorization is additive, so the user receives the
   permission once.

   ================================================================ */

function uniquePermissions(
  permissions:
    EffectivePermission[],
): EffectivePermission[] {
  const byKey =
    new Map<
      string,
      EffectivePermission
    >();


  for (
    const permission
    of permissions
  ) {
    if (
      !permission.key
    ) {
      continue;
    }


    if (
      !byKey.has(
        permission.key,
      )
    ) {
      byKey.set(
        permission.key,
        permission,
      );
    }
  }


  return Array.from(
    byKey.values(),
  ).sort(
    (
      first,
      second,
    ) =>
      first.key.localeCompare(
        second.key,
      ),
  );
}


/* ================================================================
   RESOLVE FROM TRUSTED TENANT CONTEXT
   ================================================================

   Use this when another server function already called:

       requireTenantContext()

   This avoids unnecessarily resolving membership twice.

   ================================================================ */

export async function resolvePermissionContext(
  tenantContext:
    TrustedTenantContext,
): Promise<PermissionContext> {
  const [
    roles,
    rawPermissions,
  ] =
    await Promise.all([
      loadAssignedRoles(
        tenantContext,
      ),

      tenantContext.isOwner
        ? loadOwnerPermissions()
        : loadRolePermissions(
            tenantContext,
          ),
    ]);


  const permissions =
    uniquePermissions(
      rawPermissions,
    );


  const permissionKeys =
    permissions.map(
      permission =>
        permission.key,
    );


  const permissionSet =
    new Set(
      permissionKeys,
    );


  return {
    sessionId:
      tenantContext.sessionId,

    userId:
      tenantContext.userId,

    tenantId:
      tenantContext.tenantId,

    membershipId:
      tenantContext.membershipId,

    isOwner:
      tenantContext.isOwner,

    roles,

    permissions,

    permissionKeys,

    permissionSet,
  };
}


/* ================================================================
   RESOLVE CURRENT USER
   ================================================================

   This is the normal entry point.

   No tenant ID is accepted.

   ================================================================ */

export async function getPermissionContext():
  Promise<PermissionContext> {
  const tenantContext =
    await requireTenantContext();


  return resolvePermissionContext(
    tenantContext,
  );
}


/* ================================================================
   EFFECTIVE PERMISSION KEYS
   ================================================================ */

export async function getEffectivePermissionKeys():
  Promise<string[]> {
  const context =
    await getPermissionContext();


  return [
    ...context.permissionKeys,
  ];
}


/* ================================================================
   HAS PERMISSION — EXISTING CONTEXT
   ================================================================ */

export function permissionContextHas(
  context:
    PermissionContext,

  permission:
    string,
): boolean {
  const key =
    normalizePermissionKey(
      permission,
    );


  if (
    !key
  ) {
    return false;
  }


  return context.permissionSet.has(
    key,
  );
}


/* ================================================================
   HAS ANY — EXISTING CONTEXT
   ================================================================ */

export function permissionContextHasAny(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): boolean {
  if (
    permissions.length ===
      0
  ) {
    return false;
  }


  return permissions.some(
    permission =>
      permissionContextHas(
        context,
        permission,
      ),
  );
}


/* ================================================================
   HAS ALL — EXISTING CONTEXT
   ================================================================ */

export function permissionContextHasAll(
  context:
    PermissionContext,

  permissions:
    readonly string[],
): boolean {
  if (
    permissions.length ===
      0
  ) {
    return true;
  }


  return permissions.every(
    permission =>
      permissionContextHas(
        context,
        permission,
      ),
  );
}


/* ================================================================
   HAS PERMISSION — CURRENT USER
   ================================================================ */

export async function hasPermission(
  permission:
    string,
): Promise<boolean> {
  const context =
    await getPermissionContext();


  return permissionContextHas(
    context,
    permission,
  );
}


/* ================================================================
   HAS ANY PERMISSION — CURRENT USER
   ================================================================ */

export async function hasAnyPermission(
  permissions:
    readonly string[],
): Promise<boolean> {
  const context =
    await getPermissionContext();


  return permissionContextHasAny(
    context,
    permissions,
  );
}


/* ================================================================
   HAS ALL PERMISSIONS — CURRENT USER
   ================================================================ */

export async function hasAllPermissions(
  permissions:
    readonly string[],
): Promise<boolean> {
  const context =
    await getPermissionContext();


  return permissionContextHasAll(
    context,
    permissions,
  );
}


/* ================================================================
   PERMISSION LOOKUP
   ================================================================ */

export function getPermissionFromContext(
  context:
    PermissionContext,

  permission:
    string,
): EffectivePermission | null {
  const key =
    normalizePermissionKey(
      permission,
    );


  if (
    !key
  ) {
    return null;
  }


  return (
    context.permissions.find(
      item =>
        item.key ===
        key,
    ) ||
    null
  );
}


/* ================================================================
   ROLE LOOKUP
   ================================================================ */

export function hasRole(
  context:
    PermissionContext,

  roleKey:
    string,
): boolean {
  const normalized =
    roleKey
      .trim()
      .toLowerCase();


  if (
    !normalized
  ) {
    return false;
  }


  return context.roles.some(
    role =>
      role.key
        ?.trim()
        .toLowerCase() ===
      normalized,
  );
}