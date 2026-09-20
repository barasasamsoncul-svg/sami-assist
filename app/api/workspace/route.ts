import crypto from 'node:crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import type {
  PoolClient,
} from 'pg';

import {
  cancelTenantDatabaseDeletionRequest,
  markTenantDatabaseDeletionRequested,
} from '@/lib/services/tenant-lifecycle';

import {
  getAccountContextForUser,
  listAccessibleWorkspaces,
} from '@/lib/auth/account-context';

import {
  getPermissionContext,
  permissionContextHas,
} from '@/lib/auth/permission-context';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  checkRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getSession,
  getSessionRequestMetadata,
  setCurrentTenantForSession,
} from '@/lib/auth/session';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';


export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';


/* ============================================================
   CONFIG
   ============================================================ */

const MAX_BODY_BYTES =
  16 * 1024;


const WORKSPACE_NAME_MIN_LENGTH =
  2;


const WORKSPACE_NAME_MAX_LENGTH =
  200;


const WORKSPACE_SLUG_MIN_LENGTH =
  3;


const WORKSPACE_SLUG_MAX_LENGTH =
  200;


const WORKSPACE_DELETION_GRACE_DAYS =
  30;


const WORKSPACE_UPDATE_WINDOW_MS =
  10 * 60 * 1000;


const WORKSPACE_UPDATE_BLOCK_MS =
  15 * 60 * 1000;


const WORKSPACE_LIFECYCLE_WINDOW_MS =
  60 * 60 * 1000;


const WORKSPACE_LIFECYCLE_BLOCK_MS =
  60 * 60 * 1000;


const WORKSPACE_TRANSFER_WINDOW_MS =
  60 * 60 * 1000;


const WORKSPACE_TRANSFER_BLOCK_MS =
  60 * 60 * 1000;


const WORKSPACE_SWITCH_WINDOW_MS =
  10 * 60 * 1000;


const WORKSPACE_SWITCH_BLOCK_MS =
  10 * 60 * 1000;


const RESERVED_SLUGS =
  new Set([
    'admin',
    'api',
    'auth',
    'billing',
    'dashboard',
    'help',
    'login',
    'logout',
    'register',
    'sami',
    'settings',
    'support',
    'workspace',
    'www',
  ]);


/* ============================================================
   TYPES
   ============================================================ */

type JsonObject =
  Record<string, unknown>;


type WorkspaceAction =
  | 'switch_workspace'
  | 'request_deletion'
  | 'cancel_deletion'
  | 'request_ownership_transfer'
  | 'cancel_ownership_transfer'
  | 'accept_ownership_transfer'
  | 'reject_ownership_transfer';


type WorkspaceManagementPolicy = {
  adminsCanViewWorkspaceSettings: boolean;
  adminsCanEditWorkspaceDetails: boolean;
};


type WorkspacePatchBody = {
  name?: unknown;
  slug?: unknown;
  workspaceManagement?: unknown;
};


type WorkspaceActionBody = {
  action?: unknown;
  tenantId?: unknown;
  targetUserId?: unknown;
  transferId?: unknown;
};


type WorkspaceIdentity = {
  sessionId: string;
  tenantId: string;
  userId: string;

  isOwner: boolean;
  isAdmin: boolean;

  /*
   * Category 8 permissions are the canonical authority for
   * ordinary workspace administration.
   */
  canViewWorkspaceSettings: boolean;
  canManageWorkspace: boolean;

  accessLevel:
    | 'owner'
    | 'admin'
    | 'member';
};


type WorkspaceAccess = {
  isOwner: boolean;
  isAdmin: boolean;

  canViewWorkspaceSettings: boolean;
  canManageWorkspace: boolean;
  canManageWorkspaceAccess: boolean;
  canManageLifecycle: boolean;
  canTransferOwnership: boolean;
};


type AuditInput = {
  client: PoolClient;

  tenantId: string;
  userId: string;

  action: string;
  eventType: string;

  metadata?: Record<
    string,
    unknown
  >;

  ipAddress: string;
  userAgent: string;

  correlationId: string;
};


type ActionContext = {
  identity:
    WorkspaceIdentity;

  requestMetadata:
    ReturnType<
      typeof getSessionRequestMetadata
    >;

  correlationId:
    string;
};


/* ============================================================
   ERROR
   ============================================================ */

class WorkspaceApiError extends Error {
  status:
    number;

  code:
    string;

  retryAfterSeconds?:
    number | null;


  constructor(
    status:
      number,

    code:
      string,

    message:
      string,
  ) {
    super(
      message,
    );


    this.name =
      'WorkspaceApiError';


    this.status =
      status;


    this.code =
      code;
  }
}


/* ============================================================
   RESPONSE
   ============================================================ */

function json(
  body:
    Record<string, unknown>,

  status =
    200,

  headers?:
    Record<string, string>,
) {
  return NextResponse.json(
    body,
    {
      status,

      headers: {
        'Cache-Control':
          'no-store, no-cache, must-revalidate',

        Pragma:
          'no-cache',

        ...headers,
      },
    },
  );
}


/* ============================================================
   OBJECT
   ============================================================ */

function isObject(
  value:
    unknown,
): value is JsonObject {
  return (
    typeof value ===
      'object' &&
    value !==
      null &&
    !Array.isArray(
      value,
    )
  );
}


function hasOwn(
  value:
    object,

  key:
    string,
) {
  return Object.prototype
    .hasOwnProperty.call(
      value,
      key,
    );
}


function rejectUnsupportedFields(
  body:
    JsonObject,

  allowed:
    string[],
) {
  const allowedSet =
    new Set(
      allowed,
    );


  const unsupported =
    Object.keys(
      body,
    ).filter(
      key =>
        !allowedSet.has(
          key,
        ),
    );


  if (
    unsupported.length >
    0
  ) {
    throw new WorkspaceApiError(
      400,
      'UNSUPPORTED_FIELDS',
      'The request contains unsupported fields.',
    );
  }
}


/* ============================================================
   UUID
   ============================================================ */

function isUuid(
  value:
    unknown,
): value is string {
  return (
    typeof value ===
      'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim(),
    )
  );
}


function requireUuid(
  value:
    unknown,

  code:
    string,

  message:
    string,
) {
  if (
    !isUuid(
      value,
    )
  ) {
    throw new WorkspaceApiError(
      400,
      code,
      message,
    );
  }


  return value.trim();
}


/* ============================================================
   DATE
   ============================================================ */

function toIso(
  value:
    unknown,
): string | null {
  if (
    !value
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


/* ============================================================
   SAME ORIGIN
   ============================================================ */

function requireSameOrigin(
  request:
    NextRequest,
) {
  const secFetchSite =
    request.headers
      .get(
        'sec-fetch-site',
      )
      ?.trim()
      .toLowerCase();


  if (
    secFetchSite ===
    'cross-site'
  ) {
    throw new WorkspaceApiError(
      403,
      'INVALID_ORIGIN',
      'This request could not be verified.',
    );
  }


  const expectedOrigin =
    request.nextUrl.origin;


  const origin =
    request.headers.get(
      'origin',
    );


  if (
    origin
  ) {
    try {
      if (
        new URL(
          origin,
        ).origin !==
        expectedOrigin
      ) {
        throw new WorkspaceApiError(
          403,
          'INVALID_ORIGIN',
          'This request could not be verified.',
        );
      }
    } catch (
      error
    ) {
      if (
        error instanceof
        WorkspaceApiError
      ) {
        throw error;
      }


      throw new WorkspaceApiError(
        403,
        'INVALID_ORIGIN',
        'This request could not be verified.',
      );
    }


    return;
  }


  const referer =
    request.headers.get(
      'referer',
    );


  if (
    referer
  ) {
    try {
      if (
        new URL(
          referer,
        ).origin !==
        expectedOrigin
      ) {
        throw new WorkspaceApiError(
          403,
          'INVALID_ORIGIN',
          'This request could not be verified.',
        );
      }
    } catch (
      error
    ) {
      if (
        error instanceof
        WorkspaceApiError
      ) {
        throw error;
      }


      throw new WorkspaceApiError(
        403,
        'INVALID_ORIGIN',
        'This request could not be verified.',
      );
    }
  }
}


/* ============================================================
   BODY
   ============================================================ */

async function readJsonBody(
  request:
    NextRequest,
): Promise<JsonObject> {
  const contentType =
    request.headers
      .get(
        'content-type',
      )
      ?.toLowerCase() ||
    '';


  if (
    !contentType.includes(
      'application/json',
    )
  ) {
    throw new WorkspaceApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'The request must use JSON.',
    );
  }


  const contentLength =
    Number(
      request.headers.get(
        'content-length',
      ),
    );


  if (
    Number.isFinite(
      contentLength,
    ) &&
    contentLength >
      MAX_BODY_BYTES
  ) {
    throw new WorkspaceApiError(
      413,
      'REQUEST_TOO_LARGE',
      'The request is too large.',
    );
  }


  const raw =
    await request.text();


  if (
    Buffer.byteLength(
      raw,
      'utf8',
    ) >
    MAX_BODY_BYTES
  ) {
    throw new WorkspaceApiError(
      413,
      'REQUEST_TOO_LARGE',
      'The request is too large.',
    );
  }


  if (
    !raw.trim()
  ) {
    throw new WorkspaceApiError(
      400,
      'EMPTY_REQUEST',
      'The request body is required.',
    );
  }


  let parsed:
    unknown;


  try {
    parsed =
      JSON.parse(
        raw,
      );
  } catch {
    throw new WorkspaceApiError(
      400,
      'INVALID_JSON',
      'The request contains invalid JSON.',
    );
  }


  if (
    !isObject(
      parsed,
    )
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_REQUEST',
      'The request is invalid.',
    );
  }


  return parsed;
}


