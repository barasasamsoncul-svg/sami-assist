import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

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
const MAX_EMAIL_LENGTH = 254;

const VERIFY_RATE_LIMIT_MAX_ATTEMPTS = 8;
const VERIFY_RATE_LIMIT_WINDOW_MS =
  15 * 60 * 1000;
const VERIFY_RATE_LIMIT_BLOCK_MS =
  15 * 60 * 1000;

/* ============================================================
   TYPES
   ============================================================ */

type VerifyEmailBody = {
  email?: unknown;
  code?: unknown;
};

type UserRow = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  status: string;
  email_verified_at:
    | Date
    | string
    | null;
};

/* ============================================================
   NORMALIZATION
   ============================================================ */

function normalizeEmail(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value
    .trim()
    .toLowerCase();
}

function normalizeCode(
  value: unknown
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.trim();
}

/* ============================================================
   VALIDATION
   ============================================================ */

function isValidEmail(
  email: string
): boolean {
  return (
    email.length > 0 &&
    email.length <=
      MAX_EMAIL_LENGTH &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      email
    )
  );
}

function isValidCode(
  code: string
): boolean {
  return new RegExp(
    `^\\d{${CODE_LENGTH}}$`
  ).test(code);
}

/* ============================================================
   HASHING
   ============================================================ */

function hashCode(
  code: string
): string {
  return crypto
    .createHash(
      'sha256'
    )
    .update(
      code,
      'utf8'
    )
    .digest(
      'hex'
    );
}

/* ============================================================
   RATE LIMIT
   ============================================================ */

function getRateLimitIdentifier(
  request: NextRequest,
  email: string
): string {
  const ip =
    getClientIp(
      request
    ) ||
    'unknown-ip';

  return `verify-email:${email}:${ip}`;
}

/* ============================================================
   RESPONSE
   ============================================================ */

function jsonResponse(
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

function errorResponse(
  status: number,
  code: string,
  error: string
) {
  return jsonResponse(
    {
      success: false,
      code,
      error,
    },
    status
  );
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
    console.error(
      '[Auth] Failed to record email verification event:',
      error
    );
  }
}

/* ============================================================
   SUCCESS RESPONSES
   ============================================================ */

function verifiedResponse(
  user: UserRow
) {
  return jsonResponse({
    success: true,

    code:
      'EMAIL_VERIFIED',

    verified:
      true,

    alreadyVerified:
      false,

    user: {
      id:
        user.id,

      email:
        user.email,

      firstName:
        user.first_name ||
        '',

      lastName:
        user.last_name ||
        '',

      fullName:
        user.full_name ||
        '',

      emailVerified:
        true,

      emailVerifiedAt:
        user.email_verified_at instanceof
        Date
          ? user
              .email_verified_at
              .toISOString()
          : user
              .email_verified_at,

      status:
        user.status,
    },

    message:
      'Email verified successfully. You can now sign in.',

    next:
      '/login?verified=1',
  });
}

function alreadyVerifiedResponse(
  user: UserRow
) {
  return jsonResponse({
    success: true,

    code:
      'EMAIL_ALREADY_VERIFIED',

    verified:
      true,

    alreadyVerified:
      true,

    user: {
      id:
        user.id,

      email:
        user.email,

      firstName:
        user.first_name ||
        '',

      lastName:
        user.last_name ||
        '',

      fullName:
        user.full_name ||
        '',

      emailVerified:
        true,

      emailVerifiedAt:
        user.email_verified_at instanceof
        Date
          ? user
              .email_verified_at
              .toISOString()
          : user
              .email_verified_at,

      status:
        user.status,
    },

    message:
      'Your email address is already verified.',

    next:
      '/login?verified=1',
  });
}

