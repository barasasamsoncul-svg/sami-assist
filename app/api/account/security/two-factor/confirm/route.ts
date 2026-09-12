import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  revokeAllOtherSessions,
} from '@/lib/auth/session';

import {
  confirmTwoFactorSetup,
  getTwoFactorStatus,
} from '@/lib/auth/two-factor';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

import {
  isTrustedSecurityMutation,
} from '@/lib/auth/security-action';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const CONFIRM_MAX_ATTEMPTS =
  8;

const CONFIRM_WINDOW_MS =
  10 * 60 * 1000;

const CONFIRM_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type ConfirmBody = {
  authenticatorId?:
    unknown;

  code?:
    unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<
      string,
      unknown
    >,

  status =
    200
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
      },
    }
  );
}

function jsonError(
  status:
    number,

  code:
    string,

  error:
    string,

  extra:
    Record<
      string,
      unknown
    > = {}
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,

      ...extra,
    },

    status
  );
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
    console.error(
      '[Security] Failed to record 2FA confirmation event:',
      error
    );
  }
}

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeAuthenticatorId(
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

function normalizeCode(
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

/* ============================================================
   POST / CONFIRM SETUP
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  if (
    !isTrustedSecurityMutation(
      request
    )
  ) {
    return jsonError(
      403,
      'INVALID_REQUEST_ORIGIN',
      'This security request could not be verified.'
    );
  }

  const session =
    await getSession();

  if (!session) {
    return jsonError(
      401,
      'UNAUTHENTICATED',
      'Sign in to continue.'
    );
  }

  /* ==========================================================
     BODY
     ========================================================== */

  let body:
    ConfirmBody;

  try {
    const parsed:
      unknown =
      await request.json();

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      )
    ) {
      return jsonError(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    body =
      parsed as ConfirmBody;
  } catch {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  const authenticatorId =
    normalizeAuthenticatorId(
      body.authenticatorId
    );

  const code =
    normalizeCode(
      body.code
    );

  if (
    !authenticatorId
  ) {
    return jsonError(
      400,
      'AUTHENTICATOR_ID_REQUIRED',
      'Authenticator setup is missing.'
    );
  }

  if (
    !/^\d{6}$/.test(
      code
    )
  ) {
    return jsonError(
      400,
      'TWO_FACTOR_CODE_INVALID',
      'Enter the 6-digit code from your authenticator app.'
    );
  }

  /* ==========================================================
     RATE LIMIT
     ========================================================== */

  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  const rateKey =
    `two-factor-confirm:${session.user.id}:${ip}`;

  const rateAction =
    'two-factor-confirm';

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateKey,

      action:
        rateAction,

      maxAttempts:
        CONFIRM_MAX_ATTEMPTS,

      windowMs:
        CONFIRM_WINDOW_MS,

      blockMs:
        CONFIRM_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'TWO_FACTOR_SETUP_RATE_LIMITED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return jsonError(
      429,
      'TWO_FACTOR_SETUP_RATE_LIMITED',
      'Too many authenticator verification attempts. Please wait before trying again.',
      {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      }
    );
  }

  try {
    /* ========================================================
       STATE BEFORE CONFIRMATION
       ======================================================== */

    const before =
      await getTwoFactorStatus(
        session.user.id
      );

    const firstAuthenticator =
      !before.enabled &&
      before
        .authenticatorCount ===
        0;

    /* ========================================================
       CONFIRM
       ======================================================== */

    const confirmation =
      await confirmTwoFactorSetup({
        userId:
          session.user.id,

        authenticatorId,

        code,
      });

    if (
      !confirmation.success
    ) {
      await safeRecordAuthEvent({
        request,

        userId:
          session.user.id,

        eventType:
          'TWO_FACTOR_SETUP_CONFIRMATION_FAILED',

        entityType:
          'user',

        entityId:
          session.user.id,

        metadata: {
          reason:
            'invalid_or_unavailable_setup',
        },
      });

      return jsonError(
        401,
        'TWO_FACTOR_CODE_INVALID',
        'The authenticator code is invalid or this setup is no longer available.'
      );
    }

    await resetRateLimit(
      rateKey,
      rateAction
    );

    /* ========================================================
       FIRST ENABLEMENT SESSION SAFETY
       ======================================================== */

    if (
      firstAuthenticator
    ) {
      /*
       * Existing sessions authenticated before 2FA was enabled.
       *
       * Keep this verified browser and revoke the others so all
       * other devices must perform a fresh login with 2FA.
       */
      await revokeAllOtherSessions(
        session.user.id,
        session.sessionId
      );
    }

    /* ========================================================
       AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        firstAuthenticator
          ? 'TWO_FACTOR_ENABLED'
          : 'TWO_FACTOR_AUTHENTICATOR_ADDED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        recoveryCodeCount:
          confirmation
            .recoveryCodes
            .length,

        otherSessionsRevoked:
          firstAuthenticator,
      },
    });

    const after =
      await getTwoFactorStatus(
        session.user.id
      );

    /*
     * Recovery codes are intentionally returned exactly once.
     *
     * They must be displayed to the user immediately by the
     * Security UI and must never be logged by the browser.
     */
    return jsonResponse({
      success:
        true,

      code:
        firstAuthenticator
          ? 'TWO_FACTOR_ENABLED'
          : 'TWO_FACTOR_AUTHENTICATOR_ADDED',

      message:
        firstAuthenticator
          ? 'Two-factor authentication is now enabled.'
          : 'The authenticator has been added.',

      recoveryCodes:
        confirmation
          .recoveryCodes,

      twoFactor: {
        enabled:
          after.enabled,

        authenticatorCount:
          after.authenticatorCount,

        recoveryCodeCount:
          after.recoveryCodeCount,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Security] Failed to confirm 2FA setup:',
      error
    );

    return jsonError(
      500,
      'TWO_FACTOR_CONFIRM_ERROR',
      'SaMi could not confirm the authenticator setup.'
    );
  }
}