import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  queryControl,
  withControlTransaction,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  requirePermission,
} from '@/lib/auth/permission-guards';

import {
  SAMI_PERMISSIONS,
} from '@/lib/auth/permission-catalog';

import {
  requireCompanyContext,
} from '@/lib/auth/company-context';

import type {
  PermissionContext,
} from '@/lib/auth/permission-context';


/* ================================================================
   SaMi WORKSPACE INVITATION SERVICE
   ================================================================

   Category 9.2

   ODOO-LIKE CONCEPT

   An invitation is ONE access record containing:

   - invited email
   - user type
   - roles
   - allowed companies
   - default company
   - lifecycle/status

   The invitation does NOT create a second user-management system.

   Once accepted:

      workspace_invitations
              ↓
      tenant_users
              ↓
      user_roles
              ↓
      company_users

   After acceptance, the person is managed through the normal
   SaMi Users / Roles / Company Access architecture.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type WorkspaceInvitationStatus =
  | 'pending'
  | 'accepted'
  | 'revoked'
  | 'expired';


export type WorkspaceInvitationMemberType =
  | 'internal'
  | 'portal';


export interface WorkspaceInvitationRole {
  id: string;

  key: string;

  name: string;

  description: string | null;

  isSystem: boolean;

  status: string;

  available: boolean;
}


export interface WorkspaceInvitationCompany {
  id: string;

  name: string;

  legalName: string | null;

  currency: string | null;

  timezone: string | null;

  country: string | null;

  isDefault: boolean;

  isActive: boolean;

  archivedAt: string | null;

  available: boolean;
}


export interface WorkspaceInvitationActor {
  id: string;

  email: string;

  fullName: string;
}


export interface WorkspaceInvitation {
  id: string;

  tenantId: string;

  workspaceName: string;

  email: string;

  memberType:
    WorkspaceInvitationMemberType;

  status:
    WorkspaceInvitationStatus;

  message: string | null;

  roles:
    WorkspaceInvitationRole[];

  companies:
    WorkspaceInvitationCompany[];

  defaultCompanyId: string | null;

  invitedBy:
    WorkspaceInvitationActor;

  acceptedBy:
    WorkspaceInvitationActor | null;

  revokedBy:
    WorkspaceInvitationActor | null;

  expiresAt: string;

  lastSentAt: string | null;

  acceptedAt: string | null;

  revokedAt: string | null;

  createdAt: string;

  updatedAt: string;
}


export interface InvitationAuditContext {
  ipAddress?: string | null;

  userAgent?: string | null;

  correlationId?: string | null;
}


export interface CreateWorkspaceInvitationInput {
  email: string;

  memberType?:
    WorkspaceInvitationMemberType;

  roleIds?: string[];

  companyIds?: string[];

  defaultCompanyId?: string | null;

  message?: string | null;

  expiresInDays?: number;

  audit?:
    InvitationAuditContext;
}


export interface InvitationMutationInput {
  invitationId: string;

  audit?:
    InvitationAuditContext;
}


export interface PrepareInvitationResendInput
  extends InvitationMutationInput {
  expiresInDays?: number;
}


export interface ListWorkspaceInvitationsOptions {
  status?:
    WorkspaceInvitationStatus
    | 'all';

  search?: string;

  limit?: number;

  offset?: number;
}


export interface WorkspaceInvitationTokenResult {
  invitation:
    WorkspaceInvitation;

  /*
   * This is the ONLY raw invitation token.
   *
   * It is returned to the caller so the email layer can construct
   * the invitation URL.
   *
   * The raw token is NEVER persisted.
   */
  token:
    string;
}


export interface InvitationAssignableRole {
  id: string;

  tenantId: string | null;

  key: string;

  name: string;

  description: string | null;

  isSystem: boolean;

  permissionCount: number;
}


export interface InvitationCompanyOption {
  id: string;

  name: string;

  legalName: string | null;

  currency: string;

  timezone: string;

  country: string | null;

  isCurrent: boolean;

  isDefault: boolean;
}


export interface WorkspaceInvitationFormOptions {
  roles:
    InvitationAssignableRole[];

  companies:
    InvitationCompanyOption[];

  defaultRoleId:
    string | null;

  defaultCompanyId:
    string;
}


export interface InvitationAcceptancePreparation {
  invitation:
    WorkspaceInvitation;

  accountExists:
    boolean;

  accountEmailVerified:
    boolean;

  requiresRegistration:
    boolean;

  requiresSignIn:
    boolean;
}


/* ================================================================
   ERROR
   ================================================================ */

export type InvitationServiceErrorCode =
  | 'INVALID_INVITATION_ID'
  | 'INVALID_EMAIL'
  | 'INVALID_MEMBER_TYPE'
  | 'INVALID_EXPIRY'
  | 'INVALID_MESSAGE'
  | 'INVALID_TOKEN'
  | 'TOO_MANY_ROLES'
  | 'TOO_MANY_COMPANIES'
  | 'ROLE_REQUIRED'
  | 'PORTAL_ROLE_NOT_ALLOWED'
  | 'ROLE_NOT_FOUND'
  | 'ROLE_ACCESS_DENIED'
  | 'PRIVILEGE_ESCALATION_BLOCKED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_NOT_FOUND'
  | 'COMPANY_ACCESS_DENIED'
  | 'DEFAULT_COMPANY_INVALID'
  | 'MEMBER_ALREADY_EXISTS'
  | 'INVITATION_ALREADY_PENDING'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_NOT_PENDING'
  | 'INVITATION_EXPIRED'
  | 'CONTEXT_MISMATCH';


export class InvitationServiceError
  extends Error {
  readonly code:
    InvitationServiceErrorCode;


  constructor(
    code:
      InvitationServiceErrorCode,

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'InvitationServiceError';

    this.code =
      code;
  }
}


/* ================================================================
   INTERNAL ROWS
   ================================================================ */

interface InvitationBaseRow {
  id: unknown;

  tenant_id: unknown;

  workspace_name: unknown;

  email: unknown;

  member_type: unknown;

  status: unknown;

  message: unknown;

  expires_at: unknown;

  last_sent_at: unknown;

  accepted_at: unknown;

  revoked_at: unknown;

  created_at: unknown;

  updated_at: unknown;

  invited_by: unknown;

  inviter_email: unknown;

  inviter_full_name: unknown;

  inviter_first_name: unknown;

  inviter_last_name: unknown;

  accepted_by: unknown;

  accepter_email: unknown;

  accepter_full_name: unknown;

  accepter_first_name: unknown;

  accepter_last_name: unknown;

  revoked_by: unknown;

  revoker_email: unknown;

