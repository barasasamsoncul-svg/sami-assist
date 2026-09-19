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
   SaMi ROLE SERVICE
   ================================================================

   Category 8.3

   RESPONSIBILITIES

   - list roles available to the current workspace
   - get one role
   - create custom workspace roles
   - update custom workspace roles
   - disable custom workspace roles
   - enable custom workspace roles
   - soft-delete custom workspace roles
   - restore deleted custom workspace roles safely
   - protect SaMi system roles
   - audit role lifecycle changes

   SECURITY MODEL

       session
          ↓
       trusted tenant context
          ↓
       permission context
          ↓
       roles.view / roles.manage
          ↓
       role service

   IMPORTANT

   Workspace ownership remains:

       tenant_users.is_owner

   It is NOT represented by an Owner role.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type WorkspaceRoleStatus =
  | 'active'
  | 'disabled';


export interface WorkspaceRole {
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
    WorkspaceRoleStatus;

  permissionCount:
    number;

  assignedUserCount:
    number;

  createdAt:
    string | null;

  updatedAt:
    string | null;

  deletedAt:
    string | null;

  editable:
    boolean;
}


export interface ListWorkspaceRolesOptions {
  includeDisabled?:
    boolean;
}


export interface CreateWorkspaceRoleInput {
  name:
    string;

  description?:
    string | null;

  audit?:
    RoleAuditContext;
}


export interface UpdateWorkspaceRoleInput {
  roleId:
    string;

  name:
    string;

  description?:
    string | null;

  audit?:
    RoleAuditContext;
}


export interface RoleLifecycleInput {
  roleId:
    string;

  audit?:
    RoleAuditContext;
}


export interface RoleAuditContext {
  ipAddress?:
    string | null;

  userAgent?:
    string | null;

  correlationId?:
    string | null;
}


export interface RoleMutationResult {
  role:
    WorkspaceRole;

  changed:
    boolean;

  removedAssignments?:
    number;
}


/* ================================================================
   INTERNAL ROW
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

  permission_count:
    unknown;

  assigned_user_count:
    unknown;

  created_at:
    unknown;

  updated_at:
    unknown;

  deleted_at:
    unknown;
}


/* ================================================================
   ERROR
   ================================================================ */

export class RoleServiceError
  extends Error {
  readonly code:
    | 'ROLE_VIEW_REQUIRED'
    | 'ROLE_MANAGE_REQUIRED'
    | 'INVALID_ROLE_ID'
    | 'INVALID_ROLE_NAME'
    | 'INVALID_ROLE_DESCRIPTION'
    | 'ROLE_NOT_FOUND'
    | 'ROLE_DELETED'
    | 'SYSTEM_ROLE_PROTECTED'
    | 'ROLE_NAME_EXISTS'
    | 'ROLE_KEY_EXISTS'
    | 'INVALID_ROLE_STATE';


  constructor(
    code:
      | 'ROLE_VIEW_REQUIRED'
      | 'ROLE_MANAGE_REQUIRED'
      | 'INVALID_ROLE_ID'
      | 'INVALID_ROLE_NAME'
      | 'INVALID_ROLE_DESCRIPTION'
      | 'ROLE_NOT_FOUND'
      | 'ROLE_DELETED'
      | 'SYSTEM_ROLE_PROTECTED'
      | 'ROLE_NAME_EXISTS'
      | 'ROLE_KEY_EXISTS'
      | 'INVALID_ROLE_STATE',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'RoleServiceError';

    this.code =
      code;
  }
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const MAX_ROLE_NAME_LENGTH =
  120;


const MAX_ROLE_DESCRIPTION_LENGTH =
  1000;


const MAX_ROLE_KEY_LENGTH =
  120;


/* ================================================================
   NORMALIZATION
   ================================================================ */

function requireRoleId(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new RoleServiceError(
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
    throw new RoleServiceError(
      'INVALID_ROLE_ID',
      'A valid role ID is required.',
    );
  }


  return normalized;
}


function normalizeRoleName(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new RoleServiceError(
      'INVALID_ROLE_NAME',
      'A role name is required.',
    );
  }


  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        ' ',
      );


  if (
    !normalized
  ) {
    throw new RoleServiceError(
      'INVALID_ROLE_NAME',
      'A role name is required.',
    );
  }


  if (
    normalized.length >
      MAX_ROLE_NAME_LENGTH
  ) {
    throw new RoleServiceError(
      'INVALID_ROLE_NAME',
      `Role names cannot exceed ${MAX_ROLE_NAME_LENGTH} characters.`,
    );
  }


  return normalized;
}