/* ============================================================
   WORKSPACE VALIDATION
   ============================================================ */

function normalizeWorkspaceName(
  value:
    unknown,
) {
  if (
    typeof value !==
    'string'
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_NAME',
      'Workspace name must be text.',
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
    normalized.length <
      WORKSPACE_NAME_MIN_LENGTH ||
    normalized.length >
      WORKSPACE_NAME_MAX_LENGTH
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_NAME',
      `Workspace name must be between ${WORKSPACE_NAME_MIN_LENGTH} and ${WORKSPACE_NAME_MAX_LENGTH} characters.`,
    );
  }


  return normalized;
}


function normalizeWorkspaceSlug(
  value:
    unknown,
) {
  if (
    typeof value !==
    'string'
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_SLUG',
      'Workspace address must be text.',
    );
  }


  const normalized =
    value
      .trim()
      .toLowerCase();


  if (
    normalized.length <
      WORKSPACE_SLUG_MIN_LENGTH ||
    normalized.length >
      WORKSPACE_SLUG_MAX_LENGTH
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_SLUG',
      `Workspace address must be between ${WORKSPACE_SLUG_MIN_LENGTH} and ${WORKSPACE_SLUG_MAX_LENGTH} characters.`,
    );
  }


  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      normalized,
    )
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_SLUG',
      'Workspace address can contain lowercase letters, numbers and single hyphens only.',
    );
  }


  if (
    RESERVED_SLUGS.has(
      normalized,
    )
  ) {
    throw new WorkspaceApiError(
      400,
      'RESERVED_WORKSPACE_SLUG',
      'That workspace address is reserved.',
    );
  }


  return normalized;
}


/* ============================================================
   POLICY
   ============================================================ */

function defaultWorkspaceManagementPolicy():
  WorkspaceManagementPolicy {
  return {
    adminsCanViewWorkspaceSettings:
      false,

    adminsCanEditWorkspaceDetails:
      false,
  };
}


function parseWorkspaceManagementPolicy(
  value:
    unknown,
): WorkspaceManagementPolicy {
  const defaults =
    defaultWorkspaceManagementPolicy();


  if (
    !isObject(
      value,
    )
  ) {
    return defaults;
  }


  const edit =
    typeof value
      .adminsCanEditWorkspaceDetails ===
      'boolean'
      ? value
          .adminsCanEditWorkspaceDetails
      : defaults
          .adminsCanEditWorkspaceDetails;


  const view =
    typeof value
      .adminsCanViewWorkspaceSettings ===
      'boolean'
      ? value
          .adminsCanViewWorkspaceSettings
      : defaults
          .adminsCanViewWorkspaceSettings;


  return {
    adminsCanViewWorkspaceSettings:
      view ||
      edit,

    adminsCanEditWorkspaceDetails:
      edit,
  };
}


function normalizeWorkspaceManagementPatch(
  value:
    unknown,

  current:
    WorkspaceManagementPolicy,
): WorkspaceManagementPolicy {
  if (
    !isObject(
      value,
    )
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_ACCESS',
      'Workspace access settings are invalid.',
    );
  }


  rejectUnsupportedFields(
    value,
    [
      'adminsCanViewWorkspaceSettings',
      'adminsCanEditWorkspaceDetails',
    ],
  );


  const hasView =
    hasOwn(
      value,
      'adminsCanViewWorkspaceSettings',
    );


  const hasEdit =
    hasOwn(
      value,
      'adminsCanEditWorkspaceDetails',
    );


  if (
    !hasView &&
    !hasEdit
  ) {
    throw new WorkspaceApiError(
      400,
      'NO_WORKSPACE_ACCESS_CHANGES',
      'No workspace access changes were provided.',
    );
  }


  if (
    hasView &&
    typeof value
      .adminsCanViewWorkspaceSettings !==
      'boolean'
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_ACCESS',
      'Workspace access settings are invalid.',
    );
  }


  if (
    hasEdit &&
    typeof value
      .adminsCanEditWorkspaceDetails !==
      'boolean'
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_WORKSPACE_ACCESS',
      'Workspace access settings are invalid.',
    );
  }


  let canView =
    hasView
      ? value
          .adminsCanViewWorkspaceSettings as boolean
      : current
          .adminsCanViewWorkspaceSettings;


  let canEdit =
    hasEdit
      ? value
          .adminsCanEditWorkspaceDetails as boolean
      : current
          .adminsCanEditWorkspaceDetails;


  if (
    canEdit
  ) {
    canView =
      true;
  }


  if (
    !canView
  ) {
    canEdit =
      false;
  }


  return {
    adminsCanViewWorkspaceSettings:
      canView,

    adminsCanEditWorkspaceDetails:
      canEdit,
  };
}


async function loadWorkspaceManagementPolicy(
  tenantId:
    string,
) {
  const result =
    await queryControl(
      `
        SELECT
          settings -> 'workspaceManagement'
            AS workspace_management

        FROM tenant_settings

        WHERE tenant_id = $1

        LIMIT 1
      `,
      [
        tenantId,
      ],
    );


  return parseWorkspaceManagementPolicy(
    result.rows[0]
      ?.workspace_management,
  );
}


async function loadWorkspaceManagementPolicyForUpdate(
  client:
    PoolClient,

  tenantId:
    string,
) {
  await client.query(
    `
      INSERT INTO tenant_settings (
        tenant_id,
        settings,
        created_at,
        updated_at
      )

      VALUES (
        $1,
        '{}'::jsonb,
        NOW(),
        NOW()
      )

      ON CONFLICT (tenant_id)
      DO NOTHING
    `,
    [
      tenantId,
    ],
  );


  const result =
    await client.query(
      `
        SELECT
          settings -> 'workspaceManagement'
            AS workspace_management

        FROM tenant_settings

        WHERE tenant_id = $1

        LIMIT 1

        FOR UPDATE
      `,
      [
        tenantId,
      ],
    );


  return parseWorkspaceManagementPolicy(
    result.rows[0]
      ?.workspace_management,
  );
}


function buildWorkspaceAccess(
  identity:
    WorkspaceIdentity,

  policy:
    WorkspaceManagementPolicy,
): WorkspaceAccess {
  /*
   * Legacy workspaceManagement flags are retained in storage for a
   * non-breaking migration, but they no longer authorize anything.
   * Category 8 permissions are the sole ordinary-management source.
   */
  void policy;


  return {
    isOwner:
      identity.isOwner,

    isAdmin:
      identity.isAdmin,

    canViewWorkspaceSettings:
      identity.isOwner ||
      identity.canViewWorkspaceSettings,

    canManageWorkspace:
      identity.isOwner ||
      identity.canManageWorkspace,

    /*
     * The old owner-controlled "allow Admins" switch is retired.
     * Roles & Permissions now controls delegated management.
     */
    canManageWorkspaceAccess:
      false,

    canManageLifecycle:
      identity.isOwner,

    canTransferOwnership:
      identity.isOwner,
  };
}


