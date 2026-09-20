import 'server-only';

import crypto from 'node:crypto';

import type {
  PoolClient,
} from 'pg';

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


/* ================================================================
   SaMi ROLE ↔ PERMISSION SERVICE
   ================================================================

   Category 8.4

   RESPONSIBILITIES

   - expose the permission catalog available to the workspace
   - expose a role's permission matrix
   - grant permissions to custom roles
   - revoke permissions from custom roles
   - atomically replace a custom role's permissions
   - reject unknown/deleted/disabled permissions
   - reject permissions belonging to unavailable modules
   - protect SaMi system roles
   - enforce workspace isolation
   - write audit events

   TRUST CHAIN

       session
          ↓
       active internal membership
          ↓
       trusted workspace
          ↓
       effective permissions
          ↓
       roles.view / roles.manage
          ↓
       role permission service

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type PermissionScope =
  | 'workspace'
  | 'company'
  | 'module'
  | 'record';


export interface WorkspacePermission {
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
    PermissionScope;

  isSystem:
    boolean;
}


export interface RolePermissionRole {
  id:
    string;

  tenantId:
    string | null;

  key:
    string;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  status:
    'active'
    | 'disabled';

  editable:
    boolean;
}


export interface RolePermissionMatrixItem
  extends WorkspacePermission {
  assigned:
    boolean;
}


export interface RolePermissionMatrix {
  role:
    RolePermissionRole;

  permissions:
    RolePermissionMatrixItem[];

  assignedPermissionKeys:
    string[];

  availablePermissionCount:
    number;

  assignedPermissionCount:
    number;

  editable:
    boolean;
}


export interface RolePermissionAuditContext {
  ipAddress?:
    string | null;

  userAgent?:
    string | null;

  correlationId?:
    string | null;
}


export interface RolePermissionMutationInput {
  roleId:
    string;

  permissionKeys:
    string[];

  audit?:
    RolePermissionAuditContext;
}


export interface RolePermissionMutationResult {
  roleId:
    string;

  changed:
    boolean;

  added:
    string[];

  removed:
    string[];

  matrix:
    RolePermissionMatrix;
}


/* ================================================================
   INTERNAL TYPES
   ================================================================ */

interface RoleRow {
  id:
    unknown;

  tenant_id:
    unknown;

  key:
    unknown;

  name:
    unknown;

  description:
    unknown;

  is_system:
    unknown;

  status:
    unknown;

  deleted_at:
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

  is_available?:
    unknown;
}


/* ================================================================
   ERROR
   ================================================================ */

export class RolePermissionServiceError
  extends Error {
  readonly code:
    | 'ROLE_VIEW_REQUIRED'
    | 'ROLE_MANAGE_REQUIRED'
    | 'INVALID_ROLE_ID'
    | 'INVALID_PERMISSION_KEY'
    | 'ROLE_NOT_FOUND'
    | 'ROLE_DELETED'
    | 'ROLE_DISABLED'
    | 'SYSTEM_ROLE_PROTECTED'
    | 'PERMISSION_NOT_FOUND'
    | 'PERMISSION_UNAVAILABLE';


  constructor(
    code:
      | 'ROLE_VIEW_REQUIRED'
      | 'ROLE_MANAGE_REQUIRED'
      | 'INVALID_ROLE_ID'
      | 'INVALID_PERMISSION_KEY'
      | 'ROLE_NOT_FOUND'
      | 'ROLE_DELETED'
      | 'ROLE_DISABLED'
      | 'SYSTEM_ROLE_PROTECTED'
      | 'PERMISSION_NOT_FOUND'
      | 'PERMISSION_UNAVAILABLE',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'RolePermissionServiceError';

    this.code =
      code;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const PERMISSION_KEY_PATTERN =
  /^[a-z0-9][a-z0-9._-]*$/;


const MAX_PERMISSION_KEY_LENGTH =
  160;


const MAX_PERMISSION_KEYS_PER_REQUEST =
  500;


/* ================================================================
   VALIDATION
   ================================================================ */

function requireRoleId(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new RolePermissionServiceError(
      'INVALID_ROLE_ID',
      'A valid role ID is required.',
    );
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new RolePermissionServiceError(
      'INVALID_ROLE_ID',
      'A valid role ID is required.',
    );
  }


  return normalized;
}


function normalizePermissionKey(
  value:
    unknown,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new RolePermissionServiceError(
      'INVALID_PERMISSION_KEY',
      'Permission keys must be text.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    !normalized ||
    normalized.length >
      MAX_PERMISSION_KEY_LENGTH ||
    !PERMISSION_KEY_PATTERN.test(
      normalized,
    )
  ) {
    throw new RolePermissionServiceError(
      'INVALID_PERMISSION_KEY',
      `Invalid permission key "${normalized || 'empty'}".`,
    );
  }


  return normalized;
}


function normalizePermissionKeys(
  values:
    unknown,
): string[] {
  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new RolePermissionServiceError(
      'INVALID_PERMISSION_KEY',
      'Permission keys must be provided as an array.',
    );
  }


  if (
    values.length >
      MAX_PERMISSION_KEYS_PER_REQUEST
  ) {
    throw new RolePermissionServiceError(
      'INVALID_PERMISSION_KEY',
      'Too many permissions were supplied in one request.',
    );
  }


  return [
    ...new Set(
      values.map(
        normalizePermissionKey,
      ),
    ),
  ];
}