  revoker_full_name: unknown;

  revoker_first_name: unknown;

  revoker_last_name: unknown;
}


interface InvitationRoleRow {
  invitation_id: unknown;

  id: unknown;

  tenant_id: unknown;

  key: unknown;

  name: unknown;

  description: unknown;

  is_system: unknown;

  status: unknown;

  deleted_at: unknown;
}


interface InvitationCompanyLinkRow {
  invitation_id: unknown;

  company_id: unknown;

  is_default: unknown;
}


interface TenantCompanyRow {
  id: unknown;

  name: unknown;

  legal_name: unknown;

  currency: unknown;

  timezone: unknown;

  country: unknown;

  is_active: unknown;

  archived_at: unknown;
}


interface AssignableRoleRow {
  id: unknown;

  tenant_id: unknown;

  key: unknown;

  name: unknown;

  description: unknown;

  is_system: unknown;

  permission_count: unknown;
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const DEFAULT_EXPIRY_DAYS =
  7;


const MAX_EXPIRY_DAYS =
  30;


const MAX_MESSAGE_LENGTH =
  1000;


const MAX_ROLES =
  50;


const MAX_COMPANIES =
  100;


/* ================================================================
   NORMALIZATION
   ================================================================ */

function requireUuid(
  value:
    string,

  type:
    'invitation'
    | 'role'
    | 'company',
): string {
  if (
    typeof value !==
      'string' ||
    !UUID_PATTERN.test(
      value.trim(),
    )
  ) {
    throw new InvitationServiceError(
      type ===
        'invitation'
        ? 'INVALID_INVITATION_ID'
        : type ===
            'role'
          ? 'ROLE_NOT_FOUND'
          : 'COMPANY_NOT_FOUND',

      `A valid ${type} ID is required.`,
    );
  }


  return value
    .trim()
    .toLowerCase();
}


function normalizeEmail(
  value:
    string,
): string {
  if (
    typeof value !==
    'string'
  ) {
    throw new InvitationServiceError(
      'INVALID_EMAIL',
      'A valid email address is required.',
    );
  }


  const email =
    value
      .trim()
      .toLowerCase();


  if (
    !email ||
    email.length >
      320 ||
    !EMAIL_PATTERN.test(
      email,
    )
  ) {
    throw new InvitationServiceError(
      'INVALID_EMAIL',
      'A valid email address is required.',
    );
  }


  return email;
}


function normalizeMemberType(
  value:
    WorkspaceInvitationMemberType
    | undefined,
): WorkspaceInvitationMemberType {
  const normalized =
    value ||
    'internal';


  if (
    normalized !==
      'internal' &&
    normalized !==
      'portal'
  ) {
    throw new InvitationServiceError(
      'INVALID_MEMBER_TYPE',
      'The invitation user type is invalid.',
    );
  }


  return normalized;
}


function normalizeMessage(
  value:
    string
    | null
    | undefined,
): string | null {
  if (
    value ===
      undefined ||
    value ===
      null
  ) {
    return null;
  }


  if (
    typeof value !==
      'string'
  ) {
    throw new InvitationServiceError(
      'INVALID_MESSAGE',
      'The invitation message is invalid.',
    );
  }


  const message =
    value.trim();


  if (
    !message
  ) {
    return null;
  }


  if (
    message.length >
      MAX_MESSAGE_LENGTH
  ) {
    throw new InvitationServiceError(
      'INVALID_MESSAGE',
      `Invitation messages may contain at most ${MAX_MESSAGE_LENGTH} characters.`,
    );
  }


  return message;
}


function normalizeExpiryDays(
  value:
    number
    | undefined,
): number {
  if (
    value ===
      undefined
  ) {
    return DEFAULT_EXPIRY_DAYS;
  }


  if (
    !Number.isInteger(
      value,
    ) ||
    value <
      1 ||
    value >
      MAX_EXPIRY_DAYS
  ) {
    throw new InvitationServiceError(
      'INVALID_EXPIRY',
      `Invitation expiry must be between 1 and ${MAX_EXPIRY_DAYS} days.`,
    );
  }


  return value;
}


function normalizeUuidList(
  values:
    string[]
    | undefined,

  type:
    'role'
    | 'company',

  maximum:
    number,
): string[] {
  if (
    values ===
      undefined
  ) {
    return [];
  }


  if (
    !Array.isArray(
      values,
    )
  ) {
    throw new InvitationServiceError(
      type ===
        'role'
        ? 'ROLE_NOT_FOUND'
        : 'COMPANY_NOT_FOUND',

      `Invalid ${type} selection.`,
    );
  }


  const normalized =
    [
      ...new Set(
        values.map(
          value =>
            requireUuid(
              value,
              type,
            ),
        ),
      ),
    ];


  if (
    normalized.length >
      maximum
  ) {
    throw new InvitationServiceError(
      type ===
        'role'
        ? 'TOO_MANY_ROLES'
        : 'TOO_MANY_COMPANIES',

      type ===
        'role'
        ? 'Too many roles were selected.'
        : 'Too many companies were selected.',
    );
  }


  return normalized;
}


function normalizeStatus(
  value:
    WorkspaceInvitationStatus
    | 'all'
    | undefined,
):
  WorkspaceInvitationStatus
  | null {
  if (
    !value ||
    value ===
      'all'
  ) {
    return null;
  }


  if (
    ![
      'pending',
      'accepted',
      'revoked',
      'expired',
    ].includes(
      value,
    )
  ) {
    return null;
  }


  return value;
}


function normalizeSearch(
  value:
    string
    | undefined,
): string | null {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }


  const normalized =
    value
      .trim()
      .slice(
        0,
        200,
      );


  return normalized ||
    null;
}


function toIso(
  value:
    unknown,
): string | null {
  if (
    !value
  ) {
    return null;
  }


  if (
    value instanceof
      Date
  ) {
    return value.toISOString();
  }


  const date =
    new Date(
      String(
        value,
      ),
    );


  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date.toISOString();
}


/* ================================================================
   TOKEN
   ================================================================ */

function createRawInvitationToken():
  string {
  return crypto
    .randomBytes(
      48,
    )
    .toString(
      'base64url',
    );
}


function hashInvitationToken(
  token:
    string,
): string {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      token,
      'utf8',
    )
    .digest(
      'hex',
    );
}


function requireRawToken(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new InvitationServiceError(
      'INVALID_TOKEN',
      'The invitation link is invalid.',
    );
  }


  const token =
    value.trim();


  if (
    token.length <
      32 ||
    token.length >
      500
  ) {
    throw new InvitationServiceError(
      'INVALID_TOKEN',
      'The invitation link is invalid.',
    );
  }


  return token;
}


