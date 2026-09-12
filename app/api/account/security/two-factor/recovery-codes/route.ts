import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getTwoFactorStatus,
  regenerateTwoFactorRecoveryCodes,
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

type RegenerateBody = {
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
      '[Security] Failed to record recovery-code event:',
      error
    );
  }
}

/* ============================================================
   POST / REGENERATE
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

  try {
    const status =
      await getTwoFactorStatus(
        session.user.id
      );

    if (
      !status.enabled
    ) {
      return jsonError(
        409,
        'TWO_FACTOR_NOT_ENABLED',
        'Enable two-factor authentication before generating recovery codes.'
      );
    }

    /* ========================================================
       BODY
       ======================================================== */

    let body:
      RegenerateBody;

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
        parsed as RegenerateBody;
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
          'two-factor-recovery-regenerate',

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
       REGENERATE
       ======================================================== */

    const recoveryCodes =
      await regenerateTwoFactorRecoveryCodes(
        session.user.id
      );

    await safeRecordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'TWO_FACTOR_RECOVERY_CODES_REGENERATED',

      entityType:
        'user',

      entityId:
        session.user.id,

      metadata: {
        recoveryCodeCount:
          recoveryCodes
            .length,
      },
    });

    const after =
      await getTwoFactorStatus(
        session.user.id
      );

    /*
     * Existing unused recovery codes were revoked.
     *
     * These new plaintext codes are returned exactly once.
     */
    return jsonResponse({
      success:
        true,

      code:
        'TWO_FACTOR_RECOVERY_CODES_REGENERATED',

      message:
        'New recovery codes have been generated. Your previous unused recovery codes no longer work.',

      recoveryCodes,

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
      '[Security] Failed to regenerate recovery codes:',
      error
    );

    return jsonError(
      500,
      'RECOVERY_CODE_REGENERATION_ERROR',
      'SaMi could not generate new recovery codes.'
    );
  }
}