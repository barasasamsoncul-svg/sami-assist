import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  createTwoFactorSetup,
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

type SetupBody = {
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
      '[Security] Failed to record 2FA setup event:',
      error
    );
  }
}

/* ============================================================
   POST / START SETUP
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
    SetupBody;

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
      parsed as SetupBody;
  } catch {
    return jsonError(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  try {
    /* ========================================================
       CURRENT STATE
       ======================================================== */

    const currentStatus =
      await getTwoFactorStatus(
        session.user.id
      );

    /*
     * If an active authenticator already exists, adding another
     * one requires BOTH:
     *
     * - current password
     * - existing 2FA
     *
     * This also handles an unlikely inconsistent database state
     * where the user flag is false but an active authenticator
     * still exists.
     */
    const requiresExistingTwoFactor =
      currentStatus.enabled ||
      currentStatus
        .authenticatorCount >
        0;

    /* ========================================================
       STEP-UP AUTHENTICATION
       ======================================================== */

    const verification =
      await verifySecurityAction({
        request,

        userId:
          session.user.id,

        action:
          'two-factor-setup',

        currentPassword:
          body.currentPassword,

        twoFactorCode:
          body.twoFactorCode,

        requireTwoFactor:
          requiresExistingTwoFactor,
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
       CREATE PENDING AUTHENTICATOR
       ======================================================== */

    const setup =
      await createTwoFactorSetup({
        userId:
          session.user.id,

        email:
          session.user.email,
      });

    await safeRecordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'TWO_FACTOR_SETUP_STARTED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        addingAdditionalAuthenticator:
          requiresExistingTwoFactor,
      },
    });

    /*
     * secret and otpAuthUrl are intentionally returned only for
     * this active setup flow.
     *
     * They are protected by:
     * - authenticated session
     * - password step-up
     * - existing 2FA step-up when applicable
     * - no-store response headers
     *
     * Never log either value.
     */
    return jsonResponse({
      success:
        true,

      code:
        'TWO_FACTOR_SETUP_CREATED',

      setup: {
        authenticatorId:
          setup.authenticatorId,

        secret:
          setup.secret,

        otpAuthUrl:
          setup.otpAuthUrl,

        addingAdditionalAuthenticator:
          requiresExistingTwoFactor,
      },
    });
  } catch (
    error
  ) {
    console.error(
      '[Security] Failed to start 2FA setup:',
      error
    );

    return jsonError(
      500,
      'TWO_FACTOR_SETUP_ERROR',
      'SaMi could not start authenticator setup.'
    );
  }
}