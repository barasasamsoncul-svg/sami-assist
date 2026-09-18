import 'server-only';

import {
  queryControl,
} from '@/lib/db/control';


/* ================================================================
   SaMi WORKSPACE MEMBERSHIP SERVICE
   ================================================================

   Category 7 — Membership & User Access

   PURPOSE

   This is the canonical backend read/access layer for membership.

   It answers:

   - Does this user belong to this workspace?
   - Is the membership active?
   - Is this an internal or portal member?
   - Is this user the workspace owner?
   - What workspace memberships does this user have?
   - Who belongs to this workspace?
   - Who currently owns this workspace?
   - Can this membership enter the normal SaMi workspace?

   IMPORTANT ARCHITECTURE

   users
       = global SaMi identity

   tenant_users
       = workspace membership

   company_users
       = company access inside the tenant DB

   user_roles
       = role assignment — Category 8

   invitations
       = onboarding — Category 9

   Therefore this service deliberately DOES NOT:

   - assign roles
   - evaluate detailed permissions
   - create invitations
   - manipulate company_users
   - expose Platform Admin functionality

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type WorkspaceMemberType =
  | 'internal'
  | 'portal';


export type WorkspaceMembershipStatus =
  | 'active'
  | 'suspended';


export type WorkspaceMembershipAccessState =
  | 'allowed'
  | 'membership_suspended'
  | 'membership_removed'
  | 'portal_only'
  | 'user_inactive'
  | 'workspace_inactive';


export interface WorkspaceMembership {
  id:
    string;

  tenantId:
    string;

  userId:
    string;

  /* ------------------------------------------------------------
     USER
     ------------------------------------------------------------ */

  email:
    string;

  firstName:
    string;

  lastName:
    string;

  fullName:
    string;

  avatarFileId:
    string | null;

  userStatus:
    string;

  /* ------------------------------------------------------------
     WORKSPACE
     ------------------------------------------------------------ */

  workspaceName:
    string;

  workspaceSlug:
    string;

  workspaceStatus:
    string;

  /* ------------------------------------------------------------
     MEMBERSHIP
     ------------------------------------------------------------ */

  memberType:
    WorkspaceMemberType;

  status:
    WorkspaceMembershipStatus;

  isOwner:
    boolean;

  defaultCompanyId:
    string | null;

  invitedAt:
    string | null;

  joinedAt:
    string | null;

  lastActiveAt:
    string | null;

  suspendedAt:
    string | null;

  suspendedBy:
    string | null;

  suspensionReason:
    string | null;

  removedBy:
    string | null;

  removalReason:
    string | null;

  createdAt:
    string | null;

  updatedAt:
    string | null;

  deletedAt:
    string | null;

  /* ------------------------------------------------------------
     DERIVED ACCESS
     ------------------------------------------------------------ */

  accessState:
    WorkspaceMembershipAccessState;

  canEnterWorkspace:
    boolean;
}


export interface WorkspaceMembershipSummary {
  total:
    number;

  active:
    number;

  suspended:
    number;

  internal:
    number;

  portal:
    number;

  removed:
    number;
}


export interface ListWorkspaceMembersOptions {
  includeRemoved?:
    boolean;

  status?:
    WorkspaceMembershipStatus | null;

  memberType?:
    WorkspaceMemberType | null;
}


export interface ListUserMembershipsOptions {
  includeRemoved?:
    boolean;

  activeWorkspaceOnly?:
    boolean;

  internalOnly?:
    boolean;
}


/* ================================================================
   ERROR
   ================================================================ */

export class MembershipServiceError
  extends Error {
  readonly code:
    | 'INVALID_TENANT_ID'
    | 'INVALID_USER_ID'
    | 'MEMBERSHIP_NOT_FOUND'
    | 'MEMBERSHIP_REMOVED'
    | 'MEMBERSHIP_SUSPENDED'
    | 'PORTAL_WORKSPACE_ACCESS_DENIED'
    | 'USER_NOT_ACTIVE'
    | 'WORKSPACE_NOT_ACTIVE';


  constructor(
    code:
      | 'INVALID_TENANT_ID'
      | 'INVALID_USER_ID'
      | 'MEMBERSHIP_NOT_FOUND'
      | 'MEMBERSHIP_REMOVED'
      | 'MEMBERSHIP_SUSPENDED'
      | 'PORTAL_WORKSPACE_ACCESS_DENIED'
      | 'USER_NOT_ACTIVE'
      | 'WORKSPACE_NOT_ACTIVE',

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'MembershipServiceError';

    this.code =
      code;
  }
}


