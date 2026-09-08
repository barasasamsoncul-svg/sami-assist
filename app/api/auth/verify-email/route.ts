// app/api/auth/verify-email/route.ts

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import crypto from 'crypto';

import {
  queryControl,
} from '@/lib/db/control';

import {
  recordAuthEvent,
} from '@/lib/auth/auth-events';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ============================================================
   CONSTANTS
   ============================================================ */

const CODE_LENGTH = 6;
const MAX_EMAIL_LENGTH = 254;

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
    typeof value !== 'string'
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
    typeof value !== 'string'
  ) {
    return '';
  }

  /*
   * Do NOT silently remove invalid characters.
   *
   * Example:
   *   12a3456
   *
   * must remain invalid rather than being transformed
   * into 123456.
   */
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
    .createHash('sha256')
    .update(
      code,
      'utf8'
    )
    .digest('hex');
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
    /*
     * Audit failure must never undo a completed
     * email verification.
     */
    console.error(
      '[Auth] Failed to record email verification event:',
      error
    );
  }
}

/* ============================================================
   POST /api/auth/verify-email
   ============================================================ */

export async function POST(
  request: NextRequest
) {
  try {
    /* ========================================================
       1. REQUEST
       ======================================================== */

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

    /* ========================================================
       2. NORMALIZE
       ======================================================== */

    const email =
      normalizeEmail(
        body.email
      );

    const code =
      normalizeCode(
        body.code
      );

    /* ========================================================
       3. INPUT VALIDATION
       ======================================================== */

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

    /* ========================================================
       4. FIND ACCOUNT
       ======================================================== */

    const userResult =
      await queryControl(
        `
          SELECT
            id,
            email,
            first_name,
            last_name,
            full_name,
            status,
            email_verified_at

          FROM users

          WHERE LOWER(email) = $1
            AND deleted_at IS NULL

          LIMIT 1
        `,
        [
          email,
        ]
      );

    /*
     * Do not expose whether an arbitrary email address
     * belongs to a SaMi account.
     */
    if (
      userResult.rows.length ===
      0
    ) {
      return errorResponse(
        400,
        'INVALID_OR_EXPIRED_CODE',
        'The verification code is invalid or has expired.'
      );
    }

    const user =
      userResult
        .rows[0] as UserRow;

    /* ========================================================
       5. ALREADY VERIFIED

       Verification is idempotent.
       ======================================================== */

    if (
      user.email_verified_at
    ) {
      return jsonResponse({
        success: true,

        code:
          'EMAIL_ALREADY_VERIFIED',

        verified:
          true,

        alreadyVerified:
          true,

        message:
          'Your email address is already verified.',

        next:
          '/login?verified=1',
      });
    }

    /* ========================================================
       6. ACCOUNT STATE

       Email verification may activate only accounts that are
       actually waiting for verification.

       Never turn:
         locked
         suspended
         disabled
         banned
         deleted
         cancelled

       into active accounts simply because a code was valid.
       ======================================================== */

    const status =
      String(
        user.status || ''
      )
        .trim()
        .toLowerCase();

    if (
      status !==
        'pending_verification' &&
      status !==
        'pending'
    ) {
      /*
       * Keep this generic so account status is not disclosed
       * through the public verification endpoint.
       */
      return errorResponse(
        400,
        'INVALID_OR_EXPIRED_CODE',
        'The verification code is invalid or has expired.'
      );
    }

    /* ========================================================
       7. HASH CODE
       ======================================================== */

    const codeHash =
      hashCode(
        code
      );

    /* ========================================================
       8. ATOMIC VERIFICATION

       This single PostgreSQL statement:

       1. Finds one valid unused code.
       2. Atomically consumes it.
       3. Marks the user's email verified.
       4. Changes only pending/pending_verification → active.
       5. Invalidates every remaining unused email code.

       Concurrent requests cannot successfully reuse the same
       verification code.
       ======================================================== */

    const verificationResult =
      await queryControl(
        `
          WITH consumed_code AS (
            UPDATE email_verifications ev

            SET
              used_at = NOW()

            WHERE ev.id = (
              SELECT candidate.id

              FROM email_verifications candidate

              WHERE LOWER(candidate.email) = $1
                AND candidate.code_hash = $2
                AND candidate.used_at IS NULL
                AND candidate.deleted_at IS NULL
                AND candidate.expires_at > NOW()

              ORDER BY
                candidate.created_at DESC

              LIMIT 1

              FOR UPDATE SKIP LOCKED
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
                CASE
                  WHEN LOWER(u.status) IN (
                    'pending',
                    'pending_verification'
                  )
                  THEN 'active'
                  ELSE u.status
                END,

              updated_at =
                NOW()

            WHERE u.id = $3
              AND u.deleted_at IS NULL
              AND u.email_verified_at IS NULL
              AND LOWER(u.status) IN (
                'pending',
                'pending_verification'
              )
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
              deleted_at = NOW()

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
          user.id,
        ]
      );

    /* ========================================================
       9. INVALID / EXPIRED / REPLAYED CODE
       ======================================================== */

    if (
      verificationResult
        .rows.length ===
      0
    ) {
      return errorResponse(
        400,
        'INVALID_OR_EXPIRED_CODE',
        'The verification code is invalid or has expired.'
      );
    }

    const verifiedUser =
      verificationResult
        .rows[0] as UserRow;

    /* ========================================================
       10. AUDIT
       ======================================================== */

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

    /* ========================================================
       11. SUCCESS

       Email verification does NOT:

       - create a login session
       - provision a tenant
       - modify a subscription
       - change trial dates
       - charge PesaPal

       Those responsibilities remain in their own services.
       ======================================================== */

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
          verifiedUser.id,

        email:
          verifiedUser.email,

        firstName:
          verifiedUser.first_name ||
          '',

        lastName:
          verifiedUser.last_name ||
          '',

        fullName:
          verifiedUser.full_name ||
          '',

        emailVerified:
          true,

        emailVerifiedAt:
          verifiedUser
            .email_verified_at instanceof
          Date
            ? verifiedUser
                .email_verified_at
                .toISOString()
            : verifiedUser
                .email_verified_at,

        status:
          verifiedUser.status,
      },

      message:
        'Email verified successfully. You can now sign in.',

      next:
        '/login?verified=1',
    });
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