/* ============================================================
   AUTH
   ============================================================ */

async function requireWorkspaceIdentity():
  Promise<WorkspaceIdentity> {
  const session =
    await getSession();


  if (
    !session
  ) {
    throw new WorkspaceApiError(
      401,
      'UNAUTHENTICATED',
      'You must sign in to access this workspace.',
    );
  }


  const context =
    await getAccountContextForUser(
      session.user.id,
      session.currentTenantId,
    );


  if (
    !context.tenant ||
    !context.membership
  ) {
    throw new WorkspaceApiError(
      403,
      'WORKSPACE_ACCESS_DENIED',
      'You do not have access to a workspace.',
    );
  }


  if (
    context.membership
      .status
      .trim()
      .toLowerCase() !==
    'active'
  ) {
    throw new WorkspaceApiError(
      403,
      'WORKSPACE_ACCESS_DENIED',
      'Your workspace access is not active.',
    );
  }


  const permissionContext =
    await getPermissionContext();


  if (
    permissionContext.userId !==
      session.user.id ||
    permissionContext.tenantId !==
      context.tenant.id
  ) {
    throw new WorkspaceApiError(
      403,
      'WORKSPACE_CONTEXT_MISMATCH',
      'The workspace authorization context is no longer valid.',
    );
  }


  const canViewWorkspaceSettings =
    permissionContext.isOwner ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_VIEW,
    ) ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_MANAGE,
    );


  const canManageWorkspace =
    permissionContext.isOwner ||
    permissionContextHas(
      permissionContext,
      SAMI_PERMISSIONS.WORKSPACE_MANAGE,
    );


  return {
    sessionId:
      session.sessionId,

    tenantId:
      context.tenant.id,

    userId:
      session.user.id,

    isOwner:
      context.membership
        .isOwner ===
      true,

    isAdmin:
      context.membership
        .isAdmin ===
      true,

    canViewWorkspaceSettings,

    canManageWorkspace,

    accessLevel:
      context.membership
        .accessLevel,
  };
}


async function requireOwnerInTransaction(
  client:
    PoolClient,

  tenantId:
    string,

  userId:
    string,
) {
  const result =
    await client.query(
      `
        SELECT
          id

        FROM tenant_users

        WHERE tenant_id = $1
          AND user_id = $2
          AND is_owner = TRUE

          AND LOWER(
            COALESCE(
              status,
              ''
            )
          ) = 'active'

          AND deleted_at IS NULL

        LIMIT 1

        FOR UPDATE
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
    throw new WorkspaceApiError(
      403,
      'OWNER_REQUIRED',
      'Only the workspace owner can perform this action.',
    );
  }
}


/* ============================================================
   RATE LIMIT
   ============================================================ */

async function requireRateLimit(
  identifier:
    string,

  action:
    string,

  maxAttempts:
    number,

  windowMs:
    number,

  blockMs:
    number,
) {
  const result =
    await checkRateLimit({
      identifier,
      action,
      maxAttempts,
      windowMs,
      blockMs,
    });


  if (
    result.allowed
  ) {
    return;
  }


  const error =
    new WorkspaceApiError(
      429,
      'RATE_LIMITED',
      'Too many requests. Please try again later.',
    );


  error.retryAfterSeconds =
    result.retryAfterSeconds;


  throw error;
}


/* ============================================================
   AUDIT
   ============================================================ */

async function insertAudit(
  input:
    AuditInput,
) {
  await input.client.query(
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
        'workspace',
        $1,
        'workspace',
        'success',
        $4::jsonb,
        $5,
        $6,
        $7,
        $8,
        'workspace',
        $1
      )
    `,
    [
      input.tenantId,
      input.userId,
      input.action,

      JSON.stringify(
        input.metadata ||
        {},
      ),

      input.ipAddress
        .slice(
          0,
          45,
        ),

      input.userAgent,

      input.correlationId,

      input.eventType,
    ],
  );
}


/* ============================================================
   EXPIRE TRANSFERS
   ============================================================ */

async function expireOldTransfers(
  client:
    PoolClient,

  tenantId:
    string,
) {
  await client.query(
    `
      UPDATE tenant_ownership_transfers

      SET
        status =
          'expired',

        updated_at =
          NOW()

      WHERE tenant_id = $1
        AND status = 'pending'
        AND expires_at <= NOW()
    `,
    [
      tenantId,
    ],
  );
}


/* ============================================================
   GET
   ============================================================ */

