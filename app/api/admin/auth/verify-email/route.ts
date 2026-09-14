import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  issueAdminIdentitySetupToken,
} from '@/lib/auth/admin-identity-setup';

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
  email?: unknown;
  code?: unknown;
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
  extraHeaders?: Record<
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
          'no-store, no-cache, must-revalidate, private',

        Pragma:
          'no-cache',

        Expires:
          '0',

        'Referrer-Policy':
          'no-referrer',

        'X-Content-Type-Options':
          'nosniff',

        ...extraHeaders,
      },
    }
  );
}

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
   ORIGIN PROTECTION

   This remains a public authentication endpoint, but browser
   submissions must originate from SaMi itself.

   The verification code is still the actual proof of email
   ownership; origin checking adds another browser boundary.
   ============================================================ */

function getAllowedOrigins(
  request: NextRequest
): Set<string> {
  const origins =
    new Set<string>();

  try {
    origins.add(
      request.nextUrl.origin
    );
  } catch {
    // Ignore malformed origin.
  }

  const appUrl =
    process.env.APP_URL
      ?.trim();

  if (
    appUrl
  ) {
    try {
      origins.add(
        new URL(
          appUrl
        ).origin
      );
    } catch {
      /*
       * APP_URL deployment validation belongs to infrastructure
       * configuration. Do not expose configuration details here.
       */
    }
  }

  return origins;
}

function isTrustedBrowserRequest(
  request: NextRequest
): boolean {
  const origin =
    request.headers.get(
      'origin'
    );

  const secFetchSite =
    request.headers.get(
      'sec-fetch-site'
    );

  if (
    secFetchSite ===
      'cross-site'
  ) {
    return false;
  }

  if (
    origin
  ) {
    try {
      return getAllowedOrigins(
        request
      ).has(
        new URL(
          origin
        ).origin
      );
    } catch {
      return false;
    }
  }

  if (
    secFetchSite
  ) {
    return (
      secFetchSite ===
        'same-origin' ||
      secFetchSite ===
        'none'
    );
  }

  /*
   * Allows controlled non-browser/testing clients that do not
   * send browser fetch metadata.
   */
  return true;
}

/* ============================================================
   BODY SIZE
   ============================================================ */

function hasOversizedBody(
  request: NextRequest
): boolean {
  const raw =
    request.headers.get(
      'content-length'
    );

  if (
    !raw
  ) {
    return false;
  }

  const length =
    Number(
      raw
    );

  return (
    Number.isFinite(
      length
    ) &&
    length >
      8 * 1024
  );
}

/* ============================================================
   INFRASTRUCTURE ERROR
   ============================================================ */

function isTransientInfrastructureError(
  error: unknown
): boolean {
  if (
    !error ||
    typeof error !==
      'object'
  ) {
    return false;
  }

  const candidate =
    error as {
      code?: unknown;
      message?: unknown;
    };

  const code =
    typeof candidate.code ===
      'string'
      ? candidate.code
      : '';

  const message =
    typeof candidate.message ===
      'string'
      ? candidate.message
          .toLowerCase()
      : '';

  const transientCodes =
    new Set([
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ENETUNREACH',

      '08000',
      '08001',
      '08003',
      '08004',
      '08006',
      '08007',
      '08P01',

      '57P01',
      '57P02',
      '57P03',
    ]);

  return (
    transientCodes.has(
      code
    ) ||
    message.includes(
      'connection terminated'
    ) ||
    message.includes(
      'connection refused'
    ) ||
    message.includes(
      'connection reset'
    ) ||
    message.includes(
      'timed out'
    ) ||
    message.includes(
      'timeout'
    ) ||
    message.includes(
      'server closed the connection'
    ) ||
    message.includes(
      'database is unavailable'
    )
  );
}

/* ============================================================
   IDENTITY SETUP HANDOFF
   ============================================================ */

async function createIdentitySetupHandoff(
  admin: {
    id: string;
    email: string;
    status: string;
  }
):
  Promise<
    | {
        required: false;
        next: string;
        expiresAt: null;
      }
    | {
        required: true;
        next: string;
        expiresAt: string;
      }
  > {
  /*
   * Existing active administrators only needed email
   * verification. They return to normal authentication.
   */
  if (
    admin.status !==
      'invited'
  ) {
    return {
      required:
        false,

      next:
        '/admin/login?verified=1',

      expiresAt:
        null,
    };
  }

  /*
   * Invited administrators must finish creation of their own
   * credential before they can become active.
   */
  const setup =
    await issueAdminIdentitySetupToken({
      adminId:
        admin.id,

      email:
        admin.email,
    });

  return {
    required:
      true,

    /*
     * The token is never persisted in plaintext server-side.
     *
     * The target page/API must also use Referrer-Policy:
     * no-referrer and must not send the token to analytics/logging.
     */
    next:
      `/admin/complete-identity?token=${encodeURIComponent(
        setup.token
      )}`,

    expiresAt:
      setup.expiresAt
        .toISOString(),
  };
}

