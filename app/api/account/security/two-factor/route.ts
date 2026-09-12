import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
  revokeAllOtherSessions,
} from '@/lib/auth/session';

import {
  disableTwoFactor,
  getTwoFactorStatus,
} from '@/lib/auth/two-factor';

import {
  isTrustedSecurityMutation,
  verifySecurityAction,
} from '@/lib/auth/security-action';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type DisableBody = {
  currentPassword?:
    unknown;

  twoFactorCode?:
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
      '[Security] Failed to record 2FA event:',
      error
    );
  }
}

/* ============================================================
   GET STATUS
   ============================================================ */

export async function GET() {
  try {
    const session =
      await getSession();

    if (!session) {
      return jsonError(
        401,
        'UNAUTHENTICATED',
        'Sign in to continue.'
      );
    }

    const status =
      await getTwoFactorStatus(
        session.user.id
      );

    return jsonResponse({
      success:
        true,

      code:
        'TWO_FACTOR_STATUS',

      twoFactor: {
        enabled:
          status.enabled,

        authenticatorCount:
          status.authenticatorCount,

        recoveryCodeCount:
          status.recoveryCodeCount,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Security] Failed to load 2FA status:',
      error
    );

    return jsonError(
      500,
      'TWO_FACTOR_STATUS_ERROR',
      'SaMi could not load your two-factor authentication settings.'
    );
  }
}

/* ============================================================
   DELETE / DISABLE 2FA
   ============================================================ */

export async function DELETE(
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

  try {
    const currentStatus =
      await getTwoFactorStatus(
        session.user.id
      );

    /*
     * Idempotent result.
     *
     * There is nothing dangerous to perform if 2FA is already
     * disabled.
     */
    if (
      !currentStatus.enabled
    ) {
      return jsonResponse({
        success:
          true,

        code:
          'TWO_FACTOR_ALREADY_DISABLED',

        message:
          'Two-factor authentication is already disabled.',

        twoFactor: {
          enabled:
            false,

          authenticatorCount:
            currentStatus
              .authenticatorCount,

          recoveryCodeCount:
            currentStatus
              .recoveryCodeCount,
        },
      });
    }

    /* ========================================================
       BODY
       ======================================================== */

    let body:
      DisableBody;

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
        parsed as DisableBody;
    } catch {
      return jsonError(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    /* ========================================================
       STEP-UP AUTHENTICATION
       ======================================================== */

    const verification =
      await verifySecurityAction({
        request,

        userId:
          session.user.id,

        action:
          'two-factor-disable',

        currentPassword:
          body.currentPassword,

        twoFactorCode:
          body.twoFactorCode,

        requireTwoFactor:
          true,
      });

    if (
      !verification.success
    ) {
      return jsonError(
        verification.status,

        verification.code,

        verification.error,

        verification.retryAfterSeconds
          ? {
              retryAfterSeconds:
                verification.retryAfterSeconds,
            }
          : {}
      );
    }

    /* ========================================================
       DISABLE
       ======================================================== */

    await disableTwoFactor(
      session.user.id
    );

    /*
     * Other devices may have authenticated while 2FA was still
     * enabled or may represent stale access.
     *
     * Keep the browser performing this verified security action,
     * but require every other device to sign in again.
     */
    await revokeAllOtherSessions(
      session.user.id,
      session.sessionId
    );

    await safeRecordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'TWO_FACTOR_DISABLED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        otherSessionsRevoked:
          true,
      },
    });

    const status =
      await getTwoFactorStatus(
        session.user.id
      );

    return jsonResponse({
      success:
        true,

      code:
        'TWO_FACTOR_DISABLED',

      message:
        'Two-factor authentication has been disabled. Other signed-in devices were signed out.',

      twoFactor: {
        enabled:
          status.enabled,

        authenticatorCount:
          status.authenticatorCount,

        recoveryCodeCount:
          status.recoveryCodeCount,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Security] Failed to disable 2FA:',
      error
    );

    return jsonError(
      500,
      'TWO_FACTOR_DISABLE_ERROR',
      'SaMi could not disable two-factor authentication.'
    );
  }
}