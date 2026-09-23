import 'server-only';

import crypto from 'crypto';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  hashAdminPassword,
  isValidAdminEmail,
  normalizeAdminEmail,
} from '@/lib/auth/admin-auth';

import type {
  PlatformAdminRole,
} from '@/lib/auth/admin-session';

import {
  hasAdminCapability,
} from '@/lib/admin/capabilities';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

import {
  requestAdminEmailVerification,
} from '@/lib/auth/admin-email-verification';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_NAME_LENGTH =
  120;

const MAX_EMAIL_LENGTH =
  254;

const BOOTSTRAP_PASSWORD_RANDOM_BYTES =
  48;

const PLATFORM_ADMIN_ROLES =
  new Set<PlatformAdminRole>([
    'super_admin',
    'security_admin',
    'support_admin',
    'billing_admin',
    'operations_admin',
    'developer_admin',
    'read_only_admin',
  ]);

/* ============================================================
   TYPES
   ============================================================ */

export type ProvisionPlatformAdminInput = {
  request:
    NextRequest;

  actorAdminId:
    string;

  actorRole:
    PlatformAdminRole;

  firstName:
    unknown;

  lastName:
    unknown;

  email:
    unknown;

  role:
    unknown;
};

export type ProvisionedPlatformAdmin = {
  id:
    string;

  firstName:
    string;

  lastName:
    string;

  fullName:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  status:
    'invited';

  emailVerified:
    false;

  twoFactorRequired:
    true;

  twoFactorEnabled:
    false;

  createdAt:
    string;
};

export type ProvisionPlatformAdminResult =
  | {
      success:
        true;

      code:
        | 'ADMIN_PROVISIONED'
        | 'ADMIN_PROVISIONED_VERIFICATION_PENDING';

      message:
        string;

      admin:
        ProvisionedPlatformAdmin;

      verificationSent:
        boolean;

      verificationCooldown:
        boolean;

      retryAfterSeconds:
        number | null;
    }
  | {
      success:
        false;

      code:
        | 'FORBIDDEN'
        | 'INVALID_FIRST_NAME'
        | 'INVALID_LAST_NAME'
        | 'INVALID_EMAIL'
        | 'INVALID_ROLE'
        | 'ADMIN_ALREADY_EXISTS'
        | 'PROVISIONING_FAILED';

      message:
        string;
    };

type ExistingAdminRow = {
  id:
    string;

  email:
    string;

  status:
    string;

  deleted_at:
    Date | string | null;
};

type InsertedAdminRow = {
  id:
    string;

  first_name:
    string;

  last_name:
    string;

  email:
    string;

  role:
    PlatformAdminRole;

  status:
    'invited';

  email_verified:
    boolean;

  two_factor_required:
    boolean;

  two_factor_enabled:
    boolean;

  created_at:
    Date | string;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeName(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .replace(
      /\s+/g,
      ' '
    );
}

function normalizeRole(
  value:
    unknown
): PlatformAdminRole | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase() as
      PlatformAdminRole;

  if (
    !PLATFORM_ADMIN_ROLES.has(
      normalized
    )
  ) {
    return null;
  }

  return normalized;
}

/* ============================================================
   VALIDATION
   ============================================================ */

function isValidName(
  value:
    string
): boolean {
  if (
    !value ||
    value.length >
      MAX_NAME_LENGTH
  ) {
    return false;
  }

  /*
   * Reject control characters.
   *
   * Ordinary Unicode names remain supported.
   */
  return !/[\u0000-\u001F\u007F]/.test(
    value
  );
}

function isValidActorId(
  value:
    string
): boolean {
  return (
    typeof value ===
      'string' &&
    value.length >
      0 &&
    value.length <=
      128
  );
}

/* ============================================================
   SECURE PLACEHOLDER PASSWORD

   Invited administrators must NEVER receive or know this value.

   Its only purpose is satisfying the non-null password_hash
   requirement until the verified administrator securely chooses
   their own password during identity completion.
   ============================================================ */

function generateUnusableBootstrapPassword():
  string {
  const randomPart =
    crypto
      .randomBytes(
        BOOTSTRAP_PASSWORD_RANDOM_BYTES
      )
      .toString(
        'base64url'
      );

  /*
   * Guaranteed to satisfy the authoritative admin password
   * policy:
   * - uppercase
   * - lowercase
   * - number
   * - symbol
   * - no whitespace
   * - > 12 characters
   */
  return `SaMi-Aa1!-${randomPart}`;
}

/* ============================================================
   SAFE DATE
   ============================================================ */

function toIsoString(
  value:
    Date | string
): string {
  const date =
    value instanceof
      Date
      ? value
      : new Date(
          value
        );

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return new Date()
      .toISOString();
  }

  return date.toISOString();
}

