import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  isValidAdminVerificationEmail,
  normalizeAdminVerificationEmail,
  requestAdminEmailVerification,
} from '@/lib/auth/admin-email-verification';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type ResendVerificationBody = {
  email?:
    unknown;
};

/* ============================================================
   RESPONSE HELPERS
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

function errorResponse(
  status:
    number,
  code:
    string,
  error:
    string,
  extra?:
    Record<
      string,
      unknown
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
    status
  );
}

/* ============================================================
   GENERIC SUCCESS
   ============================================================ */

/**
 * Public resend requests MUST NOT reveal:
 *
 * - whether an administrator exists;
 * - whether the account is active;
 * - whether the account is invited;
 * - whether the email is already verified;
 * - whether delivery succeeded;
 * - whether the account is suspended/disabled.
 *
 * This keeps the endpoint safe against administrator-account
 * enumeration.
 */
function genericSuccessResponse(
  retryAfterSeconds?:
    number | null
) {
  return jsonResponse({
    success:
      true,

    code:
      'VERIFICATION_REQUEST_ACCEPTED',

    message:
      'If an eligible administrator account exists for that email, SaMi will send a verification code.',

    retryAfterSeconds:
      retryAfterSeconds ??
      null,
  });
}

/* ============================================================
   POST /api/admin/auth/resend-verification
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  try {
    /* ========================================================
       1. PARSE BODY
       ======================================================== */

    let body:
      ResendVerificationBody;

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
        return errorResponse(
          400,
          'INVALID_REQUEST',
          'Invalid request body.'
        );
      }

      body =
        parsed as
          ResendVerificationBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    /* ========================================================
       2. NORMALIZE EMAIL
       ======================================================== */

    const email =
      normalizeAdminVerificationEmail(
        body.email
      );

    /* ========================================================
       3. BASIC INPUT VALIDATION
       ======================================================== */

    /*
     * Invalid syntax can safely return a normal validation
     * message because this reveals nothing about whether an
     * administrator identity exists.
     */
    if (
      !isValidAdminVerificationEmail(
        email
      )
    ) {
      return errorResponse(
        400,
        'INVALID_EMAIL',
        'Enter a valid administrator email address.'
      );
    }

    /* ========================================================
       4. REQUEST VERIFICATION
       ======================================================== */

    const result =
      await requestAdminEmailVerification({
        request,

        email,

        purpose:
          'resend_verification',
      });

    /* ========================================================
       5. PUBLIC ANTI-ENUMERATION RESPONSE
       ======================================================== */

    /*
     * The verification engine deliberately carries internal
     * information such as:
     *
     * - sent
     * - alreadyVerified
     * - admin
     * - cooldown
     *
     * None of those account-state details should be exposed to
     * an unauthenticated caller.
     */

    if (
      result.cooldown &&
      result.retryAfterSeconds
    ) {
      /*
       * We still keep the response generic.
       *
       * Returning retryAfterSeconds is acceptable because it
       * describes request throttling rather than account
       * existence.
       */
      return genericSuccessResponse(
        result.retryAfterSeconds
      );
    }

    return genericSuccessResponse();
  } catch (
    error
  ) {
    console.error(
      '[Admin Auth] Resend email verification failed:',
      error
    );

    /*
     * Do not leak database, SMTP, account-state, or internal
     * implementation details.
     */
    return errorResponse(
      500,
      'EMAIL_VERIFICATION_ERROR',
      'SaMi could not process the verification request. Please try again.'
    );
  }
}