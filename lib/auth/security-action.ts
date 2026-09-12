import 'server-only';

import type {
  NextRequest,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  verifyPassword,
} from '@/lib/auth/password';

import {
  verifyUserTwoFactorCode,
} from '@/lib/auth/two-factor';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_PASSWORD_LENGTH =
  128;

const MAX_TWO_FACTOR_CODE_LENGTH =
  64;

const SECURITY_ACTION_MAX_ATTEMPTS =
  8;

const SECURITY_ACTION_WINDOW_MS =
  10 * 60 * 1000;

const SECURITY_ACTION_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

export type SecurityActionName =
  | 'two-factor-setup'
  | 'two-factor-recovery-regenerate'
  | 'two-factor-disable';

export type SecurityActionVerificationResult =
  | {
      success: true;
    }
  | {
      success: false;

      status: number;

      code: string;

      error: string;

      retryAfterSeconds?: number;
    };

type SecurityUserRow = {
  id: string;

  password_hash:
    | string
    | null;

  two_factor_enabled:
    | boolean
    | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizePassword(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  /*
   * Passwords must never be trimmed.
   *
   * Spaces may legitimately be part of the user's password.
   */
  return value;
}

function normalizeTwoFactorCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

/* ============================================================
   SAME-ORIGIN MUTATION CHECK
   ============================================================ */

/**
 * Session cookies are already SameSite=Lax.
 *
 * This adds an explicit same-origin check for sensitive
 * authenticated security mutations.
 *
 * Requests from non-browser clients may legitimately omit
 * Origin/Sec-Fetch-Site, so absence alone is not rejected.
 */
export function isTrustedSecurityMutation(
  request:
    NextRequest
): boolean {
  const fetchSite =
    request.headers
      .get(
        'sec-fetch-site'
      )
      ?.trim()
      .toLowerCase();

  if (
    fetchSite &&
    fetchSite !==
      'same-origin' &&
    fetchSite !==
      'none'
  ) {
    return false;
  }

  const origin =
    request.headers.get(
      'origin'
    );

  if (!origin) {
    return true;
  }

  const forwardedHost =
    request.headers
      .get(
        'x-forwarded-host'
      )
      ?.split(',')[0]
      ?.trim();

  const host =
    forwardedHost ||
    request.headers
      .get(
        'host'
      )
      ?.trim();

  if (!host) {
    return false;
  }

  try {
    const originUrl =
      new URL(
        origin
      );

    return (
      originUrl.host ===
      host
    );
  } catch {
    return false;
  }
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getRateLimitContext(
  request:
    NextRequest,

  userId:
    string,

  action:
    SecurityActionName
) {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  const identifier =
    `security:${action}:${userId}:${ip}`;

  const rateAction =
    `security-${action}`;

  return {
    identifier,
    rateAction,
  };
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAuthEvent(
  input:
    Parameters<
      typeof recordAuthEvent
    >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (
    error
  ) {
    /*
     * Audit failure must never turn a correct credential
     * decision into a different authentication decision.
     */
    console.error(
      '[Security] Failed to record security action event:',
      error
    );
  }
}

/* ============================================================
   VERIFY SECURITY ACTION
   ============================================================ */

/**
 * Step-up authentication for sensitive account-security actions.
 *
 * First-time 2FA setup:
 *
 *   current password
 *
 * Existing 2FA modification:
 *
 *   current password
 *   +
 *   current authenticator/recovery code
 *
 * Rate limiting here is intentionally separate from login rate
 * limiting. A failed Settings action should not accidentally
 * increment the normal password-login account lock counter.
 */
export async function verifySecurityAction(
  input: {
    request:
      NextRequest;

    userId:
      string;

    action:
      SecurityActionName;

    currentPassword:
      unknown;

    twoFactorCode?:
      unknown;

    requireTwoFactor:
      boolean;
  }
): Promise<SecurityActionVerificationResult> {
  const userId =
    input.userId.trim();

  if (!userId) {
    return {
      success:
        false,

      status:
        401,

      code:
        'UNAUTHENTICATED',

      error:
        'Your session is no longer valid.',
    };
  }

  /* ==========================================================
     INPUT
     ========================================================== */

  const currentPassword =
    normalizePassword(
      input.currentPassword
    );

  const twoFactorCode =
    normalizeTwoFactorCode(
      input.twoFactorCode
    );

  if (
    !currentPassword
  ) {
    return {
      success:
        false,

      status:
        400,

      code:
        'CURRENT_PASSWORD_REQUIRED',

      error:
        'Enter your current password.',
    };
  }

  if (
    currentPassword.length >
    MAX_PASSWORD_LENGTH
  ) {
    return {
      success:
        false,

      status:
        400,

      code:
        'CURRENT_PASSWORD_INVALID',

      error:
        'Current password is invalid.',
    };
  }

  if (
    input.requireTwoFactor &&
    !twoFactorCode
  ) {
    return {
      success:
        false,

      status:
        400,

      code:
        'TWO_FACTOR_CODE_REQUIRED',

      error:
        'Enter your authenticator or recovery code.',
    };
  }

  if (
    twoFactorCode.length >
    MAX_TWO_FACTOR_CODE_LENGTH
  ) {
    return {
      success:
        false,

      status:
        400,

      code:
        'TWO_FACTOR_CODE_INVALID',

      error:
        'The two-factor authentication code is invalid.',
    };
  }

  /* ==========================================================
     RATE LIMIT
     ========================================================== */

  const {
    identifier,
    rateAction,
  } =
    getRateLimitContext(
      input.request,
      userId,
      input.action
    );

  const rateLimit =
    await checkRateLimit({
      identifier,

      action:
        rateAction,

      maxAttempts:
        SECURITY_ACTION_MAX_ATTEMPTS,

      windowMs:
        SECURITY_ACTION_WINDOW_MS,

      blockMs:
        SECURITY_ACTION_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request:
        input.request,

      userId,

      eventType:
        'SECURITY_ACTION_RATE_LIMITED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        action:
          input.action,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return {
      success:
        false,

      status:
        429,

      code:
        'SECURITY_ACTION_RATE_LIMITED',

      error:
        'Too many security verification attempts. Please wait before trying again.',

      /*
       * checkRateLimit() returns:
       *
       * number | null
       *
       * while this public result intentionally exposes:
       *
       * number | undefined
       *
       * Normalize null rather than changing either contract.
       */
      retryAfterSeconds:
        rateLimit
          .retryAfterSeconds ??
        undefined,
    };
  }

  /* ==========================================================
     LOAD USER SECURITY CREDENTIALS
     ========================================================== */

  const result =
    await queryControl(
      `
        SELECT
          id,
          password_hash,
          two_factor_enabled

        FROM users

        WHERE id = $1
          AND deleted_at IS NULL
          AND status = 'active'

        LIMIT 1
      `,
      [
        userId,
      ]
    );

  const user =
    result.rows[0] as
      | SecurityUserRow
      | undefined;

  if (!user) {
    return {
      success:
        false,

      status:
        401,

      code:
        'UNAUTHENTICATED',

      error:
        'Your account is no longer available.',
    };
  }

  /* ==========================================================
     PASSWORD AVAILABILITY
     ========================================================== */

  if (
    !user.password_hash
  ) {
    return {
      success:
        false,

      status:
        409,

      code:
        'PASSWORD_REAUTH_UNAVAILABLE',

      error:
        'This security action requires password verification, but this account does not currently have a password.',
    };
  }

  /* ==========================================================
     VERIFY PASSWORD
     ========================================================== */

  const passwordValid =
    await verifyPassword(
      currentPassword,
      user.password_hash
    );

  if (
    !passwordValid
  ) {
    await safeRecordAuthEvent({
      request:
        input.request,

      userId,

      eventType:
        'SECURITY_REAUTH_FAILED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        action:
          input.action,

        reason:
          'invalid_password',
      },
    });

    return {
      success:
        false,

      status:
        401,

      code:
        'CURRENT_PASSWORD_INCORRECT',

      error:
        'Your current password is incorrect.',
    };
  }

  /* ==========================================================
     VERIFY 2FA WHEN REQUIRED
     ========================================================== */

  if (
    input.requireTwoFactor
  ) {
    if (
      user.two_factor_enabled !==
      true
    ) {
      return {
        success:
          false,

        status:
          409,

        code:
          'TWO_FACTOR_NOT_ENABLED',

        error:
          'Two-factor authentication is not currently enabled.',
      };
    }

    const codeValid =
      await verifyUserTwoFactorCode({
        userId,

        code:
          twoFactorCode,
      });

    if (
      !codeValid
    ) {
      await safeRecordAuthEvent({
        request:
          input.request,

        userId,

        eventType:
          'SECURITY_REAUTH_FAILED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          action:
            input.action,

          reason:
            'invalid_two_factor_code',
        },
      });

      return {
        success:
          false,

        status:
          401,

        code:
          'TWO_FACTOR_CODE_INVALID',

        error:
          'The authenticator or recovery code is invalid.',
      };
    }
  }

  /* ==========================================================
     SUCCESS
     ========================================================== */

  await resetRateLimit(
    identifier,
    rateAction
  );

  return {
    success:
      true,
  };
}