/* ================================================================
   NORMALIZATION
   ================================================================ */

function normalizeScope(
  value:
    unknown,
): PermissionScope {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'company'
  ) {
    return 'company';
  }


  if (
    normalized ===
      'module'
  ) {
    return 'module';
  }


  if (
    normalized ===
      'record'
  ) {
    return 'record';
  }


  return 'workspace';
}


function normalizeRoleStatus(
  value:
    unknown,
):
  | 'active'
  | 'disabled' {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  return normalized ===
    'disabled'
    ? 'disabled'
    : 'active';
}


/* ================================================================
   MAPPERS
   ================================================================ */

function mapPermission(
  row:
    PermissionRow,
): WorkspacePermission {
  return {
    id:
      String(
        row.id,
      ),

    key:
      String(
        row.key ||
        '',
      )
        .trim()
        .toLowerCase(),

    name:
      typeof row.name ===
        'string'
        ? row.name
        : String(
            row.key ||
            '',
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


function mapRole(
  row:
    RoleRow,
): RolePermissionRole {
  const isSystem =
    row.is_system ===
    true;


  return {
    id:
      String(
        row.id,
      ),

    tenantId:
      typeof row.tenant_id ===
        'string'
        ? row.tenant_id
        : null,

    key:
      typeof row.key ===
        'string'
        ? row.key
        : '',

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

    isSystem,

    status:
      normalizeRoleStatus(
        row.status,
      ),

    editable:
      !isSystem,
  };
}


/* ================================================================
   AUTHORIZATION
   ================================================================ */

async function requireRoleView():
  Promise<PermissionContext> {
  const context =
    await getPermissionContext();


  if (
    !permissionContextHas(
      context,
      SAMI_PERMISSIONS
        .ROLES_VIEW,
    )
  ) {
    throw new RolePermissionServiceError(
      'ROLE_VIEW_REQUIRED',
      'You do not have permission to view workspace role permissions.',
    );
  }


  return context;
}


async function requireRoleManage():
  Promise<PermissionContext> {
  const context =
    await getPermissionContext();


  if (
    !permissionContextHas(
      context,
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    )
  ) {
    throw new RolePermissionServiceError(
      'ROLE_MANAGE_REQUIRED',
      'You do not have permission to manage workspace role permissions.',
    );
  }


  return context;
}


/* ================================================================
   ROLE LOCK
   ================================================================ */

async function lockRolePermissions(
  client:
    PoolClient,

  roleId:
    string,
): Promise<void> {
  await client.query(
    `
      SELECT
        pg_advisory_xact_lock(
          hashtext(
            $1
          )
        )
    `,
    [
      `sami:role-permissions:${roleId}`,
    ],
  );
}


/* ================================================================
   LOAD ROLE

   Visible role:

   system:
       is_system = TRUE
       tenant_id = NULL

   workspace custom:
       is_system = FALSE
       tenant_id = current workspace
   ================================================================ */

async function loadVisibleRole(
  tenantId:
    string,

  roleId:
    string,
): Promise<RolePermissionRole | null> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          tenant_id,
          key,
          name,
          description,
          is_system,
          status,
          deleted_at

        FROM roles

        WHERE id = $2

          AND (
            (
              is_system =
                TRUE

              AND tenant_id
                  IS NULL
            )

            OR

            (
              is_system =
                FALSE

              AND tenant_id =
                  $1
            )
          )

          AND deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tenantId,
        roleId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    return null;
  }


  return mapRole(
    result.rows[0] as RoleRow,
  );
}


/* ================================================================
   LOAD MUTABLE ROLE
   ================================================================ */

async function requireMutableRole(
  client:
    PoolClient,

  tenantId:
    string,

  roleId:
    string,
): Promise<RolePermissionRole> {
  const result =
    await client.query(
      `
        SELECT
          id,
          tenant_id,
          key,
          name,
          description,
          is_system,
          status,
          deleted_at

        FROM roles

        WHERE id = $2

          AND (
            (
              is_system =
                TRUE

              AND tenant_id
                  IS NULL
            )

            OR

            (
              is_system =
                FALSE

              AND tenant_id =
                  $1
            )
          )

        LIMIT 1

        FOR UPDATE
      `,
      [
        tenantId,
        roleId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new RolePermissionServiceError(
      'ROLE_NOT_FOUND',
      'The role could not be found in this workspace.',
    );
  }


  const row =
    result.rows[0] as RoleRow;


  if (
    row.deleted_at
  ) {
    throw new RolePermissionServiceError(
      'ROLE_DELETED',
      'Permissions cannot be changed on a deleted role.',
    );
  }


  const role =
    mapRole(
      row,
    );


  if (
    role.isSystem
  ) {
    throw new RolePermissionServiceError(
      'SYSTEM_ROLE_PROTECTED',
      'SaMi system role permissions are protected and cannot be changed from a workspace.',
    );
  }


  return role;
}


/* ================================================================
   AVAILABLE PERMISSION SQL

   Core permission:
       module_key IS NULL
       → available

   Module permission:
       module_key IS NOT NULL
       → available only when that module is installed for the
         current workspace.

   ================================================================ */

const AVAILABLE_PERMISSION_SELECT = `
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

    /* SaMi AI is a subscription-entitled core capability, not a role grant. */
    AND LOWER(p.key) NOT IN ('ai.use', 'ai.manage')

    AND (
      p.module_key
        IS NULL

      OR

      EXISTS (
        SELECT 1

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
            m.key
          ) =
          LOWER(
            p.module_key
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
   LIST WORKSPACE PERMISSION CATALOG
   ================================================================ */

export async function listWorkspacePermissionCatalog():
  Promise<WorkspacePermission[]> {
  const context =
    await requireRoleView();


  const result =
    await queryControl(
      `
        ${AVAILABLE_PERMISSION_SELECT}

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
            p.resource
          ) ASC,

          LOWER(
            p.action
          ) ASC,

          LOWER(
            p.key
          ) ASC
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
   CURRENT ROLE PERMISSION KEYS
   ================================================================ */

async function loadAssignedPermissionKeys(
  tenantId:
    string,

  roleId:
    string,
): Promise<string[]> {
  const result =
    await queryControl(
      `
        SELECT
          LOWER(
            p.key
          ) AS key

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        INNER JOIN roles r
          ON r.id =
             rp.role_id

        WHERE rp.role_id =
              $2

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

          AND r.deleted_at
              IS NULL

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
                  $1
            )
          )

        ORDER BY
          LOWER(
            p.key
          ) ASC
      `,
      [
        tenantId,
        roleId,
      ],
    );


  return result.rows
    .map(
      row =>
        typeof row.key ===
          'string'
          ? row.key
          : '',
    )
    .filter(
      Boolean,
    );
}


/* ================================================================
   ROLE PERMISSION MATRIX
   ================================================================ */

export async function getRolePermissionMatrix(
  roleId:
    string,
): Promise<RolePermissionMatrix> {
  const context =
    await requireRoleView();


  const normalizedRoleId =
    requireRoleId(
      roleId,
    );


  const [
    role,
    permissions,
    assignedPermissionKeys,
  ] =
    await Promise.all([
      loadVisibleRole(
        context.tenantId,
        normalizedRoleId,
      ),

      listWorkspacePermissionCatalogForContext(
        context,
      ),

      loadAssignedPermissionKeys(
        context.tenantId,
        normalizedRoleId,
      ),
    ]);


  if (
    !role
  ) {
    throw new RolePermissionServiceError(
      'ROLE_NOT_FOUND',
      'The role could not be found in this workspace.',
    );
  }


  const assignedSet =
    new Set(
      assignedPermissionKeys,
    );


  const matrix =
    permissions.map(
      permission => ({
        ...permission,

        assigned:
          assignedSet.has(
            permission.key,
          ),
      }),
    );


  return {
    role,

    permissions:
      matrix,

    assignedPermissionKeys:
      matrix
        .filter(
          item =>
            item.assigned,
        )
        .map(
          item =>
            item.key,
        ),

    availablePermissionCount:
      matrix.length,

    assignedPermissionCount:
      matrix.filter(
        item =>
          item.assigned,
      ).length,

    editable:
      role.editable,
  };
}


/* ================================================================
   INTERNAL CATALOG LOADER

   Avoid resolving permission context twice when the caller already
   has one.
   ================================================================ */

async function listWorkspacePermissionCatalogForContext(
  context:
    PermissionContext,
): Promise<WorkspacePermission[]> {
  const result =
    await queryControl(
      `
        ${AVAILABLE_PERMISSION_SELECT}

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
            p.resource
          ) ASC,

          LOWER(
            p.action
          ) ASC,

          LOWER(
            p.key
          ) ASC
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
   RESOLVE REQUESTED PERMISSIONS

   Returns only ACTIVE registered permissions.

   A module permission must belong to an installed module.

   ================================================================ */

async function resolveRequestedPermissions(
  client:
    PoolClient,

  tenantId:
    string,

  requestedKeys:
    string[],
): Promise<WorkspacePermission[]> {
  if (
    requestedKeys.length ===
      0
  ) {
    return [];
  }


  const deprecatedCoreAiPermissions =
    requestedKeys.filter(
      key =>
        key === 'ai.use' ||
        key === 'ai.manage',
    );


  if (
    deprecatedCoreAiPermissions.length >
      0
  ) {
    throw new RolePermissionServiceError(
      'PERMISSION_UNAVAILABLE',
      'SaMi AI access is controlled by workspace subscription entitlement and cannot be assigned through roles.',
    );
  }


  /*
   * First determine whether every requested permission actually
   * exists and is active.
   */
  const registeredResult =
    await client.query(
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
          p.is_system,

          CASE
            WHEN p.module_key
                 IS NULL
            THEN TRUE

            WHEN EXISTS (
              SELECT 1

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
                  m.key
                ) =
                LOWER(
                  p.module_key
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
            THEN TRUE

            ELSE FALSE
          END
            AS is_available

        FROM permissions p

        WHERE LOWER(
          p.key
        ) =
        ANY(
          $2::text[]
        )

          AND p.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              p.status,
              'active'
            )
          ) = 'active'
      `,
      [
        tenantId,
        requestedKeys,
      ],
    );


  const rows =
    registeredResult
      .rows as PermissionRow[];


  const byKey =
    new Map<
      string,
      PermissionRow
    >();


  for (
    const row
    of rows
  ) {
    const key =
      typeof row.key ===
        'string'
        ? row.key
            .trim()
            .toLowerCase()
        : '';


    if (
      key
    ) {
      byKey.set(
        key,
        row,
      );
    }
  }


  for (
    const requestedKey
    of requestedKeys
  ) {
    const row =
      byKey.get(
        requestedKey,
      );


    if (
      !row
    ) {
      throw new RolePermissionServiceError(
        'PERMISSION_NOT_FOUND',
        `Permission "${requestedKey}" is not an active registered SaMi permission.`,
      );
    }


    if (
      row.is_available !==
      true
    ) {
      throw new RolePermissionServiceError(
        'PERMISSION_UNAVAILABLE',
        `Permission "${requestedKey}" belongs to an app that is not currently installed in this workspace.`,
      );
    }
  }


  return requestedKeys.map(
    key =>
      mapPermission(
        byKey.get(
          key,
        )!,
      ),
  );
}


/* ================================================================
   LOAD CURRENT ASSIGNMENTS INSIDE TRANSACTION
   ================================================================ */

async function loadCurrentRolePermissions(
  client:
    PoolClient,

  roleId:
    string,
): Promise<WorkspacePermission[]> {
  const result =
    await client.query(
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

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              $1

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
          ) ASC
      `,
      [
        roleId,
      ],
    );


  return (
    result.rows as PermissionRow[]
  ).map(
    mapPermission,
  );
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertPermissionAudit(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    actorUserId:
      string;

    roleId:
      string;

    action:
      string;

    added:
      string[];

    removed:
      string[];

    audit?:
      RolePermissionAuditContext;
  },
): Promise<void> {
  const correlationId =
    input.audit
      ?.correlationId
      ?.trim() ||
    crypto.randomUUID();


  const ipAddress =
    input.audit
      ?.ipAddress
      ?.trim()
      ?.slice(
        0,
        45,
      ) ||
    'unknown';


  const userAgent =
    input.audit
      ?.userAgent
      ?.trim() ||
    '';


  await client.query(
    `
      INSERT INTO audit_logs (
        tenant_id,
        user_id,

        actor_type,

        action,

        resource_type,
        resource_id,

        module,

        result,

        metadata,

        ip_address,
        user_agent,

        correlation_id,

        event_type,

        entity_type,
        entity_id
      )

      VALUES (
        $1,
        $2,

        'human',

        $3,

        'role',
        $4,

        'authorization',

        'success',

        $5::jsonb,

        $6,
        $7,

        $8,

        $3,

        'role',
        $4
      )
    `,
    [
      input.tenantId,
      input.actorUserId,

      input.action,
      input.roleId,

      JSON.stringify({
        added:
          input.added,

        removed:
          input.removed,
      }),

      ipAddress,
      userAgent,

      correlationId,
    ],
  );
}


/* ================================================================
   BUILD MATRIX INSIDE TRANSACTION
   ================================================================ */

async function buildMatrixInsideTransaction(
  client:
    PoolClient,

  tenantId:
    string,

  role:
    RolePermissionRole,
): Promise<RolePermissionMatrix> {
  const catalogResult =
    await client.query(
      `
        ${AVAILABLE_PERMISSION_SELECT}

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
            p.resource
          ) ASC,

          LOWER(
            p.action
          ) ASC,

          LOWER(
            p.key
          ) ASC
      `,
      [
        tenantId,
      ],
    );


  const permissions =
    (
      catalogResult
        .rows as PermissionRow[]
    )
      .map(
        mapPermission,
      )
      .filter(
        item =>
          Boolean(
            item.key,
          ),
      );


  const assignedResult =
    await client.query(
      `
        SELECT
          LOWER(
            p.key
          ) AS key

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              $1

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
      `,
      [
        role.id,
      ],
    );


  const assignedSet =
    new Set<string>(
      assignedResult.rows
        .map(
          row =>
            typeof row.key ===
              'string'
              ? row.key
              : '',
        )
        .filter(
          Boolean,
        ),
    );


  const matrix =
    permissions.map(
      permission => ({
        ...permission,

        assigned:
          assignedSet.has(
            permission.key,
          ),
      }),
    );


  const assignedPermissionKeys =
    matrix
      .filter(
        item =>
          item.assigned,
      )
      .map(
        item =>
          item.key,
      );


  return {
    role,

    permissions:
      matrix,

    assignedPermissionKeys,

    availablePermissionCount:
      matrix.length,

    assignedPermissionCount:
      assignedPermissionKeys
        .length,

    editable:
      role.editable,
  };
}


/* ================================================================
   REPLACE ROLE PERMISSIONS
   ================================================================

   This is the canonical mutation.

   UI permission matrix should normally call this operation rather
   than issuing dozens of independent grant/revoke requests.

   It is atomic:

       current permissions
              ↓
       validate requested set
              ↓
       revoke removed
              ↓
       restore/insert added
              ↓
       audit
              ↓
       commit

   ================================================================ */

export async function replaceWorkspaceRolePermissions(
  input:
    RolePermissionMutationInput,
): Promise<RolePermissionMutationResult> {
  const context =
    await requireRoleManage();


  const roleId =
    requireRoleId(
      input.roleId,
    );


  const requestedKeys =
    normalizePermissionKeys(
      input.permissionKeys,
    );


  return withControlTransaction(
    async client => {
      await lockRolePermissions(
        client,
        roleId,
      );


      const role =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const requestedPermissions =
        await resolveRequestedPermissions(
          client,
          context.tenantId,
          requestedKeys,
        );


      const currentPermissions =
        await loadCurrentRolePermissions(
          client,
          roleId,
        );


      const currentKeys =
        currentPermissions.map(
          permission =>
            permission.key,
        );


      const currentSet =
        new Set(
          currentKeys,
        );


      const requestedSet =
        new Set(
          requestedKeys,
        );


      const added =
        requestedKeys.filter(
          key =>
            !currentSet.has(
              key,
            ),
        );


      const removed =
        currentKeys.filter(
          key =>
            !requestedSet.has(
              key,
            ),
        );


      if (
        added.length ===
          0 &&
        removed.length ===
          0
      ) {
        const matrix =
          await buildMatrixInsideTransaction(
            client,
            context.tenantId,
            role,
          );


        return {
          roleId,

          changed:
            false,

          added:
            [],

          removed:
            [],

          matrix,
        };
      }


      const requestedPermissionIds =
        requestedPermissions.map(
          permission =>
            permission.id,
        );


      /*
       * Soft revoke everything not present in the requested set.
       */
      await client.query(
        `
          UPDATE role_permissions

          SET
            deleted_at =
              NOW(),

            updated_at =
              NOW()

          WHERE role_id = $1
            AND deleted_at IS NULL

            AND NOT (
              permission_id =
              ANY(
                $2::uuid[]
              )
            )
        `,
        [
          roleId,
          requestedPermissionIds,
        ],
      );


      /*
       * Grant / restore requested permissions.
       *
       * Your schema already has:
       *
       * UNIQUE(role_id, permission_id)
       *
       * so ON CONFLICT revives a previously revoked relationship.
       */
      for (
        const permission
        of requestedPermissions
      ) {
        await client.query(
          `
            INSERT INTO role_permissions (
              role_id,
              permission_id,
              granted_by,
              created_at,
              updated_at,
              deleted_at
            )

            VALUES (
              $1,
              $2,
              $3,
              NOW(),
              NOW(),
              NULL
            )

            ON CONFLICT (
              role_id,
              permission_id
            )

            DO UPDATE

            SET
              granted_by =
                EXCLUDED.granted_by,

              deleted_at =
                NULL,

              updated_at =
                NOW()
          `,
          [
            roleId,
            permission.id,
            context.userId,
          ],
        );
      }


      await client.query(
        `
          UPDATE roles

          SET updated_at =
                NOW()

          WHERE id = $1
        `,
        [
          roleId,
        ],
      );


      await insertPermissionAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.permissions.updated',

          added,

          removed,

          audit:
            input.audit,
        },
      );


      const matrix =
        await buildMatrixInsideTransaction(
          client,
          context.tenantId,
          role,
        );


      return {
        roleId,

        changed:
          true,

        added,

        removed,

        matrix,
      };
    },
  );
}


/* ================================================================
   GRANT PERMISSIONS
   ================================================================

   Convenience API for programmatic use.

   Existing role permissions are preserved.

   ================================================================ */

export async function grantWorkspaceRolePermissions(
  input:
    RolePermissionMutationInput,
): Promise<RolePermissionMutationResult> {
  const context =
    await requireRoleManage();


  const roleId =
    requireRoleId(
      input.roleId,
    );


  const requestedKeys =
    normalizePermissionKeys(
      input.permissionKeys,
    );


  return withControlTransaction(
    async client => {
      await lockRolePermissions(
        client,
        roleId,
      );


      const role =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const requestedPermissions =
        await resolveRequestedPermissions(
          client,
          context.tenantId,
          requestedKeys,
        );


      const currentPermissions =
        await loadCurrentRolePermissions(
          client,
          roleId,
        );


      const currentSet =
        new Set(
          currentPermissions.map(
            permission =>
              permission.key,
          ),
        );


      const added =
        requestedKeys.filter(
          key =>
            !currentSet.has(
              key,
            ),
        );


      if (
        added.length ===
          0
      ) {
        const matrix =
          await buildMatrixInsideTransaction(
            client,
            context.tenantId,
            role,
          );


        return {
          roleId,

          changed:
            false,

          added:
            [],

          removed:
            [],

          matrix,
        };
      }


      for (
        const permission
        of requestedPermissions
      ) {
        await client.query(
          `
            INSERT INTO role_permissions (
              role_id,
              permission_id,
              granted_by,
              created_at,
              updated_at,
              deleted_at
            )

            VALUES (
              $1,
              $2,
              $3,
              NOW(),
              NOW(),
              NULL
            )

            ON CONFLICT (
              role_id,
              permission_id
            )

            DO UPDATE

            SET
              granted_by =
                EXCLUDED.granted_by,

              deleted_at =
                NULL,

              updated_at =
                NOW()
          `,
          [
            roleId,
            permission.id,
            context.userId,
          ],
        );
      }


      await client.query(
        `
          UPDATE roles
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [
          roleId,
        ],
      );


      await insertPermissionAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.permissions.granted',

          added,

          removed:
            [],

          audit:
            input.audit,
        },
      );


      const matrix =
        await buildMatrixInsideTransaction(
          client,
          context.tenantId,
          role,
        );


      return {
        roleId,

        changed:
          true,

        added,

        removed:
          [],

        matrix,
      };
    },
  );
}


