import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  getTwoFactorMethodStatus,
  isTwoFactorMethod,
  setPreferredTwoFactorMethod,
  TwoFactorStateError,
  type TwoFactorMethod,
} from '@/lib/auth/two-factor-methods';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const RATE_LIMIT_MAX_ATTEMPTS =
  10;

const RATE_LIMIT_WINDOW_MS =
  10 * 60 * 1000;

const RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type PreferredMethodBody = {
  method?: unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body: Record<
    string,
    unknown
  >,
  status = 200,
  extraHeaders?:
    Record<
      string,
      string
    >
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

        ...extraHeaders,
      },
    }
  );
}

/* ============================================================
   ERROR RESPONSE
   ============================================================ */

function errorResponse(
  status: number,
  code: string,
  error: string,
  extra?: Record<
    string,
    unknown
  >,
  headers?: Record<
    string,
    string
  >
) {
  return jsonResponse(
    {
      success:
        false,

      code,

      error,

      ...(extra || {}),
    },
    status,
    headers
  );
}

/* ============================================================
   REQUEST BODY
   ============================================================ */

async function readBody(
  request:
    NextRequest
): Promise<
  PreferredMethodBody | null
> {
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
      return null;
    }

    return parsed as
      PreferredMethodBody;
  } catch {
    return null;
  }
}

/* ============================================================
   NORMALIZE METHOD
   ============================================================ */