/* ================================================================
   ACTOR DISPLAY
   ================================================================ */

function actorDisplayName(
  fullName:
    unknown,

  firstName:
    unknown,

  lastName:
    unknown,

  email:
    unknown,
): string {
  if (
    typeof fullName ===
      'string' &&
    fullName.trim()
  ) {
    return fullName.trim();
  }


  const joined =
    [
      typeof firstName ===
        'string'
        ? firstName.trim()
        : '',

      typeof lastName ===
        'string'
        ? lastName.trim()
        : '',
    ]
      .filter(
        Boolean,
      )
      .join(
        ' ',
      );


  if (
    joined
  ) {
    return joined;
  }


  return typeof email ===
    'string'
      ? email
      : '';
}


/* ================================================================
   PERMISSION CONTEXT
   ================================================================ */

async function requireInvitationView():
  Promise<PermissionContext> {
  return requirePermission(
    SAMI_PERMISSIONS
      .INVITATIONS_VIEW,
  );
}


async function requireInvitationManage():
  Promise<PermissionContext> {
  return requirePermission(
    SAMI_PERMISSIONS
      .INVITATIONS_MANAGE,
  );
}


/* ================================================================
   COMPANY CONTEXT FOR INVITATION MANAGEMENT
   ================================================================ */

async function requireInvitationCompanyContext(
  permissionContext:
    PermissionContext,
) {
  const companyContext =
    await requireCompanyContext();


  if (
    companyContext.userId !==
      permissionContext.userId ||
    companyContext.tenantId !==
      permissionContext.tenantId ||
    companyContext.sessionId !==
      permissionContext.sessionId
  ) {
    throw new InvitationServiceError(
      'CONTEXT_MISMATCH',
      'The workspace authorization context is inconsistent.',
    );
  }


  return companyContext;
}


/* ================================================================
   EXPIRE PENDING INVITATIONS
   ================================================================ */

async function expireDueInvitations(
  tenantId:
    string,
): Promise<number> {
  const result =
    await queryControl(
      `
        UPDATE workspace_invitations

        SET
          status =
            'expired',

          updated_at =
            NOW()

        WHERE tenant_id = $1

          AND status =
              'pending'

          AND expires_at <=
              NOW()

          AND deleted_at
              IS NULL

        RETURNING id
      `,
      [
        tenantId,
      ],
    );


  return result.rows.length;
}


/* ================================================================
   ASSIGNABLE ROLES
   ================================================================ */

async function loadAssignableRoles(
  context:
    PermissionContext,
): Promise<InvitationAssignableRole[]> {
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
              ) =
              'active'

              AND (
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
          )::integer
            AS permission_count

        FROM roles r

        WHERE r.deleted_at
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
                  $1
            )
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
      ],
    );


  const rows =
    roleResult.rows as
      AssignableRoleRow[];


  /*
   * Workspace owner can assign every active role visible in
   * the workspace.
   */
  if (
    context.isOwner
  ) {
    return rows.map(
      row => ({
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

        permissionCount:
          Number(
            row.permission_count ||
            0,
          ),
      }),
    );
  }


  if (
    rows.length ===
      0
  ) {
    return [];
  }


  const roleIds =
    rows.map(
      row =>
        String(
          row.id,
        ),
    );


  const permissionResult =
    await queryControl(
      `
        SELECT DISTINCT
          rp.role_id,

          LOWER(
            p.key
          )
            AS permission_key

        FROM role_permissions rp

        INNER JOIN permissions p
          ON p.id =
             rp.permission_id

        WHERE rp.role_id =
              ANY(
                $2::uuid[]
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

          AND (
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
      `,
      [
        context.tenantId,
        roleIds,
      ],
    );


  const permissionsByRole =
    new Map<
      string,
      Set<string>
    >();


  for (
    const row
    of permissionResult.rows
  ) {
    const roleId =
      String(
        row.role_id,
      );


    const permissionKey =
      String(
        row.permission_key ||
        '',
      )
        .trim()
        .toLowerCase();


    const set =
      permissionsByRole.get(
        roleId,
      ) ||
      new Set<string>();


    if (
      permissionKey
    ) {
      set.add(
        permissionKey,
      );
    }


    permissionsByRole.set(
      roleId,
      set,
    );
  }


  return rows
    .filter(
      row => {
        const roleId =
          String(
            row.id,
          );


        const rolePermissions =
          permissionsByRole.get(
            roleId,
          ) ||
          new Set<string>();


        /*
         * A non-owner can only invite someone into a role whose
         * effective permission set is a subset of the actor's own
         * effective permissions.
         */
        for (
          const permission
          of rolePermissions
        ) {
          if (
            !context.permissionSet.has(
              permission,
            )
          ) {
            return false;
          }
        }


        return true;
      },
    )
    .map(
      row => ({
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

        permissionCount:
          Number(
            row.permission_count ||
            0,
          ),
      }),
    );
}


/* ================================================================
   FORM OPTIONS
   ================================================================ */

