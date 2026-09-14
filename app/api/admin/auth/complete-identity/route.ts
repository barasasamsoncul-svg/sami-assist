import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  completeAdminIdentity,
} from '@/lib/auth/admin-identity-setup';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   TYPES
   ============================================================ */

type CompleteIdentityBody = {
  token?:
    unknown;

  password?:
    unknown;

  confirmPassword?:
    unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200,
  additionalHeaders?: Record<
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

        ...additionalHeaders,
      },
    }
  );
}

/* ============================================================
   ORIGIN VALIDATION

   This is a public authentication endpoint, so there is no admin
   session to authenticate yet.

   The setup token is the authentication secret.

   We still reject browser requests explicitly originating from
   another website.
   ============================================================ */

function getAllowedOrigins(
  request:
    NextRequest
): Set<string> {
  const origins =
    new Set<string>();

  try {
    origins.add(
      request.nextUrl.origin
    );
  } catch {
    // Ignore invalid request URL.
  }

  const configuredAppUrl =
    process.env.APP_URL
      ?.trim();

  if (
    configuredAppUrl
  ) {
    try {
      origins.add(
        new URL(
          configuredAppUrl
        ).origin
      );
    } catch {
      /*
       * APP_URL deployment validation belongs to infrastructure
       * configuration.
       *
       * request.nextUrl.origin may still safely establish the
       * current same-origin boundary.
       */
    }
  }

  return origins;
}

function isTrustedBrowserRequest(
  request:
    NextRequest
): boolean {
  const origin =
    request.headers.get(
      'origin'
    );

  const secFetchSite =
    request.headers.get(
      'sec-fetch-site'
    );

  /*
   * Explicit browser cross-site requests are rejected.
   */
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
      const normalizedOrigin =
        new URL(
          origin
        ).origin;

      return getAllowedOrigins(
        request
      ).has(
        normalizedOrigin
      );
    } catch {
      return false;
    }
  }

  /*
   * same-site is deliberately not treated as same-origin.
   *
   * Another subdomain should not automatically be trusted to
   * submit administrator credentials.
   */
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
   * Non-browser/testing clients may omit browser fetch metadata.
   * The one-time cryptographically random setup token remains the
   * actual authorization credential.
   */
  return true;
}

/* ============================================================
   BODY SIZE

   Prevent unexpectedly large JSON payloads reaching password
   processing.
   ============================================================ */

function hasOversizedBody(
  request:
    NextRequest
): boolean {
  const contentLength =
    request.headers.get(
      'content-length'
    );

  if (
    !contentLength
  ) {
    return false;
  }

  const length =
    Number(
      contentLength
    );

  if (
    !Number.isFinite(
      length
    )
  ) {
    return false;
  }

  return length >
    16 * 1024;
}

/* ============================================================
   DATABASE / INFRASTRUCTURE ERRORS
   ============================================================ */