/* ================================================================
   ID VALIDATION
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


function requireTenantId(
  tenantId:
    string,
): string {
  if (
    typeof tenantId !==
      'string'
  ) {
    throw new MembershipServiceError(
      'INVALID_TENANT_ID',
      'A valid workspace ID is required.',
    );
  }


  const normalized =
    tenantId.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new MembershipServiceError(
      'INVALID_TENANT_ID',
      'A valid workspace ID is required.',
    );
  }


  return normalized;
}


function requireUserId(
  userId:
    string,
): string {
  if (
    typeof userId !==
      'string'
  ) {
    throw new MembershipServiceError(
      'INVALID_USER_ID',
      'A valid user ID is required.',
    );
  }


  const normalized =
    userId.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new MembershipServiceError(
      'INVALID_USER_ID',
      'A valid user ID is required.',
    );
  }


  return normalized;
}


/* ================================================================
   STATUS NORMALIZATION
   ================================================================ */

function normalizeMembershipStatus(
  value:
    unknown,
): WorkspaceMembershipStatus {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'suspended'
  ) {
    return 'suspended';
  }


  return 'active';
}


function normalizeMemberType(
  value:
    unknown,
): WorkspaceMemberType {
  const normalized =
    typeof value ===
      'string'
      ? value
          .trim()
          .toLowerCase()
      : '';


  if (
    normalized ===
      'portal'
  ) {
    return 'portal';
  }


  return 'internal';
}


/* ================================================================
   ISO DATE
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
    value instanceof Date
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
   NORMALIZE GENERIC STATUS
   ================================================================ */

function normalizeStatus(
  value:
    unknown,
): string {
  return typeof value ===
    'string'
    ? value
        .trim()
        .toLowerCase()
    : '';
}


/* ================================================================
   ACCESS STATE
   ================================================================ */

function resolveMembershipAccessState(
  input: {
    deletedAt:
      string | null;

    membershipStatus:
      WorkspaceMembershipStatus;

    memberType:
      WorkspaceMemberType;

    userStatus:
      string;

    workspaceStatus:
      string;
  },
): WorkspaceMembershipAccessState {
  if (
    input.deletedAt
  ) {
    return 'membership_removed';
  }


  if (
    input.membershipStatus ===
      'suspended'
  ) {
    return 'membership_suspended';
  }


  /**
   * Portal users do not enter the normal SaMi back-office
   * workspace.
   *
   * Portal surfaces will be designed separately.
   */
  if (
    input.memberType ===
      'portal'
  ) {
    return 'portal_only';
  }


  if (
    normalizeStatus(
      input.userStatus,
    ) !==
      'active'
  ) {
    return 'user_inactive';
  }


  if (
    normalizeStatus(
      input.workspaceStatus,
    ) !==
      'active'
  ) {
    return 'workspace_inactive';
  }


  return 'allowed';
}


/* ================================================================
   ROW MAPPER
   ================================================================ */

