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
   SaMi USER ↔ ROLE ASSIGNMENT SERVICE
   ================================================================

   Category 8.5

   RESPONSIBILITIES

   - list assignable roles
   - read a workspace member's role assignments
   - replace a member's complete role set atomically
   - grant one or more roles
   - revoke one or more roles
   - protect workspace ownership
   - enforce tenant isolation
   - prevent privilege escalation
   - restore soft-deleted user_roles safely
   - audit role assignment changes

   OWNERSHIP

       tenant_users.is_owner

   remains structural.

   Workspace ownership is NOT granted through user_roles.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type UserRoleStatus =
  | 'active'
  | 'disabled';


export interface AssignableWorkspaceRole {
  id: string;

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
    UserRoleStatus;

  permissionCount:
    number;

  assignable:
    boolean;
}


export interface WorkspaceMemberRoleAssignment {
  id:
    string;

  key:
    string;

  name:
    string;

  description:
    string | null;

  isSystem:
    boolean;

  status:
    UserRoleStatus;
}


export interface WorkspaceMemberRoles {
  membershipId:
    string;

  userId:
    string;

  tenantId:
    string;

  isOwner:
    boolean;

  memberType:
    'internal';

  membershipStatus:
    'active';

  roles:
    WorkspaceMemberRoleAssignment[];
}


export interface UserRoleAuditContext {
  ipAddress?:
    string | null;

  userAgent?:
    string | null;

  correlationId?:
    string | null;
}


export interface ReplaceWorkspaceMemberRolesInput {
  userId:
    string;

  roleIds:
    string[];

  audit?:
    UserRoleAuditContext;
}


export interface ModifyWorkspaceMemberRolesInput {
  userId:
    string;

  roleIds:
    string[];

  audit?:
    UserRoleAuditContext;
}


export interface UserRoleMutationResult {
  member:
    WorkspaceMemberRoles;

  changed:
    boolean;

  addedRoleIds:
    string[];

  removedRoleIds:
    string[];
}


/* ================================================================
   INTERNAL TYPES
   ================================================================ */

interface MembershipRow {
  membership_id:
    unknown;

  user_id:
    unknown;

  tenant_id:
    unknown;

  member_type:
    unknown;

  membership_status:
    unknown;

  is_owner:
    unknown;
}


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

  permission_count?:
    unknown;
}


/* ================================================================
   ERROR
   ================================================================ */

export class UserRoleServiceError
  extends Error {
  readonly code:
    | 'ROLE_VIEW_REQUIRED'
    | 'ROLE_MANAGE_REQUIRED'
    | 'INVALID_USER_ID'
    | 'INVALID_ROLE_ID'
    | 'TOO_MANY_ROLES'
    | 'MEMBER_NOT_FOUND'
    | 'MEMBER_NOT_ACTIVE'
    | 'INTERNAL_MEMBER_REQUIRED'
    | 'OWNER_ROLE_ASSIGNMENTS_PROTECTED'
    | 'ROLE_NOT_FOUND'
    | 'ROLE_NOT_ACTIVE'
    | 'ROLE_ACCESS_DENIED'
    | 'PRIVILEGE_ESCALATION_BLOCKED'
    | 'EMPTY_ROLE_SET';


  constructor(
    code:
      | 'ROLE_VIEW_REQUIRED'
      | 'ROLE_MANAGE_REQUIRED'
      | 'INVALID_USER_ID'
      | 'INVALID_ROLE_ID'
      | 'TOO_MANY_ROLES'
      | 'MEMBER_NOT_FOUND'
      | 'MEMBER_NOT_ACTIVE'
      | 'INTERNAL_MEMBER_REQUIRED'
      | 'OWNER_ROLE_ASSIGNMENTS_PROTECTED'
      | 'ROLE_NOT_FOUND'
      | 'ROLE_NOT_ACTIVE'
      | 'ROLE_ACCESS_DENIED'
      | 'PRIVILEGE_ESCALATION_BLOCKED'
      | 'EMPTY_ROLE_SET',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'UserRoleServiceError';

    this.code =
      code;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const MAX_ROLES_PER_MEMBER =
  50;


/* ================================================================
   UUID VALIDATION
   ================================================================ */

function requireUuid(
  value:
    string,

  type:
    'user'
    | 'role',
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new UserRoleServiceError(
      type === 'user'
        ? 'INVALID_USER_ID'
        : 'INVALID_ROLE_ID',

      type === 'user'
        ? 'A valid user ID is required.'
        : 'A valid role ID is required.',
    );
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new UserRoleServiceError(
      type === 'user'
        ? 'INVALID_USER_ID'
        : 'INVALID_ROLE_ID',

      type === 'user'
        ? 'A valid user ID is required.'
        : 'A valid role ID is required.',
    );
  }


  return normalized;
}


function normalizeRoleIds(
  values:
    unknown,
): string[] {
  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new UserRoleServiceError(
      'INVALID_ROLE_ID',
      'Role IDs must be supplied as an array.',
    );
  }


  if (
    values.length >
      MAX_ROLES_PER_MEMBER
  ) {
    throw new UserRoleServiceError(
      'TOO_MANY_ROLES',
      `A member cannot have more than ${MAX_ROLES_PER_MEMBER} roles.`,
    );
  }


  return [
    ...new Set(
      values.map(
        value =>
          requireUuid(
            String(
              value,
            ),
            'role',
          ),
      ),
    ),
  ];
}