export async function getWorkspaceInvitationFormOptions():
  Promise<WorkspaceInvitationFormOptions> {
  const permissionContext =
    await requireInvitationManage();


  const companyContext =
    await requireInvitationCompanyContext(
      permissionContext,
    );


  const roles =
    await loadAssignableRoles(
      permissionContext,
    );


  const defaultRole =
    roles.find(
      role =>
        role.isSystem &&
        role.tenantId ===
          null &&
        role.key
          .trim()
          .toLowerCase() ===
          'member',
    );


  return {
    roles,

    companies:
      companyContext
        .allowedCompanies
        .map(
          company => ({
            id:
              company.id,

            name:
              company.name,

            legalName:
              company.legalName,

            currency:
              company.currency,

            timezone:
              company.timezone,

            country:
              company.country,

            isCurrent:
              company.id ===
              companyContext
                .currentCompanyId,

            isDefault:
              company.id ===
              companyContext
                .defaultCompanyId,
          }),
        ),

    defaultRoleId:
      defaultRole
        ?.id ||
      null,

    defaultCompanyId:
      companyContext
        .currentCompanyId,
  };
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertInvitationAudit(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    actorUserId:
      string;

    invitationId:
      string;

    action:
      string;

    metadata:
      Record<
        string,
        unknown
      >;

    audit?:
      InvitationAuditContext;
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

        'invitation',
        $4,

        'workspace',

        'success',

        $5::jsonb,

        $6,
        $7,

        $8,

        $3,

        'invitation',
        $4
      )
    `,
    [
      input.tenantId,
      input.actorUserId,

      input.action,
      input.invitationId,

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
   BASE INVITATION QUERY
   ================================================================ */

const INVITATION_BASE_SELECT = `
  SELECT
    wi.id,
    wi.tenant_id,

    t.name
      AS workspace_name,

    wi.email,
    wi.member_type,
    wi.status,
    wi.message,

    wi.expires_at,
    wi.last_sent_at,
    wi.accepted_at,
    wi.revoked_at,
    wi.created_at,
    wi.updated_at,

    wi.invited_by,

    inviter.email
      AS inviter_email,

    inviter.full_name
      AS inviter_full_name,

    inviter.first_name
      AS inviter_first_name,

    inviter.last_name
      AS inviter_last_name,

    wi.accepted_by,

    accepter.email
      AS accepter_email,

    accepter.full_name
      AS accepter_full_name,

    accepter.first_name
      AS accepter_first_name,

    accepter.last_name
      AS accepter_last_name,

    wi.revoked_by,

    revoker.email
      AS revoker_email,

    revoker.full_name
      AS revoker_full_name,

    revoker.first_name
      AS revoker_first_name,

    revoker.last_name
      AS revoker_last_name

  FROM workspace_invitations wi

  INNER JOIN tenants t
    ON t.id =
       wi.tenant_id

  INNER JOIN users inviter
    ON inviter.id =
       wi.invited_by

  LEFT JOIN users accepter
    ON accepter.id =
       wi.accepted_by

  LEFT JOIN users revoker
    ON revoker.id =
       wi.revoked_by
`;


/* ================================================================
   HYDRATE INVITATIONS
   ================================================================ */

async function hydrateInvitations(
  baseRows:
    InvitationBaseRow[],
): Promise<WorkspaceInvitation[]> {
  if (
    baseRows.length ===
      0
  ) {
    return [];
  }


  const invitationIds =
    baseRows.map(
      row =>
        String(
          row.id,
        ),
    );


  const [
    roleResult,
    companyLinkResult,
  ] =
    await Promise.all([
      queryControl(
        `
          SELECT
            wir.invitation_id,

            r.id,
            r.tenant_id,
            r.key,
            r.name,
            r.description,
            r.is_system,
            r.status,
            r.deleted_at

          FROM workspace_invitation_roles wir

          INNER JOIN roles r
            ON r.id =
               wir.role_id

          WHERE wir.invitation_id =
                ANY(
                  $1::uuid[]
                )

            AND wir.deleted_at
                IS NULL

          ORDER BY
            wir.created_at ASC,
            r.id ASC
        `,
        [
          invitationIds,
        ],
      ),

      queryControl(
        `
          SELECT
            invitation_id,
            company_id,
            is_default

          FROM workspace_invitation_companies

          WHERE invitation_id =
                ANY(
                  $1::uuid[]
                )

            AND deleted_at
                IS NULL

          ORDER BY
            is_default DESC,
            created_at ASC,
            company_id ASC
        `,
        [
          invitationIds,
        ],
      ),
    ]);


  const rolesByInvitation =
    new Map<
      string,
      WorkspaceInvitationRole[]
    >();


  for (
    const raw
    of roleResult.rows as
      InvitationRoleRow[]
  ) {
    const invitationId =
      String(
        raw.invitation_id,
      );


    const current =
      rolesByInvitation.get(
        invitationId,
      ) ||
      [];


    const status =
      typeof raw.status ===
        'string'
        ? raw.status
        : 'unknown';


    current.push({
      id:
        String(
          raw.id,
        ),

      key:
        typeof raw.key ===
          'string'
          ? raw.key
          : '',

      name:
        typeof raw.name ===
          'string'
          ? raw.name
          : '',

      description:
        typeof raw.description ===
          'string'
          ? raw.description
          : null,

      isSystem:
        raw.is_system ===
          true,

      status,

      available:
        !raw.deleted_at &&
        status
          .trim()
          .toLowerCase() ===
          'active',
    });


    rolesByInvitation.set(
      invitationId,
      current,
    );
  }


  const companyLinksByInvitation =
    new Map<
      string,
      Array<{
        companyId:
          string;

        isDefault:
          boolean;
      }>
    >();


  const tenantCompanyIds =
    new Map<
      string,
      Set<string>
    >();


  const tenantByInvitation =
    new Map<
      string,
      string
    >();


  for (
    const row
    of baseRows
  ) {
    tenantByInvitation.set(
      String(
        row.id,
      ),

      String(
        row.tenant_id,
      ),
    );
  }


  for (
    const raw
    of companyLinkResult.rows as
      InvitationCompanyLinkRow[]
  ) {
    const invitationId =
      String(
        raw.invitation_id,
      );


    const companyId =
      String(
        raw.company_id,
      );


    const current =
      companyLinksByInvitation.get(
        invitationId,
      ) ||
      [];


    current.push({
      companyId,

      isDefault:
        raw.is_default ===
        true,
    });


    companyLinksByInvitation.set(
      invitationId,
      current,
    );


    const tenantId =
      tenantByInvitation.get(
        invitationId,
      );


    if (
      tenantId
    ) {
      const set =
        tenantCompanyIds.get(
          tenantId,
        ) ||
        new Set<string>();


      set.add(
        companyId,
      );


      tenantCompanyIds.set(
        tenantId,
        set,
      );
    }
  }


  const companyLookup =
    new Map<
      string,
      TenantCompanyRow
    >();


  await Promise.all(
    [
      ...tenantCompanyIds.entries(),
    ].map(
      async ([
        tenantId,
        companySet,
      ]) => {
        const companyIds =
          [
            ...companySet,
          ];


        if (
          companyIds.length ===
            0
        ) {
          return;
        }


        const pool =
          await getTenantPoolByTenantId(
            tenantId,
          );


        const result =
          await pool.query(
            `
              SELECT
                id,
                name,
                legal_name,
                currency,
                timezone,
                country,
                is_active,
                archived_at

              FROM companies

              WHERE id =
                    ANY(
                      $1::uuid[]
                    )
            `,
            [
              companyIds,
            ],
          );


        for (
          const row
          of result.rows as
            TenantCompanyRow[]
        ) {
          companyLookup.set(
            `${tenantId}:${String(
              row.id,
            )}`,

            row,
          );
        }
      },
    ),
  );


  return baseRows.map(
    row => {
      const invitationId =
        String(
          row.id,
        );


      const tenantId =
        String(
          row.tenant_id,
        );


      const companyLinks =
        companyLinksByInvitation.get(
          invitationId,
        ) ||
        [];


      const companies:
        WorkspaceInvitationCompany[] =
        companyLinks.map(
          link => {
            const company =
              companyLookup.get(
                `${tenantId}:${link.companyId}`,
              );


            if (
              !company
            ) {
              return {
                id:
                  link.companyId,

                name:
                  'Unavailable company',

                legalName:
                  null,

                currency:
                  null,

                timezone:
                  null,

                country:
                  null,

                isDefault:
                  link.isDefault,

                isActive:
                  false,

                archivedAt:
                  null,

                available:
                  false,
              };
            }


            const active =
              company.is_active ===
                true &&
              !company.archived_at;


            return {
              id:
                String(
                  company.id,
                ),

              name:
                typeof company.name ===
                  'string'
                  ? company.name
                  : '',

              legalName:
                typeof company.legal_name ===
                  'string'
                  ? company.legal_name
                  : null,

              currency:
                typeof company.currency ===
                  'string'
                  ? company.currency
                  : null,

              timezone:
                typeof company.timezone ===
                  'string'
                  ? company.timezone
                  : null,

              country:
                typeof company.country ===
                  'string'
                  ? company.country
                  : null,

              isDefault:
                link.isDefault,

              isActive:
                company.is_active ===
                true,

              archivedAt:
                toIso(
                  company.archived_at,
                ),

              available:
                active,
            };
          },
        );


      const invitedBy: WorkspaceInvitationActor = {
        id:
          String(
            row.invited_by,
          ),

        email:
          typeof row.inviter_email ===
            'string'
            ? row.inviter_email
            : '',

        fullName:
          actorDisplayName(
            row.inviter_full_name,
            row.inviter_first_name,
            row.inviter_last_name,
            row.inviter_email,
          ),
      };


      const acceptedBy:
        WorkspaceInvitationActor
        | null =
        row.accepted_by
          ? {
              id:
                String(
                  row.accepted_by,
                ),

              email:
                typeof row.accepter_email ===
                  'string'
                  ? row.accepter_email
                  : '',

              fullName:
                actorDisplayName(
                  row.accepter_full_name,
                  row.accepter_first_name,
                  row.accepter_last_name,
                  row.accepter_email,
                ),
            }
          : null;


      const revokedBy:
        WorkspaceInvitationActor
        | null =
        row.revoked_by
          ? {
              id:
                String(
                  row.revoked_by,
                ),

              email:
                typeof row.revoker_email ===
                  'string'
                  ? row.revoker_email
                  : '',

              fullName:
                actorDisplayName(
                  row.revoker_full_name,
                  row.revoker_first_name,
                  row.revoker_last_name,
                  row.revoker_email,
                ),
            }
          : null;


      return {
        id:
          invitationId,

        tenantId,

        workspaceName:
          typeof row.workspace_name ===
            'string'
            ? row.workspace_name
            : '',

        email:
          typeof row.email ===
            'string'
            ? row.email
            : '',

        memberType:
          row.member_type ===
            'portal'
            ? 'portal'
            : 'internal',

        status:
          (
            [
              'pending',
              'accepted',
              'revoked',
              'expired',
            ].includes(
              String(
                row.status,
              ),
            )
              ? String(
                  row.status,
                )
              : 'expired'
          ) as WorkspaceInvitationStatus,

        message:
          typeof row.message ===
            'string'
            ? row.message
            : null,

        roles:
          rolesByInvitation.get(
            invitationId,
          ) ||
          [],

        companies,

        defaultCompanyId:
          companies.find(
            company =>
              company.isDefault,
          )
            ?.id ||
          null,

        invitedBy,

        acceptedBy,

        revokedBy,

        expiresAt:
          toIso(
            row.expires_at,
          ) ||
          new Date(
            0,
          ).toISOString(),

        lastSentAt:
          toIso(
            row.last_sent_at,
          ),

        acceptedAt:
          toIso(
            row.accepted_at,
          ),

        revokedAt:
          toIso(
            row.revoked_at,
          ),

        createdAt:
          toIso(
            row.created_at,
          ) ||
          new Date(
            0,
          ).toISOString(),

        updatedAt:
          toIso(
            row.updated_at,
          ) ||
          new Date(
            0,
          ).toISOString(),
      };
    },
  );
}


/* ================================================================
   LOAD ONE INVITATION INTERNALLY
   ================================================================ */

async function loadInvitationInternal(
  tenantId:
    string,

  invitationId:
    string,
): Promise<WorkspaceInvitation | null> {
  const result =
    await queryControl(
      `
        ${INVITATION_BASE_SELECT}

        WHERE wi.tenant_id = $1
          AND wi.id = $2

          AND wi.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tenantId,
        invitationId,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    return null;
  }


  const hydrated =
    await hydrateInvitations(
      result.rows as
        InvitationBaseRow[],
    );


  return hydrated[0] ||
    null;
}