function mapMembership(
  row:
    Record<
      string,
      unknown
    >,
): WorkspaceMembership {
  const memberType =
    normalizeMemberType(
      row.member_type,
    );


  const status =
    normalizeMembershipStatus(
      row.membership_status,
    );


  const deletedAt =
    toIso(
      row.membership_deleted_at,
    );


  const userStatus =
    typeof row.user_status ===
      'string'
      ? row.user_status
      : 'unknown';


  const workspaceStatus =
    typeof row.workspace_status ===
      'string'
      ? row.workspace_status
      : 'unknown';


  const accessState =
    resolveMembershipAccessState({
      deletedAt,

      membershipStatus:
        status,

      memberType,

      userStatus,

      workspaceStatus,
    });


  return {
    id:
      String(
        row.membership_id ||
        '',
      ),

    tenantId:
      String(
        row.tenant_id ||
        '',
      ),

    userId:
      String(
        row.user_id ||
        '',
      ),

    email:
      typeof row.email ===
        'string'
        ? row.email
        : '',

    firstName:
      typeof row.first_name ===
        'string'
        ? row.first_name
        : '',

    lastName:
      typeof row.last_name ===
        'string'
        ? row.last_name
        : '',

    fullName:
      typeof row.full_name ===
        'string'
        ? row.full_name
        : '',

    avatarFileId:
      typeof row.avatar_file_id ===
        'string'
        ? row.avatar_file_id
        : null,

    userStatus,

    workspaceName:
      typeof row.workspace_name ===
        'string'
        ? row.workspace_name
        : '',

    workspaceSlug:
      typeof row.workspace_slug ===
        'string'
        ? row.workspace_slug
        : '',

    workspaceStatus,

    memberType,

    status,

    isOwner:
      row.is_owner ===
      true,

    defaultCompanyId:
      typeof row.default_company_id ===
        'string'
        ? row.default_company_id
        : null,

    invitedAt:
      toIso(
        row.invited_at,
      ),

    joinedAt:
      toIso(
        row.joined_at,
      ),

    lastActiveAt:
      toIso(
        row.last_active_at,
      ),

    suspendedAt:
      toIso(
        row.suspended_at,
      ),

    suspendedBy:
      typeof row.suspended_by ===
        'string'
        ? row.suspended_by
        : null,

    suspensionReason:
      typeof row.suspension_reason ===
        'string'
        ? row.suspension_reason
        : null,

    removedBy:
      typeof row.removed_by ===
        'string'
        ? row.removed_by
        : null,

    removalReason:
      typeof row.removal_reason ===
        'string'
        ? row.removal_reason
        : null,

    createdAt:
      toIso(
        row.membership_created_at,
      ),

    updatedAt:
      toIso(
        row.membership_updated_at,
      ),

    deletedAt,

    accessState,

    canEnterWorkspace:
      accessState ===
      'allowed',
  };
}


/* ================================================================
   SHARED SELECT
   ================================================================ */

const MEMBERSHIP_SELECT = `
  SELECT
    tu.id
      AS membership_id,

    tu.tenant_id,
    tu.user_id,

    tu.member_type,

    tu.status
      AS membership_status,

    tu.is_owner,

    tu.default_company_id,

    tu.invited_at,
    tu.joined_at,
    tu.last_active_at,

    tu.suspended_at,
    tu.suspended_by,
    tu.suspension_reason,

    tu.removed_by,
    tu.removal_reason,

    tu.created_at
      AS membership_created_at,

    tu.updated_at
      AS membership_updated_at,

    tu.deleted_at
      AS membership_deleted_at,

    u.email,
    u.first_name,
    u.last_name,
    u.full_name,
    u.avatar_file_id,

    u.status
      AS user_status,

    t.name
      AS workspace_name,

    t.slug
      AS workspace_slug,

    t.status
      AS workspace_status

  FROM tenant_users tu

  INNER JOIN users u
    ON u.id =
       tu.user_id

  INNER JOIN tenants t
    ON t.id =
       tu.tenant_id
`;


/* ================================================================
   GET MEMBERSHIP
   ================================================================ */