/* ================================================================
   HELPERS
   ================================================================ */

function toCount(
  value:
    unknown,
): number {
  const number =
    Number(
      value,
    );


  return Number.isFinite(
    number,
  )
    ? Math.max(
        0,
        Math.trunc(
          number,
        ),
      )
    : 0;
}


function normalizeRoleStatus(
  value:
    unknown,
): UserRoleStatus {
  return String(
    value ||
    '',
  )
    .trim()
    .toLowerCase() ===
    'disabled'
    ? 'disabled'
    : 'active';
}


function mapRole(
  row:
    RoleRow,

  assignable =
    true,
): AssignableWorkspaceRole {
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

    isSystem:
      row.is_system ===
        true,

    status:
      normalizeRoleStatus(
        row.status,
      ),

    permissionCount:
      toCount(
        row.permission_count,
      ),

    assignable,
  };
}


function mapAssignedRole(
  row:
    RoleRow,
): WorkspaceMemberRoleAssignment {
  return {
    id:
      String(
        row.id,
      ),

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

    isSystem:
      row.is_system ===
        true,

    status:
      normalizeRoleStatus(
        row.status,
      ),
  };
}


/* ================================================================
   INITIAL AUTHORIZATION
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
    throw new UserRoleServiceError(
      'ROLE_VIEW_REQUIRED',
      'You do not have permission to view workspace role assignments.',
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
    throw new UserRoleServiceError(
      'ROLE_MANAGE_REQUIRED',
      'You do not have permission to manage workspace role assignments.',
    );
  }


  return context;
}


/* ================================================================
   MEMBER
   ================================================================ */

