import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  verifyAdminEmail,
} from '@/lib/auth/admin-email-verification';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type VerifyAdminEmailBody = {
  email?:
    unknown;

  code?:
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
   POST /api/admin/auth/verify-email
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
      VerifyAdminEmailBody;

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
          VerifyAdminEmailBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    /* ========================================================
       2. VERIFY
       ======================================================== */

    const result =
      await verifyAdminEmail({
        request,

        email:
          body.email,

        code:
          body.code,
      });

    /* ========================================================
       3. SUCCESS
       ======================================================== */

    if (
      result.success
    ) {
      return jsonResponse({
        success:
          true,

        code:
          result.code,

        verified:
          result.verified,

        alreadyVerified:
          result.alreadyVerified,

        admin:
          result.admin
            ? {
                id:
                  result.admin.id,

                email:
                  result.admin.email,

                firstName:
                  result.admin.firstName,

                lastName:
                  result.admin.lastName,

                fullName:
                  result.admin.fullName,

                role:
                  result.admin.role,

                status:
                  result.admin.status,

                emailVerified:
                  result.admin.emailVerified,

                emailVerifiedAt:
                  result.admin.emailVerifiedAt,
              }
            : null,

        message:
          result.alreadyVerified
            ? 'This administrator email is already verified.'
            : 'Administrator email verified successfully.',

        /*
         * Verification alone does not activate an invited admin.
         *
         * Existing active admins may continue to login.
         * Invited admins will later continue through the
         * invitation/provisioning flow.
         */
        next:
          result.admin?.status ===
          'active'
            ? '/admin/login?verified=1'
            : '/admin/login?verified=1&status=invited',
      });
    }

    /* ========================================================
       4. CONTROLLED FAILURES
       ======================================================== */

    switch (
      result.code
    ) {
      case 'INVALID_EMAIL':
        return errorResponse(
          400,
          result.code,
          result.error ||
            'Enter a valid administrator email address.'
        );

      case 'INVALID_VERIFICATION_CODE':
        return errorResponse(
          400,
          result.code,
          result.error ||
            'Enter the 6-digit verification code.'
        );

      case 'VERIFICATION_RATE_LIMITED':
        return errorResponse(
          429,
          result.code,
          result.error ||
            'Too many verification attempts. Please wait before trying again.',
          {
            retryAfterSeconds:
              result.retryAfterSeconds,
          }
        );

      case 'ADMIN_NOT_ELIGIBLE':
        return errorResponse(
          403,
          result.code,
          result.error ||
            'This administrator account cannot be verified.'
        );

      case 'INVALID_OR_EXPIRED_CODE':
        return errorResponse(
          400,
          result.code,
          result.error ||
            'The verification code is invalid or has expired.'
        );

      default:
        return errorResponse(
          400,
          result.code,
          result.error ||
            'Could not verify this administrator email.'
        );
    }
  } catch (
    error
  ) {
    console.error(
      '[Admin Auth] Email verification failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_VERIFICATION_ERROR',
      'SaMi could not verify the administrator email. Please try again.'
    );
  }
}