function normalizeDescription(
  value:
    string | null | undefined,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  if (
    typeof value !==
      'string'
  ) {
    throw new RoleServiceError(
      'INVALID_ROLE_DESCRIPTION',
      'Role description must be text.',
    );
  }


  const normalized =
    value
      .trim()
      .replace(
        /\s+/g,
        ' ',
      );


  if (
    !normalized
  ) {
    return null;
  }


  if (
    normalized.length >
      MAX_ROLE_DESCRIPTION_LENGTH
  ) {
    throw new RoleServiceError(
      'INVALID_ROLE_DESCRIPTION',
      `Role descriptions cannot exceed ${MAX_ROLE_DESCRIPTION_LENGTH} characters.`,
    );
  }


  return normalized;
}


/* ================================================================
   ROLE KEY
   ================================================================

   Custom role keys are stable.

   Renaming a role does NOT change the key.

   Examples:

       Sales Manager
          ↓
       sales_manager

       Accounts Payable
          ↓
       accounts_payable

   ================================================================ */

function generateRoleKey(
  name:
    string,
): string {
  const ascii =
    name
      .normalize(
        'NFKD',
      )
      .replace(
        /[\u0300-\u036f]/g,
        '',
      )
      .toLowerCase()
      .replace(
        /[^a-z0-9]+/g,
        '_',
      )
      .replace(
        /^_+|_+$/g,
        '',
      )
      .slice(
        0,
        MAX_ROLE_KEY_LENGTH,
      );


  if (
    ascii
  ) {
    return ascii;
  }


  return `role_${crypto
    .randomUUID()
    .replace(
      /-/g,
      '',
    )
    .slice(
      0,
      12,
    )}`;
}


/* ================================================================
   DATE
   ================================================================ */

function toIso(
  value:
    unknown,
): string | null {
  if (
    value ===
      null ||
    value ===
      undefined
  ) {
    return null;
  }


  const date =
    value instanceof
      Date
      ? value
      : new Date(
          String(
            value,
          ),
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return null;
  }


  return date.toISOString();
}


/* ================================================================
   NUMBER
   ================================================================ */

function toCount(
  value:
    unknown,
): number {
  const number =
    Number(
      value,
    );


  if (
    !Number.isFinite(
      number,
    ) ||
    number <
      0
  ) {
    return 0;
  }


  return Math.trunc(
    number,
  );
}


/* ================================================================
   STATUS
   ================================================================ */

function normalizeRoleStatus(
  value:
    unknown,
): WorkspaceRoleStatus {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'active'
  ) {
    return 'active';
  }


  if (
    normalized ===
      'disabled'
  ) {
    return 'disabled';
  }


  throw new RoleServiceError(
    'INVALID_ROLE_STATE',
    `Unsupported role state "${normalized || 'unknown'}".`,
  );
}


/* ================================================================
   MAP ROLE
   ================================================================ */

function mapRole(
  row:
    RoleRow,
): WorkspaceRole {
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

    permissionCount:
      toCount(
        row.permission_count,
      ),

    assignedUserCount:
      toCount(
        row.assigned_user_count,
      ),

    createdAt:
      toIso(
        row.created_at,
      ),

    updatedAt:
      toIso(
        row.updated_at,
      ),

    deletedAt:
      toIso(
        row.deleted_at,
      ),

    editable:
      !isSystem,
  };
}


