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

   Categories:
   - 8.2 Permission Resolution
   - 8.9 Module Permission Registration

   TRUST CHAIN

       session
          ↓
       active internal membership
          ↓
       active workspace
          ↓
       trusted tenant context
          ↓
       active assigned roles
          ↓
       active permissions
          ↓
       installed module validation
          ↓
       effective permissions

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
    | 'workspace'
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
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  switch (
    normalized
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
   INSTALLED MODULE CONDITIONS

   IMPORTANT:

   We intentionally maintain two versions because the queries have
   different parameter lists.

   OWNER:
       $1 = tenantId

   ROLE USER:
       $1 = userId
       $2 = tenantId

   This prevents PostgreSQL 42P18 caused by referencing $2 without
   a type-resolvable $1.
   ================================================================ */

const OWNER_INSTALLED_MODULE_CONDITION = `
  (
    p.module_key
      IS NULL

    OR

    EXISTS (
      SELECT
        1

      FROM tenant_modules tm

      INNER JOIN modules m
        ON m.id =
           tm.module_id

      WHERE tm.tenant_id =
            $1

        AND tm.deleted_at
            IS NULL

        AND m.deleted_at
            IS NULL

        AND LOWER(
          COALESCE(
            m.status,
            ''
          )
        ) =
        'active'

        AND LOWER(
          COALESCE(
            m.key,
            ''
          )
        ) =
        LOWER(
          COALESCE(
            p.module_key,
            ''
          )
        )

        AND LOWER(
          COALESCE(
            tm.status,
            ''
          )
        ) IN (
          'installed',
          'active',
          'enabled'
        )
    )
  )
`;


const ROLE_INSTALLED_MODULE_CONDITION = `
  (
    p.module_key
      IS NULL

    OR

    EXISTS (
      SELECT
        1

      FROM tenant_modules tm

      INNER JOIN modules m
        ON m.id =
           tm.module_id

      WHERE tm.tenant_id =
            $2

        AND tm.deleted_at
            IS NULL

        AND m.deleted_at
            IS NULL

        AND LOWER(
          COALESCE(
            m.status,
            ''
          )
        ) =
        'active'

        AND LOWER(
          COALESCE(
            m.key,
            ''
          )
        ) =
        LOWER(
          COALESCE(
            p.module_key,
            ''
          )
        )

        AND LOWER(
          COALESCE(
            tm.status,
            ''
          )
        ) IN (
          'installed',
          'active',
          'enabled'
        )
    )
  )
`;


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

          INNER JOIN roles r
            ON r.id =
               ur.role_id

          WHERE ur.user_id =
                $1

            AND ur.tenant_id =
                $2

            AND ur.deleted_at
                IS NULL

            AND r.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                r.status,
                'active'
              )
            ) =
            'active'

            AND (
              (
                r.is_system =
                  TRUE

                AND r.tenant_id
                    IS NULL
              )

              OR

              (
                r.is_system =
                  FALSE

                AND r.tenant_id =
                    $2
              )
            )
        )
          AS resolved_roles

        ORDER BY
          resolved_roles.is_system
            DESC,

          LOWER(
            resolved_roles.name
          )
            ASC,

          resolved_roles.id
            ASC
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

   Owner receives every active permission AVAILABLE to the current
   workspace.

   Core permissions:
       available

   Module permissions:
       available only when module installed/enabled

   IMPORTANT:
       this query has ONLY ONE parameter

       $1 = tenantId

   ================================================================ */

async function loadOwnerPermissions(
  context:
    TrustedTenantContext,
): Promise<EffectivePermission[]> {
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
          ) =
          'active'

          AND ${OWNER_INSTALLED_MODULE_CONDITION}

        ORDER BY
          CASE
            WHEN p.module_key
                 IS NULL
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            COALESCE(
              p.module_key,
              ''
            )
          ) ASC,

          LOWER(
            p.key
          ) ASC,

          p.id ASC
      `,
      [
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
   LOAD ROLE PERMISSIONS
   ================================================================ */

async function loadRolePermissions(
  context:
    TrustedTenantContext,
): Promise<EffectivePermission[]> {
  const result =
    await queryControl(
      `
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

          INNER JOIN roles r
            ON r.id =
               ur.role_id

          INNER JOIN role_permissions rp
            ON rp.role_id =
               r.id

          INNER JOIN permissions p
            ON p.id =
               rp.permission_id

          WHERE ur.user_id =
                $1

            AND ur.tenant_id =
                $2

            AND ur.deleted_at
                IS NULL

            AND r.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                r.status,
                'active'
              )
            ) =
            'active'

            AND (
              (
                r.is_system =
                  TRUE

                AND r.tenant_id
                    IS NULL
              )

              OR

              (
                r.is_system =
                  FALSE

                AND r.tenant_id =
                    $2
              )
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
            ) =
            'active'

            AND ${ROLE_INSTALLED_MODULE_CONDITION}
        )
          AS resolved_permissions

        ORDER BY
          CASE
            WHEN resolved_permissions.module_key
                 IS NULL
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            COALESCE(
              resolved_permissions.module_key,
              ''
            )
          ) ASC,

          LOWER(
            resolved_permissions.key
          ) ASC,

          resolved_permissions.id
            ASC
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
   RESOLVE PERMISSION CONTEXT
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
        ? loadOwnerPermissions(
            tenantContext,
          )
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
    new Set<string>(
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
   CURRENT USER PERMISSION CONTEXT
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
   HAS ONE
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
   HAS ANY
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
   HAS ALL
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
   HAS ONE — CURRENT USER
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
   HAS ANY — CURRENT USER
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
   HAS ALL — CURRENT USER
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
    typeof roleKey ===
      'string'
      ? roleKey
          .trim()
          .toLowerCase()
      : '';


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