export async function GET() {
  try {
    const identity =
      await requireWorkspaceIdentity();


    const [
      policy,
      workspaces,
      workspaceResult,
      ownerResult,
      pendingTransferResult,
    ] =
      await Promise.all([
        loadWorkspaceManagementPolicy(
          identity.tenantId,
        ),

        listAccessibleWorkspaces(
          identity.userId,
        ),

        queryControl(
          `
            SELECT
              id,
              name,
              slug,
              logo_url,
              status,
              created_at,
              updated_at,
              archived_at,
              archived_by,
              deletion_requested_at,
              deletion_requested_by,
              deletion_scheduled_for,
              deletion_cancelled_at,
              deletion_cancelled_by

            FROM tenants

            WHERE id = $1
              AND deleted_at IS NULL

            LIMIT 1
          `,
          [
            identity.tenantId,
          ],
        ),

        queryControl(
          `
            SELECT
              u.id,
              u.email,
              u.first_name,
              u.last_name,
              u.full_name

            FROM tenant_users tu

            INNER JOIN users u
              ON u.id =
                 tu.user_id

            WHERE tu.tenant_id = $1
              AND tu.is_owner = TRUE

              AND LOWER(
                COALESCE(
                  tu.status,
                  ''
                )
              ) = 'active'

              AND tu.deleted_at
                  IS NULL

              AND u.deleted_at
                  IS NULL

            LIMIT 1
          `,
          [
            identity.tenantId,
          ],
        ),

        queryControl(
          `
            SELECT
              transfer.id,
              transfer.from_user_id,
              transfer.to_user_id,
              transfer.status,
              transfer.requested_at,
              transfer.expires_at,

              from_user.email
                AS from_email,

              from_user.full_name
                AS from_full_name,

              to_user.email
                AS to_email,

              to_user.full_name
                AS to_full_name

            FROM tenant_ownership_transfers
              transfer

            INNER JOIN users
              from_user
              ON from_user.id =
                 transfer.from_user_id

            INNER JOIN users
              to_user
              ON to_user.id =
                 transfer.to_user_id

            WHERE transfer.tenant_id = $1

              AND transfer.status =
                  'pending'

              AND transfer.expires_at >
                  NOW()

              AND (
                transfer.from_user_id = $2
                OR
                transfer.to_user_id = $2
              )

            ORDER BY
              transfer.requested_at
                DESC

            LIMIT 1
          `,
          [
            identity.tenantId,
            identity.userId,
          ],
        ),
      ]);


    if (
      workspaceResult
        .rows.length ===
      0
    ) {
      throw new WorkspaceApiError(
        404,
        'WORKSPACE_NOT_FOUND',
        'The workspace could not be found.',
      );
    }


    const access =
      buildWorkspaceAccess(
        identity,
        policy,
      );


    const transfer =
      pendingTransferResult
        .rows[0] ||
      null;


    const hasIncomingTransfer =
      Boolean(
        transfer &&
        transfer.to_user_id ===
          identity.userId,
      );


    if (
      !access
        .canViewWorkspaceSettings &&
      !hasIncomingTransfer
    ) {
      throw new WorkspaceApiError(
        403,
        'WORKSPACE_SETTINGS_ACCESS_DENIED',
        'Workspace settings are managed by the workspace owner.',
      );
    }


    const transferCandidatesResult =
      identity.isOwner
        ? await queryControl(
            `
              SELECT
                u.id,
                u.email,
                u.first_name,
                u.last_name,
                u.full_name

              FROM tenant_users tu

              INNER JOIN users u
                ON u.id =
                   tu.user_id

              WHERE tu.tenant_id = $1
                AND tu.is_owner = FALSE

                AND LOWER(
                  COALESCE(
                    tu.status,
                    ''
                  )
                ) = 'active'

                AND tu.deleted_at
                    IS NULL

                AND u.deleted_at
                    IS NULL

                AND LOWER(
                  COALESCE(
                    u.status,
                    ''
                  )
                ) = 'active'

              ORDER BY
                COALESCE(
                  NULLIF(
                    BTRIM(
                      u.full_name
                    ),
                    ''
                  ),
                  u.email
                ) ASC
            `,
            [
              identity.tenantId,
            ],
          )
        : {
            rows:
              [],
          };


    const workspace =
      workspaceResult
        .rows[0];


    const owner =
      ownerResult
        .rows[0] ||
      null;


    const deletionPending =
      Boolean(
        workspace
          .deletion_requested_at,
      ) &&
      Boolean(
        workspace
          .deletion_scheduled_for,
      ) &&
      !workspace
        .deletion_cancelled_at;


    return json({
      success:
        true,

      code:
        'WORKSPACE_LOADED',

      currentWorkspaceId:
        identity.tenantId,

      workspaces,

      workspace: {
        id:
          workspace.id,

        name:
          workspace.name,

        slug:
          workspace.slug,

        logoUrl:
          workspace.logo_url ||
          null,

        status:
          workspace.status,

        createdAt:
          toIso(
            workspace.created_at,
          ),

        updatedAt:
          toIso(
            workspace.updated_at,
          ),

        lifecycle: {
          archivedAt:
            toIso(
              workspace
                .archived_at,
            ),

          deletionPending,

          deletionRequestedAt:
            toIso(
              workspace
                .deletion_requested_at,
            ),

          deletionScheduledFor:
            toIso(
              workspace
                .deletion_scheduled_for,
            ),

          deletionCancelledAt:
            toIso(
              workspace
                .deletion_cancelled_at,
            ),
        },
      },

      access,

      workspaceManagement:
        policy,

      owner:
        owner
          ? {
              id:
                owner.id,

              email:
                owner.email,

              firstName:
                owner.first_name ||
                '',

              lastName:
                owner.last_name ||
                '',

              fullName:
                owner.full_name ||
                '',
            }
          : null,

      ownershipTransfer:
        transfer
          ? {
              id:
                transfer.id,

              status:
                transfer.status,

              fromUserId:
                transfer
                  .from_user_id,

              toUserId:
                transfer
                  .to_user_id,

              fromEmail:
                transfer
                  .from_email,

              fromName:
                transfer
                  .from_full_name ||
                '',

              toEmail:
                transfer
                  .to_email,

              toName:
                transfer
                  .to_full_name ||
                '',

              requestedAt:
                toIso(
                  transfer
                    .requested_at,
                ),

              expiresAt:
                toIso(
                  transfer
                    .expires_at,
                ),

              isIncoming:
                transfer
                  .to_user_id ===
                identity.userId,

              isOutgoing:
                transfer
                  .from_user_id ===
                identity.userId,
            }
          : null,

      transferCandidates:
        transferCandidatesResult
          .rows
          .map(
            (
              row:
                Record<string, unknown>,
            ) => ({
              id:
                String(
                  row.id ||
                  '',
                ),

              email:
                String(
                  row.email ||
                  '',
                ),

              firstName:
                String(
                  row.first_name ||
                  '',
                ),

              lastName:
                String(
                  row.last_name ||
                  '',
                ),

              fullName:
                String(
                  row.full_name ||
                  '',
                ),
            }),
          ),
    });
  } catch (
    error
  ) {
    return handleError(
      error,
      '[Workspace GET]',
    );
  }
}


/* ============================================================
   PATCH
   ============================================================ */

export async function PATCH(
  request:
    NextRequest,
) {
  try {
    requireSameOrigin(
      request,
    );


    const identity =
      await requireWorkspaceIdentity();


    await requireRateLimit(
      `${identity.userId}:${identity.tenantId}`,
      'workspace_update',
      20,
      WORKSPACE_UPDATE_WINDOW_MS,
      WORKSPACE_UPDATE_BLOCK_MS,
    );


    const body =
      await readJsonBody(
        request,
      );


    rejectUnsupportedFields(
      body,
      [
        'name',
        'slug',
        'workspaceManagement',
      ],
    );


    const hasName =
      hasOwn(
        body,
        'name',
      );


    const hasSlug =
      hasOwn(
        body,
        'slug',
      );


    const hasManagement =
      hasOwn(
        body,
        'workspaceManagement',
      );


    if (
      hasManagement
    ) {
      throw new WorkspaceApiError(
        409,
        'WORKSPACE_MANAGEMENT_POLICY_RETIRED',
        'Workspace management access is now controlled by Roles & Permissions.',
      );
    }


    if (
      !hasName &&
      !hasSlug &&
      !hasManagement
    ) {
      throw new WorkspaceApiError(
        400,
        'NO_CHANGES',
        'No workspace changes were provided.',
      );
    }


    const requestedName =
      hasName
        ? normalizeWorkspaceName(
            body.name,
          )
        : null;


    const requestedSlug =
      hasSlug
        ? normalizeWorkspaceSlug(
            body.slug,
          )
        : null;


    const requestMetadata =
      getSessionRequestMetadata(
        request,
      );


    const correlationId =
      crypto.randomUUID();


    const result =
      await withControlTransaction(
        async client => {
          const workspaceResult =
            await client.query(
              `
                SELECT
                  id,
                  name,
                  slug,
                  logo_url,
                  status,
                  created_at,
                  updated_at

                FROM tenants

                WHERE id = $1
                  AND deleted_at IS NULL

                LIMIT 1

                FOR UPDATE
              `,
              [
                identity.tenantId,
              ],
            );


          if (
            workspaceResult
              .rows.length ===
            0
          ) {
            throw new WorkspaceApiError(
              404,
              'WORKSPACE_NOT_FOUND',
              'The workspace could not be found.',
            );
          }


          const workspace =
            workspaceResult
              .rows[0];


          if (
            String(
              workspace.status ||
              '',
            )
              .trim()
              .toLowerCase() !==
            'active'
          ) {
            throw new WorkspaceApiError(
              409,
              'WORKSPACE_NOT_ACTIVE',
              'Workspace settings cannot be changed while the workspace is unavailable.',
            );
          }


          const currentPolicy =
            await loadWorkspaceManagementPolicyForUpdate(
              client,
              identity.tenantId,
            );


          const currentAccess =
            buildWorkspaceAccess(
              identity,
              currentPolicy,
            );


          if (
            (
              hasName ||
              hasSlug
            ) &&
            !currentAccess
              .canManageWorkspace
          ) {
            throw new WorkspaceApiError(
              403,
              'WORKSPACE_EDIT_ACCESS_DENIED',
              'You do not have permission to change workspace details.',
            );
          }


          if (
            hasManagement &&
            !identity.isOwner
          ) {
            throw new WorkspaceApiError(
              403,
              'OWNER_REQUIRED',
              'Only the workspace owner can change workspace management access.',
            );
          }


          const nextName =
            requestedName ??
            workspace.name;


          const nextSlug =
            requestedSlug ??
            workspace.slug;


          const nextPolicy =
            hasManagement
              ? normalizeWorkspaceManagementPatch(
                  body.workspaceManagement,
                  currentPolicy,
                )
              : currentPolicy;


          const detailsChanged =
            nextName !==
              workspace.name ||
            nextSlug !==
              workspace.slug;


          const policyChanged =
            nextPolicy
              .adminsCanViewWorkspaceSettings !==
              currentPolicy
                .adminsCanViewWorkspaceSettings ||
            nextPolicy
              .adminsCanEditWorkspaceDetails !==
              currentPolicy
                .adminsCanEditWorkspaceDetails;


          let finalWorkspace =
            workspace;


          if (
            detailsChanged
          ) {
            const updated =
              await client.query(
                `
                  UPDATE tenants

                  SET
                    name =
                      $2,

                    slug =
                      $3,

                    updated_at =
                      NOW()

                  WHERE id = $1
                    AND deleted_at IS NULL

                  RETURNING
                    id,
                    name,
                    slug,
                    logo_url,
                    status,
                    created_at,
                    updated_at
                `,
                [
                  identity.tenantId,
                  nextName,
                  nextSlug,
                ],
              );


            finalWorkspace =
              updated.rows[0];
          }


          if (
            policyChanged
          ) {
            await client.query(
              `
                UPDATE tenant_settings

                SET
                  settings =
                    jsonb_set(
                      settings,
                      '{workspaceManagement}',
                      $2::jsonb,
                      TRUE
                    ),

                  updated_at =
                    NOW()

                WHERE tenant_id = $1
              `,
              [
                identity.tenantId,

                JSON.stringify(
                  nextPolicy,
                ),
              ],
            );
          }


          if (
            detailsChanged ||
            policyChanged
          ) {
            await insertAudit({
              client,

              tenantId:
                identity.tenantId,

              userId:
                identity.userId,

              action:
                policyChanged &&
                !detailsChanged
                  ? 'workspace.management_access_updated'
                  : 'workspace.updated',

              eventType:
                policyChanged &&
                !detailsChanged
                  ? 'workspace.management_access_updated'
                  : 'workspace.updated',

              metadata: {
                details:
                  detailsChanged
                    ? {
                        before: {
                          name:
                            workspace.name,

                          slug:
                            workspace.slug,
                        },

                        after: {
                          name:
                            nextName,

                          slug:
                            nextSlug,
                        },
                      }
                    : undefined,

                managementAccess:
                  policyChanged
                    ? {
                        before:
                          currentPolicy,

                        after:
                          nextPolicy,
                      }
                    : undefined,
              },

              ipAddress:
                requestMetadata
                  .ipAddress,

              userAgent:
                requestMetadata
                  .userAgent,

              correlationId,
            });
          }


          return {
            workspace:
              finalWorkspace,

            policy:
              nextPolicy,

            access:
              buildWorkspaceAccess(
                identity,
                nextPolicy,
              ),

            unchanged:
              !detailsChanged &&
              !policyChanged,
          };
        },
      );


    return json({
      success:
        true,

      code:
        result.unchanged
          ? 'WORKSPACE_UNCHANGED'
          : 'WORKSPACE_UPDATED',

      message:
        result.unchanged
          ? 'Workspace settings are already up to date.'
          : 'Workspace settings were updated.',

      workspace: {
        id:
          result.workspace.id,

        name:
          result.workspace.name,

        slug:
          result.workspace.slug,

        logoUrl:
          result.workspace
            .logo_url ||
          null,

        status:
          result.workspace.status,

        createdAt:
          toIso(
            result.workspace
              .created_at,
          ),

        updatedAt:
          toIso(
            result.workspace
              .updated_at,
          ),
      },

      workspaceManagement:
        result.policy,

      access:
        result.access,
    });
  } catch (
    error
  ) {
    return handleError(
      error,
      '[Workspace PATCH]',
    );
  }
}