/* ================================================================
   PERMISSION GATE
   ================================================================ */

async function requireRolePermission(
  permission:
    string,
): Promise<PermissionContext> {
  const context =
    await getPermissionContext();


  if (
    !permissionContextHas(
      context,
      permission,
    )
  ) {
    if (
      permission ===
        SAMI_PERMISSIONS
          .ROLES_VIEW
    ) {
      throw new RoleServiceError(
        'ROLE_VIEW_REQUIRED',
        'You do not have permission to view workspace roles.',
      );
    }


    throw new RoleServiceError(
      'ROLE_MANAGE_REQUIRED',
      'You do not have permission to manage workspace roles.',
    );
  }


  return context;
}


/* ================================================================
   TENANT ROLE LOCK
   ================================================================

   Role creation/update is serialized per workspace.

   This protects against concurrent duplicate role creation without
   requiring unsafe reliance on browser checks.

   ================================================================ */

async function lockWorkspaceRoles(
  client:
    PoolClient,

  tenantId:
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
      `sami:roles:${tenantId}`,
    ],
  );
}


/* ================================================================
   ROLE SELECT
   ================================================================ */

const ROLE_SELECT = `
  SELECT
    r.id,
    r.tenant_id,
    r.key,
    r.name,
    r.description,
    r.is_system,
    r.status,
    r.created_at,
    r.updated_at,
    r.deleted_at,

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
      AS permission_count,

    (
      SELECT
        COUNT(*)

      FROM user_roles ur

      WHERE ur.role_id =
            r.id

        AND ur.tenant_id =
            $1

        AND ur.deleted_at
            IS NULL
    )
      AS assigned_user_count
`;


/* ================================================================
   ROLE VISIBILITY

   A workspace sees:

       system role:
           is_system = TRUE
           tenant_id = NULL

       OR

       its own custom role:
           is_system = FALSE
           tenant_id = current workspace

   ================================================================ */

function visibleRoleCondition(
  alias =
    'r',
): string {
  return `
    (
      (
        ${alias}.is_system =
          TRUE

        AND ${alias}.tenant_id
            IS NULL
      )

      OR

      (
        ${alias}.is_system =
          FALSE

        AND ${alias}.tenant_id =
            $1
      )
    )
  `;
}


/* ================================================================
   LIST WORKSPACE ROLES
   ================================================================ */

export async function listWorkspaceRoles(
  options:
    ListWorkspaceRolesOptions =
      {},
): Promise<WorkspaceRole[]> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_VIEW,
    );


  const includeDisabled =
    options.includeDisabled ===
    true;


  const result =
    await queryControl(
      `
        ${ROLE_SELECT}

        FROM roles r

        WHERE
          ${visibleRoleCondition()}

          AND r.deleted_at
              IS NULL

          AND (
            $2::boolean =
              TRUE

            OR

            LOWER(
              COALESCE(
                r.status,
                'active'
              )
            ) = 'active'
          )

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
        includeDisabled,
      ],
    );


  return (
    result.rows as RoleRow[]
  ).map(
    mapRole,
  );
}


/* ================================================================
   GET ROLE
   ================================================================ */

export async function getWorkspaceRole(
  roleId:
    string,
): Promise<WorkspaceRole | null> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_VIEW,
    );


  const normalizedRoleId =
    requireRoleId(
      roleId,
    );


  const result =
    await queryControl(
      `
        ${ROLE_SELECT}

        FROM roles r

        WHERE r.id = $2

          AND
          ${visibleRoleCondition()}

        LIMIT 1
      `,
      [
        context.tenantId,
        normalizedRoleId,
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

  includeDeleted =
    false,
): Promise<RoleRow> {
  const result =
    await client.query(
      `
        ${ROLE_SELECT}

        FROM roles r

        WHERE r.id = $2

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

        LIMIT 1

        FOR UPDATE OF r
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
    throw new RoleServiceError(
      'ROLE_NOT_FOUND',
      'The role could not be found in this workspace.',
    );
  }


  const role =
    result.rows[0] as RoleRow;


  if (
    role.is_system ===
      true
  ) {
    throw new RoleServiceError(
      'SYSTEM_ROLE_PROTECTED',
      'SaMi system roles are protected and cannot be modified.',
    );
  }


  if (
    role.deleted_at &&
    !includeDeleted
  ) {
    throw new RoleServiceError(
      'ROLE_DELETED',
      'This role has been deleted.',
    );
  }


  return role;
}


