import 'server-only';

import crypto from 'crypto';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  sendPasswordResetEmail,
} from '@/lib/services/password-reset-email';

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

export type PasswordResetRequestResult = {
  accountFound:
    boolean;

  issued:
    boolean;

  emailSent:
    boolean;
};

type IdentityRow = {
  id:
    string;

  email:
    string;

  first_name:
    string | null;

  status:
    string | null;
};

type ResetActivityRow = {
  request_count:
    | string
    | number
    | null;

  latest_created_at:
    | Date
    | string
    | null;
};

type IdentityConfig = {
  identityTable:
    | 'users'
    | 'platform_admins';

  resetTable:
    | 'password_reset_tokens'
    | 'platform_admin_password_reset_tokens';

  foreignKey:
    | 'user_id'
    | 'admin_id';

  resetPath:
    | '/reset-password'
    | '/admin/reset-password';

  audience:
    | 'workspace'
    | 'platform_admin';

  allowedStatuses:
    ReadonlySet<string>;
};

/* ============================================================
   CONSTANTS
   ============================================================ */

export const PASSWORD_RESET_RESEND_COOLDOWN_SECONDS =
  60;

const PASSWORD_RESET_MAX_REQUESTS_PER_HOUR =
  5;

const PASSWORD_RESET_TOKEN_EXPIRY_MINUTES =
  30;

const PASSWORD_RESET_TOKEN_BYTES =
  48;

const MAX_EMAIL_LENGTH =
  254;

/* ============================================================
   IDENTITY CONFIGURATION
   ============================================================ */

const IDENTITY_CONFIG:
  Record<
    PasswordResetIdentityType,
    IdentityConfig
  > = {
    user: {
      identityTable:
        'users',

      resetTable:
        'password_reset_tokens',

      foreignKey:
        'user_id',

      resetPath:
        '/reset-password',

      audience:
        'workspace',

      allowedStatuses:
        new Set([
          'active',
          'locked',
          'pending',
          'pending_verification',
        ]),
    },

    platform_admin: {
      identityTable:
        'platform_admins',

      resetTable:
        'platform_admin_password_reset_tokens',

      foreignKey:
        'admin_id',

      resetPath:
        '/admin/reset-password',

      audience:
        'platform_admin',

      /*
       * Invited administrators must complete their identity
       * provisioning/invitation flow instead of using normal
       * forgotten-password recovery.
       */
      allowedStatuses:
        new Set([
          'active',
          'locked',
        ]),
    },
  };

/* ============================================================
   EMAIL
   ============================================================ */

export function normalizePasswordResetEmail(
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
    .toLowerCase();
}