function isTransientInfrastructureError(
  error:
    unknown
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

  if (
    transientCodes.has(
      code
    )
  ) {
    return true;
  }

  return (
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
      'timeout'
    ) ||
    message.includes(
      'timed out'
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
   POST /api/admin/auth/complete-identity
   ============================================================ */

export async function POST(
  request:
    NextRequest
) {
  try {
    /* ========================================================
       1. REQUEST ORIGIN
       ======================================================== */

    if (
      !isTrustedBrowserRequest(
        request
      )
    ) {
      return jsonResponse(
        {
          success:
            false,

          code:
            'UNTRUSTED_REQUEST',

          error:
            'This administrator setup request could not be verified.',
        },
        403
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
      return jsonResponse(
        {
          success:
            false,

          code:
            'REQUEST_TOO_LARGE',

          error:
            'The request is too large.',
        },
        413
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
      return jsonResponse(
        {
          success:
            false,

          code:
            'UNSUPPORTED_CONTENT_TYPE',

          error:
            'This endpoint requires a JSON request.',
        },
        415
      );
    }

    /* ========================================================
       4. PARSE BODY
       ======================================================== */

    let body:
      CompleteIdentityBody;

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
        return jsonResponse(
          {
            success:
              false,

            code:
              'INVALID_REQUEST',

            error:
              'Invalid request body.',
          },
          400
        );
      }

      body =
        parsed as
          CompleteIdentityBody;
    } catch {
      return jsonResponse(
        {
          success:
            false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    /* ========================================================
       5. COMPLETE IDENTITY
       ======================================================== */

    const result =
      await completeAdminIdentity({
        request,

        token:
          body.token,

        password:
          body.password,

        confirmPassword:
          body.confirmPassword,
      });

    /* ========================================================
       6. SUCCESS
       ======================================================== */

    if (
      result.success
    ) {
      return jsonResponse(
        {
          success:
            true,

          code:
            result.code,

          message:
            'Administrator account setup completed successfully.',

          admin:
            result.admin,

          next:
            result.next,
        },
        200
      );
    }

    /* ========================================================
       7. CONTROLLED FAILURES
       ======================================================== */

    switch (
      result.code
    ) {
      case 'INVALID_TOKEN':
      case 'SETUP_TOKEN_INVALID':
        /*
         * Keep these equivalent from the outside.
         *
         * Do not expose whether the token had the correct shape,
         * existed previously, expired or was already consumed.
         */
        return jsonResponse(
          {
            success:
              false,

            code:
              'SETUP_TOKEN_INVALID',

            error:
              'This administrator setup link is invalid or has expired.',
          },
          400
        );

      case 'INVALID_PASSWORD':
        return jsonResponse(
          {
            success:
              false,

            code:
              result.code,

            error:
              result.error,
          },
          400
        );

      case 'PASSWORD_MISMATCH':
        return jsonResponse(
          {
            success:
              false,

            code:
              result.code,

            error:
              result.error,
          },
          400
        );

      case 'SETUP_RATE_LIMITED': {
        const retryAfterSeconds =
          Math.max(
            1,
            Number(
              result.retryAfterSeconds ||
              60
            )
          );

        return jsonResponse(
          {
            success:
              false,

            code:
              result.code,

            error:
              result.error,

            retryAfterSeconds,
          },
          429,
          {
            'Retry-After':
              String(
                retryAfterSeconds
              ),
          }
        );
      }

      case 'ADMIN_NOT_ELIGIBLE':
        /*
         * Do not reveal whether the administrator was disabled,
         * deleted, already activated, or otherwise changed state.
         */
        return jsonResponse(
          {
            success:
              false,

            code:
              'SETUP_TOKEN_INVALID',

            error:
              'This administrator setup link is invalid or has expired.',
          },
          400
        );

      case 'SETUP_COMPLETION_FAILED':
        return jsonResponse(
          {
            success:
              false,

            code:
              'SETUP_COMPLETION_FAILED',

            error:
              'SaMi could not complete administrator setup.',
          },
          500
        );
    }
  } catch (
    error
  ) {
    /* ========================================================
       8. INFRASTRUCTURE FAILURE
       ======================================================== */

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      console.error(
        '[Admin Complete Identity API] Temporary infrastructure failure:',
        error instanceof
          Error
          ? error.message
          : 'Unknown infrastructure failure'
      );

      return jsonResponse(
        {
          success:
            false,

          code:
            'SERVICE_TEMPORARILY_UNAVAILABLE',

          error:
            'SaMi is temporarily unable to complete administrator setup.',
        },
        503,
        {
          'Retry-After':
            '30',
        }
      );
    }

    /* ========================================================
       9. UNKNOWN ERROR
       ======================================================== */

    console.error(
      '[Admin Complete Identity API] Unexpected failure:',
      error instanceof
        Error
        ? error.message
        : 'Unknown administrator setup error'
    );

    return jsonResponse(
      {
        success:
          false,

        code:
          'ADMIN_IDENTITY_SETUP_ERROR',

        error:
          'SaMi could not complete administrator setup.',
      },
      500
    );
  }
}