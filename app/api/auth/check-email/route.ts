import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  queryControl,
} from '@/lib/db/control';

import {
  checkRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const MAX_EMAIL_LENGTH = 254;

/*
 * This endpoint intentionally answers whether an email can be
 * used for registration, so it must be protected from bulk
 * account-enumeration attempts.
 *
 * Rate-limit by client IP, not by email. If the email were part
 * of the key, an attacker could bypass the limit simply by
 * changing the address on every request.
 */
const CHECK_EMAIL_RATE_LIMIT_MAX_ATTEMPTS =
  30;

const CHECK_EMAIL_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const CHECK_EMAIL_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmail(
  value: string
): string {
  return value
    .trim()
    .toLowerCase();
}

function isValidEmail(
  value: string
): boolean {
  if (
    !value ||
    value.length >
      MAX_EMAIL_LENGTH
  ) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value
  );
}

function json(
  body: Record<
    string,
    unknown
  >,
  status = 200
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

function getRateLimitIdentifier(
  request: NextRequest
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `check-email:${ip}`;
}

/* ============================================================
   GET /api/auth/check-email
   ============================================================ */

export async function GET(
  request: NextRequest
) {
  try {
    /* ========================================================
       1. INPUT
       ======================================================== */

    const rawEmail =
      request.nextUrl.searchParams.get(
        'email'
      );

    if (!rawEmail) {
      return json(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Email is required.',
        },
        400
      );
    }

    const email =
      normalizeEmail(
        rawEmail
      );

    /* ========================================================
       2. VALIDATION
       ======================================================== */

    if (
      !isValidEmail(
        email
      )
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_EMAIL',

          error:
            'Please enter a valid email address.',
        },
        400
      );
    }

    /* ========================================================
       3. RATE LIMIT

       The Register client needs an explicit availability result,
       so this endpoint cannot be fully anti-enumerating.

       Instead, protect it against bulk discovery by limiting the
       number of checks from one client IP.
       ======================================================== */

    const rateLimit =
      await checkRateLimit({
        identifier:
          getRateLimitIdentifier(
            request
          ),

        action:
          'check-email',

        maxAttempts:
          CHECK_EMAIL_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          CHECK_EMAIL_RATE_LIMIT_WINDOW_MS,

        blockMs:
          CHECK_EMAIL_RATE_LIMIT_BLOCK_MS,
      });

    if (
      !rateLimit.allowed
    ) {
      return json(
        {
          success: false,

          code:
            'CHECK_EMAIL_RATE_LIMITED',

          error:
            'Too many email checks. Please wait before trying again.',

          retryAfterSeconds:
            rateLimit
              .retryAfterSeconds,
        },
        429
      );
    }

    /* ========================================================
       4. ACCOUNT LOOKUP

       IMPORTANT:
       Do not filter deleted_at here.

       The authoritative registration route rejects an email when
       ANY previous users row exists, including a soft-deleted
       account. Returning EMAIL_AVAILABLE for a deleted row would
       let the Register UI continue only for registration to fail
       later with ACCOUNT_PREVIOUSLY_DELETED.

       We intentionally return only availability here. We do not
       reveal whether the matching account is active, pending,
       Google-created, suspended or deleted.
       ======================================================== */

    const result =
      await queryControl(
        `
          SELECT id

          FROM users

          WHERE LOWER(email) = $1

          LIMIT 1
        `,
        [
          email,
        ]
      );

    const exists =
      result.rows.length >
      0;

    /* ========================================================
       5. RESPONSE

       Keep `exists` because the current Register client depends
       on it.

       Detailed account state remains authoritative in the final
       registration endpoint and is not exposed here.
       ======================================================== */

    return json({
      success: true,

      code:
        exists
          ? 'EMAIL_ALREADY_EXISTS'
          : 'EMAIL_AVAILABLE',

      exists,
    });
  } catch (error) {
    console.error(
      '[Auth] Check email failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'CHECK_EMAIL_ERROR',

        error:
          'Could not check this email address.',
      },
      500
    );
  }
}