/* ================================================================
   REVOKE PERMISSIONS
   ================================================================ */

export async function revokeWorkspaceRolePermissions(
  input:
    RolePermissionMutationInput,
): Promise<RolePermissionMutationResult> {
  const context =
    await requireRoleManage();


  const roleId =
    requireRoleId(
      input.roleId,
    );


  const requestedKeys =
    normalizePermissionKeys(
      input.permissionKeys,
    );


  return withControlTransaction(
    async client => {
      await lockRolePermissions(
        client,
        roleId,
      );


      const role =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      /*
       * Validate every supplied permission key.
       *
       * Revocation must not silently accept typos.
       */
      const requestedPermissions =
        await resolveRequestedPermissions(
          client,
          context.tenantId,
          requestedKeys,
        );


      const currentPermissions =
        await loadCurrentRolePermissions(
          client,
          roleId,
        );


      const currentSet =
        new Set(
          currentPermissions.map(
            permission =>
              permission.key,
          ),
        );


      const removed =
        requestedKeys.filter(
          key =>
            currentSet.has(
              key,
            ),
        );


      if (
        removed.length ===
          0
      ) {
        const matrix =
          await buildMatrixInsideTransaction(
            client,
            context.tenantId,
            role,
          );


        return {
          roleId,

          changed:
            false,

          added:
            [],

          removed:
            [],

          matrix,
        };
      }


      const permissionIdsToRemove =
        requestedPermissions
          .filter(
            permission =>
              removed.includes(
                permission.key,
              ),
          )
          .map(
            permission =>
              permission.id,
          );


      await client.query(
        `
          UPDATE role_permissions

          SET
            deleted_at =
              NOW(),

            updated_at =
              NOW()

          WHERE role_id = $1

            AND permission_id =
                ANY(
                  $2::uuid[]
                )

            AND deleted_at
                IS NULL
        `,
        [
          roleId,
          permissionIdsToRemove,
        ],
      );


      await client.query(
        `
          UPDATE roles
          SET updated_at = NOW()
          WHERE id = $1
        `,
        [
          roleId,
        ],
      );


      await insertPermissionAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.permissions.revoked',

          added:
            [],

          removed,

          audit:
            input.audit,
        },
      );


      const matrix =
        await buildMatrixInsideTransaction(
          client,
          context.tenantId,
          role,
        );


      return {
        roleId,

        changed:
          true,

        added:
          [],

        removed,

        matrix,
      };
    },
  );
}