/* ============================================================
   POST
   ============================================================ */

export async function POST(
  request:
    NextRequest,
) {
  try {
    requireSameOrigin(
      request,
    );


    const identity =
      await requireWorkspaceIdentity();


    const body =
      await readJsonBody(
        request,
      );


    rejectUnsupportedFields(
      body,
      [
        'action',
        'tenantId',
        'targetUserId',
        'transferId',
      ],
    );


    if (
      typeof body.action !==
      'string'
    ) {
      throw new WorkspaceApiError(
        400,
        'ACTION_REQUIRED',
        'A workspace action is required.',
      );
    }


    const action =
      body.action
        .trim()
        .toLowerCase() as
        WorkspaceAction;


    const supported:
      WorkspaceAction[] = [
        'switch_workspace',
        'request_deletion',
        'cancel_deletion',
        'request_ownership_transfer',
        'cancel_ownership_transfer',
        'accept_ownership_transfer',
        'reject_ownership_transfer',
      ];


    if (
      !supported.includes(
        action,
      )
    ) {
      throw new WorkspaceApiError(
        400,
        'INVALID_ACTION',
        'The requested workspace action is not supported.',
      );
    }


    const context:
      ActionContext = {
      identity,

      requestMetadata:
        getSessionRequestMetadata(
          request,
        ),

      correlationId:
        crypto.randomUUID(),
    };


    switch (
      action
    ) {
      case 'switch_workspace':
        return switchWorkspace(
          {
            ...context,

            tenantId:
              body.tenantId,
          },
        );


      case 'request_deletion':
        return requestDeletion(
          context,
        );


      case 'cancel_deletion':
        return cancelDeletion(
          context,
        );


      case 'request_ownership_transfer':
        return requestOwnershipTransfer(
          {
            ...context,

            targetUserId:
              body.targetUserId,
          },
        );


      case 'cancel_ownership_transfer':
        return cancelOwnershipTransfer(
          {
            ...context,

            transferId:
              body.transferId,
          },
        );


      case 'accept_ownership_transfer':
        return acceptOwnershipTransfer(
          {
            ...context,

            transferId:
              body.transferId,
          },
        );


      case 'reject_ownership_transfer':
        return rejectOwnershipTransfer(
          {
            ...context,

            transferId:
              body.transferId,
          },
        );
    }
  } catch (
    error
  ) {
    return handleError(
      error,
      '[Workspace POST]',
    );
  }
}


/* ============================================================
   SWITCH WORKSPACE
   ============================================================ */

