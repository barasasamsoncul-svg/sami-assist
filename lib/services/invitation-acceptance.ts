import 'server-only';

import crypto from 'crypto';

import type {
  PoolClient,
} from 'pg';

import {
  getControlPool,
  queryControl,
} from '@/lib/db/control';

import {
  getTenantPoolByTenantId,
} from '@/lib/db/tenant';

import {
  hashPassword,
} from '@/lib/auth/password';

import {
  prepareInvitationAcceptance,
} from '@/lib/services/invitations';


/* ================================================================
   SaMi INVITATION ACCEPTANCE SERVICE

   Category 9.4

   PURPOSE

   Convert a pending invitation into SaMi's normal access model:

       invitation
           ↓
       user
           ↓
       tenant_users
           ↓
       user_roles
           ↓
       company_users

   IMPORTANT

   Normal registration:

       user
         ↓
       new workspace
         ↓
       subscription
         ↓
       apps
         ↓
       company

   Invitation registration:

       invited email
           ↓
       global SaMi identity
           ↓
       EXISTING workspace

   An invitation must never create another workspace.

   EXISTING ACCOUNT

   Existing SaMi users must authenticate normally.

   NEW ACCOUNT

   A new invited person may create their SaMi identity directly
   from the secure email-bound invitation.

   ================================================================ */


/* ================================================================
   TYPES
   ================================================================ */

export type InvitationAcceptanceMemberType =
  | 'internal'
  | 'portal';


export interface InvitationAcceptanceAuditContext {
  ipAddress?:
    string | null;

  userAgent?:
    string | null;

  correlationId?:
    string | null;
}


export interface AcceptWorkspaceInvitationInput {
  token:
    string;

  authenticatedUserId?:
    string | null;

  firstName?:
    string;

  lastName?:
    string;

  phone?:
    string | null;

  password?:
    string;

  audit?:
    InvitationAcceptanceAuditContext;
}


export interface InvitationAcceptanceResult {
  invitationId:
    string;

  tenantId:
    string;

  workspaceName:
    string;

  userId:
    string;

  email:
    string;

  memberType:
    InvitationAcceptanceMemberType;

  membershipId:
    string;

  roleIds:
    string[];

  companyIds:
    string[];

  defaultCompanyId:
    string;

  accountCreated:
    boolean;

  membershipRestored:
    boolean;

  acceptedAt:
    string;
}


/* ================================================================
   ERROR
   ================================================================ */

export type InvitationAcceptanceErrorCode =
  | 'INVALID_TOKEN'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_NOT_PENDING'
  | 'INVITATION_EXPIRED'
  | 'WORKSPACE_UNAVAILABLE'
  | 'SIGN_IN_REQUIRED'
  | 'ACCOUNT_MISMATCH'
  | 'ACCOUNT_UNAVAILABLE'
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'REGISTRATION_REQUIRED'
  | 'INVALID_NAME'
  | 'INVALID_PASSWORD'
  | 'INVALID_PHONE'
  | 'MEMBER_ALREADY_EXISTS'
  | 'ROLE_REQUIRED'
  | 'ROLE_NOT_AVAILABLE'
  | 'PORTAL_ROLE_NOT_ALLOWED'
  | 'COMPANY_REQUIRED'
  | 'COMPANY_NOT_AVAILABLE'
  | 'DEFAULT_COMPANY_INVALID'
  | 'ACCEPTANCE_FAILED';


export class InvitationAcceptanceError
  extends Error {
  readonly code:
    InvitationAcceptanceErrorCode;


  constructor(
    code:
      InvitationAcceptanceErrorCode,

    message:
      string,
  ) {
    super(
      message,
    );

    this.name =
      'InvitationAcceptanceError';

    this.code =
      code;
  }
}


/* ================================================================
   INTERNAL DATABASE ROWS
   ================================================================ */

interface InvitationRow {
  id:
    string;

  tenant_id:
    string;

  workspace_name:
    string;

  email:
    string;

  member_type:
    string;

  status:
    string;

  expires_at:
    Date | string;

  created_at:
    Date | string;
}


interface UserRow {
  id:
    string;

  email:
    string;

  status:
    string;

  email_verified:
    boolean | null;

  email_verified_at:
    Date | string | null;

  deleted_at:
    Date | string | null;
}


interface MembershipRow {
  id:
    string;

  status:
    string;

  member_type:
    string;

  is_owner:
    boolean;

  deleted_at:
    Date | string | null;
}


interface RoleRow {
  invitation_role_id:
    string;

  role_id:
    string | null;

  tenant_id:
    string | null;

  key:
    string | null;

  name:
    string | null;