/* ================================================================
   NAME / KEY COLLISION
   ================================================================ */

async function ensureRoleIdentityAvailable(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    name:
      string;

    key:
      string;

    excludeRoleId?:
      string | null;
  },
): Promise<void> {
  const result =
    await client.query(
      `
        SELECT
          id,
          name,
          key

        FROM roles

        WHERE deleted_at
              IS NULL

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

          AND (
            LOWER(
              name
            ) =
            LOWER(
              $2
            )

            OR

            LOWER(
              key
            ) =
            LOWER(
              $3
            )
          )

          AND (
            $4::uuid
              IS NULL

            OR id <>
               $4::uuid
          )

        LIMIT 1
      `,
      [
        input.tenantId,
        input.name,
        input.key,
        input.excludeRoleId ||
          null,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    return;
  }


  const conflict =
    result.rows[0];


  if (
    typeof conflict.name ===
      'string' &&
    conflict.name
      .trim()
      .toLowerCase() ===
      input.name
        .trim()
        .toLowerCase()
  ) {
    throw new RoleServiceError(
      'ROLE_NAME_EXISTS',
      'A role with this name already exists in the workspace.',
    );
  }


  throw new RoleServiceError(
    'ROLE_KEY_EXISTS',
    'A role with this key already exists in the workspace.',
  );
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertRoleAudit(
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

    metadata:
      Record<
        string,
        unknown
      >;

    audit?:
      RoleAuditContext;
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

      JSON.stringify(
        input.metadata,
      ),

      ipAddress,
      userAgent,

      correlationId,
    ],
  );
}


/* ================================================================
   LOAD RESULT AFTER MUTATION
   ================================================================ */

