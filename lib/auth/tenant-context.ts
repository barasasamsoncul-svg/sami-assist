import 'server-only';

import {
  getSession,
} from '@/lib/auth/session';

import {
  queryControl,
} from '@/lib/db/control';


/**
 * ================================================================
 * SaMi TRUSTED TENANT CONTEXT
 * ================================================================
 *
 * Category 7.4
 *
 * This context represents an INTERNAL SaMi workspace.
 *
 * Portal memberships are deliberately rejected here.
 *
 * Future customer/vendor/client portal surfaces must use a
 * separate restricted context instead of this internal context.
 *
 * Normal module/API code must NEVER select a tenant from:
 *
 * - request.body.tenantId
 * - request.query.tenantId
 * - request headers
 * - browser localStorage
 * - arbitrary browser state
 *
 * The current tenant comes from the authenticated SaMi session
 * and is revalidated against:
 *
 * - tenant_users
 * - membership status
 * - member_type
 * - tenants
 * - tenant_databases
 *
 * ================================================================
 */


export type TenantAccessLevel =
  | 'owner'
  | 'admin'
  | 'member';


export type TrustedWorkspaceMemberType =
  'internal';


export interface TrustedTenantContext {
  sessionId: string;

  userId: string;
  tenantId: string;

  membershipId: string;

  memberType:
    TrustedWorkspaceMemberType;

  tenantName: string;
  tenantSlug: string;

  accessLevel:
    TenantAccessLevel;

  isOwner: boolean;
  isAdmin: boolean;

  databaseId: string;
  databaseName: string;

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

/**
 * Resolve the current authenticated INTERNAL workspace.
 *
 * This intentionally accepts NO tenantId argument.
 */
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

              AND LOWER(
                COALESCE(
                  r.key,
                  r.name,
                  ''
                )
              ) LIKE '%admin%'
          )
            AS role_is_admin

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
          ) = 'active'

        WHERE tu.user_id =
              $1

          AND tu.tenant_id =
              $2

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND LOWER(
            COALESCE(
              tu.member_type,
              ''
            )
          ) = 'internal'

          AND tu.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) = 'active'

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


  const isAdmin =
    isOwner ||
    row.role_is_admin ===
      true;


  const accessLevel:
    TenantAccessLevel =
    isOwner
      ? 'owner'
      : isAdmin
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
    userId: string;
    tenantId: string;
    sessionId: string;
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