  is_system:
    boolean | null;

  status:
    string | null;

  role_deleted_at:
    Date | string | null;
}


interface CompanyLinkRow {
  company_id:
    string;

  is_default:
    boolean;
}


interface ActiveCompanyRow {
  id:
    string;
}


interface CompanyUserSnapshot {
  company_id:
    string;

  is_default:
    boolean;

  status:
    string;

  created_at:
    Date | string;

  updated_at:
    Date | string;
}


/* ================================================================
   CONSTANTS
   ================================================================ */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


const MAX_NAME_LENGTH =
  120;


const MAX_PHONE_LENGTH =
  40;


const MAX_PASSWORD_LENGTH =
  128;


/* ================================================================
   TOKEN
   ================================================================ */

function normalizeToken(
  value:
    string,
): string {
  if (
    typeof value !==
      'string'
  ) {
    throw new InvitationAcceptanceError(
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
    throw new InvitationAcceptanceError(
      'INVALID_TOKEN',
      'The invitation link is invalid.',
    );
  }


  return token;
}


function hashToken(
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


function createInvalidatedTokenHash():
  string {
  return crypto
    .createHash(
      'sha256',
    )
    .update(
      crypto
        .randomBytes(
          64,
        )
        .toString(
          'base64url',
        ),
      'utf8',
    )
    .digest(
      'hex',
    );
}


/* ================================================================
   USER INPUT
   ================================================================ */

function normalizeName(
  value:
    string | undefined,
): string {
  return (
    value ||
    ''
  )
    .trim()
    .replace(
      /\s+/g,
      ' ',
    );
}


function normalizePhone(
  value:
    string
    | null
    | undefined,
): string | null {
  if (
    !value
  ) {
    return null;
  }


  const phone =
    value.trim();


  if (
    !phone
  ) {
    return null;
  }


  if (
    phone.length >
      MAX_PHONE_LENGTH
  ) {
    throw new InvitationAcceptanceError(
      'INVALID_PHONE',
      'The phone number is too long.',
    );
  }


  return phone;
}


function normalizeAuthenticatedUserId(
  value:
    string
    | null
    | undefined,
): string | null {
  if (
    !value
  ) {
    return null;
  }


  const normalized =
    value.trim();


  if (
    !UUID_PATTERN.test(
      normalized,
    )
  ) {
    throw new InvitationAcceptanceError(
      'ACCOUNT_MISMATCH',
      'The signed-in SaMi account is invalid.',
    );
  }


  return normalized;
}


function normalizeMemberType(
  value:
    string,
): InvitationAcceptanceMemberType {
  return value ===
    'portal'
    ? 'portal'
    : 'internal';
}


/* ================================================================
   DATE
   ================================================================ */

function toIso(
  value:
    Date | string,
): string {
  const date =
    value instanceof Date
      ? value
      : new Date(
          value,
        );


  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return new Date()
      .toISOString();
  }


  return date.toISOString();
}


/* ================================================================
   REGISTRATION DETAILS
   ================================================================ */

async function prepareNewAccountRegistration(
  input:
    AcceptWorkspaceInvitationInput,

  accountExists:
    boolean,
): Promise<{
  firstName:
    string;

  lastName:
    string;

  phone:
    string | null;

  passwordHash:
    string | null;
}> {
  if (
    accountExists
  ) {
    return {
      firstName:
        '',

      lastName:
        '',

      phone:
        null,

      passwordHash:
        null,
    };
  }


  const firstName =
    normalizeName(
      input.firstName,
    );


  const lastName =
    normalizeName(
      input.lastName,
    );


  const phone =
    normalizePhone(
      input.phone,
    );


  const password =
    typeof input.password ===
      'string'
      ? input.password
      : '';


  if (
    !firstName ||
    !lastName
  ) {
    throw new InvitationAcceptanceError(
      'INVALID_NAME',
      'First name and last name are required.',
    );
  }


  if (
    firstName.length >
      MAX_NAME_LENGTH ||
    lastName.length >
      MAX_NAME_LENGTH
  ) {
    throw new InvitationAcceptanceError(
      'INVALID_NAME',
      'Your name is too long.',
    );
  }


  if (
    password.length <
      8 ||
    password.length >
      MAX_PASSWORD_LENGTH
  ) {
    throw new InvitationAcceptanceError(
      'INVALID_PASSWORD',
      'Password must contain between 8 and 128 characters.',
    );
  }


  const passwordHash =
    await hashPassword(
      password,
    );


  return {
    firstName,

    lastName,

    phone,

    passwordHash,
  };
}


/* ================================================================
   AUDIT
   ================================================================ */

async function insertAcceptanceAudit(
  client:
    PoolClient,

  input: {
    tenantId:
      string;

    userId:
      string;

    invitationId:
      string;

    memberType:
      InvitationAcceptanceMemberType;

    accountCreated:
      boolean;

    membershipRestored:
      boolean;

    roleIds:
      string[];

    companyIds:
      string[];

    audit?:
      InvitationAcceptanceAuditContext;
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
      .slice(
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

        'invitation.accepted',

        'invitation',
        $3,

        'workspace',

        'success',

        $4::jsonb,

        $5,
        $6,

        $7,

        'invitation.accepted',

        'invitation',
        $3
      )
    `,
    [
      input.tenantId,
      input.userId,
      input.invitationId,

      JSON.stringify({
        memberType:
          input.memberType,

        accountCreated:
          input.accountCreated,

        membershipRestored:
          input.membershipRestored,

        roleIds:
          input.roleIds,

        companyIds:
          input.companyIds,
      }),

      ipAddress,
      userAgent,
      correlationId,
    ],
  );
}


/* ================================================================
   COMPANY ACCESS COMPENSATION
   ================================================================

   SaMi uses:

   Control DB
       users
       tenant_users
       user_roles
       invitations

   Tenant DB
       companies
       company_users

   PostgreSQL cannot create one normal transaction across these two
   separate physical databases.

   Therefore:

   1. Snapshot existing company access
   2. Apply tenant DB company access
   3. Commit tenant DB
   4. Complete Control DB acceptance
   5. Commit Control DB
   6. If Control DB fails, restore the tenant snapshot

   Category 19 Automation / later infrastructure can eventually
   evolve this into an outbox/saga architecture.

   ================================================================ */

async function restoreCompanyAccessSnapshot(
  tenantId:
    string,

  userId:
    string,

  snapshot:
    CompanyUserSnapshot[],
): Promise<void> {
  const pool =
    await getTenantPoolByTenantId(
      tenantId,
    );


  const client:
    PoolClient =
    await pool.connect();


  try {
    await client.query(
      'BEGIN',
    );


    await client.query(
      `
        DELETE FROM company_users

        WHERE user_id = $1
      `,
      [
        userId,
      ],
    );


    for (
      const row
      of snapshot
    ) {
      await client.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,

            is_default,
            status,

            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,

            $3,
            $4,

            $5,
            $6
          )
        `,
        [
          row.company_id,
          userId,

          row.is_default,
          row.status,

          row.created_at,
          row.updated_at,
        ],
      );
    }


    await client.query(
      'COMMIT',
    );
  } catch (
    error
  ) {
    try {
      await client.query(
        'ROLLBACK',
      );
    } catch {
      // Preserve original compensation failure.
    }


    console.error(
      '[SaMi] Invitation company-access compensation failed:',
      error,
    );
  } finally {
    client.release();
  }
}


