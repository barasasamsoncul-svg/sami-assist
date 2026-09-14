import 'server-only';

import crypto from 'crypto';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  hashPassword,
} from '@/lib/auth/password';

import {
  hashAdminPassword,
  isValidAdminPassword,
} from '@/lib/auth/admin-auth';

import {
  clearSessionCookie,
} from '@/lib/auth/session';

import {
  clearAdminSessionCookie,
} from '@/lib/auth/admin-session';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

import {
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

/* ============================================================
   TYPES
   ============================================================ */

export type PasswordResetIdentityType =
  | 'user'
  | 'platform_admin';

export type CompletePasswordResetInput = {
  request:
    NextRequest;

  identityType:
    PasswordResetIdentityType;

  token:
    unknown;

  newPassword:
    unknown;

  confirmPassword:
    unknown;
};

export type CompletePasswordResetResult =
  | {
      success:
        true;

      identityId:
        string;

      next:
        string;
    }
  | {
      success:
        false;

      code:
        PasswordResetErrorCode;

      message:
        string;
    };

export type PasswordResetErrorCode =
  | 'RESET_TOKEN_INVALID'
  | 'PASSWORD_REQUIRED'
  | 'PASSWORDS_DO_NOT_MATCH'
  | 'PASSWORD_WEAK';

type ResetIdentityRow = {
  id:
    string;

  email:
    string;

  status:
    string;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

const USER_MIN_PASSWORD_LENGTH =
  8;

const MAX_PASSWORD_LENGTH =
  128;

const MIN_RESET_TOKEN_LENGTH =
  40;

const MAX_RESET_TOKEN_LENGTH =
  512;

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeToken(
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

function normalizePassword(
  value:
    unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  /*
   * Never trim passwords.
   *
   * Workspace passwords may deliberately contain spaces.
   *
   * Platform Admin whitespace restrictions are enforced by
   * isValidAdminPassword() in admin-auth.ts.
   */
  return value;
}

/* ============================================================
   TOKEN VALIDATION
   ============================================================ */

function isValidResetToken(
  token:
    string
): boolean {
  return (
    token.length >=
      MIN_RESET_TOKEN_LENGTH &&
    token.length <=
      MAX_RESET_TOKEN_LENGTH &&
    /^[A-Za-z0-9_-]+$/.test(
      token
    )
  );
}

/* ============================================================
   TOKEN HASH
   ============================================================ */

function hashResetToken(
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
   PASSWORD POLICY

   Workspace:
   - existing SaMi workspace policy remains here.

   Platform Admin:
   - NEVER duplicate the administrator policy here.
   - admin-auth.ts is the authoritative source.
   ============================================================ */

function validatePassword(
  identityType:
    PasswordResetIdentityType,

  password:
    string
):
  | {
      success:
        true;
    }
  | {
      success:
        false;

      message:
        string;
    } {
  if (
    identityType ===
    'platform_admin'
  ) {
    if (
      !isValidAdminPassword(
        password
      )
    ) {
      return {
        success:
          false,

        message:
          'Use 12–128 characters with uppercase, lowercase, a number and a symbol. Administrator passwords cannot contain whitespace.',
      };
    }

    return {
      success:
        true,
    };
  }

  /*
   * Existing workspace password-reset policy.
   *
   * Do not silently strengthen or alter workspace authentication
   * while catching Platform Admin up.
   */
  if (
    password.length <
      USER_MIN_PASSWORD_LENGTH ||
    password.length >
      MAX_PASSWORD_LENGTH
  ) {
    return {
      success:
        false,

      message:
        'Use between 8 and 128 characters.',
    };
  }

  if (
    !/[A-Z]/.test(
      password
    ) ||
    !/[a-z]/.test(
      password
    ) ||
    !/[0-9]/.test(
      password
    )
  ) {
    return {
      success:
        false,

      message:
        'Use uppercase, lowercase and a number.',
    };
  }

  return {
    success:
      true,
  };
}

/* ============================================================
   SAFE USER AUDIT
   ============================================================ */

async function recordUserResetCompleted(
  request:
    NextRequest,

  userId:
    string
): Promise<void> {
  try {
    await recordAuthEvent({
      request,

      userId,

      eventType:
        'PASSWORD_RESET_COMPLETED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        sessionsRevoked:
          true,

        resetTokensInvalidated:
          true,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Password Reset] Failed to record user password reset:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   SAFE ADMIN AUDIT
   ============================================================ */

async function recordAdminResetCompleted(
  request:
    NextRequest,

  adminId:
    string
): Promise<void> {
  try {
    await recordAdminAuditEvent({
      request,

      adminId,

      eventType:
        'admin.password_reset.completed',

      action:
        'admin_password_reset',

      targetType:
        'platform_admin',

      targetId:
        adminId,

      successful:
        true,

      metadata: {
        sessionsRevoked:
          true,

        loginChallengesInvalidated:
          true,

        resetTokensInvalidated:
          true,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Password Reset] Failed to record administrator password reset:',
      error instanceof
        Error
        ? error.message
        : 'Unknown audit error'
    );
  }
}

/* ============================================================
   CLEAR BROWSER COOKIE
   ============================================================ */

async function clearIdentityCookie(
  identityType:
    PasswordResetIdentityType
): Promise<void> {
  try {
    if (
      identityType ===
      'platform_admin'
    ) {
      await clearAdminSessionCookie();

      return;
    }

    await clearSessionCookie();
  } catch (
    error
  ) {
    /*
     * Server-side sessions have already been revoked by the
     * successful database reset.
     *
     * Browser cookie cleanup failure must never roll back the
     * credential change.
     */
    console.error(
      '[Password Reset] Failed to clear stale authentication cookie:',
      error instanceof
        Error
        ? error.message
        : 'Unknown cookie cleanup error'
    );
  }
}

/* ============================================================
   USER RESET

   Atomic security transition:

   valid reset token
        ↓
   consume token
        ↓
   update password
        ↓
   clear temporary lock
        ↓
   revoke all sessions
        ↓
   invalidate remaining reset tokens

   If the token was already consumed, expired, deleted or invalid,
   no password update occurs.
   ============================================================ */

async function resetUserPassword(
  tokenHash:
    string,

  passwordHash:
    string
): Promise<
  ResetIdentityRow | null
> {
  const result =
    await queryControl(
      `
        WITH consumed_token AS (
          UPDATE
            password_reset_tokens prt

          SET
            used_at = NOW()

          FROM
            users u

          WHERE
            prt.user_id = u.id
            AND prt.token_hash = $1
            AND prt.used_at IS NULL
            AND prt.deleted_at IS NULL
            AND prt.expires_at > NOW()

            AND u.deleted_at IS NULL

            AND LOWER(u.status) IN (
              'active',
              'locked',
              'pending_verification'
            )

          RETURNING
            prt.user_id
        ),

        updated_identity AS (
          UPDATE
            users u

          SET
            password_hash = $2,

            failed_login_attempts = 0,

            locked_until = NULL,

            status =
              CASE
                WHEN
                  LOWER(u.status) =
                    'locked'
                THEN
                  'active'
                ELSE
                  u.status
              END,

            updated_at =
              NOW()

          FROM
            consumed_token ct

          WHERE
            u.id =
              ct.user_id
            AND u.deleted_at IS NULL

          RETURNING
            u.id,
            u.email,
            u.status
        ),

        revoked_sessions AS (
          UPDATE
            sessions s

          SET
            is_current = FALSE,

            revoked_at =
              COALESCE(
                s.revoked_at,
                NOW()
              )

          WHERE
            s.user_id IN (
              SELECT id
              FROM updated_identity
            )

            AND s.revoked_at IS NULL

          RETURNING
            s.id
        ),

        invalidated_tokens AS (
          UPDATE
            password_reset_tokens prt

          SET
            deleted_at =
              COALESCE(
                prt.deleted_at,
                NOW()
              )

          WHERE
            prt.user_id IN (
              SELECT id
              FROM updated_identity
            )

            AND prt.used_at IS NULL
            AND prt.deleted_at IS NULL

          RETURNING
            prt.id
        )

        SELECT
          id,
          email,
          status

        FROM
          updated_identity
      `,
      [
        tokenHash,
        passwordHash,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  return result
    .rows[0] as
      ResetIdentityRow;
}

/* ============================================================
   PLATFORM ADMIN RESET

   Security consequences are deliberately stronger than
   workspace reset.

   On successful reset:
   - consume the reset token
   - update password
   - update password_changed_at
   - clear temporary login lock
   - revoke ALL admin sessions
   - invalidate ALL pending login/2FA challenges
   - invalidate all other password-reset tokens

   Suspended / disabled / invited identities cannot use this
   password-reset path.

   Invited administrators complete their identity through the
   separate invitation/identity-completion flow.
   ============================================================ */

async function resetPlatformAdminPassword(
  tokenHash:
    string,

  passwordHash:
    string
): Promise<
  ResetIdentityRow | null
> {
  const result =
    await queryControl(
      `
        WITH consumed_token AS (
          UPDATE
            platform_admin_password_reset_tokens prt

          SET
            used_at = NOW()

          FROM
            platform_admins a

          WHERE
            prt.admin_id = a.id
            AND prt.token_hash = $1
            AND prt.used_at IS NULL
            AND prt.deleted_at IS NULL
            AND prt.expires_at > NOW()

            AND a.deleted_at IS NULL

            AND LOWER(a.status) IN (
              'active',
              'locked'
            )

          RETURNING
            prt.admin_id
        ),

        updated_identity AS (
          UPDATE
            platform_admins a

          SET
            password_hash = $2,

            password_changed_at =
              NOW(),

            failed_login_attempts = 0,

            locked_until = NULL,

            status =
              CASE
                /*
                 * Password reset should only release a temporary
                 * lock.
                 *
                 * A manual locked account is expected to have
                 * locked_until IS NULL and therefore should not
                 * arrive through a reset token request in the
                 * hardened request engine.
                 *
                 * This extra condition protects the update itself.
                 */
                WHEN
                  LOWER(a.status) =
                    'locked'
                  AND a.locked_until
                    IS NOT NULL
                THEN
                  'active'

                ELSE
                  a.status
              END,

            updated_at =
              NOW()

          FROM
            consumed_token ct

          WHERE
            a.id =
              ct.admin_id
            AND a.deleted_at IS NULL

          RETURNING
            a.id,
            a.email,
            a.status
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
                'password_reset'
              )

          WHERE
            s.admin_id IN (
              SELECT id
              FROM updated_identity
            )

            AND s.revoked_at IS NULL

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
              FROM updated_identity
            )

            AND c.used_at IS NULL

          RETURNING
            c.id
        ),

        invalidated_tokens AS (
          UPDATE
            platform_admin_password_reset_tokens prt

          SET
            deleted_at =
              COALESCE(
                prt.deleted_at,
                NOW()
              )

          WHERE
            prt.admin_id IN (
              SELECT id
              FROM updated_identity
            )

            AND prt.used_at IS NULL
            AND prt.deleted_at IS NULL

          RETURNING
            prt.id
        )

        SELECT
          id,
          email,
          status

        FROM
          updated_identity
      `,
      [
        tokenHash,
        passwordHash,
      ]
    );

  if (
    result.rows.length ===
    0
  ) {
    return null;
  }

  return result
    .rows[0] as
      ResetIdentityRow;
}

/* ============================================================
   COMPLETE PASSWORD RESET
   ============================================================ */

export async function completePasswordReset(
  input:
    CompletePasswordResetInput
): Promise<
  CompletePasswordResetResult
> {
  const token =
    normalizeToken(
      input.token
    );

  const newPassword =
    normalizePassword(
      input.newPassword
    );

  const confirmPassword =
    normalizePassword(
      input.confirmPassword
    );

  /* ==========================================================
     IDENTITY TYPE

     The TypeScript type protects normal callers, but this
     runtime check keeps the shared security boundary fail-closed
     if JavaScript or malformed internal usage reaches it.
     ========================================================== */

  if (
    input.identityType !==
      'user' &&
    input.identityType !==
      'platform_admin'
  ) {
    return {
      success:
        false,

      code:
        'RESET_TOKEN_INVALID',

      message:
        'This reset link is invalid or has expired.',
    };
  }

  /* ==========================================================
     TOKEN
     ========================================================== */

  if (
    !token ||
    !isValidResetToken(
      token
    )
  ) {
    return {
      success:
        false,

      code:
        'RESET_TOKEN_INVALID',

      message:
        'This reset link is invalid or has expired.',
    };
  }

  /* ==========================================================
     PASSWORDS
     ========================================================== */

  if (
    !newPassword
  ) {
    return {
      success:
        false,

      code:
        'PASSWORD_REQUIRED',

      message:
        'Enter your new password.',
    };
  }

  if (
    !confirmPassword ||
    newPassword !==
      confirmPassword
  ) {
    return {
      success:
        false,

      code:
        'PASSWORDS_DO_NOT_MATCH',

      message:
        'New password and confirmation password must match.',
    };
  }

  const passwordPolicy =
    validatePassword(
      input.identityType,
      newPassword
    );

  if (
    !passwordPolicy.success
  ) {
    return {
      success:
        false,

      code:
        'PASSWORD_WEAK',

      message:
        passwordPolicy.message,
    };
  }

  /* ==========================================================
     HASH

     Password hashing is intentionally performed before token
     consumption.

     If hashing fails, the valid reset token remains untouched so
     the user/admin can retry rather than losing their recovery
     mechanism because of a transient server crypto failure.
     ========================================================== */

  const tokenHash =
    hashResetToken(
      token
    );

  const passwordHash =
    input.identityType ===
      'platform_admin'
      ? await hashAdminPassword(
          newPassword
        )
      : await hashPassword(
          newPassword
        );

  /* ==========================================================
     ATOMIC DATABASE RESET
     ========================================================== */

  const identity =
    input.identityType ===
      'platform_admin'
      ? await resetPlatformAdminPassword(
          tokenHash,
          passwordHash
        )
      : await resetUserPassword(
          tokenHash,
          passwordHash
        );

  if (
    !identity
  ) {
    return {
      success:
        false,

      code:
        'RESET_TOKEN_INVALID',

      message:
        'This reset link is invalid or has expired.',
    };
  }

  /* ==========================================================
     COOKIE

     Database-side revocation is authoritative.

     Cookie deletion is best-effort cleanup.
     ========================================================== */

  await clearIdentityCookie(
    input.identityType
  );

  /* ==========================================================
     EVENTS
     ========================================================== */

  if (
    input.identityType ===
      'platform_admin'
  ) {
    await recordAdminResetCompleted(
      input.request,
      identity.id
    );
  } else {
    await recordUserResetCompleted(
      input.request,
      identity.id
    );
  }

  /* ==========================================================
     SUCCESS
     ========================================================== */

  return {
    success:
      true,

    identityId:
      identity.id,

    next:
      input.identityType ===
        'platform_admin'
        ? '/admin/login?reason=password_reset'
        : '/login?reason=password_reset',
  };
}