export function isValidPasswordResetEmail(
  email:
    string
): boolean {
  return (
    email.length >
      0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

/* ============================================================
   RESET TOKEN
   ============================================================ */

function generateResetToken():
  string {
  return crypto
    .randomBytes(
      PASSWORD_RESET_TOKEN_BYTES
    )
    .toString(
      'base64url'
    );
}

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
   APP URL
   ============================================================ */

function normalizeBaseUrl(
  value:
    string
): string {
  return value
    .trim()
    .replace(
      /\/+$/,
      ''
    );
}

function getAppBaseUrl(
  request:
    NextRequest
): string {
  const configured =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL;

  if (
    configured
  ) {
    try {
      const url =
        new URL(
          configured
        );

      if (
        url.protocol ===
          'https:' ||
        url.protocol ===
          'http:'
      ) {
        return normalizeBaseUrl(
          url.origin
        );
      }
    } catch {
      console.error(
        '[Password Reset] Invalid APP_URL/NEXT_PUBLIC_APP_URL.'
      );
    }
  }

  /*
   * Development fallback only.
   *
   * Production should always configure APP_URL.
   */
  return normalizeBaseUrl(
    request.nextUrl.origin
  );
}

function createPasswordResetUrl(
  request:
    NextRequest,

  config:
    IdentityConfig,

  email:
    string,

  rawToken:
    string
): string {
  const baseUrl =
    getAppBaseUrl(
      request
    );

  const url =
    new URL(
      config.resetPath,
      `${baseUrl}/`
    );

  url.searchParams.set(
    'token',
    rawToken
  );

  url.searchParams.set(
    'email',
    email
  );

  return url.toString();
}

/* ============================================================
   IDENTITY LOOKUP
   ============================================================ */

async function findIdentityByEmail(
  identityType:
    PasswordResetIdentityType,

  email:
    string
): Promise<
  IdentityRow | null
> {
  const config =
    IDENTITY_CONFIG[
      identityType
    ];

  /*
   * Table name comes only from our closed configuration above.
   * No request/user input is interpolated as a SQL identifier.
   */
  const result =
    await queryControl(
      `
        SELECT
          id,
          email,
          first_name,
          status

        FROM ${config.identityTable}

        WHERE LOWER(email) = $1
          AND deleted_at IS NULL

        LIMIT 1
      `,
      [
        email,
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
      IdentityRow;
}

/* ============================================================
   THROTTLING
   ============================================================ */

async function canIssueResetToken(
  identityType:
    PasswordResetIdentityType,

  identityId:
    string
): Promise<boolean> {
  const config =
    IDENTITY_CONFIG[
      identityType
    ];

  const result =
    await queryControl(
      `
        SELECT
          COUNT(*) FILTER (
            WHERE created_at >=
              NOW() - INTERVAL '1 hour'
          ) AS request_count,

          MAX(created_at)
            AS latest_created_at

        FROM ${config.resetTable}

        WHERE ${config.foreignKey} = $1
      `,
      [
        identityId,
      ]
    );

  const row =
    result.rows[0] as
      | ResetActivityRow
      | undefined;

  const requestCount =
    Number(
      row?.request_count ||
        0
    );

  if (
    requestCount >=
      PASSWORD_RESET_MAX_REQUESTS_PER_HOUR
  ) {
    return false;
  }

  if (
    row?.latest_created_at
  ) {
    const latestTime =
      new Date(
        row.latest_created_at
      ).getTime();

    if (
      !Number.isNaN(
        latestTime
      )
    ) {
      const elapsedSeconds =
        (
          Date.now() -
          latestTime
        ) /
        1000;

      if (
        elapsedSeconds <
          PASSWORD_RESET_RESEND_COOLDOWN_SECONDS
      ) {
        return false;
      }
    }
  }

  return true;
}

/* ============================================================
   CREATE RESET TOKEN
   ============================================================ */

async function createResetToken(
  identityType:
    PasswordResetIdentityType,

  identityId:
    string,

  tokenHash:
    string
): Promise<void> {
  const config =
    IDENTITY_CONFIG[
      identityType
    ];

  /*
   * Invalidate old active tokens and create the new one in one
   * statement so we never intentionally leave multiple current
   * password-reset challenges.
   */
  await queryControl(
    `
      WITH invalidated_tokens AS (
        UPDATE ${config.resetTable}

        SET
          deleted_at = NOW()

        WHERE ${config.foreignKey} = $1
          AND used_at IS NULL
          AND deleted_at IS NULL

        RETURNING
          id
      )

      INSERT INTO ${config.resetTable} (
        ${config.foreignKey},
        token_hash,
        expires_at,
        created_at
      )

      VALUES (
        $1,
        $2,
        NOW() + INTERVAL '${PASSWORD_RESET_TOKEN_EXPIRY_MINUTES} minutes',
        NOW()
      )
    `,
    [
      identityId,
      tokenHash,
    ]
  );
}

/* ============================================================
   TARGETED TOKEN INVALIDATION
   ============================================================ */

async function invalidateResetToken(
  identityType:
    PasswordResetIdentityType,

  identityId:
    string,

  tokenHash:
    string
): Promise<void> {
  const config =
    IDENTITY_CONFIG[
      identityType
    ];

  try {
    await queryControl(
      `
        UPDATE ${config.resetTable}

        SET
          deleted_at = NOW()

        WHERE ${config.foreignKey} = $1
          AND token_hash = $2
          AND used_at IS NULL
          AND deleted_at IS NULL
      `,
      [
        identityId,
        tokenHash,
      ]
    );
  } catch (
    error
  ) {
    console.error(
      '[Password Reset] Failed to invalidate undelivered reset token:',
      error
    );
  }
}

/* ============================================================
   AUTH EVENTS
   ============================================================ */

async function recordResetRequested(
  request:
    NextRequest,

  identityType:
    PasswordResetIdentityType,

  identityId:
    string,

  emailSent:
    boolean
): Promise<void> {
  try {
    if (
      identityType ===
        'user'
    ) {
      await recordAuthEvent({
        request,

        userId:
          identityId,

        eventType:
          'PASSWORD_RESET_REQUESTED',

        entityType:
          'user',

        entityId:
          identityId,

        metadata: {
          delivery:
            'email',

          emailSent,
        },
      });

      return;
    }

    await recordAdminAuditEvent({
      request,

      adminId:
        identityId,

      eventType:
        'admin.password_reset.requested',

      action:
        'admin_password_reset_request',

      targetType:
        'platform_admin',

      targetId:
        identityId,

      successful:
        emailSent,

      failureReason:
        emailSent
          ? null
          : 'email_delivery_failed',

      metadata: {
        delivery:
          'email',

        emailSent,
      },
    });
  } catch (
    error
  ) {
    /*
     * Audit failure must never expose account existence and must
     * not create a second reset token.
     */
    console.error(
      '[Password Reset] Failed to record password reset request event:',
      error
    );
  }
}

/* ============================================================
   REQUEST PASSWORD RESET
   ============================================================ */

export async function requestPasswordReset(
  input: {
    request:
      NextRequest;

    identityType:
      PasswordResetIdentityType;

    email:
      string;
  }
): Promise<
  PasswordResetRequestResult
> {
  const email =
    normalizePasswordResetEmail(
      input.email
    );

  if (
    !isValidPasswordResetEmail(
      email
    )
  ) {
    throw new Error(
      'INVALID_PASSWORD_RESET_EMAIL'
    );
  }

  const config =
    IDENTITY_CONFIG[
      input.identityType
    ];

  /* ==========================================================
     ACCOUNT LOOKUP
     ========================================================== */

  const identity =
    await findIdentityByEmail(
      input.identityType,
      email
    );

  /*
   * Caller MUST still return the same generic success response.
   */
  if (
    !identity
  ) {
    return {
      accountFound:
        false,

      issued:
        false,

      emailSent:
        false,
    };
  }

  /* ==========================================================
     ACCOUNT STATE
     ========================================================== */

  const status =
    String(
      identity.status || ''
    )
      .trim()
      .toLowerCase();

  if (
    !config
      .allowedStatuses
      .has(
        status
      )
  ) {
    return {
      accountFound:
        true,

      issued:
        false,

      emailSent:
        false,
    };
  }

  /* ==========================================================
     THROTTLE
     ========================================================== */

  const allowed =
    await canIssueResetToken(
      input.identityType,
      identity.id
    );

  if (
    !allowed
  ) {
    return {
      accountFound:
        true,

      issued:
        false,

      emailSent:
        false,
    };
  }

  /* ==========================================================
     TOKEN
     ========================================================== */

  const rawToken =
    generateResetToken();

  const tokenHash =
    hashResetToken(
      rawToken
    );

  await createResetToken(
    input.identityType,
    identity.id,
    tokenHash
  );

  const resetUrl =
    createPasswordResetUrl(
      input.request,
      config,
      identity.email,
      rawToken
    );

  /* ==========================================================
     EMAIL
     ========================================================== */

  let emailSent =
    false;

  try {
    const emailResult =
      await sendPasswordResetEmail({
        email:
          identity.email,

        firstName:
          identity.first_name ||
          '',

        resetUrl,

        expiresInMinutes:
          PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,

        audience:
          config.audience,
      });

    emailSent =
      emailResult.success;

    if (
      !emailResult.success
    ) {
      await invalidateResetToken(
        input.identityType,
        identity.id,
        tokenHash
      );
    }
  } catch (
    error
  ) {
    console.error(
      '[Password Reset] Email delivery failed:',
      error
    );

    await invalidateResetToken(
      input.identityType,
      identity.id,
      tokenHash
    );

    emailSent =
      false;
  }

  await recordResetRequested(
    input.request,
    input.identityType,
    identity.id,
    emailSent
  );

  return {
    accountFound:
      true,

    issued:
      emailSent,

    emailSent,
  };
}