import 'server-only';

import {
  getSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';


/* ================================================================
   SaMi TRUSTED TENANT CONTEXT
   ================================================================

   Category 7.4 / Category 8.7

   This context establishes the trusted INTERNAL workspace boundary.

   IMPORTANT

   Authorization is NOT decided here.

   This file answers:

       who is the authenticated user?
       which workspace is active?
       does the user have active INTERNAL membership?
       is the workspace active?
       is the tenant database available?
       is the user structurally the workspace owner?
       does the user hold the exact protected SaMi Admin role?

   Granular authorization belongs to:

       permission-context.ts
       permission-guards.ts

   No role-name heuristics are allowed.

   ================================================================ */


export type TenantAccessLevel =
  | 'owner'
  | 'admin'
  | 'member';


export type TrustedWorkspaceMemberType =
  'internal';


export interface TrustedTenantContext {
  sessionId:
    string;

  userId:
    string;

  tenantId:
    string;

  membershipId:
    string;

  memberType:
    TrustedWorkspaceMemberType;

  tenantName:
    string;

  tenantSlug:
    string;

  /*
   * Compatibility/display classification.
   *
   * Do NOT use accessLevel for granular authorization.
   */
  accessLevel:
    TenantAccessLevel;

  isOwner:
    boolean;

  /*
   * Exact protected SaMi Admin identity only.
   *
   * This is NOT a substitute for permission checks.
   */
  isAdmin:
    boolean;

  databaseId:
    string;

  databaseName:
    string;

  schemaVersion:
    string | null;
}


/* ================================================================
   ERROR
   ================================================================ */

export class TenantContextError
  extends Error {
  readonly code:
    | 'UNAUTHENTICATED'
    | 'NO_WORKSPACE_SELECTED'
    | 'WORKSPACE_ACCESS_DENIED'
    | 'WORKSPACE_DATABASE_UNAVAILABLE';


  constructor(
    code:
      | 'UNAUTHENTICATED'
      | 'NO_WORKSPACE_SELECTED'
      | 'WORKSPACE_ACCESS_DENIED'
      | 'WORKSPACE_DATABASE_UNAVAILABLE',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'TenantContextError';

    this.code =
      code;
  }
}


/* ================================================================
   REQUIRE INTERNAL TENANT CONTEXT
   ================================================================ */

export async function requireTenantContext():
  Promise<TrustedTenantContext> {
  const session =
    await getSession();


  if (
    !session
  ) {
    throw new TenantContextError(
      'UNAUTHENTICATED',
      'Authentication is required.',
    );
  }


  if (
    !session.currentTenantId
  ) {
    throw new TenantContextError(
      'NO_WORKSPACE_SELECTED',
      'No active workspace is selected.',
    );
  }


  const result =
    await queryControl(
      `
        SELECT
          tu.id
            AS membership_id,

          tu.member_type,

          tu.is_owner,

          t.id
            AS tenant_id,

          t.name
            AS tenant_name,

          t.slug
            AS tenant_slug,

          td.id
            AS database_id,

          td.database_name,

          td.schema_version,

          EXISTS (
            SELECT 1

            FROM user_roles ur

            INNER JOIN roles r
              ON r.id =
                 ur.role_id

            WHERE ur.user_id =
                  $1

              AND ur.tenant_id =
                  t.id

              AND ur.deleted_at
                  IS NULL

              AND r.deleted_at
                  IS NULL

              AND r.is_system =
                  TRUE

              AND r.tenant_id
                  IS NULL

              AND LOWER(
                COALESCE(
                  r.key,
                  ''
                )
              ) =
              'admin'

              AND LOWER(
                COALESCE(
                  r.status,
                  'active'
                )
              ) =
              'active'
          )
            AS has_system_admin_role

        FROM tenant_users tu

        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id

        LEFT JOIN tenant_databases td
          ON td.tenant_id =
             t.id

          AND LOWER(
            COALESCE(
              td.status,
              ''
            )
          ) =
          'active'

        WHERE tu.user_id =
              $1

          AND tu.tenant_id =
              $2

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) =
          'active'

          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) =
          'internal'

          AND tu.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) =
          'active'

          AND t.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        session.user.id,
        session.currentTenantId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new TenantContextError(
      'WORKSPACE_ACCESS_DENIED',
      'The current workspace is not available to this user.',
    );
  }


  const row =
    result.rows[0];


  if (
    !row.database_id ||
    !row.database_name
  ) {
    throw new TenantContextError(
      'WORKSPACE_DATABASE_UNAVAILABLE',
      'The workspace database is not available.',
    );
  }


  const isOwner =
    row.is_owner ===
    true;


  /*
   * Exact role identity.
   *
   * No:
   *
   *   LIKE '%admin%'
   *   name.includes('admin')
   *   role name guessing
   */
  const hasSystemAdminRole =
    row.has_system_admin_role ===
    true;


  /*
   * Owner satisfies the legacy/display "admin" classification,
   * but granular authorization still comes from permissions.
   */
  const isAdmin =
    isOwner ||
    hasSystemAdminRole;


  const accessLevel:
    TenantAccessLevel =
    isOwner
      ? 'owner'
      : hasSystemAdminRole
        ? 'admin'
        : 'member';


  return {
    sessionId:
      session.sessionId,

    userId:
      session.user.id,

    tenantId:
      String(
        row.tenant_id,
      ),

    membershipId:
      String(
        row.membership_id,
      ),

    memberType:
      'internal',

    tenantName:
      typeof row.tenant_name ===
        'string'
        ? row.tenant_name
        : '',

    tenantSlug:
      typeof row.tenant_slug ===
        'string'
        ? row.tenant_slug
        : '',

    accessLevel,

    isOwner,

    isAdmin,

    databaseId:
      String(
        row.database_id,
      ),

    databaseName:
      String(
        row.database_name,
      ),

    schemaVersion:
      typeof row.schema_version ===
        'string'
        ? row.schema_version
        : null,
  };
}


/* ================================================================
   CURRENT TENANT ID
   ================================================================ */

export async function requireCurrentTenantId():
  Promise<string> {
  const context =
    await requireTenantContext();


  return context.tenantId;
}


/* ================================================================
   CURRENT TENANT IDENTITY
   ================================================================ */

export async function requireTenantIdentity():
  Promise<{
    userId:
      string;

    tenantId:
      string;

    sessionId:
      string;
  }> {
  const context =
    await requireTenantContext();


  return {
    userId:
      context.userId,

    tenantId:
      context.tenantId,

    sessionId:
      context.sessionId,
  };
}