async function requireActiveInternalMember(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
    string,

  lock =
    false,
): Promise<MembershipRow> {
  const result =
    await client.query(
      `
        SELECT
          tu.id
            AS membership_id,

          tu.user_id,

          tu.tenant_id,

          tu.member_type,

          tu.status
            AS membership_status,

          tu.is_owner

        FROM tenant_users tu

        INNER JOIN users u
          ON u.id =
             tu.user_id

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2

          AND tu.deleted_at
              IS NULL

          AND u.deleted_at
              IS NULL

        LIMIT 1

        ${
          lock
            ? 'FOR UPDATE OF tu'
            : ''
        }
      `,
      [
        tenantId,
        userId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new UserRoleServiceError(
      'MEMBER_NOT_FOUND',
      'The user is not an active member of this workspace.',
    );
  }


  const row =
    result.rows[0] as MembershipRow;


  if (
    String(
      row.member_type ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'internal'
  ) {
    throw new UserRoleServiceError(
      'INTERNAL_MEMBER_REQUIRED',
      'Roles can only be assigned to internal workspace members.',
    );
  }


  if (
    String(
      row.membership_status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new UserRoleServiceError(
      'MEMBER_NOT_ACTIVE',
      'Roles can only be changed for an active workspace member.',
    );
  }


  return row;
}


/* ================================================================
   ACTOR REVALIDATION
   ================================================================

   We do not rely only on the permission context resolved before the
   transaction.

   Authorization is rechecked inside the transaction to reduce a
   time-of-check / time-of-use authorization race.

   ================================================================ */

async function resolveActorAuthorization(
  client:
    PoolClient,

  tenantId:
    string,

  actorUserId:
    string,
): Promise<{
  isOwner: boolean;

  permissions:
    Set<string>;
}> {
  const membership =
    await requireActiveInternalMember(
      client,
      tenantId,
      actorUserId,
      false,
    );


  if (
    membership.is_owner ===
      true
  ) {
    return {
      isOwner:
        true,

      permissions:
        new Set<string>(),
    };
  }


  const result =
    await client.query(
      `
        SELECT DISTINCT
          LOWER(
            p.key
          ) AS permission_key

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

        WHERE ur.tenant_id = $1
          AND ur.user_id = $2

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
        tenantId,
        actorUserId,
      ],
    );


  const permissions =
    new Set<string>(
      result.rows
        .map(
          row =>
            typeof row.permission_key ===
              'string'
              ? row.permission_key
              : '',
        )
        .filter(
          Boolean,
        ),
    );


  if (
    !permissions.has(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    )
  ) {
    throw new UserRoleServiceError(
      'ROLE_MANAGE_REQUIRED',
      'You no longer have permission to manage workspace roles.',
    );
  }


  return {
    isOwner:
      false,

    permissions,
  };
}


/* ================================================================
   ROLE VISIBILITY
   ================================================================ */

const VISIBLE_ROLE_CONDITION = `
  (
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
`;


/* ================================================================
   LOAD VISIBLE ACTIVE ROLES
   ================================================================ */

async function loadRolesByIds(
  client:
    PoolClient,

  tenantId:
    string,

  roleIds:
    string[],
): Promise<RoleRow[]> {
  if (
    roleIds.length ===
      0
  ) {
    return [];
  }


  const result =
    await client.query(
      `
        SELECT
          r.id,
          r.tenant_id,
          r.key,
          r.name,
          r.description,
          r.is_system,
          r.status,

          (
            SELECT
              COUNT(*)

            FROM role_permissions rp

            INNER JOIN permissions p
              ON p.id =
                 rp.permission_id

            WHERE rp.role_id =
                  r.id

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
          )
            AS permission_count

        FROM roles r

        WHERE r.id =
              ANY(
                $2::uuid[]
              )

          AND ${VISIBLE_ROLE_CONDITION}

          AND r.deleted_at
              IS NULL
      `,
      [
        tenantId,
        roleIds,
      ],
    );


  return result.rows as RoleRow[];
}


/* ================================================================
   VALIDATE REQUESTED ROLES
   ================================================================ */

async function requireAssignableRoles(
  client:
    PoolClient,

  tenantId:
    string,

  roleIds:
    string[],
): Promise<RoleRow[]> {
  const roles =
    await loadRolesByIds(
      client,
      tenantId,
      roleIds,
    );


  const byId =
    new Map(
      roles.map(
        role => [
          String(
            role.id,
          ),
          role,
        ],
      ),
    );


  for (
    const roleId
    of roleIds
  ) {
    const role =
      byId.get(
        roleId,
      );


    if (
      !role
    ) {
      throw new UserRoleServiceError(
        'ROLE_NOT_FOUND',
        `Role "${roleId}" does not exist in this workspace.`,
      );
    }


    if (
      normalizeRoleStatus(
        role.status,
      ) !==
      'active'
    ) {
      throw new UserRoleServiceError(
        'ROLE_NOT_ACTIVE',
        `Role "${role.name || roleId}" is not active.`,
      );
    }
  }


  return roleIds.map(
    roleId =>
      byId.get(
        roleId,
      )!,
  );
}


/* ================================================================
   ROLE PERMISSION SETS
   ================================================================ */

async function loadRolePermissionMap(
  client:
    PoolClient,

  roleIds:
    string[],
): Promise<
  Map<
    string,
    Set<string>
  >
> {
  const result =
    new Map<
      string,
      Set<string>
    >();


  for (
    const roleId
    of roleIds
  ) {
    result.set(
      roleId,
      new Set<string>(),
    );
  }


  if (
    roleIds.length ===
      0
  ) {
    return result;
  }


  const rows =
    await client.query(
      `
        SELECT
          rp.role_id,

          LOWER(
            p.key
          ) AS permission_key

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              ANY(
                $1::uuid[]
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
      `,
      [
        roleIds,
      ],
    );


  for (
    const row
    of rows.rows
  ) {
    const roleId =
      String(
        row.role_id,
      );


    const permissionKey =
      typeof row.permission_key ===
        'string'
        ? row.permission_key
        : '';


    if (
      !permissionKey
    ) {
      continue;
    }


    const permissions =
      result.get(
        roleId,
      ) ||
      new Set<string>();


    permissions.add(
      permissionKey,
    );


    result.set(
      roleId,
      permissions,
    );
  }


  return result;
}


/* ================================================================
   PRIVILEGE ESCALATION PROTECTION
   ================================================================

   Owner:
       may manage any role.

   Non-owner role manager:
       may only add/remove a role if every permission contained in
       that role already exists in the actor's own effective set.

   Example:

       User Manager has:
           users.view
           users.manage
           roles.view
           roles.manage

       Admin has:
           apps.manage
           companies.manage
           integrations.manage
           ...

       User Manager cannot assign Admin because that would grant
       capabilities they do not themselves possess.

   ================================================================ */

async function assertActorCanManageRoles(
  client:
    PoolClient,

  actor:
    {
      isOwner:
        boolean;

      permissions:
        Set<string>;
    },

  roleIds:
    string[],
): Promise<void> {
  if (
    actor.isOwner ||
    roleIds.length ===
      0
  ) {
    return;
  }


  const permissionMap =
    await loadRolePermissionMap(
      client,
      roleIds,
    );


  for (
    const roleId
    of roleIds
  ) {
    const rolePermissions =
      permissionMap.get(
        roleId,
      ) ||
      new Set<string>();


    for (
      const permission
      of rolePermissions
    ) {
      if (
        !actor.permissions.has(
          permission,
        )
      ) {
        throw new UserRoleServiceError(
          'PRIVILEGE_ESCALATION_BLOCKED',
          [
            'You cannot manage this role assignment because the role',
            `contains the "${permission}" permission,`,
            'which is outside your own effective access.',
          ].join(
            ' ',
          ),
        );
      }
    }
  }
}


/* ================================================================
   CURRENT MEMBER ROLE ROWS
   ================================================================ */

async function loadCurrentMemberRoles(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
    string,
): Promise<RoleRow[]> {
  const result =
    await client.query(
      `
        SELECT
          r.id,
          r.tenant_id,
          r.key,
          r.name,
          r.description,
          r.is_system,
          r.status

        FROM user_roles ur

        INNER JOIN roles r
          ON r.id =
             ur.role_id

        WHERE ur.tenant_id = $1
          AND ur.user_id = $2

          AND ur.deleted_at
              IS NULL

          AND r.deleted_at
              IS NULL

          AND ${VISIBLE_ROLE_CONDITION}

        ORDER BY
          CASE
            WHEN r.is_system =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            r.name
          ) ASC,

          r.id ASC
      `,
      [
        tenantId,
        userId,
      ],
    );


  return result.rows as RoleRow[];
}


/* ================================================================
   BUILD MEMBER STATE
   ================================================================ */

async function buildMemberState(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
    string,
): Promise<WorkspaceMemberRoles> {
  const membership =
    await requireActiveInternalMember(
      client,
      tenantId,
      userId,
      false,
    );


  const roles =
    await loadCurrentMemberRoles(
      client,
      tenantId,
      userId,
    );


  return {
    membershipId:
      String(
        membership
          .membership_id,
      ),

    userId:
      String(
        membership.user_id,
      ),

    tenantId:
      String(
        membership.tenant_id,
      ),

    isOwner:
      membership.is_owner ===
      true,

    memberType:
      'internal',

    membershipStatus:
      'active',

    roles:
      roles.map(
        mapAssignedRole,
      ),
  };
}


/* ================================================================
   LIST ASSIGNABLE WORKSPACE ROLES
   ================================================================ */

export async function listAssignableWorkspaceRoles():
  Promise<AssignableWorkspaceRole[]> {
  const context =
    await requireRoleManage();


  const poolResult =
    await queryControl(
      `
        SELECT
          r.id,
          r.tenant_id,
          r.key,
          r.name,
          r.description,
          r.is_system,
          r.status,

          (
            SELECT
              COUNT(*)

            FROM role_permissions rp

            INNER JOIN permissions p
              ON p.id =
                 rp.permission_id

            WHERE rp.role_id =
                  r.id

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
          )
            AS permission_count

        FROM roles r

        WHERE ${VISIBLE_ROLE_CONDITION}

          AND r.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              r.status,
              'active'
            )
          ) = 'active'

        ORDER BY
          CASE
            WHEN r.is_system =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            r.name
          ) ASC,

          r.id ASC
      `,
      [
        context.tenantId,
      ],
    );


  const roles =
    poolResult.rows as RoleRow[];


  if (
    context.isOwner
  ) {
    return roles.map(
      role =>
        mapRole(
          role,
          true,
        ),
    );
  }


  const roleIds =
    roles.map(
      role =>
        String(
          role.id,
        ),
    );


  const permissionResult =
    await queryControl(
      `
        SELECT
          rp.role_id,

          LOWER(
            p.key
          ) AS permission_key

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              ANY(
                $1::uuid[]
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
      `,
      [
        roleIds,
      ],
    );


  const rolePermissionMap =
    new Map<
      string,
      Set<string>
    >();


  for (
    const roleId
    of roleIds
  ) {
    rolePermissionMap.set(
      roleId,
      new Set<string>(),
    );
  }


  for (
    const row
    of permissionResult.rows
  ) {
    const roleId =
      String(
        row.role_id,
      );


    const key =
      typeof row.permission_key ===
        'string'
        ? row.permission_key
        : '';


    if (
      key
    ) {
      rolePermissionMap
        .get(
          roleId,
        )
        ?.add(
          key,
        );
    }
  }


  return roles
    .map(
      role => {
        const roleId =
          String(
            role.id,
          );


        const permissions =
          rolePermissionMap.get(
            roleId,
          ) ||
          new Set<string>();


        const assignable =
          [
            ...permissions,
          ].every(
            permission =>
              context.permissionSet.has(
                permission,
              ),
          );


        return mapRole(
          role,
          assignable,
        );
      },
    )
    .filter(
      role =>
        role.assignable,
    );
}


/* ================================================================
   GET MEMBER ROLE ASSIGNMENTS
   ================================================================ */

export async function getWorkspaceMemberRoles(
  userId:
    string,
): Promise<WorkspaceMemberRoles> {
  const context =
    await requireRoleView();


  const normalizedUserId =
    requireUuid(
      userId,
      'user',
    );


  const pool =
    await queryControl(
      `
        SELECT
          tu.id
            AS membership_id,

          tu.user_id,

          tu.tenant_id,

          tu.member_type,

          tu.status
            AS membership_status,

          tu.is_owner

        FROM tenant_users tu

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2
          AND tu.deleted_at IS NULL

        LIMIT 1
      `,
      [
        context.tenantId,
        normalizedUserId,
      ],
    );


  if (
    pool.rows.length ===
      0
  ) {
    throw new UserRoleServiceError(
      'MEMBER_NOT_FOUND',
      'The workspace member could not be found.',
    );
  }


  const membership =
    pool.rows[0] as MembershipRow;


  if (
    String(
      membership
        .member_type ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'internal'
  ) {
    throw new UserRoleServiceError(
      'INTERNAL_MEMBER_REQUIRED',
      'Role assignments are only available for internal members.',
    );
  }


  if (
    String(
      membership
        .membership_status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active'
  ) {
    throw new UserRoleServiceError(
      'MEMBER_NOT_ACTIVE',
      'The workspace member is not active.',
    );
  }


  const roleResult =
    await queryControl(
      `
        SELECT
          r.id,
          r.tenant_id,
          r.key,
          r.name,
          r.description,
          r.is_system,
          r.status

        FROM user_roles ur

        INNER JOIN roles r
          ON r.id =
             ur.role_id

        WHERE ur.tenant_id = $1
          AND ur.user_id = $2

          AND ur.deleted_at
              IS NULL

          AND r.deleted_at
              IS NULL

          AND ${VISIBLE_ROLE_CONDITION}

        ORDER BY
          CASE
            WHEN r.is_system =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            r.name
          ) ASC
      `,
      [
        context.tenantId,
        normalizedUserId,
      ],
    );


  return {
    membershipId:
      String(
        membership
          .membership_id,
      ),

    userId:
      String(
        membership.user_id,
      ),

    tenantId:
      String(
        membership.tenant_id,
      ),

    isOwner:
      membership.is_owner ===
      true,

    memberType:
      'internal',

    membershipStatus:
      'active',

    roles:
      (
        roleResult.rows as RoleRow[]
      ).map(
        mapAssignedRole,
      ),
  };
}


/* ================================================================
   ADVISORY LOCKS
   ================================================================ */

async function lockUserRoles(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
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
      `sami:user-roles:${tenantId}:${userId}`,
    ],
  );
}


async function lockRoleDefinitions(
  client:
    PoolClient,

  roleIds:
    string[],
): Promise<void> {
  const sorted =
    [
      ...roleIds,
    ].sort();


  for (
    const roleId
    of sorted
  ) {
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
}


/* ================================================================
   OWNER PROTECTION
   ================================================================ */

function protectWorkspaceOwner(
  membership:
    MembershipRow,
): void {
  if (
    membership.is_owner ===
      true
  ) {
    throw new UserRoleServiceError(
      'OWNER_ROLE_ASSIGNMENTS_PROTECTED',
      [
        'Workspace owner role assignments are protected.',
        'Ownership already provides structural authority and should',
        'not be altered through ordinary role management.',
      ].join(
        ' ',
      ),
    );
  }
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertUserRoleAudit(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    actorUserId:
      string;

    membershipId:
      string;

    targetUserId:
      string;

    action:
      string;

    addedRoles:
      RoleRow[];

    removedRoles:
      RoleRow[];

    audit?:
      UserRoleAuditContext;
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

        'workspace_member',
        $4,

        'authorization',

        'success',

        $5::jsonb,

        $6,
        $7,

        $8,

        $3,

        'workspace_member',
        $4
      )
    `,
    [
      input.tenantId,
      input.actorUserId,

      input.action,

      input.membershipId,

      JSON.stringify({
        targetUserId:
          input.targetUserId,

        addedRoles:
          input.addedRoles.map(
            role => ({
              id:
                String(
                  role.id,
                ),

              key:
                role.key,

              name:
                role.name,
            }),
          ),

        removedRoles:
          input.removedRoles.map(
            role => ({
              id:
                String(
                  role.id,
                ),

              key:
                role.key,

              name:
                role.name,
            }),
          ),
      }),

      ipAddress,
      userAgent,

      correlationId,
    ],
  );
}


/* ================================================================
   REPLACE MEMBER ROLE SET
   ================================================================ */

export async function replaceWorkspaceMemberRoles(
  input:
    ReplaceWorkspaceMemberRolesInput,
): Promise<UserRoleMutationResult> {
  const context =
    await requireRoleManage();


  const targetUserId =
    requireUuid(
      input.userId,
      'user',
    );


  const requestedRoleIds =
    normalizeRoleIds(
      input.roleIds,
    );


  if (
    requestedRoleIds.length ===
      0
  ) {
    throw new UserRoleServiceError(
      'EMPTY_ROLE_SET',
      'An active internal member must have at least one role.',
    );
  }


  return withControlTransaction(
    async client => {
      await lockUserRoles(
        client,
        context.tenantId,
        targetUserId,
      );


      const targetMembership =
        await requireActiveInternalMember(
          client,
          context.tenantId,
          targetUserId,
          true,
        );


      protectWorkspaceOwner(
        targetMembership,
      );


      const actor =
        await resolveActorAuthorization(
          client,
          context.tenantId,
          context.userId,
        );


      const requestedRoles =
        await requireAssignableRoles(
          client,
          context.tenantId,
          requestedRoleIds,
        );


      const currentRoles =
        await loadCurrentMemberRoles(
          client,
          context.tenantId,
          targetUserId,
        );


      const currentIds =
        new Set(
          currentRoles.map(
            role =>
              String(
                role.id,
              ),
          ),
        );


      const requestedIds =
        new Set(
          requestedRoleIds,
        );


      const addedRoles =
        requestedRoles.filter(
          role =>
            !currentIds.has(
              String(
                role.id,
              ),
            ),
        );


      const removedRoles =
        currentRoles.filter(
          role =>
            !requestedIds.has(
              String(
                role.id,
              ),
            ),
        );


      if (
        addedRoles.length ===
          0 &&
        removedRoles.length ===
          0
      ) {
        return {
          member:
            await buildMemberState(
              client,
              context.tenantId,
              targetUserId,
            ),

          changed:
            false,

          addedRoleIds:
            [],

          removedRoleIds:
            [],
        };
      }


      const affectedRoleIds =
        [
          ...new Set([
            ...addedRoles.map(
              role =>
                String(
                  role.id,
                ),
            ),

            ...removedRoles.map(
              role =>
                String(
                  role.id,
                ),
            ),
          ]),
        ];


      await lockRoleDefinitions(
        client,
        affectedRoleIds,
      );


      await assertActorCanManageRoles(
        client,
        actor,
        affectedRoleIds,
      );


      /*
       * Soft-remove assignments no longer requested.
       */
      await client.query(
        `
          UPDATE user_roles

          SET
            deleted_at =
              NOW(),

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND user_id = $2
            AND deleted_at IS NULL

            AND NOT (
              role_id =
              ANY(
                $3::uuid[]
              )
            )
        `,
        [
          context.tenantId,
          targetUserId,
          requestedRoleIds,
        ],
      );


      /*
       * Restore existing soft-deleted rows or insert new ones.
       *
       * Existing DB constraint:
       *
       * UNIQUE(
       *   tenant_id,
       *   user_id,
       *   role_id
       * )
       */
      for (
        const role
        of requestedRoles
      ) {
        await client.query(
          `
            INSERT INTO user_roles (
              tenant_id,
              user_id,
              role_id,
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
              tenant_id,
              user_id,
              role_id
            )

            DO UPDATE

            SET
              deleted_at =
                NULL,

              updated_at =
                NOW()
          `,
          [
            context.tenantId,
            targetUserId,
            role.id,
          ],
        );
      }


      await insertUserRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          membershipId:
            String(
              targetMembership
                .membership_id,
            ),

          targetUserId,

          action:
            'workspace.member.roles.updated',

          addedRoles,

          removedRoles,

          audit:
            input.audit,
        },
      );


      return {
        member:
          await buildMemberState(
            client,
            context.tenantId,
            targetUserId,
          ),

        changed:
          true,

        addedRoleIds:
          addedRoles.map(
            role =>
              String(
                role.id,
              ),
          ),

        removedRoleIds:
          removedRoles.map(
            role =>
              String(
                role.id,
              ),
          ),
      };
    },
  );
}