/* ============================================================
   POST /api/admin/auth/verify-email
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    /* ========================================================
       1. ORIGIN
       ======================================================== */

    if (
      !isTrustedBrowserRequest(
        request
      )
    ) {
      return errorResponse(
        403,
        'UNTRUSTED_REQUEST',
        'This administrator verification request could not be verified.'
      );
    }

    /* ========================================================
       2. REQUEST SIZE
       ======================================================== */

    if (
      hasOversizedBody(
        request
      )
    ) {
      return errorResponse(
        413,
        'REQUEST_TOO_LARGE',
        'The request is too large.'
      );
    }

    /* ========================================================
       3. CONTENT TYPE
       ======================================================== */

    const contentType =
      request.headers.get(
        'content-type'
      ) || '';

    if (
      !contentType
        .toLowerCase()
        .startsWith(
          'application/json'
        )
    ) {
      return errorResponse(
        415,
        'UNSUPPORTED_CONTENT_TYPE',
        'This endpoint requires a JSON request.'
      );
    }

    /* ========================================================
       4. PARSE BODY
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
       5. VERIFY EMAIL
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
       6. VERIFICATION SUCCESS
       ======================================================== */

    if (
      result.success
    ) {
      /*
       * A successful verification result should always contain
       * the resolved administrator.
       *
       * Fail closed if that contract is violated.
       */
      if (
        !result.admin
      ) {
        console.error(
          '[Admin Verify Email API] Verification succeeded without administrator identity.'
        );

        return errorResponse(
          500,
          'EMAIL_VERIFICATION_ERROR',
          'SaMi could not complete administrator verification.'
        );
      }

      let handoff;

      try {
        handoff =
          await createIdentitySetupHandoff(
            result.admin
          );
      } catch (
        error
      ) {
        /*
         * IMPORTANT:
         *
         * Email verification itself may already have committed.
         *
         * We MUST NOT undo verification merely because creation
         * of the next identity-setup challenge failed.
         *
         * A retry using the same consumed verification code can
         * still be recognized by verifyAdminEmail() as an
         * already-verified flow and issue a fresh setup token.
         */

        console.error(
          '[Admin Verify Email API] Identity setup handoff failed:',
          error instanceof
            Error
            ? error.message
            : 'Unknown identity setup error'
        );

        if (
          isTransientInfrastructureError(
            error
          )
        ) {
          return jsonResponse(
            {
              success:
                false,

              code:
                'IDENTITY_SETUP_TEMPORARILY_UNAVAILABLE',

              error:
                'Your administrator email is verified, but SaMi could not start account setup right now. Please retry verification shortly.',

              verified:
                true,

              alreadyVerified:
                result.alreadyVerified,

              retryable:
                true,
            },
            503,
            {
              'Retry-After':
                '30',
            }
          );
        }

        /*
         * If the identity is no longer invited/eligible between
         * verification and setup-token issuance, do not expose
         * the administrator's internal state.
         */
        return jsonResponse(
          {
            success:
              false,

            code:
              'IDENTITY_SETUP_UNAVAILABLE',

            error:
              'Your administrator email is verified, but account setup could not be started.',

            verified:
              true,

            alreadyVerified:
              result.alreadyVerified,
          },
          409
        );
      }

      return jsonResponse({
        success:
          true,

        code:
          result.code,

        verified:
          result.verified,

        alreadyVerified:
          result.alreadyVerified,

        admin: {
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
        },

        identitySetup: {
          required:
            handoff.required,

          expiresAt:
            handoff.expiresAt,
        },

        message:
          handoff.required
            ? result.alreadyVerified
              ? 'Administrator email is verified. Complete your account setup.'
              : 'Administrator email verified successfully. Complete your account setup.'
            : result.alreadyVerified
              ? 'This administrator email is already verified.'
              : 'Administrator email verified successfully.',

        next:
          handoff.next,
      });
    }

    /* ========================================================
       7. CONTROLLED FAILURES
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

      case 'VERIFICATION_RATE_LIMITED': {
        const retryAfterSeconds =
          Math.max(
            1,
            Number(
              result.retryAfterSeconds ||
                60
            )
          );

        return errorResponse(
          429,
          result.code,
          result.error ||
            'Too many verification attempts. Please wait before trying again.',
          {
            retryAfterSeconds,
          },
          {
            'Retry-After':
              String(
                retryAfterSeconds
              ),
          }
        );
      }

      /*
       * Keep account eligibility private.
       *
       * A public caller should not be able to distinguish:
       * - suspended
       * - disabled
       * - deleted
       * - unsupported account state
       */
      case 'ADMIN_NOT_ELIGIBLE':
        return errorResponse(
          400,
          'INVALID_OR_EXPIRED_CODE',
          'The verification code is invalid or has expired.'
        );

      case 'INVALID_OR_EXPIRED_CODE':
        return errorResponse(
          400,
          result.code,
          'The verification code is invalid or has expired.'
        );

      case 'EMAIL_VERIFICATION_ERROR':
        return errorResponse(
          500,
          result.code,
          'SaMi could not verify the administrator email.'
        );

      default:
        return errorResponse(
          400,
          'INVALID_OR_EXPIRED_CODE',
          'The verification code is invalid or has expired.'
        );
    }
  } catch (
    error
  ) {
    /* ========================================================
       8. TRANSIENT INFRASTRUCTURE FAILURE
       ======================================================== */

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      console.error(
        '[Admin Verify Email API] Temporary infrastructure failure:',
        error instanceof
          Error
          ? error.message
          : 'Unknown infrastructure error'
      );

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to verify the administrator email.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    /* ========================================================
       9. UNKNOWN FAILURE
       ======================================================== */

    console.error(
      '[Admin Verify Email API] Unexpected verification failure:',
      error instanceof
        Error
        ? error.message
        : 'Unknown administrator verification error'
    );

    return errorResponse(
      500,
      'EMAIL_VERIFICATION_ERROR',
      'SaMi could not verify the administrator email.'
    );
  }
}