/* ================================================================
   CREATE INVITATION
   ================================================================ */

export async function createWorkspaceInvitation(
  input:
    CreateWorkspaceInvitationInput,
): Promise<WorkspaceInvitationTokenResult> {
  const permissionContext =
    await requireInvitationManage();


  const companyContext =
    await requireInvitationCompanyContext(
      permissionContext,
    );


  const email =
    normalizeEmail(
      input.email,
    );


  const memberType =
    normalizeMemberType(
      input.memberType,
    );


  const message =
    normalizeMessage(
      input.message,
    );


  const expiresInDays =
    normalizeExpiryDays(
      input.expiresInDays,
    );


  let roleIds =
    normalizeUuidList(
      input.roleIds,
      'role',
      MAX_ROLES,
    );


  let companyIds =
    normalizeUuidList(
      input.companyIds,
      'company',
      MAX_COMPANIES,
    );


  /*
   * Odoo-like default:
   *
   * If the invitation UI has not explicitly chosen a company,
   * invite into the actor's CURRENT company.
   */
  if (
    companyIds.length ===
      0
  ) {
    companyIds = [
      companyContext
        .currentCompanyId,
    ];
  }


  const allowedCompanySet =
    new Set(
      companyContext
        .allowedCompanyIds,
    );


  for (
    const companyId
    of companyIds
  ) {
    if (
      !allowedCompanySet.has(
        companyId,
      )
    ) {
      throw new InvitationServiceError(
        'COMPANY_ACCESS_DENIED',
        'You cannot invite a user into a company you cannot access.',
      );
    }
  }


  const defaultCompanyId =
    input.defaultCompanyId
      ? requireUuid(
          input.defaultCompanyId,
          'company',
        )
      : companyIds[0];


  if (
    !companyIds.includes(
      defaultCompanyId,
    )
  ) {
    throw new InvitationServiceError(
      'DEFAULT_COMPANY_INVALID',
      'The default company must be one of the selected companies.',
    );
  }


  const assignableRoles =
    await loadAssignableRoles(
      permissionContext,
    );


  /*
   * Odoo-like internal-user baseline:
   *
   * If no role is explicitly selected, use the canonical Member
   * system role.
   */
  if (
    memberType ===
      'internal' &&
    roleIds.length ===
      0
  ) {
    const memberRole =
      assignableRoles.find(
        role =>
          role.isSystem &&
          role.tenantId ===
            null &&
          role.key
            .trim()
            .toLowerCase() ===
            'member',
      );


    if (
      !memberRole
    ) {
      throw new InvitationServiceError(
        'ROLE_REQUIRED',
        'An internal workspace invitation requires at least one assignable role.',
      );
    }


    roleIds = [
      memberRole.id,
    ];
  }


  /*
   * Portal users do not receive internal workspace roles.
   */
  if (
    memberType ===
      'portal' &&
    roleIds.length >
      0
  ) {
    throw new InvitationServiceError(
      'PORTAL_ROLE_NOT_ALLOWED',
      'Portal users cannot receive internal workspace roles.',
    );
  }


  const assignableRoleMap =
    new Map(
      assignableRoles.map(
        role => [
          role.id,
          role,
        ],
      ),
    );


  for (
    const roleId
    of roleIds
  ) {
    if (
      !assignableRoleMap.has(
        roleId,
      )
    ) {
      throw new InvitationServiceError(
        'PRIVILEGE_ESCALATION_BLOCKED',
        'One or more selected roles exceed your current authorization.',
      );
    }
  }


  const token =
    createRawInvitationToken();


  const tokenHash =
    hashInvitationToken(
      token,
    );


  const expiresAt =
    new Date(
      Date.now() +
      expiresInDays *
        24 *
        60 *
        60 *
        1000,
    );


  let invitationId:
    string;


  try {
    invitationId =
      await withControlTransaction(
        async client => {
          /*
           * Expire stale invitation for this email first.
           */
          await client.query(
            `
              UPDATE workspace_invitations

              SET
                status =
                  'expired',

                updated_at =
                  NOW()

              WHERE tenant_id = $1

                AND email = $2

                AND status =
                    'pending'

                AND expires_at <=
                    NOW()

                AND deleted_at
                    IS NULL
            `,
            [
              permissionContext
                .tenantId,

              email,
            ],
          );


          /*
           * Existing non-deleted membership blocks a new invitation.
           */
          const existingMember =
            await client.query(
              `
                SELECT
                  tu.id

                FROM users u

                INNER JOIN tenant_users tu
                  ON tu.user_id =
                     u.id

                WHERE LOWER(
                  u.email
                ) = $2

                  AND tu.tenant_id =
                      $1

                  AND u.deleted_at
                      IS NULL

                  AND tu.deleted_at
                      IS NULL

                LIMIT 1

                FOR UPDATE OF tu
              `,
              [
                permissionContext
                  .tenantId,

                email,
              ],
            );


          if (
            existingMember
              .rows.length >
            0
          ) {
            throw new InvitationServiceError(
              'MEMBER_ALREADY_EXISTS',
              'This person already belongs to the workspace.',
            );
          }


          const pendingInvitation =
            await client.query(
              `
                SELECT
                  id

                FROM workspace_invitations

                WHERE tenant_id = $1
                  AND email = $2

                  AND status =
                      'pending'

                  AND deleted_at
                      IS NULL

                LIMIT 1

                FOR UPDATE
              `,
              [
                permissionContext
                  .tenantId,

                email,
              ],
            );


          if (
            pendingInvitation
              .rows.length >
            0
          ) {
            throw new InvitationServiceError(
              'INVITATION_ALREADY_PENDING',
              'A pending invitation already exists for this email address.',
            );
          }


          const created =
            await client.query(
              `
                INSERT INTO workspace_invitations (
                  tenant_id,
                  email,
                  member_type,
                  status,
                  token_hash,
                  invited_by,
                  message,
                  expires_at,
                  created_at,
                  updated_at
                )

                VALUES (
                  $1,
                  $2,
                  $3,
                  'pending',
                  $4,
                  $5,
                  $6,
                  $7,
                  NOW(),
                  NOW()
                )

                RETURNING id
              `,
              [
                permissionContext
                  .tenantId,

                email,

                memberType,

                tokenHash,

                permissionContext
                  .userId,

                message,

                expiresAt,
              ],
            );


          const id =
            String(
              created.rows[0]
                .id,
            );


          for (
            const roleId
            of roleIds
          ) {
            await client.query(
              `
                INSERT INTO workspace_invitation_roles (
                  invitation_id,
                  role_id,
                  created_at,
                  deleted_at
                )

                VALUES (
                  $1,
                  $2,
                  NOW(),
                  NULL
                )
              `,
              [
                id,
                roleId,
              ],
            );
          }


          for (
            const companyId
            of companyIds
          ) {
            await client.query(
              `
                INSERT INTO workspace_invitation_companies (
                  invitation_id,
                  company_id,
                  is_default,
                  created_at,
                  deleted_at
                )

                VALUES (
                  $1,
                  $2,
                  $3,
                  NOW(),
                  NULL
                )
              `,
              [
                id,

                companyId,

                companyId ===
                  defaultCompanyId,
              ],
            );
          }


          await insertInvitationAudit(
            client,
            {
              tenantId:
                permissionContext
                  .tenantId,

              actorUserId:
                permissionContext
                  .userId,

              invitationId:
                id,

              action:
                'invitation.created',

              metadata: {
                email,
                memberType,
                roleIds,
                companyIds,
                defaultCompanyId,
                expiresAt:
                  expiresAt
                    .toISOString(),
              },

              audit:
                input.audit,
            },
          );


          return id;
        },
      );
  } catch (
    error
  ) {
    const databaseError =
      error as {
        code?: string;

        constraint?: string;
      };


    if (
      databaseError.code ===
        '23505' &&
      databaseError.constraint ===
        'uq_workspace_invitations_pending_email'
    ) {
      throw new InvitationServiceError(
        'INVITATION_ALREADY_PENDING',
        'A pending invitation already exists for this email address.',
      );
    }


    throw error;
  }


  const invitation =
    await loadInvitationInternal(
      permissionContext
        .tenantId,

      invitationId,
    );


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation could not be loaded after creation.',
    );
  }


  return {
    invitation,
    token,
  };
}