function normalizeMethod(
  value: unknown
):
  | TwoFactorMethod
  | null {
  if (
    typeof value !==
    'string'
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toLowerCase();

  return isTwoFactorMethod(
    normalized
  )
    ? normalized
    : null;
}

/* ============================================================
   TRUSTED MUTATION
   ============================================================ */

function isTrustedMutationRequest(
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
      'same-site' &&
    fetchSite !==
      'none'
  ) {
    return false;
  }

  const origin =
    request.headers
      .get(
        'origin'
      )
      ?.trim();

  if (
    !origin
  ) {
    return true;
  }

  const host =
    request.headers
      .get(
        'host'
      )
      ?.trim()
      .toLowerCase();

  if (
    !host
  ) {
    return false;
  }

  try {
    const originUrl =
      new URL(
        origin
      );

    return (
      originUrl.host
        .toLowerCase() ===
      host
    );
  } catch {
    return false;
  }
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getRateLimitIdentifier(
  request:
    NextRequest,
  userId:
    string
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `two-factor-preferred:${userId}:${ip}`;
}

/* ============================================================
   AUDIT
   ============================================================ */

async function safeRecordAuthEvent(
  input: Parameters<
    typeof recordAuthEvent
  >[0]
) {
  try {
    await recordAuthEvent(
      input
    );
  } catch (error) {
    /*
     * An audit-storage failure must not turn an already
     * completed preference update into a failed response.
     */
    console.error(
      '[Security] Failed to record preferred 2FA method event:',
      error
    );
  }
}

/* ============================================================
   TWO FACTOR STATE ERROR
   ============================================================ */

function twoFactorStateErrorResponse(
  error:
    TwoFactorStateError
) {
  switch (
    error.code
  ) {
    case 'METHOD_NOT_ENABLED':
      return errorResponse(
        409,
        error.code,
        error.message
      );

    case 'INVALID_TWO_FACTOR_METHOD':
      return errorResponse(
        400,
        error.code,
        error.message
      );

    case 'ACCOUNT_NOT_AVAILABLE':
      return errorResponse(
        403,
        error.code,
        error.message
      );

    case 'EMAIL_NOT_VERIFIED':
      return errorResponse(
        409,
        error.code,
        error.message
      );

    default:
      return errorResponse(
        400,
        'PREFERRED_TWO_FACTOR_METHOD_ERROR',
        error.message
      );
  }
}

/* ============================================================
   GET
   /api/account/security/two-factor/preferred

   Returns:
   - preferred method
   - available primary methods
   - complete current multi-method state

   Recovery codes are intentionally NOT a preferred method.
   They remain emergency fallback credentials.
   ============================================================ */

export async function GET() {
  /* ==========================================================
     1. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Security] Preferred 2FA method session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'PREFERRED_TWO_FACTOR_METHOD_ERROR',
      'SaMi could not load your preferred verification method.'
    );
  }

  if (
    !session
  ) {
    return errorResponse(
      401,
      'UNAUTHENTICATED',
      'Your SaMi session has expired. Sign in again to continue.'
    );
  }

  /* ==========================================================
     2. LOAD STATE
     ========================================================== */

  try {
    const status =
      await getTwoFactorMethodStatus(
        session.user.id
      );

    return jsonResponse({
      success:
        true,

      code:
        'PREFERRED_TWO_FACTOR_METHOD_STATUS',

      preferredMethod:
        status
          .preferredMethod,

      availableMethods:
        status
          .availableMethods,

      canChoosePreferredMethod:
        status
          .availableMethods
          .length >
        1,

      twoFactor:
        status,
    });
  } catch (error) {
    console.error(
      '[Security] Failed to load preferred 2FA method:',
      error
    );

    if (
      error instanceof
        TwoFactorStateError
    ) {
      return twoFactorStateErrorResponse(
        error
      );
    }

    return errorResponse(
      500,
      'PREFERRED_TWO_FACTOR_METHOD_ERROR',
      'SaMi could not load your preferred verification method.'
    );
  }
}

/* ============================================================
   PATCH
   /api/account/security/two-factor/preferred

   BODY

   {
     "method": "authenticator"
   }

   OR

   {
     "method": "email"
   }

   RULES

   - authenticated user only
   - same-origin mutation
   - only supported methods
   - selected method must already be enabled
   - preference only matters when two primary methods exist
   - recovery codes are never selectable as preferred
   ============================================================ */

export async function PATCH(
  request:
    NextRequest
) {
  /* ==========================================================
     1. TRUSTED MUTATION
     ========================================================== */

  if (
    !isTrustedMutationRequest(
      request
    )
  ) {
    return errorResponse(
      403,
      'UNTRUSTED_SECURITY_REQUEST',
      'SaMi could not verify the origin of this security request.'
    );
  }

  /* ==========================================================
     2. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Security] Preferred 2FA method session lookup failed:',
      error
    );

    return errorResponse(
      500,
      'PREFERRED_TWO_FACTOR_METHOD_ERROR',
      'SaMi could not change your preferred verification method.'
    );
  }

  if (
    !session
  ) {
    return errorResponse(
      401,
      'UNAUTHENTICATED',
      'Your SaMi session has expired. Sign in again to continue.'
    );
  }

  const userId =
    session.user.id;

  /* ==========================================================
     3. BODY
     ========================================================== */

  const body =
    await readBody(
      request
    );

  if (
    !body
  ) {
    return errorResponse(
      400,
      'INVALID_REQUEST',
      'Invalid request body.'
    );
  }

  const method =
    normalizeMethod(
      body.method
    );

  if (
    !method
  ) {
    return errorResponse(
      400,
      'INVALID_TWO_FACTOR_METHOD',
      'Choose either authenticator or email verification.'
    );
  }

  /* ==========================================================
     4. RATE LIMIT
     ========================================================== */

  const rateLimitKey =
    getRateLimitIdentifier(
      request,
      userId
    );

  const rateLimit =
    await checkRateLimit({
      identifier:
        rateLimitKey,

      action:
        'two-factor-preferred',

      maxAttempts:
        RATE_LIMIT_MAX_ATTEMPTS,

      windowMs:
        RATE_LIMIT_WINDOW_MS,

      blockMs:
        RATE_LIMIT_BLOCK_MS,
    });

  if (
    !rateLimit.allowed
  ) {
    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'PREFERRED_TWO_FACTOR_METHOD_RATE_LIMITED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        requestedMethod:
          method,

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    const retryAfterSeconds =
      rateLimit
        .retryAfterSeconds ??
      undefined;

    return errorResponse(
      429,
      'PREFERRED_TWO_FACTOR_METHOD_RATE_LIMITED',
      'Too many security-setting changes. Wait before trying again.',
      {
        retryAfterSeconds,
      },
      retryAfterSeconds
        ? {
            'Retry-After':
              String(
                retryAfterSeconds
              ),
          }
        : undefined
    );
  }

  try {
    /* ========================================================
       5. CURRENT STATE
       ======================================================== */

    const beforeStatus =
      await getTwoFactorMethodStatus(
        userId
      );

    /* ========================================================
       6. ACCOUNT MUST HAVE 2FA
       ======================================================== */

    if (
      !beforeStatus.enabled
    ) {
      return errorResponse(
        409,
        'TWO_FACTOR_NOT_ENABLED',
        'Enable a verification method before choosing a preferred method.'
      );
    }

    /* ========================================================
       7. SELECTED METHOD MUST BE ENABLED

       We check here for a clean API response.

       setPreferredTwoFactorMethod() performs the same
       authoritative check again inside its transaction.
       ======================================================== */

    if (
      !beforeStatus
        .availableMethods
        .includes(
          method
        )
    ) {
      return errorResponse(
        409,
        'METHOD_NOT_ENABLED',
        'Enable this verification method before making it your preferred method.'
      );
    }

    /* ========================================================
       8. ONLY ONE PRIMARY METHOD

       There is nothing meaningful to choose when only one
       primary method is enabled.

       The multi-method service already automatically falls back
       to the only available method.
       ======================================================== */

    if (
      beforeStatus
        .availableMethods
        .length <
      2
    ) {
      return errorResponse(
        409,
        'PREFERRED_METHOD_NOT_NEEDED',
        'Enable another verification method before choosing a preferred sign-in method.',
        {
          preferredMethod:
            beforeStatus
              .preferredMethod,

          availableMethods:
            beforeStatus
              .availableMethods,

          twoFactor:
            beforeStatus,
        }
      );
    }

    /* ========================================================
       9. IDEMPOTENT REQUEST

       Avoid unnecessary database writes and audit noise when
       the requested method is already preferred.
       ======================================================== */

    if (
      beforeStatus
        .preferredMethod ===
      method
    ) {
      await resetRateLimit(
        rateLimitKey,
        'two-factor-preferred'
      ).catch(
        (error) => {
          console.error(
            '[Security] Failed to reset preferred 2FA method rate limit:',
            error
          );
        }
      );

      return jsonResponse({
        success:
          true,

        code:
          'PREFERRED_TWO_FACTOR_METHOD_UNCHANGED',

        message:
          method ===
          'authenticator'
            ? 'Authenticator app is already your preferred verification method.'
            : 'Email is already your preferred verification method.',

        preferredMethod:
          beforeStatus
            .preferredMethod,

        availableMethods:
          beforeStatus
            .availableMethods,

        twoFactor:
          beforeStatus,
      });
    }

    /* ========================================================
       10. UPDATE AUTHORITATIVE SECURITY STATE
       ======================================================== */

    const updatedStatus =
      await setPreferredTwoFactorMethod(
        userId,
        method
      );

    /* ========================================================
       11. RESET RATE LIMIT
       ======================================================== */

    await resetRateLimit(
      rateLimitKey,
      'two-factor-preferred'
    ).catch(
      (error) => {
        console.error(
          '[Security] Failed to reset preferred 2FA method rate limit:',
          error
        );
      }
    );

    /* ========================================================
       12. AUDIT
       ======================================================== */

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'PREFERRED_TWO_FACTOR_METHOD_CHANGED',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        previousMethod:
          beforeStatus
            .preferredMethod,

        preferredMethod:
          updatedStatus
            .preferredMethod,

        availableMethods:
          updatedStatus
            .availableMethods,
      },
    });

    /* ========================================================
       13. SUCCESS
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'PREFERRED_TWO_FACTOR_METHOD_CHANGED',

      message:
        method ===
        'authenticator'
          ? 'Authenticator app is now your preferred sign-in verification method.'
          : 'Email is now your preferred sign-in verification method.',

      preferredMethod:
        updatedStatus
          .preferredMethod,

      availableMethods:
        updatedStatus
          .availableMethods,

      twoFactor:
        updatedStatus,
    });
  } catch (error) {
    /* ========================================================
       14. EXPECTED METHOD STATE ERROR
       ======================================================== */

    if (
      error instanceof
        TwoFactorStateError
    ) {
      await safeRecordAuthEvent({
        request,

        userId,

        eventType:
          'PREFERRED_TWO_FACTOR_METHOD_BLOCKED',

        entityType:
          'user',

        entityId:
          userId,

        metadata: {
          requestedMethod:
            method,

          reason:
            error.code,
        },
      });

      return twoFactorStateErrorResponse(
        error
      );
    }

    /* ========================================================
       15. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Security] Failed to change preferred 2FA method:',
      error
    );

    await safeRecordAuthEvent({
      request,

      userId,

      eventType:
        'PREFERRED_TWO_FACTOR_METHOD_ERROR',

      entityType:
        'user',

      entityId:
        userId,

      metadata: {
        requestedMethod:
          method,

        reason:
          'internal_error',
      },
    });

    return errorResponse(
      500,
      'PREFERRED_TWO_FACTOR_METHOD_ERROR',
      'SaMi could not change your preferred verification method. Try again.'
    );
  }
}