/* ================================================================
   VERIFY CONTROL COMMIT
   ================================================================

   A database connection can fail while PostgreSQL is returning the
   result of COMMIT.

   Before compensating the tenant DB, verify whether the Control DB
   transaction actually committed.

   ================================================================ */

async function acceptanceWasCommitted(
  invitationId:
    string,

  userId:
    string,
): Promise<boolean> {
  try {
    const result =
      await queryControl(
        `
          SELECT
            1

          FROM workspace_invitations

          WHERE id = $1

            AND status =
                'accepted'

            AND accepted_by =
                $2

            AND accepted_at
                IS NOT NULL

            AND deleted_at
                IS NULL

          LIMIT 1
        `,
        [
          invitationId,
          userId,
        ],
      );


    return result.rows.length ===
      1;
  } catch {
    return false;
  }
}


/* ================================================================
   ACCEPT INVITATION
   ================================================================ */

export async function acceptWorkspaceInvitation(
  input:
    AcceptWorkspaceInvitationInput,
): Promise<InvitationAcceptanceResult> {
  /* ============================================================
     1. TOKEN
     ============================================================ */

  const token =
    normalizeToken(
      input.token,
    );


  const tokenHash =
    hashToken(
      token,
    );


  const authenticatedUserId =
    normalizeAuthenticatedUserId(
      input.authenticatedUserId,
    );


  /* ============================================================
     2. PUBLIC PREFLIGHT
     ============================================================ */

  const preparation =
    await prepareInvitationAcceptance(
      token,
    );


  if (
    preparation.accountExists &&
    !authenticatedUserId
  ) {
    if (
      !preparation
        .accountEmailVerified
    ) {
      throw new InvitationAcceptanceError(
        'EMAIL_VERIFICATION_REQUIRED',
        'Verify your existing SaMi account and sign in before accepting this invitation.',
      );
    }


    throw new InvitationAcceptanceError(
      'SIGN_IN_REQUIRED',
      'Sign in with the invited SaMi account before accepting this invitation.',
    );
  }


  if (
    !preparation.accountExists &&
    authenticatedUserId
  ) {
    throw new InvitationAcceptanceError(
      'ACCOUNT_MISMATCH',
      'Sign out of the current SaMi account before creating the invited account.',
    );
  }


  /* ============================================================
     3. NEW ACCOUNT REGISTRATION INPUT
     ============================================================ */

  const registration =
    await prepareNewAccountRegistration(
      input,
      preparation.accountExists,
    );


  /* ============================================================
     4. CONTROL CONNECTION
     ============================================================ */

  const controlClient:
    PoolClient =
    await getControlPool()
      .connect();


  /*
   * IMPORTANT:
   *
   * getTenantPoolByTenantId() returns Pool.
   * pool.connect() returns PoolClient.
   *
   * Keep this explicit. Do not use an Awaited<ReturnType<...>>
   * chain here because node-postgres connect() has overloads and
   * TypeScript can resolve the callback overload as void.
   */
  let tenantClient:
    PoolClient | null =
    null;


  let tenantCommitted =
    false;


  let controlCommitted =
    false;


  let companySnapshot:
    CompanyUserSnapshot[] =
    [];


  let resultUserId:
    string | null =
    null;


  let invitationId:
    string | null =
    null;


  let tenantId:
    string | null =
    null;


  let finalResult:
    InvitationAcceptanceResult
    | null =
    null;


  try {
    await controlClient.query(
      'BEGIN',
    );


    /* ==========================================================
       5. LOCK INVITATION
       ========================================================== */

    const invitationResult =
      await controlClient.query<InvitationRow>(
        `
          SELECT
            wi.id,
            wi.tenant_id,

            t.name
              AS workspace_name,

            wi.email,
            wi.member_type,
            wi.status,
            wi.expires_at,
            wi.created_at

          FROM workspace_invitations wi

          INNER JOIN tenants t
            ON t.id =
               wi.tenant_id

          WHERE wi.token_hash =
                $1

            AND wi.deleted_at
                IS NULL

          LIMIT 1

          FOR UPDATE OF wi
        `,
        [
          tokenHash,
        ],
      );


    if (
      invitationResult
        .rows.length ===
      0
    ) {
      throw new InvitationAcceptanceError(
        'INVITATION_NOT_FOUND',
        'The invitation is invalid or no longer available.',
      );
    }


    const invitation =
      invitationResult
        .rows[0];


    invitationId =
      String(
        invitation.id,
      );


    tenantId =
      String(
        invitation.tenant_id,
      );


    const email =
      String(
        invitation.email,
      )
        .trim()
        .toLowerCase();


    const memberType =
      normalizeMemberType(
        invitation.member_type,
      );


    /* ==========================================================
       6. INVITATION STATE
       ========================================================== */

    if (
      invitation.status !==
        'pending'
    ) {
      throw new InvitationAcceptanceError(
        'INVITATION_NOT_PENDING',

        invitation.status ===
          'accepted'
          ? 'This invitation has already been accepted.'
          : invitation.status ===
              'revoked'
            ? 'This invitation has been revoked.'
            : 'This invitation is no longer available.',
      );
    }


    if (
      new Date(
        invitation.expires_at,
      ).getTime() <=
      Date.now()
    ) {
      throw new InvitationAcceptanceError(
        'INVITATION_EXPIRED',
        'This invitation has expired.',
      );
    }


    /* ==========================================================
       7. WORKSPACE AVAILABILITY
       ========================================================== */

    const workspaceResult =
      await controlClient.query(
        `
          SELECT
            t.id

          FROM tenants t

          INNER JOIN tenant_databases td
            ON td.tenant_id =
               t.id

          WHERE t.id = $1

            AND LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) =
            'active'

            AND t.deleted_at
                IS NULL

            AND LOWER(
              COALESCE(
                td.status,
                ''
              )
            ) =
            'active'

          LIMIT 1
        `,
        [
          tenantId,
        ],
      );


    if (
      workspaceResult
        .rows.length ===
      0
    ) {
      throw new InvitationAcceptanceError(
        'WORKSPACE_UNAVAILABLE',
        'This workspace is not currently available.',
      );
    }


    /* ==========================================================
       8. USER IDENTITY
       ========================================================== */

    const userResult =
      await controlClient.query<UserRow>(
        `
          SELECT
            id,
            email,
            status,

            email_verified,
            email_verified_at,

            deleted_at

          FROM users

          WHERE LOWER(
            email
          ) =
          $1

          LIMIT 1

          FOR UPDATE
        `,
        [
          email,
        ],
      );


    let userId:
      string;


    let accountCreated =
      false;


    if (
      userResult.rows.length >
      0
    ) {
      /* --------------------------------------------------------
         EXISTING SaMi ACCOUNT
         -------------------------------------------------------- */

      const existingUser =
        userResult.rows[0];


      if (
        existingUser.deleted_at
      ) {
        throw new InvitationAcceptanceError(
          'ACCOUNT_UNAVAILABLE',
          'The SaMi account associated with this email is unavailable.',
        );
      }


      if (
        !authenticatedUserId
      ) {
        throw new InvitationAcceptanceError(
          'SIGN_IN_REQUIRED',
          'Sign in with the invited SaMi account before accepting this invitation.',
        );
      }


      if (
        String(
          existingUser.id,
        ) !==
        authenticatedUserId
      ) {
        throw new InvitationAcceptanceError(
          'ACCOUNT_MISMATCH',
          'This invitation belongs to a different SaMi account.',
        );
      }


      if (
        String(
          existingUser.status ||
          '',
        )
          .trim()
          .toLowerCase() !==
        'active'
      ) {
        throw new InvitationAcceptanceError(
          'ACCOUNT_UNAVAILABLE',
          'The invited SaMi account is not active.',
        );
      }


      if (
        existingUser.email_verified !==
          true &&
        !existingUser
          .email_verified_at
      ) {
        throw new InvitationAcceptanceError(
          'EMAIL_VERIFICATION_REQUIRED',
          'Verify your SaMi email before accepting this invitation.',
        );
      }


      userId =
        String(
          existingUser.id,
        );
    } else {
      /* --------------------------------------------------------
         NEW SaMi ACCOUNT
         -------------------------------------------------------- */

      if (
        authenticatedUserId
      ) {
        throw new InvitationAcceptanceError(
          'ACCOUNT_MISMATCH',
          'Sign out of the current account before creating the invited SaMi account.',
        );
      }


      if (
        !registration
          .passwordHash
      ) {
        throw new InvitationAcceptanceError(
          'REGISTRATION_REQUIRED',
          'Create your SaMi account to accept this invitation.',
        );
      }


      /*
       * The secure invitation link was sent specifically to this
       * email and its token hash is bound to this invitation.
       *
       * Therefore the recipient cannot replace the invitation
       * email with another address.
       */
      const createdUser =
        await controlClient.query(
          `
            INSERT INTO users (
              email,
              password_hash,

              first_name,
              last_name,
              full_name,
              phone,

              status,

              email_verified,
              email_verified_at,

              created_at,
              updated_at
            )

            VALUES (
              $1,
              $2,

              $3,
              $4,
              $5,
              $6,

              'active',

              TRUE,
              NOW(),

              NOW(),
              NOW()
            )

            RETURNING id
          `,
          [
            email,

            registration
              .passwordHash,

            registration
              .firstName,

            registration
              .lastName,

            `${registration.firstName} ${registration.lastName}`,

            registration
              .phone,
          ],
        );


      if (
        createdUser.rows.length ===
        0
      ) {
        throw new InvitationAcceptanceError(
          'ACCEPTANCE_FAILED',
          'The SaMi account could not be created.',
        );
      }


      userId =
        String(
          createdUser
            .rows[0]
            .id,
        );


      accountCreated =
        true;
    }


    resultUserId =
      userId;


    /* ==========================================================
       9. INVITATION ROLES
       ========================================================== */

    const roleResult =
      await controlClient.query<RoleRow>(
        `
          SELECT
            wir.id
              AS invitation_role_id,

            r.id
              AS role_id,

            r.tenant_id,
            r.key,
            r.name,
            r.is_system,
            r.status,

            r.deleted_at
              AS role_deleted_at

          FROM workspace_invitation_roles wir

          LEFT JOIN roles r
            ON r.id =
               wir.role_id

          WHERE wir.invitation_id =
                $1

            AND wir.deleted_at
                IS NULL

          ORDER BY
            wir.created_at ASC,
            wir.id ASC
        `,
        [
          invitationId,
        ],
      );


    const roleIds:
      string[] =
      [];


    /*
     * Portal membership does not enter SaMi's internal workspace
     * authorization system.
     */
    if (
      memberType ===
        'portal' &&
      roleResult.rows.length >
        0
    ) {
      throw new InvitationAcceptanceError(
        'PORTAL_ROLE_NOT_ALLOWED',
        'Portal invitations cannot contain internal workspace roles.',
      );
    }


    for (
      const role
      of roleResult.rows
    ) {
      if (
        !role.role_id ||
        role.role_deleted_at ||
        String(
          role.status ||
          '',
        )
          .trim()
          .toLowerCase() !==
          'active'
      ) {
        throw new InvitationAcceptanceError(
          'ROLE_NOT_AVAILABLE',
          'One or more invitation roles are no longer available.',
        );
      }


      const validScope =
        (
          role.is_system ===
            true &&
          role.tenant_id ===
            null
        ) ||
        (
          role.is_system ===
            false &&
          String(
            role.tenant_id,
          ) ===
            tenantId
        );


      if (
        !validScope
      ) {
        throw new InvitationAcceptanceError(
          'ROLE_NOT_AVAILABLE',
          'One or more invitation roles do not belong to this workspace.',
        );
      }


      roleIds.push(
        String(
          role.role_id,
        ),
      );
    }


    if (
      memberType ===
        'internal' &&
      roleIds.length ===
        0
    ) {
      throw new InvitationAcceptanceError(
        'ROLE_REQUIRED',
        'This invitation no longer contains a valid workspace role.',
      );
    }


    /* ==========================================================
       10. INVITATION COMPANY ACCESS
       ========================================================== */

    const companyLinkResult =
      await controlClient.query<CompanyLinkRow>(
        `
          SELECT
            company_id,
            is_default

          FROM workspace_invitation_companies

          WHERE invitation_id =
                $1

            AND deleted_at
                IS NULL

          ORDER BY
            is_default DESC,
            created_at ASC,
            company_id ASC
        `,
        [
          invitationId,
        ],
      );


    if (
      companyLinkResult
        .rows.length ===
      0
    ) {
      throw new InvitationAcceptanceError(
        'COMPANY_REQUIRED',
        'This invitation does not contain company access.',
      );
    }


    const companyIds =
      companyLinkResult
        .rows
        .map(
          (
            row:
              CompanyLinkRow,
          ) =>
            String(
              row.company_id,
            ),
        );


    const defaultLinks =
      companyLinkResult
        .rows
        .filter(
          (
            row:
              CompanyLinkRow,
          ) =>
            row.is_default ===
            true,
        );


    if (
      defaultLinks.length !==
        1
    ) {
      throw new InvitationAcceptanceError(
        'DEFAULT_COMPANY_INVALID',
        'The invitation does not have a valid default company.',
      );
    }


    const defaultCompanyId =
      String(
        defaultLinks[0]
          .company_id,
      );


    /* ==========================================================
       11. MEMBERSHIP
       ========================================================== */

    const existingMembership =
      await controlClient.query<MembershipRow>(
        `
          SELECT
            id,
            status,
            member_type,
            is_owner,
            deleted_at

          FROM tenant_users

          WHERE tenant_id = $1
            AND user_id = $2

          LIMIT 1

          FOR UPDATE
        `,
        [
          tenantId,
          userId,
        ],
      );


    let membershipId:
      string;


    let membershipRestored =
      false;


    if (
      existingMembership
        .rows.length >
      0
    ) {
      const membership =
        existingMembership
          .rows[0];


      /*
       * A still-active membership means the person is already part
       * of this workspace. An invitation must never silently mutate
       * an existing member's current role/company access.
       */
      if (
        !membership.deleted_at
      ) {
        throw new InvitationAcceptanceError(
          'MEMBER_ALREADY_EXISTS',
          'This SaMi account already belongs to the workspace.',
        );
      }


      if (
        membership.is_owner ===
        true
      ) {
        throw new InvitationAcceptanceError(
          'MEMBER_ALREADY_EXISTS',
          'The workspace owner cannot be restored through an invitation.',
        );
      }


      const restored =
        await controlClient.query(
          `
            UPDATE tenant_users

            SET
              member_type =
                $3,

              status =
                'active',

              is_owner =
                FALSE,

              default_company_id =
                $4,

              invited_at =
                $5,

              joined_at =
                NOW(),

              suspended_at =
                NULL,

              suspended_by =
                NULL,

              suspension_reason =
                NULL,

              removed_by =
                NULL,

              removal_reason =
                NULL,

              deleted_at =
                NULL,

              updated_at =
                NOW()

            WHERE tenant_id = $1
              AND user_id = $2

            RETURNING id
          `,
          [
            tenantId,
            userId,

            memberType,
            defaultCompanyId,

            invitation.created_at,
          ],
        );


      if (
        restored.rows.length ===
        0
      ) {
        throw new InvitationAcceptanceError(
          'ACCEPTANCE_FAILED',
          'The previous workspace membership could not be restored.',
        );
      }


      membershipId =
        String(
          restored
            .rows[0]
            .id,
        );


      membershipRestored =
        true;
    } else {
      const createdMembership =
        await controlClient.query(
          `
            INSERT INTO tenant_users (
              tenant_id,
              user_id,

              member_type,
              status,

              is_owner,

              default_company_id,

              invited_at,
              joined_at,

              created_at,
              updated_at
            )

            VALUES (
              $1,
              $2,

              $3,
              'active',

              FALSE,

              $4,

              $5,
              NOW(),

              NOW(),
              NOW()
            )

            RETURNING id
          `,
          [
            tenantId,
            userId,

            memberType,

            defaultCompanyId,

            invitation.created_at,
          ],
        );


      if (
        createdMembership
          .rows.length ===
        0
      ) {
        throw new InvitationAcceptanceError(
          'ACCEPTANCE_FAILED',
          'The workspace membership could not be created.',
        );
      }


      membershipId =
        String(
          createdMembership
            .rows[0]
            .id,
        );
    }


    /* ==========================================================
       12. INITIAL ROLE ASSIGNMENTS
       ==========================================================

       Invitation roles become the authoritative initial role set.

       If a removed member is invited back, previous role
       assignments do NOT silently return.

       ========================================================== */

    await controlClient.query(
      `
        UPDATE user_roles

        SET
          deleted_at =
            NOW(),

          updated_at =
            NOW()

        WHERE tenant_id = $1
          AND user_id = $2

          AND deleted_at
              IS NULL
      `,
      [
        tenantId,
        userId,
      ],
    );


    if (
      memberType ===
        'internal'
    ) {
      for (
        const roleId
        of roleIds
      ) {
        await controlClient.query(
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
            tenantId,
            userId,
            roleId,
          ],
        );
      }
    }


    /* ==========================================================
       13. TENANT DATABASE CONNECTION
       ========================================================== */

    const tenantPool =
      await getTenantPoolByTenantId(
        tenantId,
      );


    tenantClient =
      await tenantPool.connect();


    /*
     * Capture a non-null local reference.
     *
     * This also gives TypeScript a stable PoolClient variable for
     * the remainder of this transaction.
     */
    const activeTenantClient:
      PoolClient =
      tenantClient;


    await activeTenantClient.query(
      'BEGIN',
    );


    /* ==========================================================
       14. VALIDATE COMPANIES
       ========================================================== */

    const companies =
      await activeTenantClient.query<ActiveCompanyRow>(
        `
          SELECT
            id

          FROM companies

          WHERE id =
                ANY(
                  $1::uuid[]
                )

            AND is_active =
                TRUE

            AND archived_at
                IS NULL

          ORDER BY id

          FOR UPDATE
        `,
        [
          companyIds,
        ],
      );


    const activeCompanyIds =
      new Set<string>(
        companies.rows.map(
          (
            row:
              ActiveCompanyRow,
          ) =>
            String(
              row.id,
            ),
        ),
      );


    if (
      activeCompanyIds.size !==
      companyIds.length
    ) {
      throw new InvitationAcceptanceError(
        'COMPANY_NOT_AVAILABLE',
        'One or more companies assigned to this invitation are no longer available.',
      );
    }


    if (
      !activeCompanyIds.has(
        defaultCompanyId,
      )
    ) {
      throw new InvitationAcceptanceError(
        'DEFAULT_COMPANY_INVALID',
        'The default company is no longer available.',
      );
    }


    /* ==========================================================
       15. SNAPSHOT CURRENT COMPANY ACCESS
       ========================================================== */

    const snapshotResult =
      await activeTenantClient.query<CompanyUserSnapshot>(
        `
          SELECT
            company_id,
            is_default,
            status,
            created_at,
            updated_at

          FROM company_users

          WHERE user_id = $1

          ORDER BY
            company_id

          FOR UPDATE
        `,
        [
          userId,
        ],
      );


    companySnapshot =
      snapshotResult.rows;


    /* ==========================================================
       16. REPLACE COMPANY ACCESS
       ========================================================== */

    await activeTenantClient.query(
      `
        DELETE FROM company_users

        WHERE user_id = $1
      `,
      [
        userId,
      ],
    );


    for (
      const companyId
      of companyIds
    ) {
      await activeTenantClient.query(
        `
          INSERT INTO company_users (
            company_id,
            user_id,

            is_default,
            status,

            created_at,
            updated_at
          )

          VALUES (
            $1,
            $2,

            $3,
            'active',

            NOW(),
            NOW()
          )
        `,
        [
          companyId,
          userId,

          companyId ===
            defaultCompanyId,
        ],
      );
    }


    await activeTenantClient.query(
      'COMMIT',
    );


    tenantCommitted =
      true;


    /* ==========================================================
       17. CONSUME INVITATION
       ========================================================== */

    const accepted =
      await controlClient.query(
        `
          UPDATE workspace_invitations

          SET
            status =
              'accepted',

            token_hash =
              $4,

            accepted_by =
              $3,

            accepted_at =
              NOW(),

            revoked_by =
              NULL,

            revoked_at =
              NULL,

            updated_at =
              NOW()

          WHERE tenant_id = $1
            AND id = $2

            AND status =
                'pending'

            AND token_hash =
                $5

            AND expires_at >
                NOW()

            AND deleted_at
                IS NULL

          RETURNING
            accepted_at
        `,
        [
          tenantId,
          invitationId,

          userId,

          createInvalidatedTokenHash(),

          tokenHash,
        ],
      );


    if (
      accepted.rows.length ===
      0
    ) {
      throw new InvitationAcceptanceError(
        'INVITATION_NOT_PENDING',
        'The invitation changed while it was being accepted.',
      );
    }


    const acceptedAt =
      toIso(
        accepted
          .rows[0]
          .accepted_at,
      );


    /* ==========================================================
       18. AUDIT
       ========================================================== */

    await insertAcceptanceAudit(
      controlClient,
      {
        tenantId,

        userId,

        invitationId,

        memberType,

        accountCreated,

        membershipRestored,

        roleIds,

        companyIds,

        audit:
          input.audit,
      },
    );


    /* ==========================================================
       19. FINAL RESULT
       ========================================================== */

    finalResult = {
      invitationId,

      tenantId,

      workspaceName:
        String(
          invitation
            .workspace_name ||
          'SaMi Workspace',
        ),

      userId,

      email,

      memberType,

      membershipId,

      roleIds,

      companyIds,

      defaultCompanyId,

      accountCreated,

      membershipRestored,

      acceptedAt,
    };


    /* ==========================================================
       20. CONTROL COMMIT
       ========================================================== */

    try {
      await controlClient.query(
        'COMMIT',
      );


      controlCommitted =
        true;
    } catch (
      commitError
    ) {
      /*
       * COMMIT may have reached PostgreSQL even if the connection
       * failed while receiving acknowledgement.
       */
      const committed =
        await acceptanceWasCommitted(
          invitationId,
          userId,
        );


      if (
        committed
      ) {
        controlCommitted =
          true;
      } else {
        throw commitError;
      }
    }


    if (
      !finalResult
    ) {
      throw new InvitationAcceptanceError(
        'ACCEPTANCE_FAILED',
        'SaMi could not complete this invitation.',
      );
    }


    return finalResult;
  } catch (
    error
  ) {
    /* ==========================================================
       TENANT ROLLBACK
       ========================================================== */

    if (
      tenantClient &&
      !tenantCommitted
    ) {
      try {
        await tenantClient.query(
          'ROLLBACK',
        );
      } catch {
        // Preserve the original acceptance error.
      }
    }


    /* ==========================================================
       CONTROL ROLLBACK
       ========================================================== */

    if (
      !controlCommitted
    ) {
      try {
        await controlClient.query(
          'ROLLBACK',
        );
      } catch {
        // Preserve the original acceptance error.
      }
    }


    /* ==========================================================
       CROSS-DATABASE COMPENSATION
       ========================================================== */

    if (
      tenantCommitted &&
      !controlCommitted &&
      tenantId &&
      resultUserId
    ) {
      await restoreCompanyAccessSnapshot(
        tenantId,
        resultUserId,
        companySnapshot,
      );
    }


    /* ==========================================================
       EXPECTED SERVICE ERRORS
       ========================================================== */

    if (
      error instanceof
        InvitationAcceptanceError
    ) {
      throw error;
    }


    /* ==========================================================
       DATABASE CONFLICT
       ========================================================== */

    const databaseError =
      error as {
        code?:
          string;
      };


    if (
      databaseError.code ===
        '23505'
    ) {
      throw new InvitationAcceptanceError(
        'MEMBER_ALREADY_EXISTS',
        'This invitation could not be accepted because the account or membership now already exists.',
      );
    }


    console.error(
      '[SaMi] Invitation acceptance failed:',
      error,
    );


    throw new InvitationAcceptanceError(
      'ACCEPTANCE_FAILED',
      'SaMi could not accept this invitation.',
    );
  } finally {
    /* ==========================================================
       RELEASE CONNECTIONS
       ========================================================== */

    if (
      tenantClient
    ) {
      tenantClient.release();
    }


    controlClient.release();
  }
}