/* ================================================================
   LIST INVITATIONS
   ================================================================ */

export async function listWorkspaceInvitations(
  options:
    ListWorkspaceInvitationsOptions =
      {},
): Promise<WorkspaceInvitation[]> {
  const context =
    await requireInvitationView();


  await expireDueInvitations(
    context.tenantId,
  );


  const status =
    normalizeStatus(
      options.status,
    );


  const search =
    normalizeSearch(
      options.search,
    );


  const limit =
    Math.min(
      Math.max(
        Math.trunc(
          options.limit ||
          100,
        ),
        1,
      ),
      200,
    );


  const offset =
    Math.max(
      Math.trunc(
        options.offset ||
        0,
      ),
      0,
    );


  const result =
    await queryControl(
      `
        ${INVITATION_BASE_SELECT}

        WHERE wi.tenant_id = $1

          AND wi.deleted_at
              IS NULL

          AND (
            $2::text
              IS NULL

            OR

            wi.status =
              $2
          )

          AND (
            $3::text
              IS NULL

            OR

            LOWER(
              wi.email
            ) LIKE
              '%' ||
              LOWER(
                $3
              ) ||
              '%'

            OR

            LOWER(
              COALESCE(
                inviter.full_name,
                ''
              )
            ) LIKE
              '%' ||
              LOWER(
                $3
              ) ||
              '%'
          )

        ORDER BY
          CASE wi.status
            WHEN 'pending'
              THEN 0

            WHEN 'expired'
              THEN 1

            WHEN 'accepted'
              THEN 2

            WHEN 'revoked'
              THEN 3

            ELSE 4
          END ASC,

          wi.created_at
            DESC,

          wi.id
            DESC

        LIMIT $4
        OFFSET $5
      `,
      [
        context.tenantId,
        status,
        search,
        limit,
        offset,
      ],
    );


  return hydrateInvitations(
    result.rows as
      InvitationBaseRow[],
  );
}