export async function getWorkspaceMembership(
  tenantId:
    string,

  userId:
    string,

  options?: {
    includeRemoved?:
      boolean;
  },
): Promise<WorkspaceMembership | null> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const normalizedUserId =
    requireUserId(
      userId,
    );


  const includeRemoved =
    options?.includeRemoved ===
    true;


  const result =
    await queryControl(
      `
        ${MEMBERSHIP_SELECT}

        WHERE tu.tenant_id = $1
          AND tu.user_id = $2

          AND (
            $3::boolean = TRUE

            OR

            tu.deleted_at
              IS NULL
          )

        LIMIT 1
      `,
      [
        normalizedTenantId,
        normalizedUserId,
        includeRemoved,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  return mapMembership(
    result.rows[0],
  );
}


/* ================================================================
   REQUIRE MEMBERSHIP
   ================================================================ */

export async function requireWorkspaceMembership(
  tenantId:
    string,

  userId:
    string,
): Promise<WorkspaceMembership> {
  const membership =
    await getWorkspaceMembership(
      tenantId,
      userId,
      {
        includeRemoved:
          false,
      },
    );


  if (
    !membership
  ) {
    throw new MembershipServiceError(
      'MEMBERSHIP_NOT_FOUND',
      'You do not belong to this workspace.',
    );
  }


  return membership;
}


/* ================================================================
   REQUIRE NORMAL WORKSPACE ACCESS
   ================================================================

   This is the important Odoo-style boundary:

   active internal member
          +
   active user
          +
   active workspace
          =
   normal SaMi workspace access

   Portal members are deliberately rejected here.
   ================================================================ */

export async function requireActiveWorkspaceMembership(
  tenantId:
    string,

  userId:
    string,
): Promise<WorkspaceMembership> {
  const membership =
    await getWorkspaceMembership(
      tenantId,
      userId,
      {
        includeRemoved:
          true,
      },
    );


  if (
    !membership
  ) {
    throw new MembershipServiceError(
      'MEMBERSHIP_NOT_FOUND',
      'You do not belong to this workspace.',
    );
  }


  switch (
    membership.accessState
  ) {
    case 'allowed':
      return membership;


    case 'membership_removed':
      throw new MembershipServiceError(
        'MEMBERSHIP_REMOVED',
        'Your membership in this workspace has been removed.',
      );


    case 'membership_suspended':
      throw new MembershipServiceError(
        'MEMBERSHIP_SUSPENDED',
        'Your workspace access is currently suspended.',
      );


    case 'portal_only':
      throw new MembershipServiceError(
        'PORTAL_WORKSPACE_ACCESS_DENIED',
        'Portal members cannot access the internal workspace.',
      );


    case 'user_inactive':
      throw new MembershipServiceError(
        'USER_NOT_ACTIVE',
        'Your SaMi account is not active.',
      );


    case 'workspace_inactive':
      throw new MembershipServiceError(
        'WORKSPACE_NOT_ACTIVE',
        'This workspace is not currently active.',
      );
  }
}


/* ================================================================
   BOOLEAN ACCESS CHECK
   ================================================================ */

export async function hasActiveWorkspaceAccess(
  tenantId:
    string,

  userId:
    string,
): Promise<boolean> {
  try {
    await requireActiveWorkspaceMembership(
      tenantId,
      userId,
    );

    return true;
  } catch (
    error
  ) {
    if (
      error instanceof
        MembershipServiceError
    ) {
      return false;
    }

    throw error;
  }
}


/* ================================================================
   GET WORKSPACE OWNER
   ================================================================ */

export async function getWorkspaceOwnerMembership(
  tenantId:
    string,
): Promise<WorkspaceMembership | null> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const result =
    await queryControl(
      `
        ${MEMBERSHIP_SELECT}

        WHERE tu.tenant_id = $1

          AND tu.is_owner =
              TRUE

          AND tu.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        normalizedTenantId,
      ],
    );


  if (
    result.rows.length ===
    0
  ) {
    return null;
  }


  return mapMembership(
    result.rows[0],
  );
}


/* ================================================================
   LIST WORKSPACE MEMBERS
   ================================================================ */

export async function listWorkspaceMembers(
  tenantId:
    string,

  options:
    ListWorkspaceMembersOptions = {},
): Promise<WorkspaceMembership[]> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const includeRemoved =
    options.includeRemoved ===
    true;


  const status =
    options.status ||
    null;


  const memberType =
    options.memberType ||
    null;


  const result =
    await queryControl(
      `
        ${MEMBERSHIP_SELECT}

        WHERE tu.tenant_id = $1

          AND (
            $2::boolean = TRUE

            OR

            tu.deleted_at
              IS NULL
          )

          AND (
            $3::text IS NULL

            OR

            tu.status = $3
          )

          AND (
            $4::text IS NULL

            OR

            tu.member_type = $4
          )

        ORDER BY
          CASE
            WHEN tu.is_owner =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          CASE
            WHEN tu.status =
                 'active'
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            COALESCE(
              NULLIF(
                BTRIM(
                  u.full_name
                ),
                ''
              ),

              u.email
            )
          ) ASC,

          tu.created_at ASC
      `,
      [
        normalizedTenantId,
        includeRemoved,
        status,
        memberType,
      ],
    );


  return result.rows.map(
    row =>
      mapMembership(
        row,
      ),
  );
}


/* ================================================================
   LIST USER WORKSPACE MEMBERSHIPS
   ================================================================ */

export async function listUserWorkspaceMemberships(
  userId:
    string,

  options:
    ListUserMembershipsOptions = {},
): Promise<WorkspaceMembership[]> {
  const normalizedUserId =
    requireUserId(
      userId,
    );


  const includeRemoved =
    options.includeRemoved ===
    true;


  const activeWorkspaceOnly =
    options.activeWorkspaceOnly ===
    true;


  const internalOnly =
    options.internalOnly ===
    true;


  const result =
    await queryControl(
      `
        ${MEMBERSHIP_SELECT}

        WHERE tu.user_id = $1

          AND (
            $2::boolean = TRUE

            OR

            tu.deleted_at
              IS NULL
          )

          AND (
            $3::boolean = FALSE

            OR

            (
              t.status =
                'active'

              AND t.deleted_at
                  IS NULL
            )
          )

          AND (
            $4::boolean = FALSE

            OR

            tu.member_type =
              'internal'
          )

        ORDER BY
          CASE
            WHEN t.status =
                 'active'
            THEN 0

            ELSE 1
          END ASC,

          CASE
            WHEN tu.status =
                 'active'
            THEN 0

            ELSE 1
          END ASC,

          CASE
            WHEN tu.is_owner =
                 TRUE
            THEN 0

            ELSE 1
          END ASC,

          LOWER(
            t.name
          ) ASC,

          tu.created_at ASC
      `,
      [
        normalizedUserId,
        includeRemoved,
        activeWorkspaceOnly,
        internalOnly,
      ],
    );


  return result.rows.map(
    row =>
      mapMembership(
        row,
      ),
  );
}


/* ================================================================
   ACTIVE INTERNAL WORKSPACES
   ================================================================

   This is the canonical membership-side list for a normal
   SaMi workspace selector.

   Roles are intentionally not evaluated here.
   ================================================================ */

export async function listAccessibleInternalWorkspaces(
  userId:
    string,
): Promise<WorkspaceMembership[]> {
  const memberships =
    await listUserWorkspaceMemberships(
      userId,
      {
        includeRemoved:
          false,

        activeWorkspaceOnly:
          true,

        internalOnly:
          true,
      },
    );


  return memberships.filter(
    membership =>
      membership.canEnterWorkspace,
  );
}


/* ================================================================
   MEMBERSHIP SUMMARY
   ================================================================ */

export async function getWorkspaceMembershipSummary(
  tenantId:
    string,
): Promise<WorkspaceMembershipSummary> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const result =
    await queryControl(
      `
        SELECT

          COUNT(*)::integer
            AS total,

          COUNT(*) FILTER (
            WHERE deleted_at
                  IS NULL

              AND status =
                  'active'
          )::integer
            AS active,

          COUNT(*) FILTER (
            WHERE deleted_at
                  IS NULL

              AND status =
                  'suspended'
          )::integer
            AS suspended,

          COUNT(*) FILTER (
            WHERE deleted_at
                  IS NULL

              AND member_type =
                  'internal'
          )::integer
            AS internal,

          COUNT(*) FILTER (
            WHERE deleted_at
                  IS NULL

              AND member_type =
                  'portal'
          )::integer
            AS portal,

          COUNT(*) FILTER (
            WHERE deleted_at
                  IS NOT NULL
          )::integer
            AS removed

        FROM tenant_users

        WHERE tenant_id = $1
      `,
      [
        normalizedTenantId,
      ],
    );


  const row =
    result.rows[0] ||
    {};


  return {
    total:
      Number(
        row.total ||
        0,
      ),

    active:
      Number(
        row.active ||
        0,
      ),

    suspended:
      Number(
        row.suspended ||
        0,
      ),

    internal:
      Number(
        row.internal ||
        0,
      ),

    portal:
      Number(
        row.portal ||
        0,
      ),

    removed:
      Number(
        row.removed ||
        0,
      ),
  };
}


/* ================================================================
   TOUCH MEMBERSHIP ACTIVITY
   ================================================================

   Safe helper for later session integration.

   It intentionally updates at most once every five minutes to
   avoid turning every request into a Control DB write.

   Category 7.9 will connect this properly to session activity.
   ================================================================ */

export async function touchMembershipActivity(
  tenantId:
    string,

  userId:
    string,
): Promise<boolean> {
  const normalizedTenantId =
    requireTenantId(
      tenantId,
    );


  const normalizedUserId =
    requireUserId(
      userId,
    );


  const result =
    await queryControl(
      `
        UPDATE tenant_users

        SET
          last_active_at =
            NOW()

        WHERE tenant_id = $1
          AND user_id = $2

          AND deleted_at
              IS NULL

          AND status =
              'active'

          AND member_type =
              'internal'

          AND (
            last_active_at
              IS NULL

            OR

            last_active_at <
              NOW() -
              INTERVAL '5 minutes'
          )

        RETURNING id
      `,
      [
        normalizedTenantId,
        normalizedUserId,
      ],
    );


  return (
    result.rows.length >
    0
  );
}