/* ============================================================
   POST /api/auth/verify-email
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  let email =
    '';

  let rateLimitKey:
    string | null =
    null;

  try {
    let body:
      VerifyEmailBody;

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
        parsed as VerifyEmailBody;
    } catch {
      return errorResponse(
        400,
        'INVALID_REQUEST',
        'Invalid request body.'
      );
    }

    email =
      normalizeEmail(
        body.email
      );

    const code =
      normalizeCode(
        body.code
      );

    if (
      !isValidEmail(
        email
      )
    ) {
      return errorResponse(
        400,
        'INVALID_EMAIL',
        'Enter a valid email address.'
      );
    }

    if (
      !isValidCode(
        code
      )
    ) {
      return errorResponse(
        400,
        'INVALID_VERIFICATION_CODE',
        'Enter the 6-digit verification code.'
      );
    }

    rateLimitKey =
      getRateLimitIdentifier(
        request,
        email
      );

    const rateLimit =
      await checkRateLimit({
        identifier:
          rateLimitKey,

        action:
          'verify-email',

        maxAttempts:
          VERIFY_RATE_LIMIT_MAX_ATTEMPTS,

        windowMs:
          VERIFY_RATE_LIMIT_WINDOW_MS,

        blockMs:
          VERIFY_RATE_LIMIT_BLOCK_MS,
      });

    if (
      !rateLimit.allowed
    ) {
      await safeRecordAuthEvent({
        request,

        eventType:
          'EMAIL_VERIFICATION_RATE_LIMITED',

        metadata: {
          email,

          retryAfterSeconds:
            rateLimit
              .retryAfterSeconds,
        },
      });

      return jsonResponse(
        {
          success: false,

          code:
            'VERIFICATION_RATE_LIMITED',

          error:
            'Too many verification attempts. Please wait before trying again.',

          retryAfterSeconds:
            rateLimit
              .retryAfterSeconds,
        },
        429
      );
    }

    const codeHash =
      hashCode(
        code
      );

    const verificationResult =
      await queryControl(
        `
          WITH target_user AS (
            SELECT
              u.id

            FROM users u

            WHERE LOWER(u.email) = $1
              AND u.deleted_at IS NULL
              AND u.email_verified_at IS NULL
              AND LOWER(u.status) IN (
                'pending',
                'pending_verification'
              )

            LIMIT 1

            FOR UPDATE
          ),

          candidate_code AS (
            SELECT
              ev.id

            FROM email_verifications ev

            WHERE LOWER(ev.email) = $1
              AND ev.code_hash = $2
              AND ev.used_at IS NULL
              AND ev.deleted_at IS NULL
              AND ev.expires_at > NOW()
              AND EXISTS (
                SELECT 1
                FROM target_user
              )

            ORDER BY
              ev.created_at DESC

            LIMIT 1

            FOR UPDATE
          ),

          consumed_code AS (
            UPDATE email_verifications ev

            SET
              used_at = NOW()

            WHERE ev.id = (
              SELECT id
              FROM candidate_code
            )

            RETURNING
              ev.id
          ),

          verified_user AS (
            UPDATE users u

            SET
              email_verified = TRUE,

              email_verified_at =
                COALESCE(
                  u.email_verified_at,
                  NOW()
                ),

              status =
                'active',

              updated_at =
                NOW()

            FROM target_user target

            WHERE u.id =
              target.id

              AND EXISTS (
                SELECT 1
                FROM consumed_code
              )

            RETURNING
              u.id,
              u.email,
              u.first_name,
              u.last_name,
              u.full_name,
              u.status,
              u.email_verified_at
          ),

          invalidated_codes AS (
            UPDATE email_verifications ev

            SET
              deleted_at =
                NOW()

            WHERE LOWER(ev.email) = $1
              AND ev.used_at IS NULL
              AND ev.deleted_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM verified_user
              )

            RETURNING
              ev.id
          )

          SELECT
            id,
            email,
            first_name,
            last_name,
            full_name,
            status,
            email_verified_at

          FROM verified_user
        `,
        [
          email,
          codeHash,
        ]
      );

    if (
      verificationResult
        .rows.length >
      0
    ) {
      const verifiedUser =
        verificationResult
          .rows[0] as UserRow;

      if (
        rateLimitKey
      ) {
        await resetRateLimit(
          rateLimitKey,
          'verify-email'
        );
      }

      await safeRecordAuthEvent({
        request,

        userId:
          verifiedUser.id,

        eventType:
          'EMAIL_VERIFIED',

        entityType:
          'user',

        entityId:
          verifiedUser.id,

        metadata: {
          email:
            verifiedUser.email,
        },
      });

      return verifiedResponse(
        verifiedUser
      );
    }

    const alreadyVerifiedResult =
      await queryControl(
        `
          SELECT
            u.id,
            u.email,
            u.first_name,
            u.last_name,
            u.full_name,
            u.status,
            u.email_verified_at

          FROM users u

          WHERE LOWER(u.email) = $1
            AND u.deleted_at IS NULL
            AND u.email_verified_at IS NOT NULL

            AND EXISTS (
              SELECT 1

              FROM email_verifications ev

              WHERE LOWER(ev.email) = $1
                AND ev.code_hash = $2
                AND ev.used_at IS NOT NULL
            )

          LIMIT 1
        `,
        [
          email,
          codeHash,
        ]
      );

    if (
      alreadyVerifiedResult
        .rows.length >
      0
    ) {
      const alreadyVerifiedUser =
        alreadyVerifiedResult
          .rows[0] as UserRow;

      if (
        rateLimitKey
      ) {
        await resetRateLimit(
          rateLimitKey,
          'verify-email'
        );
      }

      return alreadyVerifiedResponse(
        alreadyVerifiedUser
      );
    }

    return errorResponse(
      400,
      'INVALID_OR_EXPIRED_CODE',
      'The verification code is invalid or has expired.'
    );
  } catch (error) {
    console.error(
      '[Auth] Email verification failed:',
      error
    );

    return errorResponse(
      500,
      'EMAIL_VERIFICATION_ERROR',
      'Could not verify your email. Please try again.'
    );
  }
}