/* ================================================================
   GRANT MEMBER ROLES
   ================================================================ */

export async function grantWorkspaceMemberRoles(
  input:
    ModifyWorkspaceMemberRolesInput,
): Promise<UserRoleMutationResult> {
  const context =
    await requireRoleManage();


  const targetUserId =
    requireUuid(
      input.userId,
      'user',
    );


  const requestedRoleIds =
    normalizeRoleIds(
      input.roleIds,
    );


  if (
    requestedRoleIds.length ===
      0
  ) {
    return {
      member:
        await getWorkspaceMemberRoles(
          targetUserId,
        ),

      changed:
        false,

      addedRoleIds:
        [],

      removedRoleIds:
        [],
    };
  }


  const existing =
    await getWorkspaceMemberRoles(
      targetUserId,
    );


  const finalRoleIds =
    [
      ...new Set([
        ...existing.roles.map(
          role =>
            role.id,
        ),

        ...requestedRoleIds,
      ]),
    ];


  return replaceWorkspaceMemberRoles({
    userId:
      targetUserId,

    roleIds:
      finalRoleIds,

    audit:
      input.audit,
  });
}


/* ================================================================
   REVOKE MEMBER ROLES
   ================================================================ */

export async function revokeWorkspaceMemberRoles(
  input:
    ModifyWorkspaceMemberRolesInput,
): Promise<UserRoleMutationResult> {
  const context =
    await requireRoleManage();


  /*
   * context is deliberately resolved before reading assignments so
   * callers cannot use this helper as an authorization bypass.
   */
  void context;


  const targetUserId =
    requireUuid(
      input.userId,
      'user',
    );


  const requestedRoleIds =
    normalizeRoleIds(
      input.roleIds,
    );


  const existing =
    await getWorkspaceMemberRoles(
      targetUserId,
    );


  const removeSet =
    new Set(
      requestedRoleIds,
    );


  const finalRoleIds =
    existing.roles
      .map(
        role =>
          role.id,
      )
      .filter(
        roleId =>
          !removeSet.has(
            roleId,
          ),
      );


  if (
    finalRoleIds.length ===
      0
  ) {
    throw new UserRoleServiceError(
      'EMPTY_ROLE_SET',
      'An active internal member must retain at least one role.',
    );
  }


  return replaceWorkspaceMemberRoles({
    userId:
      targetUserId,

    roleIds:
      finalRoleIds,

    audit:
      input.audit,
  });
}