/* ================================================================
   GET ONE INVITATION
   ================================================================ */

export async function getWorkspaceInvitation(
  invitationId:
    string,
): Promise<WorkspaceInvitation> {
  const context =
    await requireInvitationView();


  const id =
    requireUuid(
      invitationId,
      'invitation',
    );


  await expireDueInvitations(
    context.tenantId,
  );


  const invitation =
    await loadInvitationInternal(
      context.tenantId,
      id,
    );


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation was not found.',
    );
  }


  return invitation;
}


/* ================================================================
   PREPARE RESEND
   ================================================================

   This rotates the invitation token.

   It does NOT mark the email as sent.

   Category 9.3 email delivery will:

       prepareWorkspaceInvitationResend()
                  ↓
       send email
                  ↓
       markWorkspaceInvitationSent()

   ================================================================ */

export async function prepareWorkspaceInvitationResend(
  input:
    PrepareInvitationResendInput,
): Promise<WorkspaceInvitationTokenResult> {
  const context =
    await requireInvitationManage();


  const invitationId =
    requireUuid(
      input.invitationId,
      'invitation',
    );


  const expiryDays =
    normalizeExpiryDays(
      input.expiresInDays,
    );


  const token =
    createRawInvitationToken();


  const tokenHash =
    hashInvitationToken(
      token,
    );


  const expiresAt =
    new Date(
      Date.now() +
      expiryDays *
        24 *
        60 *
        60 *
        1000,
    );


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            SELECT
              id,
              email,
              status,
              expires_at

            FROM workspace_invitations

            WHERE id = $2
              AND tenant_id = $1

              AND deleted_at
                  IS NULL

            LIMIT 1

            FOR UPDATE
          `,
          [
            context.tenantId,
            invitationId,
          ],
        );


      if (
        result.rows.length ===
          0
      ) {
        throw new InvitationServiceError(
          'INVITATION_NOT_FOUND',
          'The invitation was not found.',
        );
      }


      const row =
        result.rows[0];


      if (
        row.status ===
          'pending' &&
        new Date(
          row.expires_at,
        ).getTime() <=
          Date.now()
      ) {
        await client.query(
          `
            UPDATE workspace_invitations

            SET
              status =
                'expired',

              updated_at =
                NOW()

            WHERE id = $1
          `,
          [
            invitationId,
          ],
        );


        throw new InvitationServiceError(
          'INVITATION_EXPIRED',
          'This invitation has expired. Create a new invitation instead.',
        );
      }


      if (
        row.status !==
        'pending'
      ) {
        throw new InvitationServiceError(
          'INVITATION_NOT_PENDING',
          'Only pending invitations can be resent.',
        );
      }


      await client.query(
        `
          UPDATE workspace_invitations

          SET
            token_hash =
              $3,

            expires_at =
              $4,

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND id = $2
        `,
        [
          context.tenantId,
          invitationId,
          tokenHash,
          expiresAt,
        ],
      );


      await insertInvitationAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          invitationId,

          action:
            'invitation.resend_prepared',

          metadata: {
            email:
              row.email,

            expiresAt:
              expiresAt
                .toISOString(),
          },

          audit:
            input.audit,
        },
      );
    },
  );


  const invitation =
    await loadInvitationInternal(
      context.tenantId,
      invitationId,
    );


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation could not be loaded after the resend preparation.',
    );
  }


  return {
    invitation,
    token,
  };
}


/* ================================================================
   MARK EMAIL SENT
   ================================================================ */

export async function markWorkspaceInvitationSent(
  input:
    InvitationMutationInput,
): Promise<WorkspaceInvitation> {
  const context =
    await requireInvitationManage();


  const invitationId =
    requireUuid(
      input.invitationId,
      'invitation',
    );


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            UPDATE workspace_invitations

            SET
              last_sent_at =
                NOW(),

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND id = $2

              AND status =
                  'pending'

              AND expires_at >
                  NOW()

              AND deleted_at
                  IS NULL

            RETURNING
              id,
              email
          `,
          [
            context.tenantId,
            invitationId,
          ],
        );


      if (
        result.rows.length ===
          0
      ) {
        throw new InvitationServiceError(
          'INVITATION_NOT_PENDING',
          'The invitation is no longer pending.',
        );
      }


      await insertInvitationAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          invitationId,

          action:
            'invitation.sent',

          metadata: {
            email:
              result.rows[0]
                .email,
          },

          audit:
            input.audit,
        },
      );
    },
  );


  const invitation =
    await loadInvitationInternal(
      context.tenantId,
      invitationId,
    );


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation could not be loaded.',
    );
  }


  return invitation;
}


/* ================================================================
   REVOKE INVITATION
   ================================================================ */

