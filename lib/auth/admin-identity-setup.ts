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
  isValidAdminPassword,
} from '@/lib/auth/admin-auth';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getAdminRequestIp,
} from '@/lib/auth/admin-session';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

/* ============================================================
   CONSTANTS
   ============================================================ */

const SETUP_TOKEN_BYTES =
  48;

const SETUP_TOKEN_EXPIRY_MINUTES =
  30;

const MIN_SETUP_TOKEN_LENGTH =
  40;

const MAX_SETUP_TOKEN_LENGTH =
  512;

const COMPLETE_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const COMPLETE_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const COMPLETE_RATE_LIMIT_BLOCK_MS =
  30 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

export type AdminIdentitySetupTokenResult = {
  token:
    string;

  expiresAt:
    Date;
};

export type CompleteAdminIdentityInput = {
  request:
    NextRequest;

  token:
    unknown;

  password:
    unknown;

  confirmPassword:
    unknown;
};

export type CompleteAdminIdentityResult =
  | {
      success:
        true;

      code:
        'ADMIN_IDENTITY_COMPLETED';

      admin: {
        id:
          string;

        email:
          string;

        firstName:
          string;

        lastName:
          string;

        fullName:
          string;

        role:
          string;

        status:
          'active';

        emailVerified:
          true;

        twoFactorRequired:
          true;

        twoFactorEnabled:
          boolean;
      };

      next:
        string;
    }
  | {
      success:
        false;

      code:
        | 'INVALID_TOKEN'
        | 'INVALID_PASSWORD'
        | 'PASSWORD_MISMATCH'
        | 'SETUP_TOKEN_INVALID'
        | 'SETUP_RATE_LIMITED'
        | 'ADMIN_NOT_ELIGIBLE'
        | 'SETUP_COMPLETION_FAILED';

      error:
        string;

      retryAfterSeconds?:
        number | null;
    };

type ActivatedAdminRow = {
  id:
    string;

  email:
    string;

  first_name:
    string;

  last_name:
    string;

  role:
    string;

  status:
    'active';

  email_verified:
    boolean;

  two_factor_required:
    boolean;

  two_factor_enabled:
    boolean;
};

/* ============================================================
   TOKEN
   ============================================================ */