async function loadRoleAfterMutation(
  client:
    PoolClient,

  tenantId:
    string,

  roleId:
    string,

  includeDeleted =
    false,
): Promise<WorkspaceRole> {
  const result =
    await client.query(
      `
        ${ROLE_SELECT}

        FROM roles r

        WHERE r.id = $2
          AND r.tenant_id = $1
          AND r.is_system = FALSE

          ${
            includeDeleted
              ? ''
              : 'AND r.deleted_at IS NULL'
          }

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
    throw new RoleServiceError(
      'ROLE_NOT_FOUND',
      'The role could not be loaded after the change.',
    );
  }


  return mapRole(
    result.rows[0] as RoleRow,
  );
}


/* ================================================================
   CREATE CUSTOM ROLE
   ================================================================ */

export async function createWorkspaceRole(
  input:
    CreateWorkspaceRoleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const name =
    normalizeRoleName(
      input.name,
    );


  const description =
    normalizeDescription(
      input.description,
    );


  const key =
    generateRoleKey(
      name,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      await ensureRoleIdentityAvailable(
        client,
        {
          tenantId:
            context.tenantId,

          name,

          key,
        },
      );


      const result =
        await client.query(
          `
            INSERT INTO roles (
              tenant_id,
              key,
              name,
              description,
              is_system,
              status,
              created_at,
              updated_at
            )

            VALUES (
              $1,
              $2,
              $3,
              $4,
              FALSE,
              'active',
              NOW(),
              NOW()
            )

            RETURNING id
          `,
          [
            context.tenantId,
            key,
            name,
            description,
          ],
        );


      if (
        result.rows.length !==
          1
      ) {
        throw new RoleServiceError(
          'ROLE_NOT_FOUND',
          'The new role could not be created.',
        );
      }


      const roleId =
        String(
          result.rows[0]
            .id,
        );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.created',

          metadata: {
            key,
            name,
            description,
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
        );


      return {
        role,
        changed:
          true,
      };
    },
  );
}


/* ================================================================
   UPDATE CUSTOM ROLE

   Role key remains immutable.

   A role can therefore be renamed without breaking references,
   audit history or future configuration.

   ================================================================ */

export async function updateWorkspaceRole(
  input:
    UpdateWorkspaceRoleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const roleId =
    requireRoleId(
      input.roleId,
    );


  const name =
    normalizeRoleName(
      input.name,
    );


  const description =
    normalizeDescription(
      input.description,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      const existing =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const currentName =
        typeof existing.name ===
          'string'
          ? existing.name
          : '';


      const currentDescription =
        typeof existing.description ===
          'string'
          ? existing.description
          : null;


      const key =
        typeof existing.key ===
          'string'
          ? existing.key
          : '';


      await ensureRoleIdentityAvailable(
        client,
        {
          tenantId:
            context.tenantId,

          name,

          key,

          excludeRoleId:
            roleId,
        },
      );


      if (
        currentName ===
          name &&
        currentDescription ===
          description
      ) {
        const role =
          await loadRoleAfterMutation(
            client,
            context.tenantId,
            roleId,
          );


        return {
          role,

          changed:
            false,
        };
      }


      await client.query(
        `
          UPDATE roles

          SET
            name =
              $3,

            description =
              $4,

            updated_at =
              NOW()

          WHERE id = $2
            AND tenant_id = $1
            AND is_system = FALSE
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
          roleId,
          name,
          description,
        ],
      );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.updated',

          metadata: {
            key,

            previousName:
              currentName,

            name,

            previousDescription:
              currentDescription,

            description,
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
        );


      return {
        role,

        changed:
          true,
      };
    },
  );
}


/* ================================================================
   DISABLE CUSTOM ROLE

   Assignments are deliberately retained.

   Effect:

       role.status = disabled
              ↓
       permission resolver ignores role
              ↓
       users temporarily lose its permissions

   Re-enabling the role restores those existing assignments.

   ================================================================ */

export async function disableWorkspaceRole(
  input:
    RoleLifecycleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const roleId =
    requireRoleId(
      input.roleId,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      const existing =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const status =
        normalizeRoleStatus(
          existing.status,
        );


      if (
        status ===
          'disabled'
      ) {
        const role =
          await loadRoleAfterMutation(
            client,
            context.tenantId,
            roleId,
          );


        return {
          role,

          changed:
            false,
        };
      }


      await client.query(
        `
          UPDATE roles

          SET
            status =
              'disabled',

            updated_at =
              NOW()

          WHERE id = $2
            AND tenant_id = $1
            AND is_system = FALSE
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
          roleId,
        ],
      );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.disabled',

          metadata: {
            previousStatus:
              status,

            status:
              'disabled',
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
        );


      return {
        role,

        changed:
          true,
      };
    },
  );
}


/* ================================================================
   ENABLE CUSTOM ROLE
   ================================================================ */

export async function enableWorkspaceRole(
  input:
    RoleLifecycleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const roleId =
    requireRoleId(
      input.roleId,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      const existing =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const status =
        normalizeRoleStatus(
          existing.status,
        );


      if (
        status ===
          'active'
      ) {
        const role =
          await loadRoleAfterMutation(
            client,
            context.tenantId,
            roleId,
          );


        return {
          role,

          changed:
            false,
        };
      }


      await client.query(
        `
          UPDATE roles

          SET
            status =
              'active',

            updated_at =
              NOW()

          WHERE id = $2
            AND tenant_id = $1
            AND is_system = FALSE
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
          roleId,
        ],
      );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.enabled',

          metadata: {
            previousStatus:
              status,

            status:
              'active',
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
        );


      return {
        role,

        changed:
          true,
      };
    },
  );
}


