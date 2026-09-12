import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getSession,
} from '@/lib/auth/session';

import {
  verifyEmailChange,
  EmailChangeError,
} from '@/lib/account/email-change';

import {
  UserAccountNotFoundError,
} from '@/lib/account/user-account';

import {
  checkRateLimit,
  resetRateLimit,
} from '@/lib/auth/rate-limit';

import {
  getClientIp,
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const CODE_LENGTH = 6;

const VERIFY_RATE_LIMIT_MAX_ATTEMPTS =
  8;

const VERIFY_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;

const VERIFY_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type VerifyEmailChangeBody = {
  code?: unknown;
};

/* ============================================================
   RESPONSE
   ============================================================ */

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

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeCode(
  value: string
): string {
  return value.trim();
}

function isValidCode(
  value: string
): boolean {
  return new RegExp(
    `^\\d{${CODE_LENGTH}}$`
  ).test(
    value
  );
}

function rateLimitIdentifier(
  request: NextRequest,
  userId: string
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `email-change-verify:${userId}:${ip}`;
}

function getEmailChangeErrorStatus(
  error: EmailChangeError
): number {
  switch (
    error.code
  ) {
    case 'INVALID_EMAIL_CHANGE_CODE':
      return 400;

    case 'EMAIL_CHANGE_EXPIRED':
      return 400;

    case 'EMAIL_UNAVAILABLE':
      return 409;

    case 'INVALID_NEW_EMAIL':
      return 400;

    case 'EMAIL_UNCHANGED':
      return 409;

    case 'EMAIL_CHANGE_COOLDOWN':
      return 429;

    default:
      return 400;
  }
}

/* ============================================================
   POST
   /api/account/email-change/verify

   Confirms the current signed-in user's pending email change.

   Flow:

   authenticated session
          ↓
   strict six-digit code
          ↓
   rate-limit verification attempts
          ↓
   verify hashed request
          ↓
   atomically update users.email
          ↓
   mark destination email verified
          ↓
   consume email-change request

   This endpoint NEVER accepts a user ID from the client.
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  /* ==========================================================
     1. SESSION
     ========================================================== */

  let session;

  try {
    session =
      await getSession();
  } catch (error) {
    console.error(
      '[Account] Email-change verification session lookup failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_VERIFY_ERROR',

        error:
          'SaMi could not verify your email change.',
      },
      500
    );
  }

  if (!session) {
    return json(
      {
        success: false,

        code:
          'UNAUTHENTICATED',

        error:
          'You must sign in to verify your email change.',
      },
      401
    );
  }

  /* ==========================================================
     2. BODY
     ========================================================== */

  let body:
    VerifyEmailChangeBody;

  try {
    const parsed =
      await request.json();

    if (
      !parsed ||
      typeof parsed !==
        'object' ||
      Array.isArray(
        parsed
      )
    ) {
      return json(
        {
          success: false,

          code:
            'INVALID_REQUEST',

          error:
            'Invalid request body.',
        },
        400
      );
    }

    body =
      parsed as VerifyEmailChangeBody;
  } catch {
    return json(
      {
        success: false,

        code:
          'INVALID_REQUEST',

        error:
          'Invalid request body.',
      },
      400
    );
  }

  /* ==========================================================
     3. CODE TYPE
     ========================================================== */

  if (
    typeof body.code !==
    'string'
  ) {
    return json(
      {
        success: false,

        code:
          'INVALID_EMAIL_CHANGE_CODE',

        error:
          'Enter the complete 6-digit verification code.',

        field:
          'code',
      },
      400
    );
  }

  const code =
    normalizeCode(
      body.code
    );

  if (
    !isValidCode(
      code
    )
  ) {
    return json(
      {
        success: false,

        code:
          'INVALID_EMAIL_CHANGE_CODE',

        error:
          'Enter the complete 6-digit verification code.',

        field:
          'code',
      },
      400
    );
  }

  /* ==========================================================
     4. RATE LIMIT
     ========================================================== */

  const rateLimitKey =
    rateLimitIdentifier(
      request,
      session.user.id
    );

  let rateLimit;

  try {
    rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitKey,

        action:
          'email-change-verify',

        maxAttempts:
          VERIFY_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          VERIFY_RATE_LIMIT_WINDOW_MS,

        blockMs:
          VERIFY_RATE_LIMIT_BLOCK_MS,
      });
  } catch (error) {
    console.error(
      '[Account] Email-change verification rate limit failed:',
      error
    );

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_VERIFY_ERROR',

        error:
          'SaMi could not verify your email change.',
      },
      500
    );
  }

  if (
    !rateLimit.allowed
  ) {
    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'EMAIL_CHANGE_VERIFICATION_RATE_LIMITED',

      metadata: {
        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
    });

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_VERIFICATION_RATE_LIMITED',

        error:
          'Too many verification attempts. Please wait before trying again.',

        retryAfterSeconds:
          rateLimit
            .retryAfterSeconds,
      },
      429
    );
  }

  /* ==========================================================
     5. VERIFY
     ========================================================== */

  try {
    const previousEmail =
      session.user.email;

    const account =
      await verifyEmailChange(
        session.user.id,
        code
      );

    /* ========================================================
       6. RESET RATE LIMIT

       resetRateLimit() uses the existing SaMi positional
       contract:

         resetRateLimit(identifier, action)
       ======================================================== */

    try {
      await resetRateLimit(
        rateLimitKey,
        'email-change-verify'
      );
    } catch (error) {
      /*
       * Verification has already succeeded.
       *
       * Rate-limit cleanup failure must never turn a completed
       * account email change into a failed response.
       */

      console.error(
        '[Account] Failed to reset email-change verification rate limit:',
        error
      );
    }

    /* ========================================================
       7. AUDIT SUCCESS

       Never record:
       - raw verification code
       - code hash
       ======================================================== */

    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'EMAIL_CHANGED',

      metadata: {
        previousEmail,

        newEmail:
          account.email,
      },
    });

    /* ========================================================
       8. RESPONSE
       ======================================================== */

    return json({
      success: true,

      code:
        'EMAIL_CHANGED',

      message:
        'Your email address has been updated successfully.',

      account,
    });
  } catch (error) {
    /* ========================================================
       ACCOUNT NOT FOUND
       ======================================================== */

    if (
      error instanceof
      UserAccountNotFoundError
    ) {
      return json(
        {
          success: false,

          code:
            'ACCOUNT_NOT_FOUND',

          error:
            'Your SaMi account could not be found.',
        },
        404
      );
    }

    /* ========================================================
       EMAIL CHANGE DOMAIN ERROR
       ======================================================== */

    if (
      error instanceof
      EmailChangeError
    ) {
      await recordAuthEvent({
        request,

        userId:
          session.user.id,

        eventType:
          'EMAIL_CHANGE_VERIFICATION_FAILED',

        metadata: {
          code:
            error.code,
        },
      });

      return json(
        {
          success: false,

          code:
            error.code,

          error:
            error.message,

          field:
            error.code ===
              'INVALID_EMAIL_CHANGE_CODE'
              ? 'code'
              : undefined,

          retryAfterSeconds:
            error.retryAfterSeconds,
        },
        getEmailChangeErrorStatus(
          error
        )
      );
    }

    /* ========================================================
       INTERNAL ERROR
       ======================================================== */

    console.error(
      '[Account] Email-change verification failed:',
      error
    );

    await recordAuthEvent({
      request,

      userId:
        session.user.id,

      eventType:
        'EMAIL_CHANGE_VERIFICATION_ERROR',

      metadata: {},
    });

    return json(
      {
        success: false,

        code:
          'EMAIL_CHANGE_VERIFY_ERROR',

        error:
          'SaMi could not verify your email change.',
      },
      500
    );
  }
}