function generateSetupToken():
  string {
  return crypto
    .randomBytes(
      SETUP_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

function normalizeSetupToken(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

function isValidSetupToken(
  token:
    string
): boolean {
  return (
    token.length >=
      MIN_SETUP_TOKEN_LENGTH &&
    token.length <=
      MAX_SETUP_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(
      token
    )
  );
}

function hashSetupToken(
  token:
    string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      token,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   PASSWORD
   ============================================================ */

function normalizePassword(
  value:
    unknown
): string {
  /*
   * Never trim passwords.
   *
   * Admin whitespace restrictions belong to the single
   * authoritative policy in admin-auth.ts.
   */
  return typeof value ===
    'string'
    ? value
    : '';
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getRequestIp(
  request:
    NextRequest
): string {
  return (
    getAdminRequestIp(
      request
    ) ||
    'unknown-ip'
  );
}

function getSetupRateLimitIdentifier(
  request:
    NextRequest,
  tokenHash:
    string
): string {
  /*
   * Never put the raw setup token into auth_rate_limits.
   *
   * A shortened SHA-256 fingerprint is enough to separate
   * challenges without persisting the credential itself.
   */
  const fingerprint =
    tokenHash.slice(
      0,
      24
    );

  return [
    'admin-identity-setup',
    fingerprint,
    getRequestIp(
      request
    ),
  ].join(
    ':'
  );
}

/* ============================================================
   AUDIT
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
    /*
     * Audit storage failure must not undo a successful credential
     * operation.
     */
    console.error(
      '[Admin Identity Setup] Audit event failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   ISSUE IDENTITY SETUP TOKEN

   Called only after administrator email ownership has been
   established.

   Eligible identity:
   - exists
   - not deleted
   - status = invited
   - email_verified = TRUE

   Creating a new setup token atomically invalidates every
   previous unused token for this administrator.
   ============================================================ */

export async function issueAdminIdentitySetupToken(
  input: {
    adminId:
      string;

    email:
      string;
  }
): Promise<
  AdminIdentitySetupTokenResult
> {
  if (
    !input.adminId ||
    typeof input.adminId !==
      'string' ||
    !input.email ||
    typeof input.email !==
      'string'
  ) {
    throw new Error(
      'ADMIN_NOT_ELIGIBLE_FOR_IDENTITY_SETUP'
    );
  }

  const token =
    generateSetupToken();

  const tokenHash =
    hashSetupToken(
      token
    );

  const expiresAt =
    new Date(
      Date.now() +
        SETUP_TOKEN_EXPIRY_MINUTES *
          60 *
          1000
    );

  /*
   * One SQL statement means:
   *
   * - eligibility check
   * - previous token invalidation
   * - new token insertion
   *
   * form one atomic database transition.
   *
   * The partial unique index is an additional hard guarantee.
   */
  const result =
    await queryControl(
      `
        WITH eligible_admin AS (
          SELECT
            a.id

          FROM
            platform_admins a

          WHERE
            a.id = $1
            AND LOWER(a.email) =
              LOWER($2)
            AND a.status =
              'invited'
            AND a.email_verified =
              TRUE
            AND a.deleted_at
              IS NULL

          LIMIT 1
        ),

        invalidated_tokens AS (
          UPDATE
            platform_admin_identity_setup_tokens t

          SET
            deleted_at =
              COALESCE(
                t.deleted_at,
                NOW()
              )

          WHERE
            t.admin_id IN (
              SELECT id
              FROM eligible_admin
            )

            AND t.used_at
              IS NULL
            AND t.deleted_at
              IS NULL

          RETURNING
            t.id
        ),

        inserted_token AS (
          INSERT INTO
            platform_admin_identity_setup_tokens (
              admin_id,
              token_hash,
              expires_at,
              created_at
            )

          SELECT
            id,
            $3,
            $4,
            NOW()

          FROM
            eligible_admin

          RETURNING
            id
        )

        SELECT
          id

        FROM
          inserted_token
      `,
      [
        input.adminId,
        input.email,
        tokenHash,
        expiresAt,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    throw new Error(
      'ADMIN_NOT_ELIGIBLE_FOR_IDENTITY_SETUP'
    );
  }

  return {
    token,
    expiresAt,
  };
}

/* ============================================================
   COMPLETE IDENTITY

   Security transition:

   setup token
       ↓
   rate limit
       ↓
   password policy
       ↓
   consume setup token
       ↓
   invited → active
       ↓
   replace placeholder password
       ↓
   require 2FA
       ↓
   revoke any stale admin sessions
       ↓
   invalidate login challenges
       ↓
   invalidate password reset tokens
       ↓
   invalidate verification codes
       ↓
   invalidate every other setup token

   The DB state transition is performed by one SQL statement.
   ============================================================ */

export async function completeAdminIdentity(
  input:
    CompleteAdminIdentityInput
): Promise<
  CompleteAdminIdentityResult
> {
  const token =
    normalizeSetupToken(
      input.token
    );

  const password =
    normalizePassword(
      input.password
    );

  const confirmPassword =
    normalizePassword(
      input.confirmPassword
    );

  /* ==========================================================
     1. TOKEN FORMAT
     ========================================================== */

  if (
    !token ||
    !isValidSetupToken(
      token
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_TOKEN',

      error:
        'This administrator setup link is invalid or has expired.',
    };
  }

  const tokenHash =
    hashSetupToken(
      token
    );

  /* ==========================================================
     2. RATE LIMIT

     Public setup endpoint:
     token fingerprint + client IP.
     ========================================================== */

  const rateLimitIdentifier =
    getSetupRateLimitIdentifier(
      input.request,
      tokenHash
    );

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateLimitIdentifier,

      action:
        'admin-identity-setup-complete',

      maxAttempts:
        COMPLETE_RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        COMPLETE_RATE_LIMIT_WINDOW_MS,

      blockMs:
        COMPLETE_RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAdminAudit({
      request:
        input.request,

      eventType:
        'admin.identity_setup.rate_limited',

      action:
        'complete_platform_admin_identity',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'rate_limited',

      metadata: {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return {
      success:
        false,

      code:
        'SETUP_RATE_LIMITED',

      error:
        'Too many administrator setup attempts. Please wait before trying again.',

      retryAfterSeconds:
        rateLimit.retryAfterSeconds,
    };
  }

  /* ==========================================================
     3. PASSWORD
     ========================================================== */

  if (
    !password ||
    !isValidAdminPassword(
      password
    )
  ) {
    return {
      success:
        false,

      code:
        'INVALID_PASSWORD',

      error:
        'Use 12–128 characters with uppercase, lowercase, a number and a symbol. Administrator passwords cannot contain whitespace.',
    };
  }

  if (
    !confirmPassword ||
    password !==
      confirmPassword
  ) {
    return {
      success:
        false,

      code:
        'PASSWORD_MISMATCH',

      error:
        'The passwords do not match.',
    };
  }

  /* ==========================================================
     4. HASH NEW PASSWORD

     Do this BEFORE consuming the setup token.

     If crypto fails, the administrator does not lose the valid
     setup challenge.
     ========================================================== */

  let passwordHash:
    string;

  try {
    passwordHash =
      await hashAdminPassword(
        password
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin Identity Setup] Password hashing failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown hashing error'
    );

    return {
      success:
        false,

      code:
        'SETUP_COMPLETION_FAILED',

      error:
        'SaMi could not complete administrator setup.',
    };
  }

  /* ==========================================================
     5. ATOMIC IDENTITY ACTIVATION

     Only ONE request can consume the setup token because:
     - token_hash is unique
     - used_at must still be NULL
     - UPDATE consumes it atomically
     ========================================================== */

  let result;

  try {
    result =
      await queryControl(
        `
          WITH consumed_token AS (
            UPDATE
              platform_admin_identity_setup_tokens t

            SET
              used_at = NOW()

            FROM
              platform_admins a

            WHERE
              t.admin_id =
                a.id

              AND t.token_hash =
                $1

              AND t.used_at
                IS NULL

              AND t.deleted_at
                IS NULL

              AND t.expires_at >
                NOW()

              AND a.deleted_at
                IS NULL

              AND a.status =
                'invited'

              AND a.email_verified =
                TRUE

            RETURNING
              t.id AS token_id,
              t.admin_id
          ),

          activated_admin AS (
            UPDATE
              platform_admins a

            SET
              password_hash =
                $2,

              password_changed_at =
                NOW(),

              status =
                'active',

              failed_login_attempts =
                0,

              locked_until =
                NULL,

              two_factor_required =
                TRUE,

              /*
               * New administrator identities must pass through
               * fresh 2FA setup.
               */
              two_factor_enabled =
                FALSE,

              updated_at =
                NOW()

            FROM
              consumed_token ct

            WHERE
              a.id =
                ct.admin_id

              AND a.status =
                'invited'

              AND a.email_verified =
                TRUE

              AND a.deleted_at
                IS NULL

            RETURNING
              a.id,
              a.email,
              a.first_name,
              a.last_name,
              a.role,
              a.status,
              a.email_verified,
              a.two_factor_required,
              a.two_factor_enabled
          ),

          revoked_sessions AS (
            UPDATE
              platform_admin_sessions s

            SET
              revoked_at =
                COALESCE(
                  s.revoked_at,
                  NOW()
                ),

              revocation_reason =
                COALESCE(
                  s.revocation_reason,
                  'identity_setup_completed'
                )

            WHERE
              s.admin_id IN (
                SELECT id
                FROM activated_admin
              )

              AND s.revoked_at
                IS NULL

            RETURNING
              s.id
          ),

          invalidated_login_challenges AS (
            UPDATE
              platform_admin_login_challenges c

            SET
              used_at =
                COALESCE(
                  c.used_at,
                  NOW()
                )

            WHERE
              c.admin_id IN (
                SELECT id
                FROM activated_admin
              )

              AND c.used_at
                IS NULL

            RETURNING
              c.id
          ),

          invalidated_reset_tokens AS (
            UPDATE
              platform_admin_password_reset_tokens p

            SET
              deleted_at =
                COALESCE(
                  p.deleted_at,
                  NOW()
                )

            WHERE
              p.admin_id IN (
                SELECT id
                FROM activated_admin
              )

              AND p.used_at
                IS NULL

              AND p.deleted_at
                IS NULL

            RETURNING
              p.id
          ),

          invalidated_verification_codes AS (
            UPDATE
              platform_admin_email_verifications v

            SET
              deleted_at =
                COALESCE(
                  v.deleted_at,
                  NOW()
                )

            WHERE
              v.admin_id IN (
                SELECT id
                FROM activated_admin
              )

              AND v.used_at
                IS NULL

              AND v.deleted_at
                IS NULL

            RETURNING
              v.id
          ),

          invalidated_setup_tokens AS (
            UPDATE
              platform_admin_identity_setup_tokens t

            SET
              deleted_at =
                COALESCE(
                  t.deleted_at,
                  NOW()
                )

            WHERE
              t.admin_id IN (
                SELECT id
                FROM activated_admin
              )

              AND t.used_at
                IS NULL

              AND t.deleted_at
                IS NULL

            RETURNING
              t.id
          )

          SELECT
            id,
            email,
            first_name,
            last_name,
            role,
            status,
            email_verified,
            two_factor_required,
            two_factor_enabled

          FROM
            activated_admin
        `,
        [
          tokenHash,
          passwordHash,
        ]
      );
  } catch (
    error
  ) {
    console.error(
      '[Admin Identity Setup] Atomic activation failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown database error'
    );

    await safeRecordAdminAudit({
      request:
        input.request,

      eventType:
        'admin.identity_setup.failed',

      action:
        'complete_platform_admin_identity',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'database_transition_failed',
    });

    return {
      success:
        false,

      code:
        'SETUP_COMPLETION_FAILED',

      error:
        'SaMi could not complete administrator setup.',
    };
  }

  /* ==========================================================
     6. INVALID / EXPIRED / REPLAYED TOKEN
     ========================================================== */

  if (
    result.rows.length ===
    0
  ) {
    await safeRecordAdminAudit({
      request:
        input.request,

      eventType:
        'admin.identity_setup.invalid_token',

      action:
        'complete_platform_admin_identity',

      targetType:
        'platform_admin',

      successful:
        false,

      failureReason:
        'invalid_expired_or_consumed_setup_token',
    });

    return {
      success:
        false,

      code:
        'SETUP_TOKEN_INVALID',

      error:
        'This administrator setup link is invalid or has expired.',
    };
  }

  const activated =
    result.rows[0] as
      ActivatedAdminRow;

  /* ==========================================================
     7. RESET RATE LIMIT AFTER SUCCESS
     ========================================================== */

  try {
    await resetRateLimit(
      rateLimitIdentifier,
      'admin-identity-setup-complete'
    );
  } catch (
    error
  ) {
    /*
     * Successful identity activation must not be reversed because
     * rate-limit cleanup failed.
     */
    console.error(
      '[Admin Identity Setup] Failed to reset rate limit:',
      error instanceof
        Error
        ? error.message
        : 'Unknown rate-limit cleanup error'
    );
  }

  /* ==========================================================
     8. AUDIT SUCCESS
     ========================================================== */

  await safeRecordAdminAudit({
    request:
      input.request,

    adminId:
      activated.id,

    eventType:
      'admin.identity.completed',

    action:
      'complete_platform_admin_identity',

    targetType:
      'platform_admin',

    targetId:
      activated.id,

    successful:
      true,

    metadata: {
      role:
        activated.role,

      emailVerified:
        true,

      twoFactorRequired:
        true,

      sessionsRevoked:
        true,

      loginChallengesInvalidated:
        true,

      passwordResetTokensInvalidated:
        true,

      verificationCodesInvalidated:
        true,

      setupTokensInvalidated:
        true,
    },
  });

  /* ==========================================================
     9. RESPONSE
     ========================================================== */

  const firstName =
    activated.first_name ||
    '';

  const lastName =
    activated.last_name ||
    '';

  return {
    success:
      true,

    code:
      'ADMIN_IDENTITY_COMPLETED',

    admin: {
      id:
        activated.id,

      email:
        activated.email,

      firstName,

      lastName,

      fullName:
        `${firstName} ${lastName}`
          .trim(),

      role:
        activated.role,

      status:
        'active',

      emailVerified:
        true,

      twoFactorRequired:
        true,

      twoFactorEnabled:
        Boolean(
          activated.two_factor_enabled
        ),
    },

    /*
     * No administrator session is created here.

     * The newly activated administrator signs in normally.
     *
     * Existing login architecture then detects:
     *   two_factor_required = TRUE
     *   two_factor_enabled = FALSE
     *
     * and routes them through the existing secure 2FA setup flow.
     */
    next:
      '/admin/login?reason=account_ready',
  };
}