/* ============================================================
   SAFE ADMIN RESULT
   ============================================================ */

function mapProvisionedAdmin(
  row:
    InsertedAdminRow
): ProvisionedPlatformAdmin {
  const firstName =
    row.first_name ||
    '';

  const lastName =
    row.last_name ||
    '';

  return {
    id:
      row.id,

    firstName,

    lastName,

    fullName:
      `${firstName} ${lastName}`
        .trim(),

    email:
      row.email,

    role:
      row.role,

    status:
      'invited',

    emailVerified:
      false,

    twoFactorRequired:
      true,

    twoFactorEnabled:
      false,

    createdAt:
      toIsoString(
        row.created_at
      ),
  };
}

/* ============================================================
   AUDIT

   Audit failure must never destroy or roll back the identity
   operation itself.
   ============================================================ */

async function safeRecordAdminAudit(
  input:
    Parameters<
      typeof recordAdminAuditEvent
    >[0]
): Promise<void> {
  try {
    await recordAdminAuditEvent(
      input
    );
  } catch (
    error
  ) {
    console.error(
      '[Admin Provisioning] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   DATABASE ERROR
   ============================================================ */

function getDatabaseErrorCode(
  error:
    unknown
): string | null {
  if (
    !error ||
    typeof error !==
      'object'
  ) {
    return null;
  }

  const code =
    (
      error as {
        code?:
          unknown;
      }
    ).code;

  return typeof code ===
    'string'
    ? code
    : null;
}

/* ============================================================
   EXISTING ADMIN

   We check before INSERT for useful behavior, but this is NOT
   relied on for race safety.

   The database unique constraint remains the real protection
   against concurrent duplicate provisioning.
   ============================================================ */

async function findExistingAdmin(
  email:
    string
): Promise<
  ExistingAdminRow | null
> {
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          status,
          deleted_at

        FROM
          platform_admins

        WHERE
          LOWER(email) = $1

        LIMIT 1
      `,
      [
        email,
      ]
    );

  return (
    result.rows[0] as
      | ExistingAdminRow
      | undefined
  ) || null;
}

/* ============================================================
   ACTOR VALIDATION

   Category 1 intentionally allows provisioning only from a
   super_admin.

   Fine-grained administrator permissions belong to Category 8.
   ============================================================ */

async function validateProvisioningActor(
  actorAdminId:
    string,
  actorRole:
    PlatformAdminRole
): Promise<
  boolean
> {
  if (
    !isValidActorId(
      actorAdminId
    ) ||
    !hasAdminCapability(
      actorRole,
      'administrators.manage',
    )
  ) {
    return false;
  }

  /*
   * Do not trust the session role argument alone.
   * Re-read the administrator record and apply the same canonical
   * capability map used by the route and navigation layers.
   */
  const result =
    await queryControl(
      `
        SELECT
          role,
          status,
          email_verified

        FROM
          platform_admins

        WHERE
          id = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        actorAdminId,
      ]
    );

  const row =
    result.rows[0];

  if (
    !row ||
    String(
      row.status ||
      '',
    )
      .trim()
      .toLowerCase() !==
      'active' ||
    row.email_verified !==
      true
  ) {
    return false;
  }

  return hasAdminCapability(
    String(
      row.role ||
      '',
    ) as
      PlatformAdminRole,
    'administrators.manage',
  );
}

/* ============================================================
   INSERT INVITED ADMIN
   ============================================================ */

async function createInvitedAdmin(
  input: {
    actorAdminId:
      string;

    firstName:
      string;

    lastName:
      string;

    email:
      string;

    role:
      PlatformAdminRole;

    passwordHash:
      string;
  }
): Promise<
  InsertedAdminRow
> {
  const result =
    await queryControl(
      `
        INSERT INTO
          platform_admins (
            first_name,
            last_name,
            email,
            password_hash,
            role,
            status,

            email_verified,
            email_verified_at,

            two_factor_required,
            two_factor_enabled,

            failed_login_attempts,
            locked_until,

            password_changed_at,

            created_by,
            updated_by,

            created_at,
            updated_at
          )

        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          'invited',

          FALSE,
          NULL,

          TRUE,
          FALSE,

          0,
          NULL,

          NOW(),

          $6,
          $6,

          NOW(),
          NOW()
        )

        RETURNING
          id,
          first_name,
          last_name,
          email,
          role,
          status,
          email_verified,
          two_factor_required,
          two_factor_enabled,
          created_at
      `,
      [
        input.firstName,
        input.lastName,
        input.email,
        input.passwordHash,
        input.role,
        input.actorAdminId,
      ]
    );

  const row =
    result.rows[0] as
      | InsertedAdminRow
      | undefined;

  if (
    !row?.id
  ) {
    throw new Error(
      'PLATFORM_ADMIN_NOT_CREATED'
    );
  }

  return row;
}

/* ============================================================
   PROVISION PLATFORM ADMINISTRATOR
   ============================================================ */

export async function provisionPlatformAdmin(
  input:
    ProvisionPlatformAdminInput
): Promise<
  ProvisionPlatformAdminResult
> {
  const firstName =
    normalizeName(
      input.firstName
    );

  const lastName =
    normalizeName(
      input.lastName
    );

  const email =
    normalizeAdminEmail(
      input.email
    );

  const role =
    normalizeRole(
      input.role
    );

  /* ==========================================================
     1. BASIC INPUT VALIDATION
     ========================================================== */

  if (
    !isValidName(
      firstName
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_FIRST_NAME',

      message:
        `First name is required and must not exceed ${MAX_NAME_LENGTH} characters.`,
    };
  }

  if (
    !isValidName(
      lastName
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_LAST_NAME',

      message:
        `Last name is required and must not exceed ${MAX_NAME_LENGTH} characters.`,
    };
  }

  if (
    !email ||
    email.length >
      MAX_EMAIL_LENGTH ||
    !isValidAdminEmail(
      email
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_EMAIL',

      message:
        'Enter a valid administrator email address.',
    };
  }

  if (
    !role
  ) {
    return {
      success:
        false,

      code:
        'INVALID_ROLE',

      message:
        'Select a valid Platform Administrator role.',
    };
  }

  /* ==========================================================
     2. AUTHORIZATION

     Never rely only on the browser or route-level authorization.
     ========================================================== */

  const actorAuthorized =
    await validateProvisioningActor(
      input.actorAdminId,
      input.actorRole
    );

  if (
    !actorAuthorized
  ) {
    await safeRecordAdminAudit({
      request:
        input.request,

      adminId:
        input.actorAdminId ||
        undefined,

      eventType:
        'admin.identity.provision_denied',

      action:
        'provision_platform_admin',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'actor_not_authorized',

      metadata: {
        requestedRole:
          role,

        requestedEmail:
          email,
      },
    });

    return {
      success:
        false,

      code:
        'FORBIDDEN',

      message:
        'You do not have permission to provision Platform Administrators.',
    };
  }

  /* ==========================================================
     3. EXISTING IDENTITY

     This provides clean behavior.

     Race safety still comes from the database unique constraint.
     ========================================================== */

  const existing =
    await findExistingAdmin(
      email
    );

  if (
    existing
  ) {
    await safeRecordAdminAudit({
      request:
        input.request,

      adminId:
        input.actorAdminId,

      eventType:
        'admin.identity.provision_duplicate',

      action:
        'provision_platform_admin',

      targetType:
        'platform_admin',

      targetId:
        existing.id,

      successful:
        false,

      failureReason:
        existing.deleted_at
          ? 'email_previously_used'
          : 'administrator_already_exists',

      metadata: {
        email,

        existingStatus:
          existing.status,

        requestedRole:
          role,
      },
    });

    return {
      success:
        false,

      code:
        'ADMIN_ALREADY_EXISTS',

      message:
        existing.deleted_at
          ? 'An administrator identity previously associated with this email already exists. Review the existing administrator record instead of creating another.'
          : existing.status ===
              'invited'
            ? 'This administrator has already been invited. Use resend verification instead of creating another account.'
            : 'A Platform Administrator with this email already exists.',
    };
  }

  /* ==========================================================
     4. CREATE UNUSABLE PLACEHOLDER CREDENTIAL

     No temporary password is emailed, logged or returned.
     ========================================================== */

  const bootstrapPassword =
    generateUnusableBootstrapPassword();

  let passwordHash:
    string;

  try {
    passwordHash =
      await hashAdminPassword(
        bootstrapPassword
      );
  } finally {
    /*
     * JavaScript strings cannot be reliably zeroized, but we
     * deliberately retain no reference beyond this scope and
     * never log or return the plaintext bootstrap credential.
     */
  }

  /* ==========================================================
     5. INSERT IDENTITY
     ========================================================== */

  let inserted:
    InsertedAdminRow;

  try {
    inserted =
      await createInvitedAdmin({
        actorAdminId:
          input.actorAdminId,

        firstName,

        lastName,

        email,

        role,

        passwordHash,
      });
  } catch (
    error
  ) {
    const databaseCode =
      getDatabaseErrorCode(
        error
      );

    /*
     * PostgreSQL unique_violation.
     *
     * This handles concurrent requests safely even if both passed
     * our earlier existence check.
     */
    if (
      databaseCode ===
      '23505'
    ) {
      await safeRecordAdminAudit({
        request:
          input.request,

        adminId:
          input.actorAdminId,

        eventType:
          'admin.identity.provision_duplicate',

        action:
          'provision_platform_admin',

        targetType:
          'platform_admin',

        successful:
          false,

        failureReason:
          'administrator_already_exists_race',

        metadata: {
          email,
          requestedRole:
            role,
        },
      });

      return {
        success:
          false,

        code:
          'ADMIN_ALREADY_EXISTS',

        message:
          'A Platform Administrator with this email already exists.',
      };
    }

    console.error(
      '[Admin Provisioning] Administrator creation failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown database error'
    );

    await safeRecordAdminAudit({
      request:
        input.request,

      adminId:
        input.actorAdminId,

      eventType:
        'admin.identity.provision_failed',

      action:
        'provision_platform_admin',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'administrator_creation_failed',

      metadata: {
        requestedRole:
          role,
      },
    });

    return {
      success:
        false,

      code:
        'PROVISIONING_FAILED',

      message:
        'SaMi could not provision the administrator account.',
    };
  }

  const safeAdmin =
    mapProvisionedAdmin(
      inserted
    );

  /* ==========================================================
     6. RECORD IDENTITY CREATION

     Identity creation succeeded regardless of email delivery.
     ========================================================== */

  await safeRecordAdminAudit({
    request:
      input.request,

    adminId:
      input.actorAdminId,

    eventType:
      'admin.identity.provisioned',

    action:
      'provision_platform_admin',

    targetType:
      'platform_admin',

    targetId:
      inserted.id,

    successful:
      true,

    metadata: {
      email:
        inserted.email,

      role:
        inserted.role,

      status:
        inserted.status,

      emailVerified:
        false,

      twoFactorRequired:
        true,
    },
  });

  /* ==========================================================
     7. SEND VERIFICATION

     IMPORTANT:

     Do NOT delete the administrator if email delivery fails.

     The workspace registration architecture preserves valid
     identities when mail delivery temporarily fails. Platform
     Admin follows that same recoverable pattern.

     A super admin or the invited administrator may safely issue
     another verification request later.
     ========================================================== */

  try {
    const verification =
      await requestAdminEmailVerification({
        request:
          input.request,

        adminId:
          inserted.id,

        email:
          inserted.email,

        purpose:
          'admin_provisioning',
      });

    if (
      verification.sent
    ) {
      return {
        success:
          true,

        code:
          'ADMIN_PROVISIONED',

        message:
          'Administrator provisioned and verification instructions sent.',

        admin:
          safeAdmin,

        verificationSent:
          true,

        verificationCooldown:
          false,

        retryAfterSeconds:
          null,
      };
    }

    /*
     * A cooldown means a valid verification challenge already
     * exists. This is not a provisioning failure.
     */
    if (
      verification.cooldown
    ) {
      return {
        success:
          true,

        code:
          'ADMIN_PROVISIONED_VERIFICATION_PENDING',

        message:
          'Administrator provisioned. A verification challenge is already active.',

        admin:
          safeAdmin,

        verificationSent:
          false,

        verificationCooldown:
          true,

        retryAfterSeconds:
          verification.retryAfterSeconds,
      };
    }

    /*
     * Delivery could not be confirmed.
     *
     * Preserve the administrator identity.
     *
     * Do not tell the caller to blindly retry provisioning,
     * because doing so would hit the existing identity and could
     * create confusing behavior.
     */
    return {
      success:
        true,

      code:
        'ADMIN_PROVISIONED_VERIFICATION_PENDING',

      message:
        'Administrator provisioned, but SaMi could not confirm verification-email delivery. Use resend verification from the administrator management screen.',

      admin:
        safeAdmin,

      verificationSent:
        false,

      verificationCooldown:
        false,

      retryAfterSeconds:
        verification.retryAfterSeconds,
    };
  } catch (
    error
  ) {
    /*
     * Email infrastructure is a separate failure domain from
     * identity creation.
     *
     * Never delete a successfully-created administrator because
     * SMTP, DNS, provider or network delivery failed.
     */
    console.error(
      '[Admin Provisioning] Verification delivery could not be completed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown verification error'
    );

    await safeRecordAdminAudit({
      request:
        input.request,

      adminId:
        input.actorAdminId,

      eventType:
        'admin.identity.verification_pending',

      action:
        'provision_platform_admin',

      targetType:
        'platform_admin',

      targetId:
        inserted.id,

      successful:
        true,

      metadata: {
        email:
          inserted.email,

        role:
          inserted.role,

        identityCreated:
          true,

        verificationDeliveryConfirmed:
          false,
      },
    });

    return {
      success:
        true,

      code:
        'ADMIN_PROVISIONED_VERIFICATION_PENDING',

      message:
        'Administrator provisioned, but verification delivery could not be confirmed. Use resend verification instead of creating another administrator.',

      admin:
        safeAdmin,

      verificationSent:
        false,

      verificationCooldown:
        false,

      retryAfterSeconds:
        null,
    };
  }
}