export async function revokeWorkspaceInvitation(
  input:
    InvitationMutationInput,
): Promise<WorkspaceInvitation> {
  const context =
    await requireInvitationManage();


  const invitationId =
    requireUuid(
      input.invitationId,
      'invitation',
    );


  await withControlTransaction(
    async client => {
      const result =
        await client.query(
          `
            SELECT
              id,
              email,
              status,
              expires_at

            FROM workspace_invitations

            WHERE tenant_id = $1
              AND id = $2

              AND deleted_at
                  IS NULL

            LIMIT 1

            FOR UPDATE
          `,
          [
            context.tenantId,
            invitationId,
          ],
        );


      if (
        result.rows.length ===
          0
      ) {
        throw new InvitationServiceError(
          'INVITATION_NOT_FOUND',
          'The invitation was not found.',
        );
      }


      const row =
        result.rows[0];


      if (
        row.status ===
          'pending' &&
        new Date(
          row.expires_at,
        ).getTime() <=
          Date.now()
      ) {
        await client.query(
          `
            UPDATE workspace_invitations

            SET
              status =
                'expired',

              updated_at =
                NOW()

            WHERE id = $1
          `,
          [
            invitationId,
          ],
        );


        throw new InvitationServiceError(
          'INVITATION_EXPIRED',
          'The invitation has already expired.',
        );
      }


      if (
        row.status !==
        'pending'
      ) {
        throw new InvitationServiceError(
          'INVITATION_NOT_PENDING',
          'Only pending invitations can be revoked.',
        );
      }


      /*
       * Rotate hash as an additional defensive invalidation layer.
       */
      const invalidatedHash =
        hashInvitationToken(
          createRawInvitationToken(),
        );


      await client.query(
        `
          UPDATE workspace_invitations

          SET
            status =
              'revoked',

            token_hash =
              $4,

            revoked_by =
              $3,

            revoked_at =
              NOW(),

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND id = $2
        `,
        [
          context.tenantId,
          invitationId,
          context.userId,
          invalidatedHash,
        ],
      );


      await insertInvitationAudit(
        client,
        {
          tenantId:
            context.tenantId,

          actorUserId:
            context.userId,

          invitationId,

          action:
            'invitation.revoked',

          metadata: {
            email:
              row.email,
          },

          audit:
            input.audit,
        },
      );
    },
  );


  const invitation =
    await loadInvitationInternal(
      context.tenantId,
      invitationId,
    );


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation could not be loaded after revocation.',
    );
  }


  return invitation;
}


/* ================================================================
   EXPIRE CURRENT WORKSPACE INVITATIONS
   ================================================================ */

export async function expireWorkspaceInvitations():
  Promise<number> {
  const context =
    await requireInvitationManage();


  return expireDueInvitations(
    context.tenantId,
  );
}


/* ================================================================
   ACCEPTANCE PREPARATION
   ================================================================

   PUBLIC TOKEN RESOLUTION.

   This does NOT accept the invitation yet.

   It prepares the future:

       /invite/[token]

   page.

   Category 9 acceptance will later perform the actual atomic:

       users
       tenant_users
       user_roles
       company_users
       invitation.accepted

   flow.

   ================================================================ */

export async function prepareInvitationAcceptance(
  rawToken:
    string,
): Promise<InvitationAcceptancePreparation> {
  const token =
    requireRawToken(
      rawToken,
    );


  const tokenHash =
    hashInvitationToken(
      token,
    );


  const result =
    await queryControl(
      `
        ${INVITATION_BASE_SELECT}

        WHERE wi.token_hash = $1

          AND wi.deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        tokenHash,
      ],
    );


  if (
    result.rows.length ===
      0
  ) {
    throw new InvitationServiceError(
      'INVALID_TOKEN',
      'This invitation link is invalid.',
    );
  }


  const row =
    result.rows[0] as
      InvitationBaseRow;


  const invitationId =
    String(
      row.id,
    );


  const tenantId =
    String(
      row.tenant_id,
    );


  const status =
    String(
      row.status,
    );


  if (
    status ===
      'pending' &&
    new Date(
      String(
        row.expires_at,
      ),
    ).getTime() <=
      Date.now()
  ) {
    await queryControl(
      `
        UPDATE workspace_invitations

        SET
          status =
            'expired',

          updated_at =
            NOW()

        WHERE id = $1
          AND tenant_id = $2

          AND status =
              'pending'

          AND deleted_at
              IS NULL
      `,
      [
        invitationId,
        tenantId,
      ],
    );


    throw new InvitationServiceError(
      'INVITATION_EXPIRED',
      'This invitation has expired.',
    );
  }


  if (
    status !==
      'pending'
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_PENDING',
      status ===
        'accepted'
        ? 'This invitation has already been accepted.'
        : status ===
            'revoked'
          ? 'This invitation has been revoked.'
          : 'This invitation is no longer available.',
    );
  }


  const hydrated =
    await hydrateInvitations(
      [
        row,
      ],
    );


  const invitation =
    hydrated[0];


  if (
    !invitation
  ) {
    throw new InvitationServiceError(
      'INVITATION_NOT_FOUND',
      'The invitation could not be loaded.',
    );
  }


  /*
   * Do not allow acceptance preparation to silently continue if
   * access configuration is no longer valid.
   */
  if (
    invitation.companies
      .length ===
      0 ||
    invitation.companies.some(
      company =>
        !company.available,
    )
  ) {
    throw new InvitationServiceError(
      'COMPANY_NOT_FOUND',
      'One or more companies assigned to this invitation are no longer available.',
    );
  }


  if (
    invitation.memberType ===
      'internal'
  ) {
    if (
      invitation.roles
        .length ===
        0
    ) {
      throw new InvitationServiceError(
        'ROLE_REQUIRED',
        'This invitation no longer has a valid workspace role.',
      );
    }


    if (
      invitation.roles.some(
        role =>
          !role.available,
      )
    ) {
      throw new InvitationServiceError(
        'ROLE_NOT_FOUND',
        'One or more roles assigned to this invitation are no longer available.',
      );
    }
  }


  const accountResult =
    await queryControl(
      `
        SELECT
          id,
          status,
          email_verified,
          email_verified_at

        FROM users

        WHERE LOWER(
          email
        ) = $1

          AND deleted_at
              IS NULL

        LIMIT 1
      `,
      [
        invitation.email,
      ],
    );


  const account =
    accountResult.rows[0];


  const accountExists =
    Boolean(
      account,
    );


  const accountEmailVerified =
    Boolean(
      account &&
      (
        account.email_verified ===
          true ||
        account.email_verified_at
      ),
    );


  return {
    invitation,

    accountExists,

    accountEmailVerified,

    requiresRegistration:
      !accountExists,

    requiresSignIn:
      accountExists,
  };
}