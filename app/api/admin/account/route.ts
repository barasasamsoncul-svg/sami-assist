import {
  NextResponse,
} from 'next/server';

import {
  requireAdminSession,
} from '@/lib/auth/admin-session';

import {
  getPlatformAdminEmailAccount,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  getAvatarRecord,
  AvatarError,
} from '@/lib/account/avatar';

export const runtime =
  'nodejs';

export const dynamic =
  'force-dynamic';

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
  body:
    Record<string, unknown>,
  status =
    200,
  extraHeaders?:
    Record<string, string>
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
  status:
    number,
  code:
    string,
  error:
    string,
  extra?:
    Record<string, unknown>,
  headers?:
    Record<string, string>
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
   INFRASTRUCTURE
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
   GET
   /api/admin/account

   Returns the authenticated Platform Administrator's own
   authoritative account identity.

   Browser-controlled identifiers are never accepted here.
   ============================================================ */

export async function GET() {
  /* ==========================================================
     1. AUTHENTICATED ADMIN SESSION
     ========================================================== */

  let session;

  try {
    session =
      await requireAdminSession();
  } catch (error) {
    if (
      error instanceof
        Error &&
      error.message ===
        'ADMIN_UNAUTHENTICATED'
    ) {
      return errorResponse(
        401,
        'ADMIN_UNAUTHENTICATED',
        'Your administrator session has expired. Sign in again.'
      );
    }

    console.error(
      '[Admin Account] Session lookup failed:',
      error
    );

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      return errorResponse(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable.',
        {
          retryable:
            true,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return errorResponse(
      500,
      'ADMIN_SESSION_ERROR',
      'SaMi could not verify your administrator session.'
    );
  }

  /* ==========================================================
     2. AUTHORITATIVE ACCOUNT + AVATAR STATE
     ========================================================== */

  try {
    const account =
      await getPlatformAdminEmailAccount(
        session.adminId
      );

    /* ========================================================
       3. DEFENCE-IN-DEPTH ACCOUNT STATE
       ======================================================== */

    if (
      account.status !==
      'active'
    ) {
      return errorResponse(
        403,
        'ADMIN_ACCOUNT_UNAVAILABLE',
        'This administrator account is not currently available.'
      );
    }

    /*
     * Avatar storage is private.
     *
     * We load only SaMi's metadata record here. We never expose:
     * - R2 object key
     * - R2 endpoint
     * - bucket information
     * - storage credentials
     *
     * The actual image is served through the authenticated
     * /api/admin/account/avatar endpoint.
     */
    const avatar =
      await getAvatarRecord(
        'platform_admin',
        session.adminId
      );

    /* ========================================================
       4. SUCCESS
       ======================================================== */

    return jsonResponse({
      success:
        true,

      code:
        'ADMIN_ACCOUNT_LOADED',

      account: {
        id:
          account.id,

        firstName:
          account.firstName,

        lastName:
          account.lastName,

        fullName:
          account.fullName,

        email:
          account.email,

        avatarFileId:
          avatar?.id ??
          null,

        avatarUrl:
          avatar
            ? '/api/admin/account/avatar'
            : null,

        role:
          account.role,

        status:
          account.status,

        emailVerified:
          account.emailVerified,

        emailVerifiedAt:
          account.emailVerifiedAt,

        twoFactorRequired:
          session.twoFactorRequired,

        twoFactorEnabled:
          session.twoFactorEnabled,
      },
    });
  } catch (error) {
    /* ========================================================
       5. EMAIL / IDENTITY DOMAIN ERRORS
       ======================================================== */

    if (
      error instanceof
      EmailChangeError
    ) {
      if (
        error.code ===
        'IDENTITY_NOT_FOUND'
      ) {
        return errorResponse(
          404,
          'ADMIN_ACCOUNT_NOT_FOUND',
          'The administrator account could not be found.'
        );
      }

      if (
        error.code ===
        'IDENTITY_UNAVAILABLE'
      ) {
        return errorResponse(
          403,
          'ADMIN_ACCOUNT_UNAVAILABLE',
          'This administrator account is not currently available.'
        );
      }

      return errorResponse(
        400,
        error.code,
        error.message
      );
    }

    /* ========================================================
       6. AVATAR DOMAIN ERRORS
       ======================================================== */

    if (
      error instanceof
      AvatarError
    ) {
      if (
        error.code ===
        'ACCOUNT_UNAVAILABLE'
      ) {
        return errorResponse(
          403,
          'ADMIN_ACCOUNT_UNAVAILABLE',
          'This administrator account is not currently available.'
        );
      }

      if (
        error.code ===
        'STORAGE_CONFIGURATION_ERROR' ||
        error.code ===
        'STORAGE_UNAVAILABLE'
      ) {
        return errorResponse(
          503,
          'AVATAR_SERVICE_UNAVAILABLE',
          'Profile image services are temporarily unavailable.',
          {
            retryable:
              true,
          },
          {
            'Retry-After':
              '30',
          }
        );
      }

      console.error(
        '[Admin Account] Avatar metadata lookup failed:',
        error.code
      );

      return errorResponse(
        500,
        'ADMIN_AVATAR_STATE_ERROR',
        'SaMi could not load your profile image information.'
      );
    }

    /* ========================================================
       7. INTERNAL / INFRASTRUCTURE FAILURE
       ======================================================== */

    console.error(
      '[Admin Account] Account lookup failed:',
      error
    );

    if (
      isTransientInfrastructureError(
        error
      )
    ) {
      return errorResponse(
        503,
        'SERVICE_TEMPORARILY_UNAVAILABLE',
        'SaMi administrator services are temporarily unavailable.',
        {
          retryable:
            true,
        },
        {
          'Retry-After':
            '30',
        }
      );
    }

    return errorResponse(
      500,
      'ADMIN_ACCOUNT_LOAD_ERROR',
      'SaMi could not load your administrator account.'
    );
  }
}