async function switchWorkspace(
  input:
    ActionContext & {
      tenantId:
        unknown;
    },
) {
  const targetTenantId =
    requireUuid(
      input.tenantId,
      'INVALID_WORKSPACE',
      'Select a valid workspace.',
    );


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.sessionId}`,
    'workspace_switch',
    30,
    WORKSPACE_SWITCH_WINDOW_MS,
    WORKSPACE_SWITCH_BLOCK_MS,
  );


  if (
    targetTenantId ===
    input.identity.tenantId
  ) {
    const context =
      await getAccountContextForUser(
        input.identity.userId,
        targetTenantId,
      );


    return json({
      success:
        true,

      code:
        'WORKSPACE_ALREADY_SELECTED',

      message:
        'This workspace is already selected.',

      currentWorkspaceId:
        targetTenantId,

      workspace:
        context.tenant,
    });
  }


  const targetResult =
    await queryControl(
      `
        SELECT
          t.id,
          t.name,
          t.slug,
          t.status,

          tu.status
            AS membership_status

        FROM tenant_users tu

        INNER JOIN tenants t
          ON t.id =
             tu.tenant_id

        WHERE tu.user_id = $1
          AND tu.tenant_id = $2

          AND LOWER(
            COALESCE(
              tu.status,
              ''
            )
          ) = 'active'

          AND tu.deleted_at
              IS NULL

          AND t.deleted_at
              IS NULL

          AND LOWER(
            COALESCE(
              t.status,
              ''
            )
          ) = 'active'

        LIMIT 1
      `,
      [
        input.identity.userId,
        targetTenantId,
      ],
    );


  if (
    targetResult.rows.length ===
    0
  ) {
    throw new WorkspaceApiError(
      403,
      'WORKSPACE_SWITCH_DENIED',
      'You do not have access to that workspace.',
    );
  }


  const switched =
    await setCurrentTenantForSession(
      input.identity.sessionId,
      input.identity.userId,
      targetTenantId,
    );


  if (
    !switched
  ) {
    throw new WorkspaceApiError(
      409,
      'WORKSPACE_SWITCH_FAILED',
      'SaMi could not switch to that workspace.',
    );
  }


  const target =
    targetResult.rows[0];


  await withControlTransaction(
    async client => {
      await insertAudit({
        client,

        tenantId:
          targetTenantId,

        userId:
          input.identity.userId,

        action:
          'workspace.switched',

        eventType:
          'workspace.switched',

        metadata: {
          previousWorkspaceId:
            input.identity
              .tenantId,

          currentWorkspaceId:
            targetTenantId,
        },

        ipAddress:
          input.requestMetadata
            .ipAddress,

        userAgent:
          input.requestMetadata
            .userAgent,

        correlationId:
          input.correlationId,
      });
    },
  );


  const context =
    await getAccountContextForUser(
      input.identity.userId,
      targetTenantId,
    );


  return json({
    success:
      true,

    code:
      'WORKSPACE_SWITCHED',

    message:
      `Switched to ${target.name}.`,

    currentWorkspaceId:
      targetTenantId,

    workspace:
      context.tenant,

    membership:
      context.membership,

    subscription:
      context.subscription,

    modules:
      context.modules,
  });
}


/* ============================================================
   REQUEST CLOSURE
   ============================================================ */

async function requestDeletion(
  input:
    ActionContext,
) {
  if (
    !input.identity
      .isOwner
  ) {
    throw new WorkspaceApiError(
      403,
      'OWNER_REQUIRED',
      'Only the workspace owner can close the workspace.',
    );
  }


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_request_deletion',
    5,
    WORKSPACE_LIFECYCLE_WINDOW_MS,
    WORKSPACE_LIFECYCLE_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await requireOwnerInTransaction(
          client,
          input.identity
            .tenantId,
          input.identity
            .userId,
        );


        const workspaceResult =
          await client.query(
            `
              SELECT
                id,
                status,
                deletion_requested_at,
                deletion_scheduled_for,
                deletion_cancelled_at

              FROM tenants

              WHERE id = $1
                AND deleted_at IS NULL

              LIMIT 1

              FOR UPDATE
            `,
            [
              input.identity
                .tenantId,
            ],
          );


        if (
          workspaceResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            404,
            'WORKSPACE_NOT_FOUND',
            'The workspace could not be found.',
          );
        }


        const workspace =
          workspaceResult
            .rows[0];


        if (
          String(
            workspace.status ||
            '',
          )
            .trim()
            .toLowerCase() !==
          'active'
        ) {
          throw new WorkspaceApiError(
            409,
            'WORKSPACE_NOT_ACTIVE',
            'Only an active workspace can be closed.',
          );
        }


        const alreadyPending =
          Boolean(
            workspace
              .deletion_requested_at,
          ) &&
          Boolean(
            workspace
              .deletion_scheduled_for,
          ) &&
          !workspace
            .deletion_cancelled_at;


        if (
  alreadyPending
) {
  await markTenantDatabaseDeletionRequested(
    client,
    input.identity
      .tenantId,
    workspace
      .deletion_requested_at,
  );


  return {
    alreadyPending:
      true,

    scheduledFor:
      workspace
        .deletion_scheduled_for,
  };
}


        const updated =
          await client.query(
            `
              UPDATE tenants

              SET
                deletion_requested_at =
                  NOW(),

                deletion_requested_by =
                  $2,

                deletion_scheduled_for =
                  NOW() +
                  (
                    $3::integer *
                    INTERVAL '1 day'
                  ),

                deletion_cancelled_at =
                  NULL,

                deletion_cancelled_by =
                  NULL,

                updated_at =
                  NOW()

              WHERE id = $1
                AND deleted_at IS NULL

              RETURNING
                deletion_requested_at,
                deletion_scheduled_for
            `,
            [
              input.identity
                .tenantId,

              input.identity
                .userId,

              WORKSPACE_DELETION_GRACE_DAYS,
            ],
          );

          await markTenantDatabaseDeletionRequested(
  client,
  input.identity
    .tenantId,
  updated.rows[0]
    .deletion_requested_at,
);

        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.deletion_requested',

          eventType:
            'workspace.deletion_requested',

          metadata: {
            graceDays:
              WORKSPACE_DELETION_GRACE_DAYS,

            scheduledFor:
              toIso(
                updated.rows[0]
                  .deletion_scheduled_for,
              ),
          },

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          alreadyPending:
            false,

          scheduledFor:
            updated.rows[0]
              .deletion_scheduled_for,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyPending
        ? 'WORKSPACE_DELETION_ALREADY_PENDING'
        : 'WORKSPACE_DELETION_REQUESTED',

    message:
      result.alreadyPending
        ? 'Workspace closure is already scheduled.'
        : 'Workspace closure was scheduled.',

    deletion: {
      pending:
        true,

      scheduledFor:
        toIso(
          result.scheduledFor,
        ),

      graceDays:
        WORKSPACE_DELETION_GRACE_DAYS,
    },
  });
}


/* ============================================================
   CANCEL CLOSURE
   ============================================================ */

async function cancelDeletion(
  input:
    ActionContext,
) {
  if (
    !input.identity
      .isOwner
  ) {
    throw new WorkspaceApiError(
      403,
      'OWNER_REQUIRED',
      'Only the workspace owner can cancel workspace closure.',
    );
  }


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_cancel_deletion',
    8,
    WORKSPACE_LIFECYCLE_WINDOW_MS,
    WORKSPACE_LIFECYCLE_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await requireOwnerInTransaction(
          client,
          input.identity
            .tenantId,
          input.identity
            .userId,
        );


        const workspaceResult =
          await client.query(
            `
              SELECT
                deletion_requested_at,
                deletion_scheduled_for,
                deletion_cancelled_at

              FROM tenants

              WHERE id = $1
                AND deleted_at IS NULL

              LIMIT 1

              FOR UPDATE
            `,
            [
              input.identity
                .tenantId,
            ],
          );


        if (
          workspaceResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            404,
            'WORKSPACE_NOT_FOUND',
            'The workspace could not be found.',
          );
        }


        const workspace =
          workspaceResult
            .rows[0];


        const deletionPending =
          Boolean(
            workspace
              .deletion_requested_at,
          ) &&
          Boolean(
            workspace
              .deletion_scheduled_for,
          ) &&
          !workspace
            .deletion_cancelled_at;


        if (
  !deletionPending
) {
  await cancelTenantDatabaseDeletionRequest(
    client,
    input.identity
      .tenantId,
  );


  return {
    alreadyCancelled:
      true,
  };
}


        await client.query(
          `
            UPDATE tenants

            SET
              deletion_scheduled_for =
                NULL,

              deletion_cancelled_at =
                NOW(),

              deletion_cancelled_by =
                $2,

              updated_at =
                NOW()

            WHERE id = $1
              AND deleted_at IS NULL
          `,
          [
            input.identity
              .tenantId,

            input.identity
              .userId,
          ],
        );

        await cancelTenantDatabaseDeletionRequest(
  client,
  input.identity
    .tenantId,
);

        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.deletion_cancelled',

          eventType:
            'workspace.deletion_cancelled',

          metadata:
            {},

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          alreadyCancelled:
            false,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyCancelled
        ? 'WORKSPACE_DELETION_NOT_PENDING'
        : 'WORKSPACE_DELETION_CANCELLED',

    message:
      result.alreadyCancelled
        ? 'Workspace closure is not currently scheduled.'
        : 'Workspace closure was cancelled.',

    deletion: {
      pending:
        false,
    },
  });
}


/* ============================================================
   REQUEST OWNERSHIP TRANSFER
   ============================================================ */

async function requestOwnershipTransfer(
  input:
    ActionContext & {
      targetUserId:
        unknown;
    },
) {
  if (
    !input.identity
      .isOwner
  ) {
    throw new WorkspaceApiError(
      403,
      'OWNER_REQUIRED',
      'Only the workspace owner can transfer ownership.',
    );
  }


  const targetUserId =
    requireUuid(
      input.targetUserId,
      'INVALID_TRANSFER_TARGET',
      'Select a valid workspace member.',
    );


  if (
    targetUserId ===
    input.identity.userId
  ) {
    throw new WorkspaceApiError(
      400,
      'INVALID_TRANSFER_TARGET',
      'You already own this workspace.',
    );
  }


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_transfer_request',
    8,
    WORKSPACE_TRANSFER_WINDOW_MS,
    WORKSPACE_TRANSFER_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await expireOldTransfers(
          client,
          input.identity
            .tenantId,
        );


        await requireOwnerInTransaction(
          client,
          input.identity
            .tenantId,
          input.identity
            .userId,
        );


        const targetResult =
          await client.query(
            `
              SELECT
                tu.user_id,
                u.email,
                u.full_name

              FROM tenant_users tu

              INNER JOIN users u
                ON u.id =
                   tu.user_id

              WHERE tu.tenant_id = $1
                AND tu.user_id = $2
                AND tu.is_owner = FALSE

                AND LOWER(
                  COALESCE(
                    tu.status,
                    ''
                  )
                ) = 'active'

                AND tu.deleted_at
                    IS NULL

                AND u.deleted_at
                    IS NULL

                AND LOWER(
                  COALESCE(
                    u.status,
                    ''
                  )
                ) = 'active'

              LIMIT 1

              FOR UPDATE OF tu
            `,
            [
              input.identity
                .tenantId,

              targetUserId,
            ],
          );


        if (
          targetResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            400,
            'INVALID_TRANSFER_TARGET',
            'Ownership can only be transferred to an active workspace member.',
          );
        }


        const existing =
          await client.query(
            `
              SELECT
                id,
                from_user_id,
                to_user_id,
                status,
                requested_at,
                expires_at

              FROM tenant_ownership_transfers

              WHERE tenant_id = $1
                AND status = 'pending'
                AND expires_at > NOW()

              LIMIT 1

              FOR UPDATE
            `,
            [
              input.identity
                .tenantId,
            ],
          );


        if (
          existing.rows.length >
          0
        ) {
          const transfer =
            existing.rows[0];


          if (
            transfer
              .from_user_id ===
              input.identity
                .userId &&
            transfer
              .to_user_id ===
              targetUserId
          ) {
            return {
              transfer,

              alreadyPending:
                true,
            };
          }


          throw new WorkspaceApiError(
            409,
            'OWNERSHIP_TRANSFER_ALREADY_PENDING',
            'Another ownership transfer is already pending.',
          );
        }


        const inserted =
          await client.query(
            `
              INSERT INTO tenant_ownership_transfers (
                tenant_id,
                from_user_id,
                to_user_id,
                requested_by
              )

              VALUES (
                $1,
                $2,
                $3,
                $2
              )

              RETURNING
                id,
                from_user_id,
                to_user_id,
                status,
                requested_at,
                expires_at
            `,
            [
              input.identity
                .tenantId,

              input.identity
                .userId,

              targetUserId,
            ],
          );


        const transfer =
          inserted.rows[0];


        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.ownership_transfer_requested',

          eventType:
            'workspace.ownership_transfer_requested',

          metadata: {
            transferId:
              transfer.id,

            targetUserId,

            targetEmail:
              targetResult
                .rows[0]
                .email,
          },

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          transfer,

          alreadyPending:
            false,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyPending
        ? 'OWNERSHIP_TRANSFER_ALREADY_PENDING'
        : 'OWNERSHIP_TRANSFER_REQUESTED',

    message:
      result.alreadyPending
        ? 'This ownership transfer is already awaiting acceptance.'
        : 'Ownership transfer was requested.',

    transfer: {
      id:
        result.transfer.id,

      fromUserId:
        result.transfer
          .from_user_id,

      toUserId:
        result.transfer
          .to_user_id,

      status:
        result.transfer
          .status ||
        'pending',

      requestedAt:
        toIso(
          result.transfer
            .requested_at,
        ),

      expiresAt:
        toIso(
          result.transfer
            .expires_at,
        ),
    },
  });
}


/* ============================================================
   TRANSFER ID
   ============================================================ */

function requireTransferId(
  value:
    unknown,
) {
  return requireUuid(
    value,
    'INVALID_TRANSFER',
    'A valid ownership transfer is required.',
  );
}


/* ============================================================
   CANCEL OWNERSHIP TRANSFER
   ============================================================ */

async function cancelOwnershipTransfer(
  input:
    ActionContext & {
      transferId:
        unknown;
    },
) {
  if (
    !input.identity
      .isOwner
  ) {
    throw new WorkspaceApiError(
      403,
      'OWNER_REQUIRED',
      'Only the workspace owner can cancel this ownership transfer.',
    );
  }


  const transferId =
    requireTransferId(
      input.transferId,
    );


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_transfer_cancel',
    12,
    WORKSPACE_TRANSFER_WINDOW_MS,
    WORKSPACE_TRANSFER_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await expireOldTransfers(
          client,
          input.identity
            .tenantId,
        );


        await requireOwnerInTransaction(
          client,
          input.identity
            .tenantId,
          input.identity
            .userId,
        );


        const transferResult =
          await client.query(
            `
              SELECT
                id,
                from_user_id,
                to_user_id,
                status

              FROM tenant_ownership_transfers

              WHERE id = $1
                AND tenant_id = $2

              LIMIT 1

              FOR UPDATE
            `,
            [
              transferId,

              input.identity
                .tenantId,
            ],
          );


        if (
          transferResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            404,
            'OWNERSHIP_TRANSFER_NOT_FOUND',
            'The ownership transfer could not be found.',
          );
        }


        const transfer =
          transferResult
            .rows[0];


        if (
          transfer
            .from_user_id !==
          input.identity.userId
        ) {
          throw new WorkspaceApiError(
            403,
            'TRANSFER_ACCESS_DENIED',
            'You cannot cancel this ownership transfer.',
          );
        }


        if (
          transfer.status ===
          'cancelled'
        ) {
          return {
            alreadyCancelled:
              true,
          };
        }


        if (
          transfer.status !==
          'pending'
        ) {
          throw new WorkspaceApiError(
            409,
            'TRANSFER_NOT_PENDING',
            'This ownership transfer is no longer pending.',
          );
        }


        await client.query(
          `
            UPDATE tenant_ownership_transfers

            SET
              status =
                'cancelled',

              cancelled_at =
                NOW(),

              cancelled_by =
                $2,

              updated_at =
                NOW()

            WHERE id = $1
          `,
          [
            transferId,

            input.identity
              .userId,
          ],
        );


        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.ownership_transfer_cancelled',

          eventType:
            'workspace.ownership_transfer_cancelled',

          metadata: {
            transferId,

            targetUserId:
              transfer
                .to_user_id,
          },

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          alreadyCancelled:
            false,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyCancelled
        ? 'OWNERSHIP_TRANSFER_ALREADY_CANCELLED'
        : 'OWNERSHIP_TRANSFER_CANCELLED',

    message:
      result.alreadyCancelled
        ? 'The ownership transfer is already cancelled.'
        : 'The ownership transfer was cancelled.',
  });
}


/* ============================================================
   ACCEPT OWNERSHIP TRANSFER
   ============================================================ */

async function acceptOwnershipTransfer(
  input:
    ActionContext & {
      transferId:
        unknown;
    },
) {
  const transferId =
    requireTransferId(
      input.transferId,
    );


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_transfer_accept',
    8,
    WORKSPACE_TRANSFER_WINDOW_MS,
    WORKSPACE_TRANSFER_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await expireOldTransfers(
          client,
          input.identity
            .tenantId,
        );


        const transferResult =
          await client.query(
            `
              SELECT
                id,
                from_user_id,
                to_user_id,
                status,
                expires_at

              FROM tenant_ownership_transfers

              WHERE id = $1
                AND tenant_id = $2

              LIMIT 1

              FOR UPDATE
            `,
            [
              transferId,

              input.identity
                .tenantId,
            ],
          );


        if (
          transferResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            404,
            'OWNERSHIP_TRANSFER_NOT_FOUND',
            'The ownership transfer could not be found.',
          );
        }


        const transfer =
          transferResult
            .rows[0];


        if (
          transfer
            .to_user_id !==
          input.identity.userId
        ) {
          throw new WorkspaceApiError(
            403,
            'TRANSFER_ACCESS_DENIED',
            'This ownership transfer is not assigned to you.',
          );
        }


        if (
          transfer.status ===
          'completed'
        ) {
          return {
            alreadyCompleted:
              true,

            previousOwnerId:
              transfer
                .from_user_id,
          };
        }


        if (
          transfer.status !==
          'pending'
        ) {
          throw new WorkspaceApiError(
            409,
            'TRANSFER_NOT_PENDING',
            'This ownership transfer is no longer pending.',
          );
        }


        const expiresAt =
          new Date(
            transfer
              .expires_at,
          );


        if (
          Number.isNaN(
            expiresAt.getTime(),
          ) ||
          expiresAt.getTime() <=
            Date.now()
        ) {
          await client.query(
            `
              UPDATE tenant_ownership_transfers

              SET
                status =
                  'expired',

                updated_at =
                  NOW()

              WHERE id = $1
            `,
            [
              transferId,
            ],
          );


          throw new WorkspaceApiError(
            410,
            'OWNERSHIP_TRANSFER_EXPIRED',
            'This ownership transfer has expired.',
          );
        }


        const memberships =
          await client.query(
            `
              SELECT
                user_id,
                is_owner,
                status,
                deleted_at

              FROM tenant_users

              WHERE tenant_id = $1

                AND user_id IN (
                  $2,
                  $3
                )

              FOR UPDATE
            `,
            [
              input.identity
                .tenantId,

              transfer
                .from_user_id,

              transfer
                .to_user_id,
            ],
          );


        const source =
          memberships.rows.find(
            row =>
              row.user_id ===
              transfer
                .from_user_id,
          );


        const target =
          memberships.rows.find(
            row =>
              row.user_id ===
              transfer
                .to_user_id,
          );


        if (
          !source ||
          source.is_owner !==
            true ||
          source.deleted_at ||
          String(
            source.status ||
            '',
          )
            .trim()
            .toLowerCase() !==
            'active'
        ) {
          throw new WorkspaceApiError(
            409,
            'CURRENT_OWNER_CHANGED',
            'Workspace ownership has changed since this transfer was requested.',
          );
        }


        if (
          !target ||
          target.deleted_at ||
          String(
            target.status ||
            '',
          )
            .trim()
            .toLowerCase() !==
            'active'
        ) {
          throw new WorkspaceApiError(
            409,
            'TRANSFER_TARGET_UNAVAILABLE',
            'Your workspace membership is no longer active.',
          );
        }


        await client.query(
          `
            UPDATE tenant_users

            SET
              is_owner =
                FALSE,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2
              AND is_owner = TRUE
              AND deleted_at IS NULL
          `,
          [
            input.identity
              .tenantId,

            transfer
              .from_user_id,
          ],
        );


        const promoted =
          await client.query(
            `
              UPDATE tenant_users

              SET
                is_owner =
                  TRUE,

                updated_at =
                  NOW()

              WHERE tenant_id = $1
                AND user_id = $2

                AND deleted_at
                    IS NULL

                AND LOWER(
                  COALESCE(
                    status,
                    ''
                  )
                ) = 'active'

              RETURNING
                user_id
            `,
            [
              input.identity
                .tenantId,

              transfer
                .to_user_id,
            ],
          );


        if (
          promoted.rows.length !==
          1
        ) {
          throw new WorkspaceApiError(
            409,
            'TRANSFER_TARGET_UNAVAILABLE',
            'The new owner is no longer available.',
          );
        }


        await client.query(
          `
            UPDATE tenant_ownership_transfers

            SET
              status =
                'completed',

              completed_at =
                NOW(),

              completed_by =
                $2,

              updated_at =
                NOW()

            WHERE id = $1
          `,
          [
            transferId,

            input.identity
              .userId,
          ],
        );


        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.ownership_transferred',

          eventType:
            'workspace.ownership_transferred',

          metadata: {
            transferId,

            previousOwnerId:
              transfer
                .from_user_id,

            newOwnerId:
              transfer
                .to_user_id,
          },

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          alreadyCompleted:
            false,

          previousOwnerId:
            transfer
              .from_user_id,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyCompleted
        ? 'OWNERSHIP_TRANSFER_ALREADY_COMPLETED'
        : 'OWNERSHIP_TRANSFER_COMPLETED',

    message:
      result.alreadyCompleted
        ? 'Workspace ownership has already been transferred.'
        : 'You are now the workspace owner.',

    ownership: {
      ownerUserId:
        input.identity
          .userId,

      previousOwnerUserId:
        result.previousOwnerId,
    },
  });
}


/* ============================================================
   REJECT OWNERSHIP TRANSFER
   ============================================================ */

async function rejectOwnershipTransfer(
  input:
    ActionContext & {
      transferId:
        unknown;
    },
) {
  const transferId =
    requireTransferId(
      input.transferId,
    );


  await requireRateLimit(
    `${input.identity.userId}:${input.identity.tenantId}`,
    'workspace_transfer_reject',
    8,
    WORKSPACE_TRANSFER_WINDOW_MS,
    WORKSPACE_TRANSFER_BLOCK_MS,
  );


  const result =
    await withControlTransaction(
      async client => {
        await expireOldTransfers(
          client,
          input.identity
            .tenantId,
        );


        const transferResult =
          await client.query(
            `
              SELECT
                id,
                from_user_id,
                to_user_id,
                status

              FROM tenant_ownership_transfers

              WHERE id = $1
                AND tenant_id = $2

              LIMIT 1

              FOR UPDATE
            `,
            [
              transferId,

              input.identity
                .tenantId,
            ],
          );


        if (
          transferResult.rows.length ===
          0
        ) {
          throw new WorkspaceApiError(
            404,
            'OWNERSHIP_TRANSFER_NOT_FOUND',
            'The ownership transfer could not be found.',
          );
        }


        const transfer =
          transferResult
            .rows[0];


        if (
          transfer
            .to_user_id !==
          input.identity.userId
        ) {
          throw new WorkspaceApiError(
            403,
            'TRANSFER_ACCESS_DENIED',
            'This ownership transfer is not assigned to you.',
          );
        }


        if (
          transfer.status ===
          'rejected'
        ) {
          return {
            alreadyRejected:
              true,
          };
        }


        if (
          transfer.status !==
          'pending'
        ) {
          throw new WorkspaceApiError(
            409,
            'TRANSFER_NOT_PENDING',
            'This ownership transfer is no longer pending.',
          );
        }


        await client.query(
          `
            UPDATE tenant_ownership_transfers

            SET
              status =
                'rejected',

              rejected_at =
                NOW(),

              rejected_by =
                $2,

              updated_at =
                NOW()

            WHERE id = $1
          `,
          [
            transferId,

            input.identity
              .userId,
          ],
        );


        await insertAudit({
          client,

          tenantId:
            input.identity
              .tenantId,

          userId:
            input.identity
              .userId,

          action:
            'workspace.ownership_transfer_rejected',

          eventType:
            'workspace.ownership_transfer_rejected',

          metadata: {
            transferId,

            ownerUserId:
              transfer
                .from_user_id,
          },

          ipAddress:
            input.requestMetadata
              .ipAddress,

          userAgent:
            input.requestMetadata
              .userAgent,

          correlationId:
            input.correlationId,
        });


        return {
          alreadyRejected:
            false,
        };
      },
    );


  return json({
    success:
      true,

    code:
      result.alreadyRejected
        ? 'OWNERSHIP_TRANSFER_ALREADY_REJECTED'
        : 'OWNERSHIP_TRANSFER_REJECTED',

    message:
      result.alreadyRejected
        ? 'The ownership transfer is already declined.'
        : 'The ownership transfer was declined.',
  });
}


/* ============================================================
   ERROR
   ============================================================ */

function handleError(
  error:
    unknown,

  logPrefix:
    string,
) {
  if (
    error instanceof
    WorkspaceApiError
  ) {
    return json(
      {
        success:
          false,

        code:
          error.code,

        error:
          error.message,
      },

      error.status,

      error
        .retryAfterSeconds
        ? {
            'Retry-After':
              String(
                error
                  .retryAfterSeconds,
              ),
          }
        : undefined,
    );
  }


  const databaseError =
    error as {
      code?: string;
      constraint?: string;
    };


  if (
    databaseError.code ===
    '23505'
  ) {
    if (
      databaseError
        .constraint ===
      'uq_tenant_ownership_transfer_pending'
    ) {
      return json(
        {
          success:
            false,

          code:
            'OWNERSHIP_TRANSFER_ALREADY_PENDING',

          error:
            'Another ownership transfer is already pending.',
        },
        409,
      );
    }


    if (
      databaseError
        .constraint ===
        'tenants_slug_key' ||
      databaseError
        .constraint ===
        'idx_tenants_active_slug' ||
      databaseError
        .constraint ===
        'idx_tenants_slug'
    ) {
      return json(
        {
          success:
            false,

          code:
            'WORKSPACE_SLUG_TAKEN',

          error:
            'That workspace address is already in use.',
        },
        409,
      );
    }
  }


  console.error(
    logPrefix,
    error,
  );


  return json(
    {
      success:
        false,

      code:
        'WORKSPACE_REQUEST_FAILED',

      error:
        'SaMi could not complete the workspace request.',
    },
    500,
  );
}