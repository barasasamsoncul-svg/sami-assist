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
  recordAdminAuditEvent,
} from '@/lib/auth/admin-events';

/* ============================================================
   CONSTANTS
   ============================================================ */

const SETUP_TOKEN_BYTES =
  48;

const SETUP_TOKEN_EXPIRY_MS =
  30 * 60 * 1000;

const MAX_SETUP_TOKEN_LENGTH =
  512;

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
          boolean;

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
        | 'SETUP_TOKEN_EXPIRED'
        | 'ADMIN_NOT_ELIGIBLE'
        | 'SETUP_COMPLETION_FAILED';

      error:
        string;
    };

type SetupCandidateRow = {
  setup_id:
    string;

  admin_id:
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
    string;

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

function generateSetupToken() {
  return crypto
    .randomBytes(
      SETUP_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

function hashSetupToken(
  token:
    string
) {
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

function normalizeSetupToken(
  value:
    unknown
) {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  const normalized =
    value.trim();

  if (
    normalized.length <
      32 ||
    normalized.length >
      MAX_SETUP_TOKEN_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(
      normalized
    )
  ) {
    return '';
  }

  return normalized;
}

/* ============================================================
   ISSUE TOKEN
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
  const token =
    generateSetupToken();

  const tokenHash =
    hashSetupToken(
      token
    );

  const expiresAt =
    new Date(
      Date.now() +
        SETUP_TOKEN_EXPIRY_MS
    );

  /*
   * Invalidate previous unfinished setup tokens.
   */
  await queryControl(
    `
      UPDATE
        platform_admin_identity_setup_tokens

      SET
        deleted_at =
          COALESCE(
            deleted_at,
            NOW()
          )

      WHERE
        admin_id = $1
        AND used_at IS NULL
        AND deleted_at IS NULL
    `,
    [
      input.adminId,
    ]
  );

  /*
   * Only an invited + verified administrator may receive
   * an account-completion token.
   */
  const adminResult =
    await queryControl(
      `
        SELECT
          id

        FROM
          platform_admins

        WHERE
          id = $1
          AND LOWER(email) = LOWER($2)
          AND status = 'invited'
          AND email_verified = TRUE
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        input.adminId,
        input.email,
      ]
    );

  if (
    !adminResult.rows[0]
  ) {
    throw new Error(
      'ADMIN_NOT_ELIGIBLE_FOR_IDENTITY_SETUP'
    );
  }

  await queryControl(
    `
      INSERT INTO
        platform_admin_identity_setup_tokens (
          admin_id,
          token_hash,
          expires_at,
          created_at
        )

      VALUES (
        $1,
        $2,
        $3,
        NOW()
      )
    `,
    [
      input.adminId,
      tokenHash,
      expiresAt,
    ]
  );

  return {
    token,
    expiresAt,
  };
}

/* ============================================================
   COMPLETE IDENTITY
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

  if (
    !token
  ) {
    return {
      success:
        false,

      code:
        'INVALID_TOKEN',

      error:
        'This administrator setup link is invalid.',
    };
  }

  const password =
    typeof input.password ===
      'string'
      ? input.password
      : '';

  const confirmPassword =
    typeof input.confirmPassword ===
      'string'
      ? input.confirmPassword
      : '';

  if (
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
        'Administrator passwords must meet SaMi security requirements.',
    };
  }

  if (
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

  const tokenHash =
    hashSetupToken(
      token
    );

  /*
   * Find the invited administrator whose email has already been
   * verified and whose setup token is still usable.
   */
  const candidateResult =
    await queryControl(
      `
        SELECT
          s.id AS setup_id,
          a.id AS admin_id,
          a.email,
          a.first_name,
          a.last_name,
          a.role,
          a.status,
          a.email_verified,
          a.two_factor_required,
          a.two_factor_enabled

        FROM
          platform_admin_identity_setup_tokens s

        INNER JOIN
          platform_admins a
            ON a.id = s.admin_id

        WHERE
          s.token_hash = $1
          AND s.used_at IS NULL
          AND s.deleted_at IS NULL
          AND s.expires_at > NOW()

          AND a.deleted_at IS NULL
          AND a.status = 'invited'
          AND a.email_verified = TRUE

        LIMIT 1
      `,
      [
        tokenHash,
      ]
    );

  const candidate =
    candidateResult.rows[0] as
      | SetupCandidateRow
      | undefined;

  if (
    !candidate
  ) {
    return {
      success:
        false,

      code:
        'SETUP_TOKEN_EXPIRED',

      error:
        'This administrator setup link is invalid or has expired.',
    };
  }

  const passwordHash =
    await hashAdminPassword(
      password
    );

  try {
    /*
     * Atomic consumption:
     *
     * - consume setup token
     * - set administrator password
     * - activate identity
     * - preserve email verification
     * - require 2FA setup
     */
    const result =
      await queryControl(
        `
          WITH consumed AS (
            UPDATE
              platform_admin_identity_setup_tokens

            SET
              used_at = NOW()

            WHERE
              id = $1
              AND used_at IS NULL
              AND deleted_at IS NULL
              AND expires_at > NOW()

            RETURNING
              admin_id
          ),

          activated AS (
            UPDATE
              platform_admins a

            SET
              password_hash = $2,
              password_changed_at = NOW(),
              status = 'active',
              failed_login_attempts = 0,
              locked_until = NULL,
              two_factor_required = TRUE,
              updated_at = NOW()

            FROM
              consumed c

            WHERE
              a.id = c.admin_id
              AND a.status = 'invited'
              AND a.email_verified = TRUE
              AND a.deleted_at IS NULL

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
          )

          SELECT
            *

          FROM
            activated
        `,
        [
          candidate.setup_id,
          passwordHash,
        ]
      );

    const activated =
      result.rows[0] as
        | {
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
          }
        | undefined;

    if (
      !activated
    ) {
      return {
        success:
          false,

        code:
          'SETUP_COMPLETION_FAILED',

        error:
          'SaMi could not complete administrator setup.',
      };
    }

    /*
     * Invalidate any other setup tokens.
     */
    await queryControl(
      `
        UPDATE
          platform_admin_identity_setup_tokens

        SET
          deleted_at =
            COALESCE(
              deleted_at,
              NOW()
            )

        WHERE
          admin_id = $1
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [
        activated.id,
      ]
    );

    await recordAdminAuditEvent({
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
          activated.email_verified,

        twoFactorRequired:
          activated.two_factor_required,
      },
    });

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
          Boolean(
            activated.two_factor_required
          ),

        twoFactorEnabled:
          Boolean(
            activated.two_factor_enabled
          ),
      },

      /*
       * We deliberately return to login.
       *
       * The next login will detect:
       *   two_factor_required = true
       *   two_factor_enabled = false
       *
       * and hand the administrator into the existing secure
       * /admin/two-factor/setup flow.
       */
      next:
        '/admin/login?reason=account_ready',
    };
  } catch (
    error
  ) {
    console.error(
      '[Admin Identity Setup] Completion failed:',
      error instanceof
        Error
        ? error.message
        : 'Unknown identity completion error'
    );

    try {
      await recordAdminAuditEvent({
        request:
          input.request,

        adminId:
          candidate.admin_id,

        eventType:
          'admin.identity.completion_failed',

        action:
          'complete_platform_admin_identity',

        targetType:
          'platform_admin',

        targetId:
          candidate.admin_id,

        successful:
          false,

        failureReason:
          'identity_completion_failed',
      });
    } catch {
      // Never allow audit failure to replace the primary result.
    }

    return {
      success:
        false,

      code:
        'SETUP_COMPLETION_FAILED',

      error:
        'SaMi could not complete administrator setup.',
    };
  }
}