/* ================================================================
   DELETE CUSTOM ROLE

   This is a SOFT delete.

   Important difference from disable:

   DISABLE
       keeps user_roles
       → enable restores previous access.

   DELETE
       soft-deletes user_roles
       → restoring role DOES NOT silently restore user access.

   ================================================================ */

export async function deleteWorkspaceRole(
  input:
    RoleLifecycleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const roleId =
    requireRoleId(
      input.roleId,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      const existing =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
        );


      const assignmentResult =
        await client.query(
          `
            UPDATE user_roles

            SET
              deleted_at =
                NOW(),

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND role_id = $2
              AND deleted_at IS NULL

            RETURNING id
          `,
          [
            context.tenantId,
            roleId,
          ],
        );


      const removedAssignments =
        assignmentResult
          .rows
          .length;


      await client.query(
        `
          UPDATE roles

          SET
            status =
              'disabled',

            deleted_at =
              NOW(),

            updated_at =
              NOW()

          WHERE id = $2
            AND tenant_id = $1
            AND is_system = FALSE
            AND deleted_at IS NULL
        `,
        [
          context.tenantId,
          roleId,
        ],
      );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.deleted',

          metadata: {
            key:
              existing.key,

            name:
              existing.name,

            removedAssignments,
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
          true,
        );


      return {
        role,

        changed:
          true,

        removedAssignments,
      };
    },
  );
}


/* ================================================================
   RESTORE CUSTOM ROLE

   Restoration is deliberately conservative.

   The role returns as DISABLED.

   User assignments deleted during role deletion are NOT restored.

   The administrator must:

       restore role
           ↓
       review permissions
           ↓
       enable role
           ↓
       explicitly assign users

   This prevents accidental access restoration.

   ================================================================ */

export async function restoreWorkspaceRole(
  input:
    RoleLifecycleInput,
): Promise<RoleMutationResult> {
  const context =
    await requireRolePermission(
      SAMI_PERMISSIONS
        .ROLES_MANAGE,
    );


  const roleId =
    requireRoleId(
      input.roleId,
    );


  return withControlTransaction(
    async client => {
      await lockWorkspaceRoles(
        client,
        context.tenantId,
      );


      const existing =
        await requireMutableRole(
          client,
          context.tenantId,
          roleId,
          true,
        );


      if (
        !existing.deleted_at
      ) {
        const role =
          await loadRoleAfterMutation(
            client,
            context.tenantId,
            roleId,
          );


        return {
          role,

          changed:
            false,
        };
      }


      const name =
        typeof existing.name ===
          'string'
          ? existing.name
          : '';


      const key =
        typeof existing.key ===
          'string'
          ? existing.key
          : '';


      await ensureRoleIdentityAvailable(
        client,
        {
          tenantId:
            context.tenantId,

          name,

          key,

          excludeRoleId:
            roleId,
        },
      );


      await client.query(
        `
          UPDATE roles

          SET
            status =
              'disabled',

            deleted_at =
              NULL,

            updated_at =
              NOW()

          WHERE id = $2
            AND tenant_id = $1
            AND is_system = FALSE
        `,
        [
          context.tenantId,
          roleId,
        ],
      );


      await insertRoleAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          roleId,

          action:
            'role.restored',

          metadata: {
            key,
            name,

            status:
              'disabled',

            assignmentsRestored:
              false,
          },

          audit:
            input.audit,
        },
      );


      const role =
        await loadRoleAfterMutation(
          client,
          context.tenantId,
          roleId,
        );


      return {
        role,

        changed:
          true,
      };
    },
  );
}